import axios from 'axios';

export async function fetchNewsSourceStats(params) {
  const res = await axios.get('/api/news-source-stats', { params });
  return res.data;
} 