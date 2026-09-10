import { getStorage, imageSettingsFromEnv, normalizeImageSettings } from '../../_shared/storage.js';

function json(data, status = 400) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  });
}

function withTrailingSlash(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

async function resolveImageSettings(env) {
  try {
    const storage = getStorage(env);
    if (storage && typeof storage.getImageSettings === 'function') {
      return normalizeImageSettings(await storage.getImageSettings(), imageSettingsFromEnv(env));
    }
  } catch (_) {}
  return imageSettingsFromEnv(env);
}

function isAllowedSource(src, config) {
  const base = withTrailingSlash(config.public_image_base_url);
  if (!base) return false;
  try {
    const srcUrl = new URL(src);
    const baseUrl = new URL(base);
    return srcUrl.hostname === baseUrl.hostname && srcUrl.protocol === baseUrl.protocol;
  } catch {
    return false;
  }
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const src = url.searchParams.get('url') || '';
  if (!/^https?:\/\//i.test(src)) return json({ ok: false, message: '图片地址不正确' }, 400);

  const config = await resolveImageSettings(env);
  if (!isAllowedSource(src, config)) {
    return json({ ok: false, message: '图片地址不在已配置的公开访问域名下' }, 403);
  }

  const upstream = await fetch(src, {
    headers: {
      'user-agent': 'EdgeOne-Pages-Image-Proxy/1.0',
      'accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
    }
  });

  if (!upstream.ok) {
    return json({ ok: false, message: `源图片读取失败：${upstream.status}` }, upstream.status === 404 ? 404 : 502);
  }

  const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
  if (!String(contentType).toLowerCase().startsWith('image/')) {
    return json({ ok: false, message: '源地址不是图片内容' }, 415);
  }

  const headers = new Headers();
  headers.set('content-type', contentType);
  headers.set('cache-control', 'public, max-age=86400');
  headers.set('access-control-allow-origin', '*');
  return new Response(upstream.body, { status: 200, headers });
}
