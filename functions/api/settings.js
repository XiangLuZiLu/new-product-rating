import { getStorage, normalizeScoreFields } from '../_shared/storage.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  });
}

export async function onRequestGet({ env }) {
  try {
    const storage = getStorage(env);
    const scorePageCount = await storage.getScorePageCount();
    const scoreFields = await storage.getScoreFields();
    return json({ ok: true, settings: { score_page_count: scorePageCount, score_fields: scoreFields } });
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
    return json({ ok: true, settings });
  } catch (e) {
    return json({ ok: false, message: e.message || '保存设置失败' }, e.status || 400);
  }
}
