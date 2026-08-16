const fs = require('fs');
const path = require('path');
const { extractSection: sharedExtractSection } = require('./promptStore.cjs');

const DEFAULT_AUTO_REPORT_CONFIG = {
  enabled: false,
  defaults: {
    modelKey: 'deepseek-v4-flash',
    promptId: '',
    minScore: 3,
    summaryVersion: 'short',
  },
  keywords: {},
};

function toFiniteScore(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeAutoReportConfig(input) {
  const raw = input && typeof input === 'object' ? input : {};
  const defaults = raw.defaults && typeof raw.defaults === 'object' ? raw.defaults : {};
  const keywords = raw.keywords && typeof raw.keywords === 'object' ? raw.keywords : {};

  return {
    enabled: Boolean(raw.enabled),
    defaults: {
      modelKey: String(defaults.modelKey || DEFAULT_AUTO_REPORT_CONFIG.defaults.modelKey),
      promptId: String(defaults.promptId || DEFAULT_AUTO_REPORT_CONFIG.defaults.promptId),
      minScore: toFiniteScore(defaults.minScore, DEFAULT_AUTO_REPORT_CONFIG.defaults.minScore),
      summaryVersion: defaults.summaryVersion === 'full' ? 'full' : 'short',
    },
    keywords: Object.fromEntries(
      Object.entries(keywords).map(([keyword, cfg]) => {
        const item = cfg && typeof cfg === 'object' ? cfg : {};
        return [keyword, {
          enabled: Boolean(item.enabled),
          modelKey: item.modelKey ? String(item.modelKey) : '',
          promptId: item.promptId ? String(item.promptId) : '',
          minScore: item.minScore === '' || item.minScore === undefined ? '' : toFiniteScore(item.minScore, ''),
          summaryVersion: item.summaryVersion === 'full' ? 'full' : (item.summaryVersion === 'short' ? 'short' : ''),
        }];
      })
    ),
  };
}

function buildAutoReportConfig(input) {
  const config = normalizeAutoReportConfig(input);
  const enabledKeywords = Object.entries(config.keywords)
    .filter(([keyword, cfg]) => keyword && cfg.enabled)
    .map(([keyword, cfg]) => ({
      keyword,
      modelKey: cfg.modelKey || config.defaults.modelKey,
      promptId: cfg.promptId || config.defaults.promptId,
      minScore: cfg.minScore === '' ? config.defaults.minScore : cfg.minScore,
      summaryVersion: cfg.summaryVersion || config.defaults.summaryVersion,
    }));

  return { ...config, enabledKeywords };
}

function getYmdInTimeZone(date, timeZone = 'Asia/Shanghai') {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function getWeekdayInTimeZone(date, timeZone = 'Asia/Shanghai') {
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
  }).format(date);
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekday);
}

function addDaysYmd(ymd, days) {
  const [year, month, day] = ymd.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function getAutoReportWeekRange(referenceDate = new Date(), timeZone = 'Asia/Shanghai') {
  const refYmd = getYmdInTimeZone(referenceDate, timeZone);
  const weekday = getWeekdayInTimeZone(referenceDate, timeZone);
  const daysSinceSaturday = (weekday - 6 + 7) % 7;
  const endDate = addDaysYmd(refYmd, -daysSinceSaturday);
  return {
    startDate: addDaysYmd(endDate, -6),
    endDate,
  };
}

function extractPromptSection(content, title) {
  // 复用 promptStore 的统一解析实现（与全项目其他解析点保持一致）
  const value = sharedExtractSection(content, title);
  return value === null ? '' : value.trim();
}

function loadPromptPair({ keyword, promptId, promptConfigPath, fallbackPromptsPath }) {
  if (promptId && promptConfigPath && fs.existsSync(promptConfigPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(promptConfigPath, 'utf-8'));
      const prompts = config.keywords?.[keyword]?.prompts || [];
      const selected = prompts.find(prompt => prompt.id === promptId);
      if (selected?.systemPrompt && selected?.userPrompt) {
        return {
          promptId: selected.id,
          promptName: selected.name || selected.id,
          systemPrompt: selected.systemPrompt,
          userPromptTemplate: selected.userPrompt,
        };
      }
    } catch (error) {
      console.warn('读取自动周报关键词 Prompt 失败，使用默认 Prompt:', error.message);
    }
  }

  let content;
  try {
    content = fs.readFileSync(fallbackPromptsPath, 'utf-8');
  } catch (error) {
    throw new Error(`Fallback prompt file is not readable: ${error.message}`);
  }
  return {
    promptId: '',
    promptName: '默认 Prompt',
    systemPrompt: extractPromptSection(content, 'System Prompt'),
    userPromptTemplate: extractPromptSection(content, 'User Prompt'),
  };
}

function buildNewsContent(newsList, summaryVersion) {
  return newsList.map((news, index) => {
    const text = summaryVersion === 'short'
      ? (news.short_summary || news.content || '内容不详')
      : (news.content || news.short_summary || '内容不详');
    return `新闻${index + 1}标题:${news.title || '标题不详'}\n新闻${index + 1}内容:${text}`;
  }).join('\n\n');
}

function buildPotentialCustomerNewsContent(newsList, summaryVersion) {
  return newsList.map((news) => {
    const text = summaryVersion === 'short'
      ? (news.short_summary || news.content || '内容不详')
      : (news.content || news.short_summary || '内容不详');
    return `这是我的潜在客户<${news.search_keyword || '未知客户'}>，以下是我搜索到的新闻<${text}>`;
  }).join('\n\n');
}

function buildFinalUserPrompt({ template, keyword, startDate, endDate, newsList, summaryVersion, userTopic = '无特别要求' }) {
  return String(template || '')
    .replaceAll('{keyword}', keyword)
    .replaceAll('{startDate}', startDate)
    .replaceAll('{endDate}', endDate)
    .replaceAll('{news}', buildNewsContent(newsList, summaryVersion))
    .replaceAll('{qianzai_news}', buildPotentialCustomerNewsContent(newsList, summaryVersion))
    .replaceAll('{usertopic}', userTopic || '无特别要求');
}

function getNewsText(news, summaryVersion) {
  return summaryVersion === 'short'
    ? (news.short_summary || news.content || '')
    : (news.content || news.short_summary || '');
}

function getSourceWordCount(newsList, summaryVersion) {
  return newsList.reduce((sum, news) => {
    const numericWordCount = Number(news.wordcount);
    if (Number.isFinite(numericWordCount) && numericWordCount > 0) {
      return sum + numericWordCount;
    }
    return sum + getNewsText(news, summaryVersion).length;
  }, 0);
}

function defaultBuildPdfFilename({ keyword, modelName, includeContact = true, date = new Date() }) {
  const safe = value => String(value || '')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
  const contactSuffix = includeContact ? '_带联系方式' : '';
  return `AI新闻周报_${safe(keyword || '未命名')}_${safe(modelName || 'DeepSeek R1')}${contactSuffix}_${date.toISOString().slice(0, 10)}.pdf`;
}

function canUserAccessAutoReport(user, record) {
  if (!user || !record) return false;
  if (user.role === 'admin' || user.username === 'admin') return true;
  return Array.isArray(user.keywords) && user.keywords.includes(record.keyword);
}

function sanitizeAutoReportRecord(record) {
  if (!record) return record;
  const { pdf_path, pdfPath, ...rest } = record;
  return rest;
}

function createAutoReportService(options) {
  const {
    pool,
    config,
    configPath,
    loadConfig,
    promptStore,
    promptConfigPath = path.join(__dirname, '../config/keyword-prompts.json'),
    fallbackPromptsPath = path.join(__dirname, '../config/prompts.md'),
    outputDir = path.join(__dirname, '../data/auto-report-pdfs'),
    getWeeklyReportModel,
    buildChatPayload,
    callLlm,
    renderPdf,
    buildPdfFilename = defaultBuildPdfFilename,
    now = () => new Date(),
  } = options;

  if (!pool) throw new Error('pool is required');

  function readConfig() {
    if (typeof loadConfig === 'function') return buildAutoReportConfig(loadConfig());
    if (config) return buildAutoReportConfig(config);
    if (!configPath || !fs.existsSync(configPath)) return buildAutoReportConfig(null);
    return buildAutoReportConfig(JSON.parse(fs.readFileSync(configPath, 'utf-8')));
  }

  // 优先走 promptStore（默认层+运行时层合并后的生效配置）；未注入时退回旧的文件路径模式（测试兼容）
  function resolvePromptPair(keyword, promptId) {
    if (promptStore) {
      const selected = promptStore.findKeywordPrompt(keyword, promptId);
      if (selected?.systemPrompt && selected?.userPrompt) {
        return {
          promptId: selected.id,
          promptName: selected.name || selected.id,
          systemPrompt: selected.systemPrompt,
          userPromptTemplate: selected.userPrompt,
        };
      }
      const weekly = promptStore.getWeeklyPrompts();
      if (!weekly.systemPrompt || !weekly.userPrompt) {
        throw new Error('Fallback prompt file is not readable');
      }
      return {
        promptId: '',
        promptName: '默认 Prompt',
        systemPrompt: weekly.systemPrompt,
        userPromptTemplate: weekly.userPrompt,
      };
    }
    return loadPromptPair({ keyword, promptId, promptConfigPath, fallbackPromptsPath });
  }

  async function ensureLogTable() {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS auto_report_log (
        id INT AUTO_INCREMENT PRIMARY KEY,
        run_at DATETIME NOT NULL,
        trigger_type VARCHAR(20) DEFAULT 'cron',
        week_start DATE NOT NULL,
        week_end DATE NOT NULL,
        keyword VARCHAR(50) NOT NULL,
        status VARCHAR(20) NOT NULL,
        report_id INT NULL,
        news_count INT DEFAULT 0,
        model_used VARCHAR(100),
        error_message TEXT,
        duration_ms INT,
        pdf_status VARCHAR(20) DEFAULT 'pending',
        pdf_path VARCHAR(500),
        pdf_filename VARCHAR(255),
        pdf_error_message TEXT,
        model_key VARCHAR(100),
        prompt_id VARCHAR(100),
        prompt_name VARCHAR(255),
        min_score DECIMAL(4,1),
        summary_version VARCHAR(20),
        source_word_count INT DEFAULT 0,
        prompt_char_count INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_run_at (run_at),
        INDEX idx_keyword_status (keyword, status)
      )
    `);
    await ensureLogMetricColumns();
  }

  async function ensureLogMetricColumns() {
    const [columns] = await pool.query('SHOW COLUMNS FROM auto_report_log');
    const existing = new Set(columns.map(column => column.Field));
    const additions = [
      ['model_key', 'VARCHAR(100)'],
      ['prompt_id', 'VARCHAR(100)'],
      ['prompt_name', 'VARCHAR(255)'],
      ['min_score', 'DECIMAL(4,1)'],
      ['summary_version', 'VARCHAR(20)'],
      ['source_word_count', 'INT DEFAULT 0'],
      ['prompt_char_count', 'INT DEFAULT 0'],
    ];
    for (const [column, definition] of additions) {
      if (!existing.has(column)) {
        await pool.query(`ALTER TABLE auto_report_log ADD COLUMN ${column} ${definition}`);
      }
    }
  }

  async function writeLog(entry) {
    const [result] = await pool.query(
      `INSERT INTO auto_report_log
       (run_at, trigger_type, week_start, week_end, keyword, status, report_id, news_count, model_used, error_message, duration_ms, pdf_status, pdf_path, pdf_filename, pdf_error_message,
        model_key, prompt_id, prompt_name, min_score, summary_version, source_word_count, prompt_char_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.runAt || now(),
        entry.triggerType || 'cron',
        entry.startDate,
        entry.endDate,
        entry.keyword,
        entry.status,
        entry.reportId || null,
        entry.newsCount || 0,
        entry.modelUsed || null,
        entry.errorMessage || null,
        entry.durationMs || 0,
        entry.pdfStatus || null,
        entry.pdfPath || null,
        entry.pdfFilename || null,
        entry.pdfErrorMessage || null,
        entry.modelKey || null,
        entry.promptId || null,
        entry.promptName || null,
        entry.minScore === undefined ? null : entry.minScore,
        entry.summaryVersion || null,
        entry.sourceWordCount || 0,
        entry.promptCharCount || 0,
      ]
    );
    return result.insertId;
  }

  async function tryWriteLog(entry) {
    try {
      return await writeLog(entry);
    } catch (error) {
      entry.logErrorMessage = error.message;
      return null;
    }
  }

  async function queryNews({ keyword, startDate, endDate, minScore }) {
    const [rows] = await pool.query(
      `SELECT id, title, content, short_summary, source, fetchdate, score, link, keyword, search_keyword, wordcount
       FROM scored_news
       WHERE keyword = ? AND fetchdate BETWEEN ? AND ?
         AND (score IS NOT NULL AND score != '' AND CAST(score AS DECIMAL) >= ?)
       ORDER BY CAST(score AS DECIMAL) DESC, fetchdate DESC`,
      [keyword, startDate, endDate, minScore]
    );
    return rows;
  }

  async function generateReportForKeyword(params) {
    const startedAt = Date.now();
    const {
      keyword,
      startDate,
      endDate,
      modelKey,
      promptId,
      minScore,
      summaryVersion = 'short',
      triggerType = 'manual',
    } = params;

    const newsRows = await queryNews({ keyword, startDate, endDate, minScore });
    if (newsRows.length === 0) {
      const skipped = {
        keyword,
        startDate,
        endDate,
        status: 'skipped',
        newsCount: 0,
        modelUsed: null,
        durationMs: Date.now() - startedAt,
        pdfStatus: 'skipped',
        modelKey,
        promptId,
        minScore,
        summaryVersion,
        sourceWordCount: 0,
        promptCharCount: 0,
      };
      const skippedLogEntry = { ...skipped, triggerType };
      skipped.logId = await tryWriteLog(skippedLogEntry);
      skipped.logErrorMessage = skippedLogEntry.logErrorMessage;
      return skipped;
    }

    const modelConfig = getWeeklyReportModel(modelKey);
    const promptPair = resolvePromptPair(keyword, promptId);
    const userPrompt = buildFinalUserPrompt({
      template: promptPair.userPromptTemplate,
      keyword,
      startDate,
      endDate,
      newsList: newsRows,
      summaryVersion,
    });
    const promptCharCount = promptPair.systemPrompt.length + userPrompt.length;
    const sourceWordCount = getSourceWordCount(newsRows, summaryVersion);

    let reportContent;
    if (callLlm) {
      reportContent = await callLlm({
        keyword,
        modelConfig,
        systemPrompt: promptPair.systemPrompt,
        userPrompt,
        newsRows,
      });
    } else {
      reportContent = await defaultCallLlm({ modelConfig, buildChatPayload, systemPrompt: promptPair.systemPrompt, userPrompt });
    }

    const [insertResult] = await pool.query(
      `INSERT INTO weekly_reports (keyword, start_date, end_date, report_content, model_used, news_count)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [keyword, startDate, endDate, reportContent, modelConfig.model, newsRows.length]
    );

    const modelName = modelConfig.label || modelConfig.model;
    let pdfStatus = 'pending';
    let pdfPath = null;
    let pdfFilename = null;
    let pdfErrorMessage = null;

    try {
      if (!renderPdf) throw new Error('PDF renderer is not configured');
      fs.mkdirSync(outputDir, { recursive: true });
      pdfFilename = buildPdfFilename({ keyword, modelName, includeContact: true, date: now() });
      pdfPath = path.join(outputDir, pdfFilename);
      const pdfBuffer = await renderPdf({
        keyword,
        startDate,
        endDate,
        newsCount: newsRows.length,
        modelName,
        reportContent,
        includeContact: true,
      });
      fs.writeFileSync(pdfPath, pdfBuffer);
      pdfStatus = 'success';
    } catch (error) {
      pdfStatus = 'error';
      pdfErrorMessage = error.message;
    }

    const result = {
      keyword,
      startDate,
      endDate,
      status: 'success',
      reportId: insertResult.insertId,
      newsCount: newsRows.length,
      modelUsed: modelConfig.model,
      durationMs: Date.now() - startedAt,
      pdfStatus,
      pdfPath,
      pdfFilename,
      pdfErrorMessage,
      modelKey: modelConfig.key || modelKey,
      promptId: promptPair.promptId || promptId || '',
      promptName: promptPair.promptName || '',
      minScore,
      summaryVersion,
      sourceWordCount,
      promptCharCount,
    };
    const resultLogEntry = { ...result, triggerType };
    result.logId = await tryWriteLog(resultLogEntry);
    result.logErrorMessage = resultLogEntry.logErrorMessage;
    return result;
  }

  async function runAutoReportCycle({ triggerType = 'cron', referenceDate = now() } = {}) {
    const activeConfig = readConfig();
    if (!activeConfig.enabled) {
      return { status: 'disabled', results: [] };
    }

    const range = getAutoReportWeekRange(referenceDate);
    const results = [];
    for (const keywordConfig of activeConfig.enabledKeywords) {
      try {
        const result = await generateReportForKeyword({
          ...keywordConfig,
          ...range,
          triggerType,
        });
        results.push(result);
      } catch (error) {
        const failed = {
          keyword: keywordConfig.keyword,
          startDate: range.startDate,
          endDate: range.endDate,
          status: 'error',
          newsCount: 0,
          modelUsed: keywordConfig.modelKey,
          errorMessage: error.message,
          durationMs: 0,
          pdfStatus: 'skipped',
          modelKey: keywordConfig.modelKey,
          promptId: keywordConfig.promptId,
          minScore: keywordConfig.minScore,
          summaryVersion: keywordConfig.summaryVersion,
          sourceWordCount: 0,
          promptCharCount: 0,
        };
        const failedLogEntry = { ...failed, triggerType };
        failed.logId = await tryWriteLog(failedLogEntry);
        failed.logErrorMessage = failedLogEntry.logErrorMessage;
        results.push(failed);
      }
    }

    return { status: 'completed', ...range, results };
  }

  return {
    ensureLogTable,
    generateReportForKeyword,
    queryNews,
    readConfig,
    runAutoReportCycle,
    writeLog,
  };
}

async function defaultCallLlm({ modelConfig, buildChatPayload, systemPrompt, userPrompt, timeoutMs = 180000, fetchImpl = fetch }) {
  if (!buildChatPayload) throw new Error('buildChatPayload is required');
  const apiKey = process.env[modelConfig.apiKey];
  if (!apiKey) throw new Error(`环境变量 ${modelConfig.apiKey} 未配置`);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetchImpl(modelConfig.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(buildChatPayload(modelConfig, [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ], false)),
      signal: controller.signal,
    });
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`LLM API request timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`LLM API error: ${response.status} ${response.statusText} ${text}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

module.exports = {
  DEFAULT_AUTO_REPORT_CONFIG,
  buildAutoReportConfig,
  canUserAccessAutoReport,
  createAutoReportService,
  defaultCallLlm,
  getAutoReportWeekRange,
  getSourceWordCount,
  loadPromptPair,
  normalizeAutoReportConfig,
  sanitizeAutoReportRecord,
};
