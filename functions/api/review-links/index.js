import { getStorage } from '../../_shared/storage.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}

export async function onRequestGet({ env }) {
  try {
    const storage = getStorage(env);
    if (typeof storage.listReviewLinks !== 'function') return json({ ok: true, links: [] });
    const links = await storage.listReviewLinks();
    return json({ ok: true, links });
  } catch (e) {
    return json({ ok: false, message: e.message || '读取评分链接失败' }, e.status || 500);
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const payload = await request.json().catch(() => ({}));
    const storage = getStorage(env);
    if (typeof storage.createReviewLink !== 'function') throw new Error('当前存储暂不支持评分链接');
    const link = await storage.createReviewLink(payload);
    return json({ ok: true, link }, 201);
  } catch (e) {
    return json({ ok: false, message: e.message || '生成评分链接失败' }, e.status || 400);
  }
}
