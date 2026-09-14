const encoder = new TextEncoder();
const decoder = new TextDecoder();

function base64UrlEncodeBytes(bytes) {
  let binary = '';
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i += 1) binary += String.fromCharCode(arr[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecodeBytes(value) {
  const raw = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = raw + '='.repeat((4 - (raw.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

function stableSecret(env = {}) {
  return String(env.REVIEW_LINK_TOKEN_SECRET || env.SESSION_SECRET || env.ADMIN_PASSWORD || '').trim();
}

async function hmacSha256(secret, text) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(text)));
}

function safeLinkPayload(link = {}) {
  return {
    code: String(link.code || ''),
    name: String(link.name || ''),
    style_ids: Array.isArray(link.style_ids) ? link.style_ids.map(String) : [],
    expires_at: String(link.expires_at || ''),
    active: Number(link.active ?? 1),
    remark: String(link.remark || ''),
    created_at: String(link.created_at || ''),
    updated_at: String(link.updated_at || '')
  };
}

function safeSnapshot(snapshot = {}) {
  const styles = Array.isArray(snapshot.styles) ? snapshot.styles.slice(0, 100).map((row) => ({
    id: String(row?.id || ''),
    style_code: String(row?.style_code || ''),
    product_image: String(row?.product_image || ''),
    season: String(row?.season || ''),
    base_price: row?.base_price ?? '',
    style_remark: String(row?.style_remark || row?.remark || ''),
    active: Number(row?.active ?? 1)
  })).filter(row => row.id) : [];
  return {
    styles,
    score_types: Array.isArray(snapshot.score_types) ? snapshot.score_types : [],
    score_fields: Array.isArray(snapshot.score_fields) ? snapshot.score_fields : [],
    grade_rules: snapshot.grade_rules && typeof snapshot.grade_rules === 'object' ? snapshot.grade_rules : null,
    image_settings: snapshot.image_settings && typeof snapshot.image_settings === 'object' ? snapshot.image_settings : {}
  };
}

export async function createReviewLinkBootstrapToken(link, env = {}, ttlSeconds = 420) {
  const secret = stableSecret(env);
  if (!secret || !globalThis.crypto?.subtle || !link?.code) return '';
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    v: 1,
    iat: now,
    exp: now + Math.max(60, Math.min(900, Number(ttlSeconds) || 420)),
    link: safeLinkPayload(link),
    snapshot: safeSnapshot(link.public_snapshot || {})
  };
  let json = JSON.stringify(payload);
  let body = base64UrlEncodeBytes(encoder.encode(json));
  // Keep share links practical. If a very large style selection makes the
  // token too long, fall back to link metadata only. The EdgeKV record still
  // carries the full snapshot and will be used once propagation completes.
  if (body.length > 12000) {
    payload.snapshot = { styles: [], score_types: [], score_fields: [], grade_rules: null, image_settings: {} };
    json = JSON.stringify(payload);
    body = base64UrlEncodeBytes(encoder.encode(json));
  }
  const signature = base64UrlEncodeBytes(await hmacSha256(secret, body));
  return `${body}.${signature}`;
}

export async function verifyReviewLinkBootstrapToken(token, env = {}, expectedCode = '') {
  try {
    const secret = stableSecret(env);
    if (!secret || !globalThis.crypto?.subtle) return null;
    const [body, signature] = String(token || '').split('.');
    if (!body || !signature) return null;
    const expected = base64UrlEncodeBytes(await hmacSha256(secret, body));
    if (expected.length !== signature.length) return null;
    let mismatch = 0;
    for (let i = 0; i < expected.length; i += 1) mismatch |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
    if (mismatch !== 0) return null;
    const payload = JSON.parse(decoder.decode(base64UrlDecodeBytes(body)));
    if (!payload || payload.v !== 1 || Number(payload.exp || 0) < Math.floor(Date.now() / 1000)) return null;
    const code = String(payload.link?.code || '').trim();
    if (!code || (expectedCode && code !== String(expectedCode).trim())) return null;
    return {
      link: safeLinkPayload(payload.link),
      snapshot: safeSnapshot(payload.snapshot || {}),
      expires_at: Number(payload.exp || 0)
    };
  } catch {
    return null;
  }
}
