import { getStorage, normalizeScorePayload } from '../../_shared/storage.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
}

export async function onRequestGet({ request, env }) {
  try {
    const url = new URL(request.url);
    const scores = await getStorage(env).listScores({
      search: url.searchParams.get('search') || '',
      date_from: url.searchParams.get('date_from') || '',
      date_to: url.searchParams.get('date_to') || '',
      limit: url.searchParams.get('limit') || '1000'
    });
    return json({ ok: true, scores });
  } catch (e) {
    return json({ ok: false, message: e.message || '查询评分失败' }, e.status || 500);
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const storage = getStorage(env);
    const payload = await request.json();
    const scoreFields = await storage.getScoreFields();
    const score = await storage.createScore(normalizeScorePayload(payload, scoreFields));
    return json({ ok: true, score }, 201);
  } catch (e) {
    return json({ ok: false, message: e.message || '保存评分失败' }, e.status || 400);
  }
}
