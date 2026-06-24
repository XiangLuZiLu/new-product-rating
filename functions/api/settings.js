import { getStorage, normalizeScoreFields, normalizeImageSettings } from '../_shared/storage.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  });
}

function redactImageSettings(settings = {}) {
  const copy = { ...settings };
  if (copy.s3_secret_access_key) copy.s3_secret_access_key = '********';
  return copy;
}

export async function onRequestGet({ env }) {
  try {
    const storage = getStorage(env);
    const scorePageCount = await storage.getScorePageCount();
    const scoreFields = await storage.getScoreFields();
    const imageSettings = storage.getImageSettings ? await storage.getImageSettings() : normalizeImageSettings({});
    return json({ ok: true, settings: { score_page_count: scorePageCount, score_fields: scoreFields, image_settings: redactImageSettings(imageSettings) } });
  } catch (e) {
    return json({ ok: false, message: e.message || '读取设置失败' }, e.status || 500);
  }
}

export async function onRequestPut({ request, env }) {
  try {
    const payload = await request.json();
    const storage = getStorage(env);
    const settings = {};
    if (payload.score_page_count !== undefined) {
      settings.score_page_count = await storage.setScorePageCount(payload.score_page_count);
    } else {
      settings.score_page_count = await storage.getScorePageCount();
    }
    if (payload.score_fields !== undefined) {
      settings.score_fields = await storage.setScoreFields(normalizeScoreFields(payload.score_fields));
    } else {
      settings.score_fields = await storage.getScoreFields();
    }
    if (payload.image_settings !== undefined) {
      if (!storage.setImageSettings) throw new Error('当前数据存储方式暂不支持页面保存图片存储配置');
      settings.image_settings = redactImageSettings(await storage.setImageSettings(payload.image_settings));
    } else if (storage.getImageSettings) {
      settings.image_settings = redactImageSettings(await storage.getImageSettings());
    }
    return json({ ok: true, settings });
  } catch (e) {
    return json({ ok: false, message: e.message || '保存设置失败' }, e.status || 400);
  }
}
