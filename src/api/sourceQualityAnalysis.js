import axios from 'axios';

export async function fetchSourceQualityAnalysis({ keywords, startDate, endDate } = {}) {
  const params = {};
  if (keywords?.length) params.keywords = keywords.join(',');
  if (startDate) params.startDate = startDate;
  if (endDate) params.endDate = endDate;
  const res = await axios.get('/api/source-quality-analysis', { params });
  return res.data;
}
