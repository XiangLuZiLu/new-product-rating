/**
 * 修复新品评分系统 vps 分支汇总 Excel 导出本地图片丢失。
 * 用法：在仓库根目录运行 node /path/to/fix-score-export-images.mjs
 * 不读取、写入或重置 SQLite；不移动或删除业务图片。
 */
import { readFileSync, writeFileSync, copyFileSync, mkdirSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';

const root = process.cwd();
const target = resolve(root, 'server/platform/api/export.js');
const marker = 'VPS_SUMMARY_LOCAL_IMAGES_FIX_V1';
let source;
try {
  source = readFileSync(target, 'utf8');
} catch {
  throw new Error(`找不到 ${target}，请先进入 new-product-rating 仓库根目录`);
}
if (source.includes(marker)) {
  console.log('已存在本地图片导出修复，无需重复执行。');
  process.exit(0);
}

function replaceExactlyOnce(content, search, replacement, label) {
  const first = content.indexOf(search);
  if (first === -1 || content.indexOf(search, first + search.length) !== -1) {
    throw new Error(`${label}：原代码与预期不符（找不到或不止一处）。未修改文件，请先核对 vps 分支版本。`);
  }
  return content.replace(search, replacement);
}

source = replaceExactlyOnce(
  source,
  "import { getStorage, gradeByScore } from '../_shared/storage.js';",
  `import { getStorage, gradeByScore } from '../_shared/storage.js';
import { readFile, stat } from 'node:fs/promises';
import { getLocalImageFile } from '../../local-image.js';
// ${marker}`,
  '插入 VPS 本地图片依赖'
);

const helper = `
// VPS 本地上传的产品图是 /image/<随机文件名>，不应通过公网域名回源下载。
// 历史更换过域名时，只要本地存在相同图片文件，也优先用本地数据。
function resolveExportLocalImageFile(rawValue, requestUrl) {
  const raw = stripSummaryImageProxyValue(rawValue, requestUrl);
  if (!raw) return null;
  try {
    const relative = raw.startsWith('image/') ? '/' + raw : raw;
    const parsed = new URL(relative, requestUrl);
    if (!parsed.pathname.startsWith('/image/')) return null;
    return getLocalImageFile(parsed.pathname);
  } catch (_) {
    return null;
  }
}

function exportLocalImageType(filePath) {
  const lower = String(filePath || '').toLowerCase();
  if (/\\.png$/.test(lower)) return { ext: 'png', contentType: 'image/png' };
  if (/\\.jpe?g$/.test(lower)) return { ext: 'jpg', contentType: 'image/jpeg' };
  if (/\\.gif$/.test(lower)) return { ext: 'gif', contentType: 'image/gif' };
  if (/\\.webp$/.test(lower)) return { ext: 'webp', contentType: 'image/webp' };
  if (/\\.avif$/.test(lower)) return { ext: 'avif', contentType: 'image/avif' };
  return null;
}

`;
source = replaceExactlyOnce(
  source,
  'async function inspectSummaryImage(rawValue, requestUrl, imageSettings = {}) {',
  helper + 'async function inspectSummaryImage(rawValue, requestUrl, imageSettings = {}) {',
  '添加本地图片定位和类型识别'
);

// 仅修改诊断函数内部，避免与其他代码中的相同语句混淆。
const inspectStart = source.indexOf('async function inspectSummaryImage(');
const fetchStart = source.indexOf('async function fetchSummaryImages(', inspectStart);
if (inspectStart < 0 || fetchStart < 0) throw new Error('找不到图片诊断或导出函数。');
let inspect = source.slice(inspectStart, fetchStart);
inspect = replaceExactlyOnce(
  inspect,
  '  if (!resolvedUrl) return result;\n\n  try {',
  `  const localFile = resolveExportLocalImageFile(rawValue, requestUrl);
  if (localFile) {
    result.source = 'local';
    result.resolved_url = String(rawValue || '');
    try {
      const info = await stat(localFile);
      result.status = 200;
      result.content_length = String(info.size);
      result.content_type = exportLocalImageType(localFile)?.contentType || '';
      result.ok = info.isFile() && info.size > 0 && info.size <= 8 * 1024 * 1024;
      result.final_url = '/image/' + encodeURIComponent(localFile.split(/[\\\\/]/).pop());
      if (!result.ok) result.error = '本地图片为空或超过导出图片 8MB 限制';
    } catch (error) {
      result.error = '读取本地图片失败：' + String(error?.message || error);
    }
    return result;
  }
  if (!resolvedUrl) return result;

  try {`,
  '扩展图片诊断以支持本地文件'
);
source = source.slice(0, inspectStart) + inspect + source.slice(fetchStart);

const fetchBegin = source.indexOf('async function fetchSummaryImages(');
const buildBegin = source.indexOf('async function buildSummaryXlsx(', fetchBegin);
if (fetchBegin < 0 || buildBegin < 0) throw new Error('找不到汇总图片下载函数。');
let fetchCode = source.slice(fetchBegin, buildBegin);
fetchCode = replaceExactlyOnce(
  fetchCode,
  "    const rawValue = String(dataRows[i].imageUrl || '').trim();\n    const target = resolveSummaryImageUrl(rawValue, requestUrl, imageSettings);",
  `    const rawValue = String(dataRows[i].imageUrl || '').trim();

    // VPS：优先直接从磁盘读取本地产品图，避免 CDN 回源、旧域名、HTTPS 和 DNS 问题。
    const localFile = resolveExportLocalImageFile(rawValue, requestUrl);
    if (localFile) {
      try {
        const info = await stat(localFile);
        const format = exportLocalImageType(localFile);
        if (!info.isFile() || !info.size || info.size > 8 * 1024 * 1024 || !format) {
          console.warn('评分汇总图片跳过：本地文件大小或格式不符合要求，行号', i + 1);
          continue;
        }
        const bytes = new Uint8Array(await readFile(localFile));
        images.push({
          filename: 'image' + (images.length + 1) + '.' + format.ext,
          ext: format.ext,
          contentType: format.contentType,
          bytes,
          dataRowIndex: i
        });
      } catch (error) {
        console.warn('评分汇总本地图片读取失败，行号', i + 1, String(error?.message || error));
      }
      continue;
    }

    // 历史云端图片、第三方图片：仍按原来的 HTTP(S) 下载流程处理。
    const target = resolveSummaryImageUrl(rawValue, requestUrl, imageSettings);`,
  '为汇总导出加入本地文件直读'
);
source = source.slice(0, fetchBegin) + fetchCode + source.slice(buildBegin);

const backupDir = join(root, 'data', 'backups', 'source-patches');
mkdirSync(backupDir, { recursive: true });
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupFile = join(backupDir, `export.js.before-local-image-fix.${timestamp}.bak`);
copyFileSync(target, backupFile);
try {
  writeFileSync(target, source, 'utf8');
  console.log('修复已写入：', target);
  console.log('原文件备份：', backupFile);
  console.log('下一步：node --check server/platform/api/export.js');
} catch (error) {
  copyFileSync(backupFile, target);
  throw error;
}
