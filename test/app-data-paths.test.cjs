'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { resolveAppDataDir, resolveStoredPdfPath } = require('../services/appDataPaths.cjs');

test('resolveAppDataDir follows release data symlink to the stable shared directory', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'keydigest-data-path-'));
  const shared = path.join(root, 'shared', 'data');
  const release = path.join(root, 'releases', 'release-a');
  fs.mkdirSync(shared, { recursive: true });
  fs.mkdirSync(release, { recursive: true });
  fs.symlinkSync(shared, path.join(release, 'data'));

  assert.equal(resolveAppDataDir({ fallbackDir: path.join(release, 'data'), configuredDir: '' }), fs.realpathSync(shared));
  assert.equal(resolveAppDataDir({ fallbackDir: '/unused', configuredDir: shared }), path.resolve(shared));
});

test('resolveStoredPdfPath maps both legacy absolute paths and new filenames into shared PDF storage', () => {
  const pdfDir = '/srv/keydigest/shared/data/auto-report-pdfs';
  assert.equal(
    resolveStoredPdfPath(pdfDir, '/srv/keydigest/releases/release-a/data/auto-report-pdfs/report.pdf'),
    path.join(pdfDir, 'report.pdf'),
  );
  assert.equal(resolveStoredPdfPath(pdfDir, 'report.pdf'), path.join(pdfDir, 'report.pdf'));
  assert.equal(resolveStoredPdfPath(pdfDir, '../../report.pdf'), path.join(pdfDir, 'report.pdf'));
  assert.equal(resolveStoredPdfPath(pdfDir, '/etc/passwd'), null);
  assert.equal(resolveStoredPdfPath(pdfDir, ''), null);
});
