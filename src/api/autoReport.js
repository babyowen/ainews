async function parseJsonResponse(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || data.details || `HTTP ${response.status}`);
  }
  return data;
}

export async function fetchAutoReportConfig(authHeaders = {}) {
  const response = await fetch('/api/config/auto-report', {
    headers: authHeaders,
  });
  return parseJsonResponse(response);
}

export async function saveAutoReportConfig(config, authHeaders = {}) {
  const response = await fetch('/api/config/auto-report', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
    },
    body: JSON.stringify(config),
  });
  return parseJsonResponse(response);
}

export async function fetchAutoReportStatus(authHeaders = {}) {
  const response = await fetch('/api/auto-report/status', {
    headers: authHeaders,
  });
  return parseJsonResponse(response);
}

export async function triggerAutoReport(authHeaders = {}) {
  const response = await fetch('/api/auto-report/trigger', {
    method: 'POST',
    headers: authHeaders,
  });
  return parseJsonResponse(response);
}

export async function fetchAutoReportHistory({ page = 1, limit = 20, keyword = '' } = {}, authHeaders = {}) {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });
  if (keyword) params.set('keyword', keyword);
  const response = await fetch(`/api/auto-report/history?${params.toString()}`, {
    headers: authHeaders,
  });
  return parseJsonResponse(response);
}

export function buildAutoReportDownloadUrl(logId) {
  return `/api/auto-report/download/${encodeURIComponent(logId)}`;
}
