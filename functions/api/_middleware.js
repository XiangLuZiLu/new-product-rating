const encoder = new TextEncoder();

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  });
}

function getCookie(request, name) {
  const cookie = request.headers.get('Cookie') || '';
  return cookie
    .split(';')
    .map(v => v.trim())
    .find(v => v.startsWith(name + '='))
    ?.slice(name.length + 1);
}

function base64UrlEncode(input) {
  const bytes = typeof input === 'string' ? encoder.encode(input) : input;
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(input) {
  let s = input.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return atob(s);
}

async function hmac(data, secret) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  return base64UrlEncode(new Uint8Array(signature));
}

function safeEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
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
  if (url.pathname === '/api/login' || url.pathname === '/api/logout') return next();

  const session = await verifySession(request, env);
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
