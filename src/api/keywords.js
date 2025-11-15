import axios from 'axios';

export async function fetchKeywords() {
  const res = await axios.get('/api/keywords');
  return res.data;
} 