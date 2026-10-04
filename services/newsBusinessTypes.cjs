const LEVELS = ['缴存', '提取', '贷款', '其它'];
function decodeBusinessTypes(raw, aliases = []) {
  if (raw == null) return {tags: [], status: 'pending'};
  let values;
  try { values = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return {tags: [], status: 'invalid'}; }
  if (!Array.isArray(values)) return {tags: [], status: 'invalid'};
  if (!values.length) return {tags: [], status: 'unidentified'};
  const lookup = new Map(aliases.map(a => [JSON.stringify([a.level1, a.retired_level2]), a.canonical_level2]));
  const tags = new Map();
  for (const value of values) {
    if (!value || !LEVELS.includes(value.level1) || typeof value.level2 !== 'string' || !value.level2.trim()) return {tags: [], status: 'invalid'};
    let level2 = value.level2.trim();
    const seen = new Set();
    while (lookup.has(JSON.stringify([value.level1, level2]))) {
      if (seen.has(level2)) return {tags: [], status: 'invalid'};
      seen.add(level2);
      const next = lookup.get(JSON.stringify([value.level1, level2]));
      if (typeof next !== 'string' || !next.trim()) return {tags: [], status: 'invalid'};
      level2 = next.trim();
    }
    const tag = {level1: value.level1, level2};
    tags.set(JSON.stringify(tag), tag);
  }
  return {tags: [...tags.values()], status: 'tagged'};
}
function matchesBusinessTypes(tags, selections = []) {
  return !selections.length || selections.some(s => tags.some(t => t.level1 === s.level1 && (!s.level2 || t.level2 === s.level2)));
}
function countBusinessTypes(rows) {
  return LEVELS.map(level1 => {
    const ids = new Set();
    const children = new Map();
    for (const row of rows) for (const tag of row.businessTypes || []) {
      if (tag.level1 !== level1) continue;
      ids.add(String(row.id));
      if (!children.has(tag.level2)) children.set(tag.level2, new Set());
      children.get(tag.level2).add(String(row.id));
    }
    return {level1, count: ids.size, children: [...children].sort(([a], [b]) => a.localeCompare(b, 'zh-CN')).map(([level2, set]) => ({level2, count: set.size}))};
  });
}
module.exports = {LEVELS, decodeBusinessTypes, matchesBusinessTypes, countBusinessTypes};
