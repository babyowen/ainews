import test from 'node:test';
import assert from 'node:assert/strict';

test('export selection includes only the requested booklet, in reading order', async () => {
  const { renderIntroductionPages } = await import('../src/introduction/content.mjs');
  const general = renderIntroductionPages('general');
  const fund = renderIntroductionPages('fund');
  const combined = renderIntroductionPages('all');
  assert.equal((general.match(/class="intro-sheet /g) || []).length, 3);
  assert.equal((fund.match(/class="intro-sheet /g) || []).length, 6);
  assert.equal((combined.match(/class="intro-sheet /g) || []).length, 9);
  assert.ok(!general.includes('id="fund-overview"'));
  assert.ok(!fund.includes('id="general-overview"'));
  assert.ok(combined.indexOf('id="general-overview"') < combined.indexOf('id="fund-overview"'));
  assert.throws(() => renderIntroductionPages('<script>'), /无效/);
});

test('PDF embeds the selected real screenshots without network image dependencies', async () => {
  const { buildIntroductionPdfHtml } = await import('../server/pdf/renderIntroductionPdf.cjs');
  for (const [part, count] of [['general', 1], ['fund', 4], ['all', 5]]) {
    const html = await buildIntroductionPdfHtml(part);
    assert.equal((html.match(/src="data:image\/jpeg;base64,/g) || []).length, count);
    assert.ok(!html.includes('src="/introduction-assets/'));
  }
});
