export function createInitialExtractionBatches(newsList = []) {
  return [{
    id: '1',
    news: Array.isArray(newsList) ? newsList : [],
    depth: 0
  }];
}
