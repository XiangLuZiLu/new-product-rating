
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...extraHeaders }
  });
}

function bytesFromInput(input) {
  return typeof input === 'string' ? encoder.encode(input) : input;
}

function base64UrlEncode(input) {
  const bytes = bytesFromInput(input);
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const n = (a << 16) | (b << 8) | c;
    out += B64_CHARS[(n >> 18) & 63];
    out += B64_CHARS[(n >> 12) & 63];
    out += i + 1 < bytes.length ? B64_CHARS[(n >> 6) & 63] : '=';
    out += i + 2 < bytes.length ? B64_CHARS[n & 63] : '=';
  }
  return out.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecodeToBytes(input) {
  let s = String(input || '').replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const clean = s.replace(/[^A-Za-z0-9+/=]/g, '');
  const bytes = [];
  for (let i = 0; i < clean.length; i += 4) {
    const c1 = B64_CHARS.indexOf(clean[i]);
    const c2 = B64_CHARS.indexOf(clean[i + 1]);
    const c3 = clean[i + 2] === '=' ? -1 : B64_CHARS.indexOf(clean[i + 2]);
    const c4 = clean[i + 3] === '=' ? -1 : B64_CHARS.indexOf(clean[i + 3]);
    if (c1 < 0 || c2 < 0) continue;
    const n = (c1 << 18) | (c2 << 12) | ((c3 < 0 ? 0 : c3) << 6) | (c4 < 0 ? 0 : c4);
    bytes.push((n >> 16) & 255);
    if (c3 >= 0) bytes.push((n >> 8) & 255);
    if (c4 >= 0) bytes.push(n & 255);
  }
  return new Uint8Array(bytes);
}

function base64UrlDecode(input) {
  return decoder.decode(base64UrlDecodeToBytes(input));
}

function fallbackSignature(data, secret) {
  // 兜底给不支持 WebCrypto/btoa/atob 的边缘运行时使用；Cloudflare 仍优先使用 HMAC-SHA256。
  const text = `${secret}|${data}|${secret}`;
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 ^= ch;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= ch + i;
    h2 = Math.imul(h2, 0x85ebca6b) >>> 0;
  }
  return `fb.${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`;
}

async function hmac(data, secret) {
  try {
    if (globalThis.crypto && globalThis.crypto.subtle) {
      const key = await globalThis.crypto.subtle.importKey(
        'raw',
        encoder.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );
      const signature = await globalThis.crypto.subtle.sign('HMAC', key, encoder.encode(data));
      return base64UrlEncode(new Uint8Array(signature));
    }
  } catch {}
  return fallbackSignature(data, secret);
}

function safeEqual(a, b) {
  const left = String(a ?? '');
  const right = String(b ?? '');
  if (!left || !right || left.length !== right.length) return false;
  let result = 0;
  for (let i = 0; i < left.length; i++) result |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return result === 0;
}

function getCookie(request, name) {
  const cookie = request.headers.get('Cookie') || '';
  return cookie
    .split(';')
    .map(v => v.trim())
    .find(v => v.startsWith(name + '='))
    ?.slice(name.length + 1);
}

function getSessionIdleSeconds(env) {
  const raw = Number(env.SESSION_IDLE_MINUTES || env.SESSION_TIMEOUT_MINUTES || 120);
  if (!Number.isFinite(raw) || raw <= 0) return 120 * 60;
  const minutes = Math.max(1, Math.min(Math.floor(raw), 43200));
  return minutes * 60;
}

async function createSessionCookie(request, env, username) {
  const secret = env.SESSION_SECRET || env.ADMIN_PASSWORD;
  const now = Date.now();
  const idleSeconds = getSessionIdleSeconds(env);
  const payload = base64UrlEncode(JSON.stringify({
    user: username,
    iat: now,
    exp: now + idleSeconds * 1000
  }));
  const signature = await hmac(payload, secret);
  const token = `${payload}.${signature}`;
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${idleSeconds}${secure}`;
}

async function verifySession(request, env) {
  const token = getCookie(request, 'session');
  if (!token) return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;
  const secret = env.SESSION_SECRET || env.ADMIN_PASSWORD;
  if (!secret) return null;
  const expected = await hmac(payload, secret);
  if (!safeEqual(signature, expected)) return null;
  try {
    const data = JSON.parse(base64UrlDecode(payload));
    if (!data.exp || Date.now() >= data.exp) return null;
    return { username: String(data.user || 'admin') };
  } catch {
    return null;
  }
}

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);

  if (request.method === 'OPTIONS') return next();
  if (url.pathname === '/api/login' || url.pathname === '/api/logout' || url.pathname.startsWith('/api/public/')) return next();

  let session = null;
  try {
    session = await verifySession(request, env);
  } catch {
    session = null;
  }
  if (!session) return json({ ok: false, message: '未登录或登录已过期' }, 401);

  const response = await next();
  const headers = new Headers(response.headers);
  headers.append('Set-Cookie', await createSessionCookie(request, env, session.username));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}
