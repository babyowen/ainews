export const DEFAULT_POLICY_COMPARISON_TITLE = '扬州公积金政策城市对比';

const createStructuredReport = () => ({
  intro: [],
  cities: [],
  missing: []
});

const parseMarkerMeta = (metaStr) => {
  const meta = {};
  (metaStr || '').split('|').forEach((seg) => {
    const [k, ...rest] = seg.split('=');
    if (!k || rest.length === 0) return;
    meta[k.trim()] = rest.join('=').trim().replace(/\]\]+$/, '');
  });
  return meta;
};

const parseCityLead = (text) => {
  const s = String(text ?? '').trim();
  const m = s.match(/^\*\*(.+?)\*\*\s*[:：]\s*(.*)$/);
  if (!m) return { city: '', text: s };
  return { city: m[1].trim(), text: (m[2] || '').trim() };
};

const getBlockEntries = (block) => {
  const list = Array.isArray(block?.list) ? block.list : [];
  const contentLines = Array.isArray(block?.content) ? block.content : [];
  return [...list, ...contentLines]
    .map((item) => String(item ?? '').trim())
    .filter(Boolean);
};

const normalizePolicyTitle = ({ title, localEntries, category }) => {
  const explicit = String(title ?? '').trim();
  if (explicit) return explicit;
  const first = String(localEntries?.[0] ?? '').trim();
  if (first) return first;
  return String(category ?? '').trim() || '政策对比项';
};

const hasMissingYangzhouPolicy = (entries) =>
  (entries || []).some((entry) => /扬州暂无|暂无该项政策|暂无对应条款/.test(String(entry ?? '')));

const ensureCityBucket = (report, cityName) => {
  const safeName = cityName || '其他城市';
  let city = report.cities.find((item) => item.name === safeName);
  if (!city) {
    city = { name: safeName, summary: [], categories: [] };
    report.cities.push(city);
  }
  return city;
};

const ensureCategoryBucket = (city, categoryName) => {
  const safeTitle = categoryName || '未分类';
  let category = city.categories.find((item) => item.title === safeTitle);
  if (!category) {
    category = { title: safeTitle, items: [] };
    city.categories.push(category);
  }
  return category;
};

const appendMatchedItem = (report, item) => {
  const city = ensureCityBucket(report, item.city);
  const category = ensureCategoryBucket(city, item.category);
  category.items.push({
    title: normalizePolicyTitle(item),
    localEntries: item.localEntries || [],
    yangzhouEntries: item.yangzhouEntries || [],
    diffEntries: item.diffEntries || []
  });
};

const appendMissingItem = (report, item) => {
  report.missing.push({
    city: item.city || '其他城市',
    category: item.category || '未分类',
    title: normalizePolicyTitle(item),
    localEntries: item.localEntries || [],
    diffEntries: item.diffEntries || []
  });
};

const parseLegacyMarkerMarkdown = (markdown) => {
  const lines = (markdown || '').split('\n');
  const result = [];
  let currentSection = '';
  let currentCard = null;
  let currentBlock = null;

  const flushBlock = () => {
    if (currentCard && currentBlock) {
      currentCard.blocks.push(currentBlock);
      currentBlock = null;
    }
  };

  const flushCard = () => {
    flushBlock();
    if (currentCard) {
      result.push(currentCard);
      currentCard = null;
    }
  };

  lines.forEach((rawLine) => {
    const line = (rawLine || '').trim();
    if (!line) return;

    const sec = line.match(/^\[\[SECTION\|(.*)\]\]$/);
    if (sec) {
      flushCard();
      currentSection = sec[1].trim();
      result.push({ type: 'section', title: currentSection });
      return;
    }

    const card = line.match(/^\[\[CARD\|(.*)\]\]$/);
    if (card) {
      flushCard();
      const meta = parseMarkerMeta(card[1]);
      currentCard = {
        type: 'card',
        category: meta.category || currentSection,
        city: meta.city || '',
        title: meta.title || '',
        blocks: []
      };
      return;
    }

    if (line === '[[/CARD]]') {
      flushCard();
      return;
    }

    const block = line.match(/^\[\[BLOCK\|(.+?)\]\]$/);
    if (block) {
      if (!currentCard) {
        currentCard = { type: 'card', category: currentSection, city: '', title: '', blocks: [] };
      }
      flushBlock();
      const key = (block[1] || '').trim();
      const isYangzhou = key === 'yangzhou';
      const isDiff = key === 'diff';
      const label = isYangzhou ? '扬州' : (isDiff ? '对比分析' : key);
      const labelClass = isYangzhou ? 'yangzhou' : (isDiff ? 'comparison' : 'other');
      if (labelClass === 'other' && !currentCard.city) currentCard.city = key;
      currentBlock = { type: 'block', label, labelClass, blockKey: key, content: [], list: [] };
      return;
    }

    if (line === '---') {
      flushCard();
      result.push({ type: 'separator' });
      return;
    }

    if (line.startsWith('- ')) {
      const text = line.replace(/^-+\s*/, '').trim();
      if (currentBlock) currentBlock.list.push(text);
      else if (currentCard) {
        if (!currentCard.list) currentCard.list = [];
        currentCard.list.push(text);
      } else {
        result.push({ type: 'content', text });
      }
      return;
    }

    if (currentBlock) currentBlock.content.push(line);
    else if (currentCard) {
      if (!currentCard.content) currentCard.content = [];
      currentCard.content.push(line);
    } else {
      result.push({ type: 'content', text: line });
    }
  });

  flushCard();
  return result;
};

const parseLegacyMarkdown = (markdown) => {
  const lines = (markdown || '').split('\n');
  const result = [];
  let currentCard = null;
  let currentBlock = null;

  const flushCard = () => {
    if (currentBlock && currentCard) {
      currentCard.blocks.push(currentBlock);
      currentBlock = null;
    }
    if (currentCard) {
      result.push(currentCard);
      currentCard = null;
    }
  };

  lines.forEach((line) => {
    const trimmed = (line || '').trim();
    if (!trimmed) return;

    if (trimmed.startsWith('### ')) {
      flushCard();
      result.push({ type: 'section', title: trimmed.replace(/^###\s*/, '').trim() });
      return;
    }

    if (trimmed === '---') {
      flushCard();
      result.push({ type: 'separator' });
      return;
    }

    const labelMatch = trimmed.match(/^\*\*(扬州|其他城市|对比分析)\*\*(?:\s*[:：]\s*(.*))?$/);
    if (labelMatch) {
      if (!currentCard) currentCard = { type: 'card', category: '', city: '', title: '', blocks: [] };
      if (currentBlock) currentCard.blocks.push(currentBlock);
      const label = labelMatch[1];
      const labelClass = label === '扬州' ? 'yangzhou' : (label === '对比分析' ? 'comparison' : 'other');
      currentBlock = { type: 'block', label, labelClass, content: [], list: [] };
      const inlineText = (labelMatch[2] || '').trim();
      if (inlineText) currentBlock.content.push(inlineText);
      return;
    }

    if (trimmed.startsWith('- ')) {
      const text = trimmed.replace(/^-+\s*/, '').trim();
      if (currentBlock) {
        currentBlock.list.push(text);
      } else if (currentCard) {
        if (!currentCard.list) currentCard.list = [];
        currentCard.list.push(text);
      } else {
        result.push({ type: 'content', text });
      }
      return;
    }

    if (currentBlock) {
      currentBlock.content.push(trimmed);
    } else if (currentCard) {
      if (!currentCard.content) currentCard.content = [];
      currentCard.content.push(trimmed);
    } else {
      result.push({ type: 'content', text: trimmed });
    }
  });

  flushCard();
  return result;
};

const buildStructuredReportFromLegacy = (parsed) => {
  const report = createStructuredReport();
  const groups = [];
  let current = null;

  parsed.forEach((item) => {
    if (item.type === 'section') {
      current = { title: item.title, items: [] };
      groups.push(current);
      return;
    }
    if (!current) {
      current = { title: '', items: [] };
      groups.push(current);
    }
    current.items.push(item);
  });

  groups.forEach((group) => {
    const cards = group.items.filter((item) => item.type === 'card');
    const contents = group.items.filter((item) => item.type === 'content');
    if (contents.length > 0) {
      report.intro.push(...contents.map((item) => item.text).filter(Boolean));
    }

    cards.forEach((card) => {
      const blocks = Array.isArray(card.blocks) ? card.blocks : [];
      const otherBlock = blocks.find((block) => block.labelClass === 'other');
      const yangzhouBlock = blocks.find((block) => block.labelClass === 'yangzhou');
      const diffBlock = blocks.find((block) => block.labelClass === 'comparison');

      const rawLocalEntries = getBlockEntries(otherBlock);
      const rawYangzhouEntries = getBlockEntries(yangzhouBlock);
      const diffEntries = getBlockEntries(diffBlock);

      const firstLocal = rawLocalEntries[0] || '';
      const parsedLead = parseCityLead(firstLocal);
      const cleanedLocalEntries = [...rawLocalEntries];
      if (cleanedLocalEntries.length > 0 && parsedLead.text && parsedLead.text !== firstLocal) {
        cleanedLocalEntries[0] = parsedLead.text;
      }

      const city = card.city || parsedLead.city || '其他城市';
      const category = card.category || group.title || '未分类';
      const title = normalizePolicyTitle({
        title: card.title,
        localEntries: cleanedLocalEntries,
        category
      });

      if (hasMissingYangzhouPolicy(rawYangzhouEntries)) {
        appendMissingItem(report, {
          city,
          category,
          title,
          localEntries: cleanedLocalEntries,
          diffEntries
        });
        return;
      }

      appendMatchedItem(report, {
        city,
        category,
        title,
        localEntries: cleanedLocalEntries,
        yangzhouEntries: rawYangzhouEntries,
        diffEntries
      });
    });
  });

  return report;
};

const parseModernMarkerMarkdown = (markdown) => {
  const report = createStructuredReport();
  const lines = (markdown || '').split('\n');
  let currentCity = null;
  let currentCategory = '';
  let currentCard = null;
  let currentMode = '';
  let inMissingSection = false;

  const flushCard = () => {
    if (!currentCard) return;
    const title = normalizePolicyTitle({
      title: currentCard.title,
      localEntries: currentCard.localEntries,
      category: currentCard.category
    });

    if (inMissingSection || currentCard.yangzhouEntries.length === 0 || hasMissingYangzhouPolicy(currentCard.yangzhouEntries)) {
      appendMissingItem(report, {
        city: currentCard.city,
        category: currentCard.category,
        title,
        localEntries: currentCard.localEntries,
        diffEntries: currentCard.diffEntries.length > 0 ? currentCard.diffEntries : currentCard.noteEntries
      });
    } else {
      appendMatchedItem(report, {
        city: currentCard.city,
        category: currentCard.category,
        title,
        localEntries: currentCard.localEntries,
        yangzhouEntries: currentCard.yangzhouEntries,
        diffEntries: currentCard.diffEntries
      });
    }
    currentCard = null;
    currentMode = '';
  };

  lines.forEach((rawLine) => {
    const line = (rawLine || '').trim();
    if (!line) return;

    const cityMatch = line.match(/^\[\[CITY\|(.*)\]\]$/);
    if (cityMatch) {
      flushCard();
      currentCity = ensureCityBucket(report, cityMatch[1].trim());
      currentCategory = '';
      inMissingSection = false;
      currentMode = '';
      return;
    }

    if (line === '[[/CITY]]') {
      flushCard();
      currentCity = null;
      currentCategory = '';
      currentMode = '';
      return;
    }

    const categoryMatch = line.match(/^\[\[CATEGORY\|(.*)\]\]$/);
    if (categoryMatch) {
      flushCard();
      currentCategory = categoryMatch[1].trim();
      currentMode = '';
      return;
    }

    const cardMatch = line.match(/^\[\[CARD\|(.*)\]\]$/);
    if (cardMatch) {
      flushCard();
      const meta = parseMarkerMeta(cardMatch[1]);
      currentCard = {
        city: meta.city || currentCity?.name || '其他城市',
        category: meta.category || currentCategory || '未分类',
        title: meta.title || '',
        localEntries: [],
        yangzhouEntries: [],
        diffEntries: [],
        noteEntries: []
      };
      currentMode = '';
      return;
    }

    if (line === '[[/CARD]]') {
      flushCard();
      return;
    }

    const blockMatch = line.match(/^\[\[BLOCK\|(.+?)\]\]$/);
    if (blockMatch) {
      currentMode = (blockMatch[1] || '').trim().toLowerCase();
      return;
    }

    if (line === '[[SUMMARY]]') {
      currentMode = 'summary';
      return;
    }

    if (line === '[[/SUMMARY]]') {
      currentMode = '';
      return;
    }

    if (line === '[[MISSING]]') {
      flushCard();
      inMissingSection = true;
      currentCategory = '';
      currentMode = '';
      return;
    }

    if (line === '[[/MISSING]]') {
      flushCard();
      inMissingSection = false;
      currentMode = '';
      return;
    }

    if (line === '---') {
      flushCard();
      return;
    }

    const text = line.startsWith('- ') ? line.replace(/^-+\s*/, '').trim() : line;
    if (!text) return;

    if (currentMode === 'summary' && currentCity) {
      currentCity.summary.push(text);
      return;
    }

    if (!currentCard) {
      report.intro.push(text);
      return;
    }

    if (currentMode === 'local') {
      currentCard.localEntries.push(text);
      return;
    }
    if (currentMode === 'yangzhou') {
      currentCard.yangzhouEntries.push(text);
      return;
    }
    if (currentMode === 'diff') {
      currentCard.diffEntries.push(text);
      return;
    }
    if (currentMode === 'note') {
      currentCard.noteEntries.push(text);
      return;
    }

    currentCard.diffEntries.push(text);
  });

  flushCard();
  return report;
};

export const buildStructuredPolicyComparisonReport = (content = '') => {
  const raw = String(content ?? '');
  if (!raw.trim()) return createStructuredReport();
  if (raw.includes('[[CITY|') || raw.includes('[[MISSING]]')) {
    return parseModernMarkerMarkdown(raw);
  }
  if (raw.includes('[[SECTION|') || raw.includes('[[CARD|')) {
    return buildStructuredReportFromLegacy(parseLegacyMarkerMarkdown(raw));
  }
  return buildStructuredReportFromLegacy(parseLegacyMarkdown(raw));
};

export const getPolicyComparisonReportStats = (report) => {
  const cities = Array.isArray(report?.cities) ? report.cities : [];
  const totalMatched = cities.reduce(
    (sum, city) => sum + city.categories.reduce((acc, category) => acc + category.items.length, 0),
    0
  );
  const totalCategories = new Set(
    cities.flatMap((city) => city.categories.map((category) => category.title))
  ).size;

  return {
    cityCount: cities.length,
    totalMatched,
    totalCategories,
    missingCount: Array.isArray(report?.missing) ? report.missing.length : 0
  };
};
