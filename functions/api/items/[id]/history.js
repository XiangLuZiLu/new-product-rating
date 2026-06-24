function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  });
}

export async function onRequestGet({ env, params }) {
  const id = Number(params.id);
  if (!Number.isInteger(id)) return json({ ok: false, message: 'ID 不正确' }, 400);
  const { results } = await env.DB.prepare('SELECT id, item_id, action, snapshot_json, changed_at FROM review_item_history WHERE item_id = ? ORDER BY id DESC LIMIT 100')
    .bind(id)
    .all();
  return json({ ok: true, history: results || [] });
}
