'use strict';

const fs = require('node:fs');
const path = require('node:path');

function resolveAppDataDir({ configuredDir = process.env.KEYDIGEST_DATA_DIR, fallbackDir } = {}) {
  if (!fallbackDir) throw new Error('fallbackDir is required');
  if (configuredDir) return path.resolve(configuredDir);

  const resolvedFallback = path.resolve(fallbackDir);
  try {
    // 部署环境中的 data 是指向 shared/data 的符号链接；解析真实路径可避免绑定具体 release。
    return fs.realpathSync(resolvedFallback);
  } catch (error) {
    if (error.code === 'ENOENT') return resolvedFallback;
    throw error;
  }
}

function resolveStoredPdfPath(pdfDir, storedPath) {
  if (typeof storedPath !== 'string' || !storedPath.trim()) return null;
  const filename = path.basename(storedPath.trim());
  if (!filename || path.extname(filename).toLowerCase() !== '.pdf') return null;

  const resolvedBase = path.resolve(pdfDir);
  const resolvedFile = path.resolve(resolvedBase, filename);
  if (!resolvedFile.startsWith(`${resolvedBase}${path.sep}`)) return null;
  return resolvedFile;
}

module.exports = {
  resolveAppDataDir,
  resolveStoredPdfPath,
};
