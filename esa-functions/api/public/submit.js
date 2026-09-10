import { getStorage, normalizeScorePayload } from '../../_shared/storage.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
}

function beijingDateTime(value = new Date()) {
  const d = new Date(new Date(value).getTime() + 8 * 60 * 60 * 1000);
  return d.toISOString().replace('T', ' ').slice(0, 19);
}

function beijingDate(value = new Date()) {
  return beijingDateTime(value).slice(0, 10);
}

function sameReviewer(a, b) {
  return String(a || '').trim().replace(/\s+/g, ' ') === String(b || '').trim().replace(/\s+/g, ' ');
}

function normalizeLinkCode(value) {
  return String(value || '').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32);
}

function linkExpired(link) {
  const expires = String(link?.expires_at || '').replace('T', ' ').slice(0, 19);
  return !!expires && expires <= beijingDateTime();
}

async function getDailySubmission(storage, reviewer, reviewDate, reviewLinkCode = '') {
  if (typeof storage.getDailySubmission === 'function') {
    const row = await storage.getDailySubmission(reviewer, reviewDate, reviewLinkCode);
    if (row) return row;
  }
  const rows = await storage.listScores({ date_from: reviewDate, date_to: reviewDate, search: reviewer, review_link_code: reviewLinkCode, limit: 5000 });
  return (rows || []).find(row => sameReviewer(row.reviewer, reviewer) && String(row.review_date || '') === reviewDate && (!reviewLinkCode || normalizeLinkCode(row.review_link_code) === normalizeLinkCode(reviewLinkCode))) || null;
}

function newSubmissionId() {
  return (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function')
    ? globalThis.crypto.randomUUID()
    : `submission_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export async function onRequestPost({ request, env }) {
  try {
    const storage = getStorage(env);
    const payload = await request.json();
    const list = Array.isArray(payload?.scores) ? payload.scores : [];
    if (!list.length) return json({ ok: false, message: '没有需要提交的评分数据' }, 400);

    const reviewer = String(payload.reviewer || list[0]?.reviewer || '').trim();
    if (!reviewer) return json({ ok: false, message: '评分人姓名不能为空' }, 400);

    const reviewLinkCode = normalizeLinkCode(payload.review_link_code || payload.reviewLinkCode || '');
    if (!reviewLinkCode) {
      return json({ ok: false, code: 'REVIEW_LINK_REQUIRED', message: '访问地址有问题，请联系管理员获取正确的评分链接。' }, 403);
    }
    if (reviewLinkCode) {
      if (typeof storage.getReviewLink !== 'function') return json({ ok: false, message: '当前存储暂不支持评分链接' }, 400);
      const link = await storage.getReviewLink(reviewLinkCode);
      if (!link || link.deleted_at || Number(link.active ?? 1) !== 1) {
        return json({ ok: false, code: 'LINK_NOT_FOUND', message: '该评分链接不存在或已被删除，请联系管理员重新生成。' }, 404);
      }
      if (linkExpired(link)) {
        return json({ ok: false, code: 'LINK_EXPIRED', message: '评分链接已过期，无法提交。' }, 410);
      }
      const allowed = new Set((link.style_ids || []).map(String));
      const forbidden = list.find(item => !allowed.has(String(item.style_id || '')));
      if (forbidden) return json({ ok: false, message: '提交内容包含该评分链接不允许评分的款式' }, 403);
    }

    const review_date = beijingDate();
    const submitted_at = beijingDateTime();

    const existing = await getDailySubmission(storage, reviewer, review_date, reviewLinkCode);
    if (existing) {
      return json({
        ok: false,
        code: 'DUPLICATE_DAILY_SUBMISSION',
        message: `${reviewer} 今天已经通过该评分链接提交过评分，不能重复提交。`,
        existing_submission_id: existing.submission_id || '',
        existing_submitted_at: existing.submitted_at || existing.created_at || ''
      }, 409);
    }

    const scoreFields = await storage.getScoreFields();
    const gradeRules = storage.getGradeRules ? await storage.getGradeRules() : undefined;
    const submission_id = String(payload.submission_id || '').trim() || newSubmissionId();

    const normalized = list.map(item => normalizeScorePayload({
      ...item,
      reviewer,
      review_date: item.review_date || review_date,
      submission_id,
      submitted_at,
      review_link_code: reviewLinkCode
    }, scoreFields, gradeRules));

    const scores = typeof storage.createScoresBatch === 'function'
      ? await storage.createScoresBatch(normalized, { reviewer, review_date, submission_id, submitted_at, review_link_code: reviewLinkCode, skip_duplicate_check: true })
      : [];
    if (!scores.length) {
      for (const item of normalized) {
        scores.push(await storage.createScore(item));
      }
    }
    if (typeof storage.deletePublicDraft === 'function') {
      try { await storage.deletePublicDraft(reviewer, reviewLinkCode); } catch (_) {}
    }
    return json({ ok: true, submission_id, submitted_at, scores }, 201);
  } catch (e) {
    return json({ ok: false, message: e.message || '批量提交评分失败' }, e.status || 400);
  }
}
