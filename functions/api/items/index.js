import { getStorage, normalizePayload } from '../../_shared/storage.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  });
}

export async function onRequestGet({ request, env }) {
  try {
    const url = new URL(request.url);
    const storage = getStorage(env);
    const items = await storage.listItems({
      search: url.searchParams.get('search') || '',
      date_from: url.searchParams.get('date_from') || '',
      date_to: url.searchParams.get('date_to') || '',
      limit: url.searchParams.get('limit') || '500'
    });
    return json({ ok: true, items });
  } catch (e) {
    return json({ ok: false, message: e.message || '查询失败' }, e.status || 500);
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const payload = await request.json();
    const data = normalizePayload(payload);
    const item = await getStorage(env).createItem(data);
    return json({ ok: true, item }, 201);
  } catch (e) {
    return json({ ok: false, message: e.message || '保存失败' }, e.status || 400);
  }
}
