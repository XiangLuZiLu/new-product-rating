import { getStorage } from '../../_shared/storage.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}

export async function onRequestGet({ env }) {
  try {
    const storage = getStorage(env);
    const styles = await storage.listStyles({ activeOnly: true });
    const scoreFields = await storage.getScoreFields();
    return json({ ok: true, styles, score_fields: scoreFields });
  } catch (e) {
    return json({ ok: false, message: e.message || '读取评分款式失败' }, e.status || 500);
  }
}
