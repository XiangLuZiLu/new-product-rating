import { getStorage } from '../../_shared/storage.js';
import { createReviewLinkBootstrapToken } from '../../_shared/reviewLinkBootstrap.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}

export async function onRequestGet({ params, env }) {
  try {
    const storage = getStorage(env);
    if (typeof storage.getReviewLink !== 'function') throw new Error('当前存储暂不支持评分链接');
    const link = await storage.getReviewLink(params.code);
    if (!link) return json({ ok: false, message: '评分链接不存在或已删除' }, 404);
    const { public_snapshot, ...summary } = link || {};
    return json({ ok: true, link: summary });
  } catch (e) {
    return json({ ok: false, message: e.message || '读取评分链接失败' }, e.status || 500);
  }
}



export async function onRequestPut({ params, request, env }) {
  try {
    const payload = await request.json().catch(() => ({}));
    const storage = getStorage(env);
    if (typeof storage.updateReviewLink !== 'function') throw new Error('当前存储暂不支持评分链接');
    const fullLink = await storage.updateReviewLink(params.code, payload);
    const access_token = await createReviewLinkBootstrapToken(fullLink, env, 420);
    const { public_snapshot, ...link } = fullLink || {};
    if (access_token) link.access_token = access_token;
    return json({ ok: true, link, access_token });
  } catch (e) {
    return json({ ok: false, message: e.message || '更新评分链接失败' }, e.status || 400);
  }
}

export async function onRequestDelete({ params, env }) {
  try {
    const storage = getStorage(env);
    if (typeof storage.deleteReviewLink !== 'function') throw new Error('当前存储暂不支持评分链接');
    await storage.deleteReviewLink(params.code);
    return json({ ok: true });
  } catch (e) {
    return json({ ok: false, message: e.message || '删除评分链接失败' }, e.status || 500);
  }
}
