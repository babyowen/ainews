import axios from 'axios';

export async function fetchNewsWebsites() {
  const res = await axios.get('/api/news-websites');
  return res.data;
} 