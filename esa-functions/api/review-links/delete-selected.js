import { getStorage } from '../../_shared/storage.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
}

export async function onRequestDelete({ request, env }) {
  try {
    const payload = await request.json().catch(() => ({}));
    const codes = Array.from(new Set(
      (Array.isArray(payload.codes) ? payload.codes : [])
        .map(value => String(value || '').trim())
        .filter(Boolean)
    ));
    if (!codes.length) return json({ ok: false, message: '请至少选择一个评分链接' }, 400);
    if (codes.length > 5) {
      return json({ ok: false, message: 'ESA EdgeKV 单次最多删除 5 个评分链接，请分批删除' }, 400);
    }

    const storage = getStorage(env);
    if (typeof storage.deleteReviewLinksBatch === 'function') {
      const result = await storage.deleteReviewLinksBatch(codes);
      return json({ ok: true, ...result });
    }

    for (const code of codes) await storage.deleteReviewLink(code);
    return json({ ok: true, deleted_count: codes.length, deleted_codes: codes });
  } catch (error) {
    return json({ ok: false, message: error.message || '删除评分链接失败' }, error.status || 500);
  }
}
