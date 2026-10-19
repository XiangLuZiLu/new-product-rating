import { getStorage } from '../../../_shared/storage.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
}

export async function onRequestGet({ env, params }) {
  try {
    const history = await getStorage(env).getScoreHistory(params.id);
    return json({ ok: true, history });
  } catch (e) {
    return json({ ok: false, message: e.message || '读取历史失败' }, e.status || 500);
  }
}
