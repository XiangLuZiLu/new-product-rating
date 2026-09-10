import { getStorage } from '../../_shared/storage.js';
import { tryDeleteImageByUrl } from '../../_shared/imageStorage.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}

export async function onRequestDelete({ request, env }) {
  try {
    const url = new URL(request.url);
    const payload = await request.json().catch(() => ({}));
    const requestedIds = Array.from(new Set((Array.isArray(payload.ids) ? payload.ids : []).map(String).filter(Boolean))).slice(0, 1000);
    const storage = getStorage(env);
    const styles = await storage.listStyles({
      search: requestedIds.length ? '' : (url.searchParams.get('search') || '')
    });
    const requestedSet = new Set(requestedIds);
    const rows = (Array.isArray(styles) ? styles.filter(Boolean) : [])
      .filter(row => !requestedIds.length || requestedSet.has(String(row.id)));
    const ids = Array.from(new Set(rows.map(row => row && row.id).filter(Boolean).map(String)));
    const imageUrls = Array.from(new Set(rows.map(row => String(row.product_image || '').trim()).filter(Boolean)));

    await Promise.all(ids.map(id => storage.deleteStyle(id)));
    const imageResults = await Promise.all(imageUrls.map(imageUrl => tryDeleteImageByUrl(env, imageUrl)));
    const imageDeletedCount = imageResults.filter(item => item && item.deleted).length;
    const imageFailedCount = imageResults.filter(item => item && item.error).length;
    return json({
      ok: true,
      deleted_count: ids.length,
      deleted_ids: ids,
      image_deleted_count: imageDeletedCount,
      image_failed_count: imageFailedCount,
      image_delete_results: imageResults
    });
  } catch (error) {
    return json({ ok: false, message: error.message || '删除款式失败' }, error.status || 500);
  }
}
