const encoder = new TextEncoder();

function jsonError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function normalizeImageDriver(env) {
  return String(env.IMAGE_STORAGE_DRIVER || env.IMAGE_DRIVER || 'url').trim().toLowerCase();
}

function getMaxBytes(env) {
  const mb = Number(env.IMAGE_MAX_SIZE_MB || 10);
  return Math.max(1, Math.min(50, Number.isFinite(mb) ? mb : 10)) * 1024 * 1024;
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

function buildObjectKey(file, env) {
  const prefix = String(env.IMAGE_KEY_PREFIX || 'review-images')
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
  const driver = normalizeImageDriver(env);
  if (driver === 'url' || driver === 'none' || driver === 'disabled') {
    throw jsonError('当前未启用图片上传。请配置 IMAGE_STORAGE_DRIVER=r2 或 s3。', 400);
  }

  const form = await request.formData();
  const file = form.get('file') || form.get('image');
  if (!(file instanceof File)) throw jsonError('请上传图片文件字段 file', 400);
  if (!String(file.type || '').startsWith('image/')) throw jsonError('只能上传图片文件', 400);
  if (file.size <= 0) throw jsonError('图片文件为空', 400);
  const maxBytes = getMaxBytes(env);
  if (file.size > maxBytes) throw jsonError(`图片不能超过 ${Math.round(maxBytes / 1024 / 1024)}MB`, 400);

  const key = buildObjectKey(file, env);
  const bytes = await file.arrayBuffer();
  const contentType = file.type || 'application/octet-stream';

  if (driver === 'r2') return uploadToR2(env, key, bytes, contentType);
  if (['s3', 'oss', 'cos', 'minio', 'qiniu', 'qiniu-s3', 'aws-s3'].includes(driver)) {
    return uploadToS3(env, key, bytes, contentType);
  }

  throw jsonError(`不支持的图片存储方式：${driver}`, 400);
}

async function uploadToR2(env, key, bytes, contentType) {
  const bucket = env.IMAGE_BUCKET || env.R2_BUCKET;
  if (!bucket || typeof bucket.put !== 'function') {
    throw jsonError('当前使用 R2 图片存储，但未绑定 R2 bucket。请在 wrangler.toml 或 Pages 设置中绑定 IMAGE_BUCKET。', 500);
  }

  await bucket.put(key, bytes, {
    httpMetadata: {
      contentType,
      cacheControl: 'public, max-age=31536000, immutable'
    }
  });

  const publicBase = withTrailingSlash(env.PUBLIC_IMAGE_BASE_URL || env.R2_PUBLIC_BASE_URL || env.IMAGE_PUBLIC_BASE_URL);
  const url = publicBase ? `${publicBase}/${encodeURI(key)}` : `/api/images/${encodeURIComponent(key)}`;
  return { key, url, storage: 'r2' };
}

async function uploadToS3(env, key, bytes, contentType) {
  const endpoint = withTrailingSlash(env.S3_ENDPOINT || env.OSS_ENDPOINT || env.IMAGE_S3_ENDPOINT);
  const bucket = String(env.S3_BUCKET || env.OSS_BUCKET || env.IMAGE_S3_BUCKET || '').trim();
  const region = String(env.S3_REGION || env.OSS_REGION || 'us-east-1').trim() || 'us-east-1';
  const accessKeyId = String(env.S3_ACCESS_KEY_ID || env.OSS_ACCESS_KEY_ID || '').trim();
  const secretAccessKey = String(env.S3_SECRET_ACCESS_KEY || env.OSS_SECRET_ACCESS_KEY || '').trim();
  const forcePathStyle = String(env.S3_FORCE_PATH_STYLE ?? 'true').toLowerCase() !== 'false';

  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
    throw jsonError('当前使用 S3/OSS 图片存储，但缺少 S3_ENDPOINT、S3_BUCKET、S3_ACCESS_KEY_ID 或 S3_SECRET_ACCESS_KEY。', 500);
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

  const publicBase = withTrailingSlash(env.S3_PUBLIC_BASE_URL || env.OSS_PUBLIC_BASE_URL || env.IMAGE_PUBLIC_BASE_URL);
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
