'use strict';

// 全项目唯一的 prompt 访问入口（issue #22）。
// 所有 prompt 的读取走 configStore 生效层（默认 + 运行时合并），
// 所有管理界面的保存只写运行时层 config/runtime/，config/ 默认层保持不动。

const { createConfigStore } = require('./configStore.cjs');

// ---------- markdown 小节工具（统一此前散落在 server.cjs 约 10 处、3 种变体的解析实现）----------

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// 提取 `## <title>` 小节代码围栏内的内容；标题行须整行匹配，
// 围栏可带语言标记；代码块内部再出现 `## xxx` 小节（周报模板即如此）不受影响。
function extractSection(content, title) {
  const re = new RegExp(
    `^##\\s+${escapeRegExp(title)}\\s*\\n+\\s*\`\`\`[^\\n]*\\n([\\s\\S]*?)\\n\\s*\`\`\``,
    'm'
  );
  const match = String(content || '').match(re);
  return match ? match[1] : null;
}

// 替换或追加一个小节（用于管理界面保存 policy prompt）
function upsertSection(content, title, text) {
  const body = String(content || '');
  const nextText = String(text ?? '');
  if (nextText.includes('```')) {
    const error = new Error('Prompt 内容不能包含 Markdown 三反引号代码围栏');
    error.status = 400;
    throw error;
  }
  const re = new RegExp(`^##\\s+${escapeRegExp(title)}\\s*\\n[\\s\\S]*?\\n\\s*\`\`\``, 'm');
  if (re.test(body)) {
    return body.replace(re, `## ${title}\n\n\`\`\`\n${nextText}\n\`\`\``);
  }
  const sep = body === '' || body.endsWith('\n') ? '' : '\n';
  return `${body}${sep}\n\n## ${title}\n\n\`\`\`\n${nextText}\n\`\`\`\n`;
}

// ---------- 内联 prompt 常量（原先散落在 server.cjs 的 8 处定义，其中 3 对是重复）----------
// 属于代码资产：随 git 版本管理、随代码部署，不进入运行时层。

const POLICY_EXTRACTION_SYSTEM =
  '你是一个专业的政策分析助手，请严格按照用户的要求提取政策信息并输出为JSON格式。';

const POLICY_COMPARISON_SYSTEM = '你是一个专业的政策对比分析专家。';

// policy_prompts.md 缺失/解析失败时的兜底模板
const POLICY_COMPARISON_FALLBACK_USER =
  '请对比以下两份政策内容：\n\n现行政策：\n{current}\n\n新提取政策：\n{extracted}';

// 政策 JSON 提取失败后的强制约束前缀与修复器 prompt
const POLICY_STRICT_PREFIX_LINES = [
  '【强制约束：为避免超长/截断导致JSON不完整，请严格执行】',
  '1) 仅输出一个JSON对象，且必须能被JSON.parse解析。',
  '2) 每条“政策明细”的“内容”请控制在120字以内；禁止换行、禁止使用\\n；用分号/逗号表达要点。',
  '3) 只保留关键数字与要素（对象/门槛/额度比例/期限/范围/流程关键点），不要写办理渠道/网址/过长材料清单。',
  '4) 若同城同类信息重复，请合并为1条更精炼的政策明细；优先保留数字最明确的条目。',
  '5) “依据文件”请尽量短（<=60字）。'
];

function buildStrictUserPrompt(finalUserPrompt) {
  return `${POLICY_STRICT_PREFIX_LINES.join('\n')}\n\n${finalUserPrompt}`;
}

const JSON_REPAIR_SYSTEM =
  '你是一个严格的JSON修复器。你只输出可被JSON.parse解析的单一JSON对象，不要任何解释或markdown。';

function buildJsonRepairUserPrompt(repairSource) {
  return [
    '请将下面文本修复为合法JSON对象：',
    '要求：',
    '1) 只输出一个JSON对象',
    '2) 不要多余文字',
    '3) 需要时将字符串中的换行转义为\\\\n，双引号转义为\\"',
    '',
    '待修复文本：',
    String(repairSource || '').slice(0, 12000)
  ].join('\n');
}

// ---------- 周报 / 政策 markdown prompt ----------

const WEEKLY_SECTIONS = {
  systemPrompt: 'System Prompt',
  userPrompt: 'User Prompt',
  modifySystemPrompt: 'Modify System Prompt',
  modifyUserPrompt: 'Modify User Prompt',
};

const POLICY_SECTION_TITLES = {
  extraction: 'Policy Extraction Prompt',
  comparison: 'Policy Comparison Prompt',
};

function slugifyPromptName(value = '') {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function ensureSingleDefault(prompts, preferredId = '', forcePreferred = false) {
  if (!Array.isArray(prompts) || prompts.length === 0) return;
  const defaults = prompts.filter((prompt) => prompt.isDefault);
  const preferred = prompts.find((prompt) => prompt.id === preferredId);
  if (defaults.length === 1 && (!forcePreferred || defaults[0].id === preferred?.id)) return;

  const selected = preferred
    || defaults[0]
    || prompts[0];
  for (const prompt of prompts) prompt.isDefault = prompt.id === selected.id;
}

function createPromptStore(options = {}) {
  const configStore = options.configStore || createConfigStore({ configDir: options.configDir });

  function weeklySource() {
    return configStore.isOverridden('prompts.md') ? 'runtime' : 'default';
  }

  // { systemPrompt, userPrompt, modifySystemPrompt, modifyUserPrompt, source }（缺失为 ''）
  function getWeeklyPrompts() {
    const content = configStore.readEffectiveText('prompts.md') || '';
    const read = (title) => {
      const value = extractSection(content, title);
      return value === null ? '' : value.trim();
    };
    return {
      systemPrompt: read(WEEKLY_SECTIONS.systemPrompt),
      userPrompt: read(WEEKLY_SECTIONS.userPrompt),
      modifySystemPrompt: read(WEEKLY_SECTIONS.modifySystemPrompt),
      modifyUserPrompt: read(WEEKLY_SECTIONS.modifyUserPrompt),
      source: weeklySource(),
    };
  }

  // { extractionPrompt, comparisonPrompt, source }
  function getPolicyPrompts() {
    const content = configStore.readEffectiveText('policy_prompts.md') || '';
    const extraction = extractSection(content, POLICY_SECTION_TITLES.extraction);
    const comparison = extractSection(content, POLICY_SECTION_TITLES.comparison);
    return {
      extractionPrompt: extraction === null ? '' : extraction.trim(),
      comparisonPrompt: comparison === null ? '' : comparison.trim(),
      source: configStore.isOverridden('policy_prompts.md') ? 'runtime' : 'default',
    };
  }

  function savePolicyPrompt(type, text) {
    const title = POLICY_SECTION_TITLES[type];
    if (!title) throw new Error(`未知的政策 prompt 类型: ${type}`);
    const content = configStore.readEffectiveText('policy_prompts.md') || '';
    configStore.commitText('policy_prompts.md', upsertSection(content, title, String(text ?? '')));
  }

  // ---------- 关键词 prompt 库（keyword-prompts.json）----------

  function getKeywordLibrary() {
    return configStore.readEffectiveJson('keyword-prompts.json') || { keywords: {}, metadata: {} };
  }

  function getKeywordFactoryDefaultId(keyword) {
    const defaults = configStore.readDefaultJson('keyword-prompts.json');
    const prompts = defaults?.keywords?.[keyword]?.prompts || [];
    return prompts.find((prompt) => prompt.isDefault)?.id || '';
  }

  function listKeywordPrompts(keyword) {
    const library = getKeywordLibrary();
    const prompts = ((library.keywords[keyword] || {}).prompts) || [];
    return prompts.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      isDefault: !!p.isDefault,
      systemPrompt: p.systemPrompt || '',
      userPrompt: p.userPrompt || '',
      source: p.source || 'default',
      updatedAt: p.updatedAt,
    }));
  }

  // 返回 { systemPrompt, userPrompt, ... } 或 null（调用方决定是否回退周报默认模板）
  function findKeywordPrompt(keyword, promptId) {
    if (!keyword || !promptId) return null;
    const library = getKeywordLibrary();
    const prompts = ((library.keywords[keyword] || {}).prompts) || [];
    return prompts.find((p) => p.id === promptId) || null;
  }

  // 保存（新增或更新）一条关键词 prompt；返回保存后的条目
  function saveKeywordPrompt({ keyword, promptId, name, description, systemPrompt, userPrompt, isDefault }) {
    if (!keyword || !name || !description || !systemPrompt || !userPrompt) {
      const err = new Error('缺少必要参数：关键词、版本名称、描述、System Prompt、User Prompt为必填');
      err.status = 400;
      throw err;
    }

    const library = getKeywordLibrary();
    library.keywords = library.keywords || {};
    library.metadata = library.metadata || {};

    if (!library.keywords[keyword]) {
      library.keywords[keyword] = { prompts: [] };
    }
    const prompts = library.keywords[keyword].prompts;

    const rawId = (promptId || '').trim();
    const ts = new Date();
    const tsStr = `${ts.getFullYear()}${String(ts.getMonth() + 1).padStart(2, '0')}${String(ts.getDate()).padStart(2, '0')}${String(ts.getHours()).padStart(2, '0')}${String(ts.getMinutes()).padStart(2, '0')}`;
    let effectiveId = rawId || `${slugifyPromptName(name)}-${tsStr}`;
    const existingIds = new Set(prompts.map((p) => p.id));
    if (existingIds.has(effectiveId)) {
      let counter = 2;
      while (existingIds.has(`${effectiveId}-${counter}`)) counter++;
      effectiveId = `${effectiveId}-${counter}`;
    }

    const existingIndex = prompts.findIndex((p) => p.id === effectiveId || (rawId && p.id === rawId));
    const now = new Date().toISOString();
    const promptConfig = {
      id: existingIndex >= 0 ? prompts[existingIndex].id : effectiveId,
      name,
      description: description || '',
      systemPrompt,
      userPrompt,
      isDefault: isDefault || false,
      createdAt: existingIndex >= 0 ? prompts[existingIndex].createdAt : now,
      updatedAt: now,
    };

    if (isDefault) {
      prompts.forEach((p) => {
        p.isDefault = false;
      });
    }
    if (existingIndex >= 0) prompts[existingIndex] = promptConfig;
    else prompts.push(promptConfig);
    ensureSingleDefault(prompts, isDefault ? promptConfig.id : getKeywordFactoryDefaultId(keyword));

    library.metadata.lastUpdated = now;
    configStore.commitJson('keyword-prompts.json', library);
    return promptConfig;
  }

  // 删除一条关键词 prompt；找不到返回 null；关键词清空后整个关键词移除
  function deleteKeywordPrompt(keyword, promptId) {
    const library = getKeywordLibrary();
    const keywordConfig = (library.keywords || {})[keyword];
    if (!keywordConfig || !keywordConfig.prompts) return null;
    const index = keywordConfig.prompts.findIndex((p) => p.id === promptId);
    if (index === -1) return null;
    keywordConfig.prompts.splice(index, 1);
    ensureSingleDefault(keywordConfig.prompts, getKeywordFactoryDefaultId(keyword));
    if (keywordConfig.prompts.length === 0) delete library.keywords[keyword];
    library.metadata = library.metadata || {};
    library.metadata.lastUpdated = new Date().toISOString();
    configStore.commitJson('keyword-prompts.json', library);
    return { keyword, promptId };
  }

  // 条目级恢复默认：只移除该条目的运行时层覆盖或墓碑，其他生产定制不受影响
  function resetKeywordPrompt(keyword, promptId) {
    const currentPrompt = findKeywordPrompt(keyword, promptId);
    const factoryDefaultId = getKeywordFactoryDefaultId(keyword);
    const runtime = configStore.readRuntimeJson('keyword-prompts.json');
    if (!runtime) return null;
    let touched = false;

    const kwConfig = (runtime.keywords || {})[keyword];
    if (kwConfig && Array.isArray(kwConfig.prompts)) {
      const before = kwConfig.prompts.length;
      kwConfig.prompts = kwConfig.prompts.filter((p) => p.id !== promptId);
      if (kwConfig.prompts.length !== before) touched = true;
      if (kwConfig.prompts.length === 0) delete runtime.keywords[keyword];
    }

    const tombstone = `${keyword}::${promptId}`;
    runtime.metadata = runtime.metadata || {};
    const deleted = runtime.metadata.deletedIds || [];
    if (deleted.includes(tombstone)) {
      runtime.metadata.deletedIds = deleted.filter((x) => x !== tombstone);
      touched = true;
    }

    if (!touched) return null;
    const hasContent =
      Object.keys(runtime.keywords || {}).length > 0 || (runtime.metadata.deletedIds || []).length > 0;
    const effective = configStore.previewRuntimeJson('keyword-prompts.json', hasContent ? runtime : null);
    const prompts = effective?.keywords?.[keyword]?.prompts || [];
    ensureSingleDefault(
      prompts,
      factoryDefaultId,
      promptId === factoryDefaultId || currentPrompt?.isDefault === true,
    );
    configStore.commitJson('keyword-prompts.json', effective);
    return { keyword, promptId };
  }

  // ---------- 地区政策报告 prompt 库（region-policy-report-prompts.json）----------

  function getRegionLibrary() {
    return (
      configStore.readEffectiveJson('region-policy-report-prompts.json') || {
        metadata: {},
        prompts: [],
      }
    );
  }

  function getRegionFactoryDefaultId() {
    const defaults = configStore.readDefaultJson('region-policy-report-prompts.json');
    return (defaults?.prompts || []).find((prompt) => prompt.isDefault)?.id || '';
  }

  function getRegionPromptSummaries() {
    const library = getRegionLibrary();
    return (library.prompts || []).map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      systemPrompt: p.systemPrompt,
      userPromptSingle: p.userPromptSingle,
      userPromptMulti: p.userPromptMulti,
      isDefault: !!p.isDefault,
      source: p.source || 'default',
      updatedAt: p.updatedAt,
    }));
  }

  function findRegionPrompt(promptId) {
    if (!promptId) return null;
    const library = getRegionLibrary();
    return (library.prompts || []).find((p) => p.id === promptId) || null;
  }

  function saveRegionPrompt({ promptId, name, description, systemPrompt, userPromptSingle, userPromptMulti, isDefault }) {
    if (!name || !description || !systemPrompt || !userPromptSingle || !userPromptMulti) {
      const err = new Error('缺少必要参数：名称、描述、System Prompt、单地区/多地区 User Prompt 为必填');
      err.status = 400;
      throw err;
    }

    const library = getRegionLibrary();
    library.metadata = library.metadata || {};
    library.prompts = Array.isArray(library.prompts) ? library.prompts : [];

    const rawId = (promptId || '').trim();
    let effectiveId = rawId || `${slugifyPromptName(name)}-${Date.now()}`;
    const existingIds = new Set(library.prompts.map((p) => p.id));
    if (!rawId && existingIds.has(effectiveId)) {
      let counter = 2;
      while (existingIds.has(`${effectiveId}-${counter}`)) counter++;
      effectiveId = `${effectiveId}-${counter}`;
    }

    const existingIndex = library.prompts.findIndex((p) => p.id === rawId);
    const now = new Date().toISOString();
    const prompt = {
      id: existingIndex >= 0 ? library.prompts[existingIndex].id : effectiveId,
      name,
      description: description || '',
      systemPrompt,
      userPromptSingle,
      userPromptMulti,
      isDefault: isDefault || false,
      createdAt: existingIndex >= 0 ? library.prompts[existingIndex].createdAt : now,
      updatedAt: now,
    };

    if (isDefault) {
      library.prompts.forEach((p) => {
        p.isDefault = false;
      });
    }
    if (existingIndex >= 0) library.prompts[existingIndex] = prompt;
    else library.prompts.push(prompt);
    ensureSingleDefault(library.prompts, isDefault ? prompt.id : getRegionFactoryDefaultId());

    library.metadata.version = library.metadata.version || '1.0.0';
    library.metadata.description = library.metadata.description || '地区政策报告 Prompt 配置，支持多版本与单地区/多地区双模板';
    library.metadata.lastUpdated = now;
    configStore.commitJson('region-policy-report-prompts.json', library);
    return prompt;
  }

  // 至少保留一个版本；删除最后一个抛错（route 转 400）
  function deleteRegionPrompt(promptId) {
    const library = getRegionLibrary();
    const prompts = library.prompts || [];
    const index = prompts.findIndex((p) => p.id === promptId);
    if (index === -1) return null;
    if (prompts.length <= 1) {
      const err = new Error('至少保留一个 prompt 版本');
      err.status = 400;
      throw err;
    }
    prompts.splice(index, 1);
    ensureSingleDefault(prompts, getRegionFactoryDefaultId());
    library.metadata = library.metadata || {};
    library.metadata.lastUpdated = new Date().toISOString();
    configStore.commitJson('region-policy-report-prompts.json', library);
    return { promptId };
  }

  // 条目级恢复默认：只移除该版本的运行时层覆盖或墓碑（与关键词库同构）
  function resetRegionPrompt(promptId) {
    const currentPrompt = findRegionPrompt(promptId);
    const factoryDefaultId = getRegionFactoryDefaultId();
    const runtime = configStore.readRuntimeJson('region-policy-report-prompts.json');
    if (!runtime) return null;
    let touched = false;

    if (Array.isArray(runtime.prompts)) {
      const before = runtime.prompts.length;
      runtime.prompts = runtime.prompts.filter((p) => p.id !== promptId);
      if (runtime.prompts.length !== before) touched = true;
    }
    runtime.metadata = runtime.metadata || {};
    const deleted = runtime.metadata.deletedIds || [];
    if (deleted.includes(promptId)) {
      runtime.metadata.deletedIds = deleted.filter((x) => x !== promptId);
      touched = true;
    }

    if (!touched) return null;
    const hasContent = (runtime.prompts || []).length > 0 || (runtime.metadata.deletedIds || []).length > 0;
    const effective = configStore.previewRuntimeJson('region-policy-report-prompts.json', hasContent ? runtime : null);
    ensureSingleDefault(
      effective?.prompts || [],
      factoryDefaultId,
      promptId === factoryDefaultId || currentPrompt?.isDefault === true,
    );
    configStore.commitJson('region-policy-report-prompts.json', effective);
    return { promptId };
  }

  return {
    configStore,
    getWeeklyPrompts,
    getPolicyPrompts,
    savePolicyPrompt,
    getKeywordLibrary,
    listKeywordPrompts,
    findKeywordPrompt,
    saveKeywordPrompt,
    deleteKeywordPrompt,
    resetKeywordPrompt,
    getRegionLibrary,
    getRegionPromptSummaries,
    findRegionPrompt,
    saveRegionPrompt,
    deleteRegionPrompt,
    resetRegionPrompt,
  };
}

module.exports = {
  createPromptStore,
  extractSection,
  upsertSection,
  escapeRegExp,
  POLICY_EXTRACTION_SYSTEM,
  POLICY_COMPARISON_SYSTEM,
  POLICY_COMPARISON_FALLBACK_USER,
  POLICY_STRICT_PREFIX_LINES,
  buildStrictUserPrompt,
  buildJsonRepairUserPrompt,
  JSON_REPAIR_SYSTEM,
};
