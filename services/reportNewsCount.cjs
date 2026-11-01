// The denominator includes every collected article for this keyword and period,
// including low-scored and unscored rows. Never apply the summary score filter.
async function countPeriodNews(pool, { keyword, startDate, endDate }) {
  const [rows] = await pool.query(
    'SELECT COUNT(*) AS total_news_count FROM scored_news WHERE keyword = ? AND fetchdate BETWEEN ? AND ?',
    [keyword, startDate, endDate],
  );
  const count = Number(rows[0]?.total_news_count);
  if (!Number.isSafeInteger(count) || count < 0) throw new Error('无法取得报告期新闻总量');
  return count;
}

module.exports = { countPeriodNews };
