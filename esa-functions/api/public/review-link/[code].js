import { getStorage, imageSettingsFromEnv, normalizeImageSettings } from '../../../_shared/storage.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}

function nowBeijing() {
  const d = new Date(Date.now() + 8 * 60 * 60 * 1000);
  return d.toISOString().replace('T', ' ').slice(0, 19);
}
function isExpired(link) {
  const expires = String(link?.expires_at || '').replace('T', ' ').slice(0, 19);
  return !!expires && expires <= nowBeijing();
}

export async function onRequestGet({ params, env }) {
  try {
    const storage = getStorage(env);
    if (typeof storage.getReviewLink !== 'function') throw new Error('当前存储暂不支持评分链接');
    const link = await storage.getReviewLink(params.code);
    if (!link || link.deleted_at || Number(link.active ?? 1) !== 1) {
      return json({ ok: false, code: 'LINK_NOT_FOUND', message: '该评分链接不存在或已被删除，请联系管理员重新生成。' }, 404);
    }
    if (isExpired(link)) {
      return json({ ok: false, code: 'LINK_EXPIRED', message: '该评分链接已过期，请联系管理员重新生成。' }, 410);
    }
    const ids = new Set((link.style_ids || []).map(String));
    const allStyles = await storage.listStyles({ activeOnly: true });
    const styles = (allStyles || []).filter(row => ids.has(String(row.id)));
    const scoreTypes = storage.getScoreTypes ? await storage.getScoreTypes() : [];
    const scoreFields = await storage.getScoreFields();
    const gradeRules = storage.getGradeRules ? await storage.getGradeRules() : null;
    const rawImageSettings = storage.getImageSettings ? await storage.getImageSettings() : {};
    const imageSettings = normalizeImageSettings(rawImageSettings, imageSettingsFromEnv(env));
    const publicImageSettings = {
      image_key_prefix: imageSettings.image_key_prefix || 'review-images',
      public_image_base_url: imageSettings.public_image_base_url || '',
      public_image_path_prefix: imageSettings.public_image_path_prefix || '',
      s3_endpoint: imageSettings.s3_endpoint || '',
      s3_bucket: imageSettings.s3_bucket || ''
    };
    return json({ ok: true, review_link: link, styles, score_types: scoreTypes, score_fields: scoreFields, grade_rules: gradeRules, image_settings: publicImageSettings });
  } catch (e) {
    return json({ ok: false, message: e.message || '读取评分链接失败' }, e.status || 500);
  }
}
