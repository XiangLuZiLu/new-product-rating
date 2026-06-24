import { getStorage, normalizeScorePayload } from '../../_shared/storage.js';

function nowDateTime() { return new Date().toISOString().replace('T', ' ').slice(0, 19); }
function newSubmissionId() { return (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') ? globalThis.crypto.randomUUID() : `submission_${Date.now()}_${Math.random().toString(36).slice(2)}`; }

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
}

export async function onRequestPost({ request, env }) {
  try {
    const storage = getStorage(env);
    const payload = await request.json();
    const scoreFields = await storage.getScoreFields();
    const score = await storage.createScore(normalizeScorePayload({ ...payload, submission_id: payload.submission_id || newSubmissionId(), submitted_at: payload.submitted_at || nowDateTime() }, scoreFields));
    return json({ ok: true, score }, 201);
  } catch (e) {
    return json({ ok: false, message: e.message || '提交评分失败' }, e.status || 400);
  }
}
