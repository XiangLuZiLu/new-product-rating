import { getStorage, normalizeStylePayload } from '../../_shared/storage.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
}

export async function onRequestGet({ request, env }) {
  try {
    const url = new URL(request.url);
    const styles = await getStorage(env).listStyles({ search: url.searchParams.get('search') || '' });
    return json({ ok: true, styles });
  } catch (e) {
    return json({ ok: false, message: e.message || '查询款式失败' }, e.status || 500);
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const payload = await request.json();
    const style = await getStorage(env).createStyle(normalizeStylePayload(payload));
    return json({ ok: true, style }, 201);
  } catch (e) {
    return json({ ok: false, message: e.message || '保存款式失败' }, e.status || 400);
  }
}
