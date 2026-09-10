import { getStorage, imageSettingsFromEnv, normalizeImageSettings } from './storage.js';

const encoder = new TextEncoder();

function jsonError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function normalizeImageDriver(config) {
  return String(config.driver || 'url').trim().toLowerCase();
}

function getMaxBytes(config) {
  const mb = Number(config.image_max_size_mb || 10);
  return Math.max(1, Math.min(50, Number.isFinite(mb) ? mb : 10)) * 1024 * 1024;
}

async function resolveImageSettings(env) {
  try {
    const storage = getStorage(env);
    if (storage && typeof storage.getImageSettings === 'function') {
      return normalizeImageSettings(await storage.getImageSettings(), imageSettingsFromEnv(env));
    }
  } catch (_) {
    // 数据库暂不可用时，退回到环境变量，方便排错和迁移。
  }
  return imageSettingsFromEnv(env);
}

function safeExt(filename = '', contentType = '') {
  const byName = String(filename).toLowerCase().match(/\.([a-z0-9]{1,8})$/)?.[1];
  const byType = String(contentType).toLowerCase().split('/')[1]?.replace(/[^a-z0-9]/g, '');
  const ext = byName || byType || 'bin';
  const allow = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'avif']);
  return allow.has(ext) ? ext : 'bin';
}

function safeBaseName(filename = 'image') {
  const name = String(filename || 'image')
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return name || 'image';
}

function isUploadFileLike(value) {
  return !!value
    && typeof value.arrayBuffer === 'function'
    && typeof value.size === 'number';
}

function buildObjectKey(file, config, styleCode = '') {
  const prefix = String(config.image_key_prefix || 'review-images')
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'review-images';
  const ext = safeExt(file.name, file.type);
  const base = safeBaseName(file.name);
  const style = safeBaseName(styleCode);
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const random = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  return `${prefix}-${date}-${Date.now()}-${random}-${base}.${ext}`;
}

function withTrailingSlash(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function cleanPathPrefix(value) {
  return String(value || '').trim().replace(/^\/+|\/+$/g, '');
}

function encodedKeyPath(value) {
  return String(value || '').split('/').filter(Boolean).map(encodeURIComponent).join('/');
}

function buildPublicUrl(publicBase, key, config = {}) {
  const base = withTrailingSlash(publicBase);
  const prefix = cleanPathPrefix(config.public_image_path_prefix);
  const keyPath = encodedKeyPath(key);
  if (!base) return '';
  return prefix ? `${base}/${encodedKeyPath(prefix)}/${keyPath}` : `${base}/${keyPath}`;
}

function publicDisplayUrl(rawUrl) {
  const value = String(rawUrl || '').trim();
  if (!value) return value;
  // HTTPS 页面无法稳定直接显示 http 图片；当用户填写 http:// 七牛测试域名时，
  // 通过本站同源 HTTPS 代理展示，仍然按照用户填写的域名拼接真实图片地址。
  if (/^http:\/\//i.test(value)) {
    return `/api/public/image-proxy?url=${encodeURIComponent(value)}`;
  }
  return value;
}


function stripImageProxyUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw, 'https://local.invalid');
    if (url.pathname === '/api/public/image-proxy') {
      const target = url.searchParams.get('url') || '';
      return target ? decodeURIComponent(target) : '';
    }
  } catch (_) {}
  return raw;
}

function urlsEqualBase(rawUrl, baseUrl) {
  try {
    const url = new URL(rawUrl);
    const base = new URL(baseUrl);
    const urlPath = url.pathname.replace(/\/+$/, '');
    const basePath = base.pathname.replace(/\/+$/, '');
    return url.origin === base.origin && (basePath === '' || urlPath === basePath || urlPath.startsWith(`${basePath}/`));
  } catch (_) {
    return false;
  }
}

function removeLeadingPath(pathname, prefix) {
  const path = String(pathname || '').replace(/^\/+/, '');
  const cleanPrefix = cleanPathPrefix(prefix);
  if (!cleanPrefix) return path;
  if (path === cleanPrefix) return '';
  if (path.startsWith(`${cleanPrefix}/`)) return path.slice(cleanPrefix.length + 1);
  return path;
}

function decodeKeyPath(pathname) {
  return String(pathname || '')
    .split('/')
    .filter(Boolean)
    .map(part => {
      try { return decodeURIComponent(part); } catch { return part; }
    })
    .join('/');
}

function objectKeyFromPublicUrl(imageUrl, config = {}) {
  const input = stripImageProxyUrl(imageUrl);
  if (!input || !/^https?:\/\//i.test(input)) return '';
  let url;
  try { url = new URL(input); } catch { return ''; }

  const publicBase = withTrailingSlash(config.public_image_base_url);
  if (publicBase && urlsEqualBase(input, publicBase)) {
    const base = new URL(publicBase);
    let relativePath = url.pathname;
    const basePath = base.pathname.replace(/\/+$/, '');
    if (basePath && relativePath.startsWith(basePath)) relativePath = relativePath.slice(basePath.length);
    relativePath = removeLeadingPath(relativePath, config.public_image_path_prefix);
    const key = decodeKeyPath(relativePath);
    return key && !key.includes('..') ? key : '';
  }

  // 兼容保存成 S3 Endpoint 访问地址的旧数据。
  const endpoint = withTrailingSlash(config.s3_endpoint);
  const bucket = String(config.s3_bucket || '').trim();
  if (endpoint && bucket) {
    try {
      const ep = new URL(endpoint);
      if (url.hostname === ep.hostname) {
        let relativePath = url.pathname.replace(/^\/+/, '');
        if (relativePath === bucket) return '';
        if (relativePath.startsWith(`${bucket}/`)) relativePath = relativePath.slice(bucket.length + 1);
        const key = decodeKeyPath(relativePath);
        return key && !key.includes('..') ? key : '';
      }
      if (url.hostname === `${bucket}.${ep.hostname}`) {
        const key = decodeKeyPath(url.pathname);
        return key && !key.includes('..') ? key : '';
      }
    } catch (_) {}
  }
  return '';
}

function looksManagedImageKey(key, config = {}) {
  const value = String(key || '').trim();
  if (!value || value.includes('..')) return false;
  const prefix = String(config.image_key_prefix || '').trim();
  if (!prefix) return true;
  return value === prefix || value.startsWith(`${prefix}-`) || value.startsWith(`${prefix}/`);
}

async function safeDeleteManagedImage(env, config, imageUrl) {
  const driver = normalizeImageDriver(config);
  const key = objectKeyFromPublicUrl(imageUrl, config);
  if (!key || !looksManagedImageKey(key, config)) return { deleted: false, skipped: true, key: key || '' };
  if (driver === 'r2') return deleteFromR2(env, key);
  if (driver === 's3') return deleteFromS3(config, key);
  return { deleted: false, skipped: true, key };
}

export async function deleteImageByUrl(env, imageUrl) {
  if (!imageUrl) return { deleted: false, skipped: true };
  const config = await resolveImageSettings(env);
  return safeDeleteManagedImage(env, config, imageUrl);
}

export async function tryDeleteImageByUrl(env, imageUrl) {
  try {
    return await deleteImageByUrl(env, imageUrl);
  } catch (error) {
    return { deleted: false, skipped: false, error: error?.message || '删除图片失败' };
  }
}

export async function uploadImageFromRequest(request, env) {
  const config = await resolveImageSettings(env);
  const driver = normalizeImageDriver(config);
  if (driver === 'url' || driver === 'none' || driver === 'disabled') {
    throw jsonError('当前未启用图片上传。请在后台「图片存储配置」里选择 R2 或 S3兼容OSS。', 400);
  }

  const form = await request.formData();
  const file = form.get('file') || form.get('image');
  const styleCode = String(form.get('style_code') || '').trim();
  if (!isUploadFileLike(file)) throw jsonError('请上传图片文件字段 file', 400);
  if (!String(file.type || '').startsWith('image/')) throw jsonError('只能上传图片文件', 400);
  if (file.size <= 0) throw jsonError('图片文件为空', 400);
  const maxBytes = getMaxBytes(config);
  if (file.size > maxBytes) throw jsonError(`图片不能超过 ${Math.round(maxBytes / 1024 / 1024)}MB`, 400);

  const key = buildObjectKey(file, config, styleCode);
  const bytes = await file.arrayBuffer();
  const contentType = file.type || 'application/octet-stream';

  if (driver === 'r2') return uploadToR2(env, config, key, bytes, contentType);
  if (driver === 's3') return uploadToS3(config, key, bytes, contentType);

  throw jsonError(`不支持的图片存储方式：${driver}`, 400);
}

async function uploadToR2(env, config, key, bytes, contentType) {
  const bucket = env.IMAGE_BUCKET || env.R2_BUCKET;
  if (!bucket || typeof bucket.put !== 'function') {
    throw jsonError('当前使用 R2 图片存储，但未在 Cloudflare Pages 后台绑定 R2 bucket。请绑定变量名 IMAGE_BUCKET。', 500);
  }

  await bucket.put(key, bytes, {
    httpMetadata: {
      contentType,
      cacheControl: 'public, max-age=31536000, immutable'
    }
  });

  const publicBase = withTrailingSlash(config.public_image_base_url);
  const rawUrl = publicBase ? buildPublicUrl(publicBase, key, config) : `/api/images/${encodeURIComponent(key)}`;
  const url = publicDisplayUrl(rawUrl);
  return { key, url, raw_url: rawUrl, storage: 'r2' };
}

async function uploadToS3(config, key, bytes, contentType) {
  const endpoint = withTrailingSlash(config.s3_endpoint);
  const bucket = String(config.s3_bucket || '').trim();
  const region = String(config.s3_region || 'us-east-1').trim() || 'us-east-1';
  const accessKeyId = String(config.s3_access_key_id || '').trim();
  const secretAccessKey = String(config.s3_secret_access_key || '').trim();
  const forcePathStyle = config.s3_force_path_style !== false;

  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
    throw jsonError('当前使用 S3/OSS 图片存储，但页面配置里缺少 Endpoint、Bucket、AccessKey 或 SecretKey。', 500);
  }

  const url = buildS3ObjectUrl(endpoint, bucket, key, forcePathStyle);
  const signed = await signS3Request({ method: 'PUT', url, region, service: 's3', accessKeyId, secretAccessKey, body: bytes, contentType });
  const response = await fetch(url.toString(), {
    method: 'PUT',
    headers: signed.headers,
    body: bytes
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw jsonError(`图片上传到 S3/OSS 失败：${response.status} ${text.slice(0, 200)}`, 502);
  }

  const publicBase = withTrailingSlash(config.public_image_base_url);
  const publicUrl = publicBase ? buildPublicUrl(publicBase, key, config) : url.toString();
  return { key, url: publicDisplayUrl(publicUrl), raw_url: publicUrl, storage: 's3' };
}


async function deleteFromR2(env, key) {
  const bucket = env.IMAGE_BUCKET || env.R2_BUCKET;
  if (!bucket || typeof bucket.delete !== 'function') {
    throw jsonError('当前使用 R2 图片存储，但未绑定可删除的 R2 bucket。', 500);
  }
  await bucket.delete(key);
  return { deleted: true, key, storage: 'r2' };
}

async function deleteFromS3(config, key) {
  const endpoint = withTrailingSlash(config.s3_endpoint);
  const bucket = String(config.s3_bucket || '').trim();
  const region = String(config.s3_region || 'us-east-1').trim() || 'us-east-1';
  const accessKeyId = String(config.s3_access_key_id || '').trim();
  const secretAccessKey = String(config.s3_secret_access_key || '').trim();
  const forcePathStyle = config.s3_force_path_style !== false;
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
    throw jsonError('当前使用 S3/OSS 图片存储，但页面配置里缺少 Endpoint、Bucket、AccessKey 或 SecretKey，无法删除图片。', 500);
  }
  const url = buildS3ObjectUrl(endpoint, bucket, key, forcePathStyle);
  const signed = await signS3Request({ method: 'DELETE', url, region, service: 's3', accessKeyId, secretAccessKey, body: '' });
  const response = await fetch(url.toString(), { method: 'DELETE', headers: signed.headers });
  // 七牛/部分 S3 兼容服务删除不存在对象也可能返回 404；对于清理旧图来说可视为已清理。
  if (![200, 202, 204, 404].includes(response.status)) {
    const text = await response.text().catch(() => '');
    throw jsonError(`删除 OSS 图片失败：${response.status} ${text.slice(0, 200)}`, 502);
  }
  return { deleted: response.status !== 404, key, storage: 's3' };
}

function buildS3ObjectUrl(endpoint, bucket, key, forcePathStyle) {
  const base = new URL(endpoint);
  const encodedKey = key.split('/').map(encodeURIComponent).join('/');
  if (forcePathStyle) {
    base.pathname = `${base.pathname.replace(/\/+$/, '')}/${encodeURIComponent(bucket)}/${encodedKey}`;
    return base;
  }
  base.hostname = `${bucket}.${base.hostname}`;
  base.pathname = `${base.pathname.replace(/\/+$/, '')}/${encodedKey}`;
  return base;
}

function hex(buffer) {
  return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function sha256(data) {
  const bytes = typeof data === 'string' ? encoder.encode(data) : data;
  return crypto.subtle.digest('SHA-256', bytes);
}

async function hmac(key, data) {
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(data));
}

async function getSigningKey(secretAccessKey, dateStamp, region, service) {
  const kDate = await hmac(encoder.encode(`AWS4${secretAccessKey}`), dateStamp);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, service);
  return hmac(kService, 'aws4_request');
}

function amzDates(date = new Date()) {
  const iso = date.toISOString().replace(/[:-]|\.\d{3}/g, '');
  return { amzDate: iso, dateStamp: iso.slice(0, 8) };
}

function canonicalUri(pathname) {
  return pathname.split('/').map(part => encodeURIComponent(decodeURIComponent(part)).replace(/%2F/g, '/')).join('/');
}

async function signS3Request({ method, url, region, service, accessKeyId, secretAccessKey, body = '', contentType = '' }) {
  const { amzDate, dateStamp } = amzDates();
  const payloadHash = hex(await sha256(body || ''));
  const host = url.host;
  const headers = {
    host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate
  };
  if (contentType) headers['content-type'] = contentType;

  const canonicalHeaders = Object.entries(headers)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k.toLowerCase()}:${String(v).trim()}\n`)
    .join('');
  const signedHeaders = Object.keys(headers).sort().map(k => k.toLowerCase()).join(';');
  const canonicalRequest = [
    method,
    canonicalUri(url.pathname),
    url.searchParams.toString(),
    canonicalHeaders,
    signedHeaders,
    payloadHash
  ].join('\n');

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    hex(await sha256(canonicalRequest))
  ].join('\n');

  const signingKey = await getSigningKey(secretAccessKey, dateStamp, region, service);
  const signature = hex(await hmac(signingKey, stringToSign));
  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const outputHeaders = {
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
    authorization
  };
  if (contentType) outputHeaders['content-type'] = contentType;
  return { headers: outputHeaders };
}

export async function getImageObject(env, key) {
  const bucket = env.IMAGE_BUCKET || env.R2_BUCKET;
  if (!bucket || typeof bucket.get !== 'function') return null;
  const object = await bucket.get(key);
  if (!object) return null;
  return object;
}
