// Local image storage for the VPS-only branch. Files are intentionally kept outside public/.
import { lstatSync } from 'node:fs';
import { mkdir, writeFile, rename, unlink } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const LOCAL_IMAGE_DIR = resolve(projectRoot, 'image');
const goodKey = (key) => /^[A-Za-z0-9_-]{1,170}\.(?:jpe?g|png|webp|gif|avif)$/.test(String(key || ''));
function badInput(message) { const e = new Error(message); e.status = 400; return e; }

function imageSignatureMatches(bytes, type) {
  const b = bytes;
  if (type === 'image/jpeg') return b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (type === 'image/png') return b.length >= 8 && [137,80,78,71,13,10,26,10].every((n,i) => b[i] === n);
  if (type === 'image/gif') return b.length >= 6 && /^(GIF87a|GIF89a)$/.test(Buffer.from(b.subarray(0,6)).toString('ascii'));
  if (type === 'image/webp') return b.length >= 12 && Buffer.from(b.subarray(0,4)).toString('ascii') === 'RIFF' && Buffer.from(b.subarray(8,12)).toString('ascii') === 'WEBP';
  if (type === 'image/avif') return b.length >= 16 && Buffer.from(b.subarray(4,8)).toString('ascii') === 'ftyp' && ['avif','avis'].includes(Buffer.from(b.subarray(8,12)).toString('ascii'));
  return false;
}

// IMAGE_MAGIC_AUTO_V1: 判断实际文件内容，不信任用户上传的扩展名或浏览器 MIME 类型。
// 依然严格禁止无法识别的文件，包括 SVG、HTML 等可执行内容。
function realImageFormat(bytes) {
  const formats = [
    ['image/jpeg', 'jpg'], ['image/png', 'png'], ['image/gif', 'gif'],
    ['image/webp', 'webp'], ['image/avif', 'avif']
  ];
  const detected = formats.find(([mime]) => imageSignatureMatches(bytes, mime));
  return detected ? { mime: detected[0], ext: detected[1] } : null;
}

export async function saveLocalImage(key, arrayBuffer, _declaredContentType = '') {
  // 文件名已由后端 buildObjectKey 生成，不能允许任意路径或目录穿越。
  const name = /^([A-Za-z0-9_-]{1,170})\.[A-Za-z0-9]{1,8}$/.exec(String(key || ''));
  if (!name) throw badInput('图片文件名不符合安全规则');
  const bytes = new Uint8Array(arrayBuffer);
  const actual = realImageFormat(bytes);
  if (!actual) throw badInput('无法识别图片真实格式，仅支持 JPG、PNG、GIF、WebP、AVIF');
  const realKey = `${name[1]}.${actual.ext}`;
  if (!goodKey(realKey)) throw badInput('图片文件名不符合安全规则');
  await mkdir(LOCAL_IMAGE_DIR, { recursive: true, mode: 0o750 });
  const file = join(LOCAL_IMAGE_DIR, realKey);
  const temp = join(LOCAL_IMAGE_DIR, `.${randomUUID()}.tmp`);
  try {
    await writeFile(temp, bytes, { flag:'wx', mode: 0o640 });
    await rename(temp, file);
  } catch (error) {
    await unlink(temp).catch(() => {});
    throw error;
  }
  const url = `/image/${encodeURIComponent(realKey)}`;
  return { key: realKey, url, raw_url: url, storage: 'local', content_type: actual.mime };
}

export function getLocalImageFile(pathname) {
  const match = /^\/image\/([^/]+)$/.exec(String(pathname || ''));
  if (!match) return null;
  let key;
  try { key = decodeURIComponent(match[1]); } catch { return null; }
  if (!goodKey(key)) return null;
  const file = join(LOCAL_IMAGE_DIR, key);
  try {
    const info = lstatSync(file);
    return info.isFile() && !info.isSymbolicLink() ? file : null;
  } catch { return null; }
}

export async function deleteLocalImageUrl(imageUrl, config) {
  const raw = String(imageUrl || '').trim();
  // Only delete our own relative URLs; never follow an arbitrary external host/path.
  if (!/^\/image\/[^/?#]+$/.test(raw)) return { deleted:false, skipped:true };
  const file = getLocalImageFile(raw);
  if (!file) return { deleted:false, skipped:true };
  const key = file.split(/[\\/]/).at(-1);
  const prefix = String(config.image_key_prefix || '').trim();
  if (prefix && !(key.startsWith(`${prefix}-`))) return { deleted:false, skipped:true };
  await unlink(file);
  return { deleted:true, key, storage:'local' };
}
