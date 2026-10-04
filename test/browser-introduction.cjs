// Offline UI + real PDF verification. Test-owned auth; no DB, cron, or model calls.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const express = require('express');
const { chromium } = require('playwright');
const { createIsolatedApp } = require('./helpers/isolatedApp.cjs');
const { getPdfBrowser } = require('../server/pdf/playwrightBrowser.cjs');
const { buildIntroductionPdfHtml } = require('../server/pdf/renderIntroductionPdf.cjs');
const root = path.resolve(__dirname, '..');
const output = process.env.INTRO_QA_DIR || path.join(os.tmpdir(), 'keydigest-introduction-qa');

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'kd-intro-fixture-'));
  const configDir = path.join(fixture, 'config');
  fs.cpSync(path.join(root, 'config'), configDir, { recursive: true, filter: file => !path.relative(path.join(root, 'config'), file).split(path.sep).includes('runtime') });
  fs.mkdirSync(path.join(configDir, 'runtime'), { recursive: true });
  const password = randomUUID();
  // No business permissions: static literature must remain readable, without granting access.
  fs.writeFileSync(path.join(configDir, 'runtime/users.json'), JSON.stringify([{ username: 'reader', password, displayName: '介绍预览', role: 'restricted', keywords: [], routes: [] }]));
  const request = createIsolatedApp({ configDir, dataDir: path.join(fixture, 'data') });
  const login = await request('POST', '/api/auth/login', { username: 'reader', password });
  assert.equal(login.status, 200);
  const token = login.body.token;
  assert.equal((await request('POST', '/api/introduction/export-pdf', { part: 'all' })).status, 401);
  for (const part of [undefined, '', 'invalid', ['all'], '../all']) {
    assert.equal((await request('POST', '/api/introduction/export-pdf', { part }, token)).status, 400);
  }
  let failExport = false;
  const app = express(); app.use(express.json());
  app.get('/api/auth/me', async (req, res) => { const r = await request('GET', '/api/auth/me', null, req.headers.authorization?.slice(7)); res.status(r.status).json(r.body); });
  app.post('/api/introduction/export-pdf', async (req, res) => {
    if (failExport) return res.status(503).json({ error: 'PDF 引擎暂不可用，请联系管理员' });
    const r = await request('POST', '/api/introduction/export-pdf', req.body, req.headers.authorization?.slice(7));
    if (r.status !== 200) return res.status(r.status).json(r.body);
    res.type('pdf').send(Buffer.from(r.body.data));
  });
  app.use(express.static(path.join(root, 'dist'))); app.get('*', (_req, res) => res.sendFile(path.join(root, 'dist/index.html')));
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(value => sessionStorage.setItem('keydigest_auth_token', value), token);
    const url = `http://127.0.0.1:${server.address().port}/introduction`;
    await page.goto(url);
    await page.locator('.intro-sheet').first().waitFor();
    assert.equal(await page.locator('.intro-sheet').count(), 3);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(1200);
    const link = page.getByRole('link', { name: '网站介绍', exact: true });
    const box = await link.boundingBox();
    const userBox = await page.locator('.sidebar-user').boundingBox();
    assert.ok(box.y + box.height <= userBox.y && box.y > 0 && userBox.y < 1000, JSON.stringify({box, userBox}));
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(output, 'general-desktop.png') });
    await page.evaluate(() => { window.introObservedSheet = document.querySelector('#general-difference'); });
    await page.getByRole('button', { name: /03\s*为什么使用/ }).click();
    await page.waitForTimeout(1300);
    await page.screenshot({ path: path.join(output, 'chapter-jump.png') });
    assert.ok(await page.evaluate(() => window.introObservedSheet === document.querySelector('#general-difference')), 'Chapter updates must retain observed content');
    assert.equal(await page.locator('#general-difference .intro-sheet-content').evaluate(el => getComputedStyle(el).opacity), '1');
    await page.screenshot({ path: path.join(output, 'difference-desktop.png') });
    await page.getByRole('button', { name: '公积金专区', exact: true }).click();
    await page.locator('#fund-overview').waitFor();
    assert.equal(await page.locator('.intro-sheet').count(), 6);
    await page.waitForTimeout(1100);
    await page.screenshot({ path: path.join(output, 'fund-desktop.png') });
    for (const part of ['general', 'fund', 'all']) {
      await page.getByLabel('PDF 导出范围').selectOption(part);
      const download = page.waitForEvent('download');
      await page.getByRole('button', { name: '导出 PDF', exact: true }).click();
      const file = await download;
      await file.saveAs(path.join(output, `${part}.pdf`));
      assert.equal(fs.readFileSync(path.join(output, `${part}.pdf`)).subarray(0, 5).toString(), '%PDF-');
      await page.getByRole('button', { name: '导出 PDF', exact: true }).waitFor();
    }
    failExport = true;
    await page.getByRole('button', { name: '导出 PDF', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'PDF 引擎暂不可用' }).waitFor();
    assert.ok(await page.getByRole('button', { name: '导出 PDF', exact: true }).isEnabled());
    failExport = false;
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await page.locator('#fund-overview').waitFor();
    await page.waitForTimeout(1100);
    await page.screenshot({ path: path.join(output, 'fund-mobile.png') });
    for (const sheet of await page.locator('.intro-sheet').all()) {
      await sheet.scrollIntoViewIfNeeded(); await page.waitForTimeout(1000);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Mobile must not overflow horizontally');
      assert.equal(await sheet.locator('.intro-sheet-content').evaluate(el => getComputedStyle(el).opacity), '1');
    }
    await page.getByRole('button', { name: '打开菜单', exact: true }).click();
    await link.click();
    assert.ok(!(await page.locator('.sidebar').getAttribute('class')).includes('mobile-open'));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload();
    await page.locator('.intro-sheet').first().waitFor();
    assert.equal(await page.locator('.intro-motion').count(), 0);
    assert.equal(await page.locator('.intro-sheet-content').last().evaluate(el => getComputedStyle(el).opacity), '1');
    await page.getByRole('button', { name: '网站总体介绍', exact: true }).click();
    await page.screenshot({ path: path.join(output, 'general-mobile.png') });
    // Check the actual print layout for clipped content and per-page footer placement.
    const printPage = await browser.newPage();
    await printPage.setContent(await buildIntroductionPdfHtml('all'));
    await printPage.evaluate(async () => { await document.fonts.ready; await Promise.all(Array.from(document.images, img => img.decode())); });
    assert.equal(await printPage.locator('img').count(), 5);
    await printPage.emulateMedia({ media: 'print' });
    const slideSizes = await printPage.locator('.intro-sheet').evaluateAll(sheets => sheets.map(sheet => {
      const { width, height } = sheet.getBoundingClientRect();
      return { width, height };
    }));
    assert.equal(slideSizes.length, 9);
    for (const size of slideSizes) assert.ok(Math.abs(size.width / size.height - 16 / 9) < 0.001, 'PDF slides must use a 16:9 landscape canvas');
    const overflow = await printPage.locator('.intro-sheet').evaluateAll(sheets => sheets.filter(sheet => {
      const content = sheet.querySelector('.intro-sheet-content').getBoundingClientRect();
      const footer = sheet.querySelector('footer').getBoundingClientRect();
      return sheet.scrollHeight > sheet.clientHeight + 1 || content.bottom > footer.top;
    }).map(sheet => sheet.id));
    assert.deepEqual(overflow, [], 'Print pages must fit without overlapping footers');
    assert.deepEqual(errors, []);
    console.log(`PASS: signed-in/no-permission access; invalid/anonymous export rejection; 3 real PDF downloads; failure recovery; desktop/mobile; reduced motion; print bounds. Artifacts: ${output}`);
  } finally {
    await browser.close();
    await (await getPdfBrowser()).close();
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(fixture, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
