import { getStorage, normalizeScoreFields, normalizeScoreTypes, normalizeImageSettings, normalizeGradeRules } from '../_shared/storage.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  });
}

function exposeImageSettings(settings = {}) {
  // 管理员登录后允许回显 SecretKey；前端默认用 password 隐藏，点击眼睛才显示。
  return { ...settings };
}

export async function onRequestGet({ env }) {
  try {
    const storage = getStorage(env);
    const scorePageCount = await storage.getScorePageCount();
    const scoreTypes = storage.getScoreTypes ? await storage.getScoreTypes() : normalizeScoreTypes([]);
    const scoreFields = await storage.getScoreFields();
    const imageSettings = storage.getImageSettings ? await storage.getImageSettings() : normalizeImageSettings({});
    const gradeRules = storage.getGradeRules ? await storage.getGradeRules() : normalizeGradeRules({});
    return json({ ok: true, settings: { score_page_count: scorePageCount, score_types: scoreTypes, score_fields: scoreFields, image_settings: exposeImageSettings(imageSettings), grade_rules: gradeRules } });
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
    if (payload.score_types !== undefined) {
      if (!storage.setScoreTypes) throw new Error('当前数据存储方式暂不支持保存评分类型');
      settings.score_types = await storage.setScoreTypes(normalizeScoreTypes(payload.score_types));
    } else {
      settings.score_types = storage.getScoreTypes ? await storage.getScoreTypes() : normalizeScoreTypes([]);
    }
    if (payload.score_fields !== undefined) {
      settings.score_fields = await storage.setScoreFields(normalizeScoreFields(payload.score_fields, settings.score_types));
    } else {
      settings.score_fields = await storage.getScoreFields();
    }
    if (payload.image_settings !== undefined) {
      if (!storage.setImageSettings) throw new Error('当前数据存储方式暂不支持页面保存图片存储配置');
      settings.image_settings = exposeImageSettings(await storage.setImageSettings(payload.image_settings));
    } else if (storage.getImageSettings) {
      settings.image_settings = exposeImageSettings(await storage.getImageSettings());
    }
    if (payload.grade_rules !== undefined) {
      if (!storage.setGradeRules) throw new Error('当前数据存储方式暂不支持保存评分等级配置');
      settings.grade_rules = await storage.setGradeRules(normalizeGradeRules(payload.grade_rules));
    } else if (storage.getGradeRules) {
      settings.grade_rules = await storage.getGradeRules();
    }
    return json({ ok: true, settings });
  } catch (e) {
    return json({ ok: false, message: e.message || '保存设置失败' }, e.status || 400);
  }
}
