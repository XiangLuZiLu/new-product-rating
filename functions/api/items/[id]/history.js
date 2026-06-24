import { getStorage } from '../../../_shared/storage.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  });
}

export async function onRequestGet({ env, params }) {
  try {
    const id = String(params.id || '').trim();
    if (!id) return json({ ok: false, message: 'ID 不正确' }, 400);
    const history = await getStorage(env).getHistory(id);
    return json({ ok: true, history });
  } catch (e) {
    return json({ ok: false, message: e.message || '读取历史失败' }, e.status || 500);
  }
}
