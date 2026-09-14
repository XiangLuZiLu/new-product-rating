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

function cleanCodes(payload) {
  return Array.from(new Set(
    (Array.isArray(payload?.codes) ? payload.codes : [])
      .map(value => String(value || '').trim())
      .filter(Boolean)
  ));
}

export async function onRequestDelete({ request, env }) {
  try {
    const payload = await request.json().catch(() => ({}));
    const codes = cleanCodes(payload);
    if (!codes.length) return json({ ok: false, message: '请至少选择一个评分链接' }, 400);

    const storage = getStorage(env);
    const phase = String(payload.phase || 'all').trim().toLowerCase();

    if (phase === 'keys') {
      if (codes.length > 5) return json({ ok: false, message: '单个删除工作请求最多 5 条评分链接' }, 400);
      const result = typeof storage.deleteReviewLinkKeys === 'function'
        ? await storage.deleteReviewLinkKeys(codes)
        : await storage.deleteReviewLinksBatch(codes);
      return json({ ok: true, phase: 'keys', ...result });
    }

    if (phase === 'index') {
      const result = typeof storage.cleanupReviewLinksIndex === 'function'
        ? await storage.cleanupReviewLinksIndex(codes)
        : { cleaned_count: 0, cleaned_codes: [] };
      return json({ ok: true, phase: 'index', ...result });
    }

    // Compatibility path for older admin.js versions.
    if (codes.length > 5) {
      return json({ ok: false, message: 'ESA EdgeKV 单次最多删除 5 个评分链接，请使用新版后台自动并发分批删除' }, 400);
    }
    const result = typeof storage.deleteReviewLinksBatch === 'function'
      ? await storage.deleteReviewLinksBatch(codes)
      : null;
    if (result) return json({ ok: true, phase: 'all', ...result });

    for (const code of codes) await storage.deleteReviewLink(code);
    return json({ ok: true, phase: 'all', deleted_count: codes.length, deleted_codes: codes });
  } catch (error) {
    return json({ ok: false, message: error.message || '删除评分链接失败' }, error.status || 500);
  }
}
