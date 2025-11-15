export async function fetchLowScoreDistribution(params) {
  const searchParams = new URLSearchParams(params).toString();
  const res = await fetch(`/api/low-score-distribution?${searchParams}`);
  return await res.json();
} 