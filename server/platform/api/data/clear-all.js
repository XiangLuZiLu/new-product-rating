import { getStorage } from '../../_shared/storage.js';
import { tryDeleteImageByUrl } from '../../_shared/imageStorage.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
}

export async function onRequestDelete({ env }) {
  try {
    const storage = getStorage(env);
    const scores = await storage.listScores({ limit: '10000' });
    const scoreIds = Array.from(new Set((scores || []).map(row => row && row.id).filter(Boolean).map(String)));
    for (const id of scoreIds) await storage.deleteScore(id);

    const styles = await storage.listStyles({});
    const styleRows = Array.isArray(styles) ? styles.filter(Boolean) : [];
    const styleIds = Array.from(new Set(styleRows.map(row => row && row.id).filter(Boolean).map(String)));
    const imageUrls = Array.from(new Set(styleRows.map(row => String(row.product_image || '').trim()).filter(Boolean)));
    for (const id of styleIds) await storage.deleteStyle(id);

    const imageResults = await Promise.all(imageUrls.map(imageUrl => tryDeleteImageByUrl(env, imageUrl)));
    return json({
      ok: true,
      deleted_score_count: scoreIds.length,
      deleted_style_count: styleIds.length,
      image_deleted_count: imageResults.filter(item => item && item.deleted).length,
      image_failed_count: imageResults.filter(item => item && item.error).length
    });
  } catch (error) {
    return json({ ok: false, message: error.message || '清空全部数据失败' }, error.status || 500);
  }
}
