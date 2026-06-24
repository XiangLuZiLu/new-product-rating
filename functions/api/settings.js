import { getStorage } from '../_shared/storage.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  });
}

export async function onRequestGet({ env }) {
  try {
    const scorePageCount = await getStorage(env).getScorePageCount();
    return json({ ok: true, settings: { score_page_count: scorePageCount } });
  } catch (e) {
    return json({ ok: false, message: e.message || '读取设置失败' }, e.status || 500);
  }
}

export async function onRequestPut({ request, env }) {
  try {
    const payload = await request.json();
    const scorePageCount = await getStorage(env).setScorePageCount(payload.score_page_count);
    return json({ ok: true, settings: { score_page_count: scorePageCount } });
  } catch (e) {
    return json({ ok: false, message: e.message || '保存设置失败' }, e.status || 400);
  }
}
