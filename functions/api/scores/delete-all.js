import { getStorage } from '../../_shared/storage.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}

export async function onRequestDelete({ request, env }) {
  try {
    const url = new URL(request.url);
    const payload = await request.json().catch(() => ({}));
    const requestedIds = Array.from(new Set((Array.isArray(payload.ids) ? payload.ids : []).map(String).filter(Boolean))).slice(0, 5000);
    const storage = getStorage(env);
    let ids = requestedIds;
    if (!ids.length) {
      const scores = await storage.listScores({
        search: url.searchParams.get('search') || '',
        date_from: url.searchParams.get('date_from') || '',
        date_to: url.searchParams.get('date_to') || '',
        review_link_code: url.searchParams.get('review_link_code') || '',
        limit: url.searchParams.get('limit') || '10000'
      });
      ids = Array.from(new Set((scores || []).map(row => row && row.id).filter(Boolean).map(String)));
    }
    const deletedCount = typeof storage.deleteScoresBatch === 'function'
      ? await storage.deleteScoresBatch(ids)
      : (await Promise.all(ids.map(id => storage.deleteScore(id)))).length;
    return json({ ok: true, deleted_count: deletedCount, deleted_ids: ids });
  } catch (error) {
    return json({ ok: false, message: error.message || '删除评分结果失败' }, error.status || 500);
  }
}
