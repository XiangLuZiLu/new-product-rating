import { getStorage } from '../../_shared/storage.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}

function normalizeLinkCode(value) {
  return String(value || '').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32);
}

function beijingDateTime(value = new Date()) {
  const d = new Date(new Date(value).getTime() + 8 * 60 * 60 * 1000);
  return d.toISOString().replace('T', ' ').slice(0, 19);
}

function linkExpired(link) {
  const expires = String(link?.expires_at || '').replace('T', ' ').slice(0, 19);
  return !!expires && expires <= beijingDateTime();
}

async function requireReviewLink(storage, value) {
  const code = normalizeLinkCode(value);
  if (!code) {
    const error = new Error('访问地址有问题，请联系管理员获取正确的评分链接。');
    error.status = 403;
    error.code = 'REVIEW_LINK_REQUIRED';
    throw error;
  }
  if (typeof storage.getReviewLink !== 'function') {
    const error = new Error('当前存储暂不支持评分链接');
    error.status = 400;
    throw error;
  }
  const link = await storage.getReviewLink(code);
  if (!link || link.deleted_at || Number(link.active ?? 1) !== 1) {
    const error = new Error('该评分链接不存在或已被删除，请联系管理员重新生成。');
    error.status = 404;
    error.code = 'LINK_NOT_FOUND';
    throw error;
  }
  if (linkExpired(link)) {
    const error = new Error('该评分链接已过期，请联系管理员重新生成。');
    error.status = 410;
    error.code = 'LINK_EXPIRED';
    throw error;
  }
  return { code, link };
}

function requestIdentity(request) {
  const url = new URL(request.url);
  return {
    reviewer: String(url.searchParams.get('reviewer') || '').trim(),
    link_code: normalizeLinkCode(url.searchParams.get('link_code') || url.searchParams.get('review_link_code') || '')
  };
}

function errorJson(error, fallback) {
  return json({ ok: false, code: error.code || undefined, message: error.message || fallback }, error.status || 400);
}

export async function onRequestGet({ request, env }) {
  try {
    const { reviewer, link_code } = requestIdentity(request);
    if (!reviewer) return json({ ok: false, message: '评分人姓名不能为空' }, 400);
    const storage = getStorage(env);
    const valid = await requireReviewLink(storage, link_code);
    if (typeof storage.getPublicDraft !== 'function') return json({ ok: true, draft: null });
    const draft = await storage.getPublicDraft(reviewer, valid.code);
    return json({ ok: true, draft: draft || null });
  } catch (e) {
    return errorJson(e, '读取评分草稿失败');
  }
}

export async function onRequestPut({ request, env }) {
  try {
    const storage = getStorage(env);
    const payload = await request.json();
    const valid = await requireReviewLink(storage, payload?.review_link_code || payload?.reviewLinkCode || '');
    if (typeof storage.savePublicDraft !== 'function') return json({ ok: true, draft: null });
    const draft = await storage.savePublicDraft({ ...payload, review_link_code: valid.code });
    return json({ ok: true, draft });
  } catch (e) {
    return errorJson(e, '保存评分草稿失败');
  }
}

export async function onRequestPost(context) {
  return onRequestPut(context);
}

export async function onRequestDelete({ request, env }) {
  try {
    const { reviewer, link_code } = requestIdentity(request);
    if (!reviewer) return json({ ok: false, message: '评分人姓名不能为空' }, 400);
    const storage = getStorage(env);
    const valid = await requireReviewLink(storage, link_code);
    if (typeof storage.deletePublicDraft === 'function') await storage.deletePublicDraft(reviewer, valid.code);
    return json({ ok: true });
  } catch (e) {
    return errorJson(e, '删除评分草稿失败');
  }
}
