import axios from 'axios';

export async function fetchScoredNews(params) {
  const searchParams = new URLSearchParams(params).toString();
  const res = await fetch(`/api/scored-news?${searchParams}`);
  const data = await res.json();
  // 如果后端返回的是数组（兼容老数据），转成 { rows, total }
  if (Array.isArray(data)) {
    return { rows: data, total: data.length };
  }
  return data;
} 