import { getStorage } from '../../_shared/storage.js';
import { tryDeleteImageByUrl } from '../../_shared/imageStorage.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });
}

function normalizeItems(payload) {
  const items = Array.isArray(payload?.items) ? payload.items : [];
  if (items.length) {
    const seen = new Set();
    return items.map(item => ({
      id: String(item?.id || '').trim(),
      product_image: String(item?.product_image || '').trim()
    })).filter(item => item.id && !seen.has(item.id) && seen.add(item.id));
  }
  return Array.from(new Set((Array.isArray(payload?.ids) ? payload.ids : [])
    .map(value => String(value || '').trim())
    .filter(Boolean)))
    .map(id => ({ id, product_image: '' }));
}

export async function onRequestDelete({ request, env }) {
  try {
    const payload = await request.json().catch(() => ({}));
    const items = normalizeItems(payload);
    const ids = items.map(item => item.id);
    if (!ids.length) return json({ ok: false, message: '请至少选择一个款式' }, 400);

    const storage = getStorage(env);
    const phase = String(payload.phase || 'all').trim().toLowerCase();

    if (phase === 'keys') {
      if (ids.length > 5) return json({ ok: false, message: '单个删除工作请求最多 5 个款式' }, 400);
      const result = typeof storage.deleteStyleKeys === 'function'
        ? await storage.deleteStyleKeys(ids)
        : null;
      if (!result) {
        for (const id of ids) await storage.deleteStyle(id);
      }

      const imageUrls = Array.from(new Set(items.map(item => item.product_image).filter(Boolean)));
      const imageResults = await Promise.all(imageUrls.map(imageUrl => tryDeleteImageByUrl(env, imageUrl)));
      return json({
        ok: true,
        phase: 'keys',
        deleted_count: result?.deleted_count ?? ids.length,
        deleted_ids: result?.deleted_ids ?? ids,
        image_deleted_count: imageResults.filter(item => item && item.deleted).length,
        image_failed_count: imageResults.filter(item => item && item.error).length,
        image_delete_results: imageResults
      });
    }

    if (phase === 'index') {
      const result = typeof storage.cleanupStylesIndex === 'function'
        ? await storage.cleanupStylesIndex(ids)
        : { cleaned_count: 0, cleaned_ids: [] };
      return json({ ok: true, phase: 'index', ...result });
    }

    // Compatibility path for older admin.js versions.
    if (ids.length > 5) {
      return json({ ok: false, message: 'ESA EdgeKV 单次最多删除 5 个款式，请使用新版后台自动并发分批删除' }, 400);
    }
    if (typeof storage.deleteStyleKeys === 'function' && typeof storage.cleanupStylesIndex === 'function') {
      const result = await storage.deleteStyleKeys(ids);
      await storage.cleanupStylesIndex(result.deleted_ids);
      const imageUrls = Array.from(new Set(items.map(item => item.product_image).filter(Boolean)));
      const imageResults = await Promise.all(imageUrls.map(imageUrl => tryDeleteImageByUrl(env, imageUrl)));
      return json({
        ok: true,
        deleted_count: result.deleted_count,
        deleted_ids: result.deleted_ids,
        image_deleted_count: imageResults.filter(item => item && item.deleted).length,
        image_failed_count: imageResults.filter(item => item && item.error).length,
        image_delete_results: imageResults
      });
    }

    for (const id of ids) await storage.deleteStyle(id);
    return json({ ok: true, deleted_count: ids.length, deleted_ids: ids });
  } catch (error) {
    return json({ ok: false, message: error.message || '删除款式失败' }, error.status || 500);
  }
}
