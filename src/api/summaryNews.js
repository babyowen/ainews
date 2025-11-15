import axios from 'axios';

export async function fetchSummaryNews(params) {
  const res = await axios.get('/api/summary-news', { params });
  return res.data;
} 