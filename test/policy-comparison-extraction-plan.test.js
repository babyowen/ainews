import assert from 'node:assert/strict';
import test from 'node:test';
import { createInitialExtractionBatches } from '../src/pages/PolicyComparison/extractionPlan.js';

test('policy comparison extraction starts with one batch for all selected news', () => {
  const news = Array.from({ length: 95 }, (_, index) => ({ id: index + 1 }));

  const batches = createInitialExtractionBatches(news);

  assert.equal(batches.length, 1);
  assert.equal(batches[0].id, '1');
  assert.equal(batches[0].news.length, 95);
  assert.equal(batches[0].depth, 0);
});
