import assert from 'node:assert/strict';
import test from 'node:test';
import { finalizeStreamingReport } from '../src/utils/streamingReport.js';

test('done event keeps accumulated streaming content when final report is empty', () => {
  assert.equal(finalizeStreamingReport('', '已流式输出的正文'), '已流式输出的正文');
});

test('done event prefers final report when it has content', () => {
  assert.equal(finalizeStreamingReport('最终正文', '已流式输出的正文'), '最终正文');
});
