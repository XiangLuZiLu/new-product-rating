function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  });
}

async function ensureSettingsTable(DB) {
  await DB.prepare(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `).run();
}

async function getScorePageCount(DB) {
  await ensureSettingsTable(DB);
  const row = await DB.prepare("SELECT value FROM app_settings WHERE key = 'score_page_count'").first();
  const value = Number.parseInt(row?.value || '3', 10);
  return Math.max(1, Math.min(50, Number.isFinite(value) ? value : 3));
}

async function setScorePageCount(DB, count) {
  await ensureSettingsTable(DB);
  const safeCount = Math.max(1, Math.min(50, Number.parseInt(count, 10) || 1));
  await DB.prepare(`
    INSERT INTO app_settings (key, value, updated_at)
    VALUES ('score_page_count', ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
  `).bind(String(safeCount)).run();
  return safeCount;
}

export async function onRequestGet({ env }) {
  try {
    const scorePageCount = await getScorePageCount(env.DB);
    return json({ ok: true, settings: { score_page_count: scorePageCount } });
  } catch (e) {
    return json({ ok: false, message: e.message || '读取设置失败' }, 500);
  }
}

export async function onRequestPut({ request, env }) {
  try {
    const payload = await request.json();
    const scorePageCount = await setScorePageCount(env.DB, payload.score_page_count);
    return json({ ok: true, settings: { score_page_count: scorePageCount } });
  } catch (e) {
    return json({ ok: false, message: e.message || '保存设置失败' }, 400);
  }
}
