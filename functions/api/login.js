const encoder = new TextEncoder();

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...extraHeaders }
  });
}

function base64UrlEncode(input) {
  const bytes = typeof input === 'string' ? encoder.encode(input) : input;
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
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
  const left = String(a ?? '');
  const right = String(b ?? '');
  if (!left || !right || left.length !== right.length) return false;
  let result = 0;
  for (let i = 0; i < left.length; i++) result |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return result === 0;
}

function getAdminUsername(env) {
  return String(env.ADMIN_USERNAME || 'admin');
}

function getSessionIdleSeconds(env) {
  const raw = Number(env.SESSION_IDLE_MINUTES || env.SESSION_TIMEOUT_MINUTES || 120);
  if (!Number.isFinite(raw) || raw <= 0) return 120 * 60;
  const minutes = Math.max(1, Math.min(Math.floor(raw), 43200));
  return minutes * 60;
}

async function createToken(env, username) {
  const secret = env.SESSION_SECRET || env.ADMIN_PASSWORD;
  const now = Date.now();
  const idleSeconds = getSessionIdleSeconds(env);
  const payload = base64UrlEncode(JSON.stringify({
    user: username,
    iat: now,
    exp: now + idleSeconds * 1000
  }));
  const signature = await hmac(payload, secret);
  return { token: `${payload}.${signature}`, maxAge: idleSeconds };
}

export async function onRequestPost({ request, env }) {
  if (!env.ADMIN_PASSWORD) return json({ ok: false, message: '未配置 ADMIN_PASSWORD 环境变量' }, 500);

  let body = {};
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, message: '请求格式错误' }, 400);
  }

  const expectedUsername = getAdminUsername(env);
  const inputUsername = String(body.username || '').trim();
  const inputPassword = String(body.password || '');

  if (!safeEqual(inputUsername, expectedUsername) || !safeEqual(inputPassword, String(env.ADMIN_PASSWORD))) {
    return json({ ok: false, message: '账号或密码错误' }, 401);
  }

  const { token, maxAge } = await createToken(env, expectedUsername);
  const url = new URL(request.url);
  const secure = url.protocol === 'https:' ? '; Secure' : '';
  return json({ ok: true, idle_minutes: Math.round(maxAge / 60) }, 200, {
    'Set-Cookie': `session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure}`
  });
}
