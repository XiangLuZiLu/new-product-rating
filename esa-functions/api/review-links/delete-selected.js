import { getStorage } from '../../_shared/storage.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}

export async function onRequestDelete({ request, env }) {
  try {
    const payload = await request.json().catch(() => ({}));
    const codes = Array.from(new Set((Array.isArray(payload.codes) ? payload.codes : []).map(value => String(value || '').trim()).filter(Boolean))).slice(0, 1000);
    if (!codes.length) return json({ ok: false, message: '请至少选择一个评分链接' }, 400);
    const storage = getStorage(env);
    await Promise.all(codes.map(code => storage.deleteReviewLink(code)));
    return json({ ok: true, deleted_count: codes.length, deleted_codes: codes });
  } catch (error) {
    return json({ ok: false, message: error.message || '删除评分链接失败' }, error.status || 500);
  }
}
