import axios from 'axios';

// 获取历史周报列表
export async function fetchHistoryReports(params) {
  const res = await axios.get('/api/reports/history', { params });
  return res.data;
}

// 获取单个周报详情
export async function fetchReportDetail(id) {
  const res = await axios.get(`/api/reports/${id}`);
  return res.data;
}

// 删除周报
export async function deleteReport(id) {
  const res = await axios.delete(`/api/reports/${id}`);
  return res.data;
}

// 获取所有关键词
export async function fetchReportKeywords() {
  const res = await axios.get('/api/reports/keywords/list');
  return res.data;
}
