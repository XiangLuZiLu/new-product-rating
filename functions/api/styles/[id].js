import { getStorage, normalizeStylePayload } from '../../_shared/storage.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
}

function parseId(params) {
  const id = String(params.id || '').trim();
  if (!id) throw new Error('ID 不正确');
  return id;
}

export async function onRequestPut({ request, env, params }) {
  try {
    const id = parseId(params);
    const payload = await request.json();
    const style = await getStorage(env).updateStyle(id, normalizeStylePayload(payload));
    return json({ ok: true, style });
  } catch (e) {
    return json({ ok: false, message: e.message || '更新款式失败' }, e.status || 400);
  }
}

export async function onRequestDelete({ env, params }) {
  try {
    const id = parseId(params);
    await getStorage(env).deleteStyle(id);
    return json({ ok: true });
  } catch (e) {
    return json({ ok: false, message: e.message || '删除款式失败' }, e.status || 400);
  }
}
