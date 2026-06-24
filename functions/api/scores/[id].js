import { getStorage, normalizeScoreUpdatePayload } from '../../_shared/storage.js';

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
    const storage = getStorage(env);
    const payload = await request.json();
    const scoreFields = await storage.getScoreFields();
    const score = await storage.updateScore(id, normalizeScoreUpdatePayload(payload, scoreFields));
    return json({ ok: true, score });
  } catch (e) {
    return json({ ok: false, message: e.message || '更新评分失败' }, e.status || 400);
  }
}

export async function onRequestDelete({ env, params }) {
  try {
    const id = parseId(params);
    await getStorage(env).deleteScore(id);
    return json({ ok: true });
  } catch (e) {
    return json({ ok: false, message: e.message || '删除评分失败' }, e.status || 400);
  }
}
