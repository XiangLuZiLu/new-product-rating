import { getStorage, normalizeScorePayload } from '../../_shared/storage.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
}

function nowDateTime() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
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

    const scoreFields = await storage.getScoreFields();
    const submission_id = String(payload.submission_id || '').trim() || newSubmissionId();
    const submitted_at = String(payload.submitted_at || '').trim() || nowDateTime();
    const review_date = String(payload.review_date || new Date().toISOString().slice(0, 10)).trim();

    const normalized = list.map(item => normalizeScorePayload({
      ...item,
      reviewer,
      review_date: item.review_date || review_date,
      submission_id,
      submitted_at
    }, scoreFields));

    const scores = [];
    for (const item of normalized) {
      scores.push(await storage.createScore(item));
    }
    return json({ ok: true, submission_id, submitted_at, scores }, 201);
  } catch (e) {
    return json({ ok: false, message: e.message || '批量提交评分失败' }, e.status || 400);
  }
}
