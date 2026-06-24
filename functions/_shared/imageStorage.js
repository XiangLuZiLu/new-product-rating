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

function buildObjectKey(file, config) {
  const prefix = String(config.image_key_prefix || 'review-images')
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'review-images';
  const ext = safeExt(file.name, file.type);
  const base = safeBaseName(file.name);
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const random = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  return `${prefix}-${date}-${Date.now()}-${random}-${base}.${ext}`;
}

function withTrailingSlash(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

export async function uploadImageFromRequest(request, env) {
  const config = await resolveImageSettings(env);
  const driver = normalizeImageDriver(config);
  if (driver === 'url' || driver === 'none' || driver === 'disabled') {
    throw jsonError('当前未启用图片上传。请在后台「图片存储配置」里选择 R2 或 S3兼容OSS。', 400);
  }

  const form = await request.formData();
  const file = form.get('file') || form.get('image');
  if (!(file instanceof File)) throw jsonError('请上传图片文件字段 file', 400);
  if (!String(file.type || '').startsWith('image/')) throw jsonError('只能上传图片文件', 400);
  if (file.size <= 0) throw jsonError('图片文件为空', 400);
  const maxBytes = getMaxBytes(config);
  if (file.size > maxBytes) throw jsonError(`图片不能超过 ${Math.round(maxBytes / 1024 / 1024)}MB`, 400);

  const key = buildObjectKey(file, config);
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
  const url = publicBase ? `${publicBase}/${encodeURI(key)}` : `/api/images/${encodeURIComponent(key)}`;
  return { key, url, storage: 'r2' };
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
  const publicUrl = publicBase ? `${publicBase}/${encodeURI(key)}` : url.toString();
  return { key, url: publicUrl, storage: 's3' };
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

async function signS3Request({ method, url, region, service, accessKeyId, secretAccessKey, body, contentType }) {
  const { amzDate, dateStamp } = amzDates();
  const payloadHash = hex(await sha256(body));
  const host = url.host;
  const headers = {
    host,
    'content-type': contentType,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate
  };

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

  return {
    headers: {
      'content-type': contentType,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
      authorization
    }
  };
}

export async function getImageObject(env, key) {
  const bucket = env.IMAGE_BUCKET || env.R2_BUCKET;
  if (!bucket || typeof bucket.get !== 'function') return null;
  const object = await bucket.get(key);
  if (!object) return null;
  return object;
}
