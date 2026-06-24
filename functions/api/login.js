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

async function createToken(env, username) {
  const secret = env.SESSION_SECRET || env.ADMIN_PASSWORD;
  const payload = base64UrlEncode(JSON.stringify({ user: username, exp: Date.now() + 24 * 60 * 60 * 1000 }));
  const signature = await hmac(payload, secret);
  return `${payload}.${signature}`;
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

  const token = await createToken(env, expectedUsername);
  const url = new URL(request.url);
  const secure = url.protocol === 'https:' ? '; Secure' : '';
  return json({ ok: true }, 200, {
    'Set-Cookie': `session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400${secure}`
  });
}
