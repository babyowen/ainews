import axios from 'axios';

export async function fetchQualityAnalysisData(params) {
  const res = await axios.get('/api/quality-analysis', { params });
  return res.data;
} 