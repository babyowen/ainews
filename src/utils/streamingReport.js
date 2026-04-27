export function finalizeStreamingReport(finalReport, accumulatedContent) {
  const report = String(finalReport || '');
  if (report.trim()) return report;
  return String(accumulatedContent || '');
}
