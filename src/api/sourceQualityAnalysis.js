import axios from 'axios';

export async function fetchSourceQualityAnalysis() {
  const res = await axios.get('/api/source-quality-analysis');
  return res.data;
}
