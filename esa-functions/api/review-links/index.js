import { getStorage } from '../../_shared/storage.js';
import { createReviewLinkBootstrapToken } from '../../_shared/reviewLinkBootstrap.js';

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

export async function onRequestPost({ request, env, context }) {
  try {
    const payload = await request.json().catch(() => ({}));
    const storage = getStorage(env);
    if (typeof storage.createReviewLinkFast === 'function') {
      const fullLink = await storage.createReviewLinkFast(payload);
      const access_token = await createReviewLinkBootstrapToken(fullLink, env, 420);
      const { public_snapshot, ...link } = fullLink || {};
      if (access_token) link.access_token = access_token;
      if (typeof storage.ensureReviewLinkIndexed === 'function') {
        if (context && typeof context.waitUntil === 'function') {
          context.waitUntil(new Promise(resolve => setTimeout(resolve, 0))
            .then(() => storage.ensureReviewLinkIndexed(fullLink.code))
            .catch(() => false));
        } else {
          await storage.ensureReviewLinkIndexed(fullLink.code).catch(() => false);
        }
      }
      return json({ ok: true, link, visibility: 'accepted', access_token }, 201);
    }
    if (typeof storage.createReviewLink !== 'function') throw new Error('当前存储暂不支持评分链接');
    const link = await storage.createReviewLink(payload);
    return json({ ok: true, link }, 201);
  } catch (e) {
    return json({ ok: false, message: e.message || '生成评分链接失败' }, e.status || 400);
  }
}
