import { getStorage, normalizeStylePayload } from '../../_shared/storage.js';
import { tryDeleteImageByUrl } from '../../_shared/imageStorage.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
}

function parseId(params) {
  const id = String(params.id || '').trim();
  if (!id) throw new Error('ID 不正确');
  return id;
}

async function getCurrentStyle(storage, id) {
  if (typeof storage.getStyle === 'function') return storage.getStyle(id);
  const rows = await storage.listStyles({});
  return (rows || []).find(row => String(row.id) === String(id)) || null;
}

function imageChanged(oldUrl, newUrl) {
  return String(oldUrl || '').trim() && String(oldUrl || '').trim() !== String(newUrl || '').trim();
}

export async function onRequestPut({ request, env, params }) {
  try {
    const id = parseId(params);
    const storage = getStorage(env);
    const oldStyle = await getCurrentStyle(storage, id);
    const payload = normalizeStylePayload(await request.json());
    const style = await storage.updateStyle(id, payload);
    const imageDelete = imageChanged(oldStyle?.product_image, payload.product_image)
      ? await tryDeleteImageByUrl(env, oldStyle.product_image)
      : { skipped: true };
    return json({ ok: true, style, image_delete: imageDelete });
  } catch (e) {
    return json({ ok: false, message: e.message || '更新款式失败' }, e.status || 400);
  }
}

export async function onRequestDelete({ env, params }) {
  try {
    const id = parseId(params);
    const storage = getStorage(env);
    const oldStyle = await getCurrentStyle(storage, id);
    await storage.deleteStyle(id);
    const imageDelete = oldStyle?.product_image
      ? await tryDeleteImageByUrl(env, oldStyle.product_image)
      : { skipped: true };
    return json({ ok: true, image_delete: imageDelete });
  } catch (e) {
    return json({ ok: false, message: e.message || '删除款式失败' }, e.status || 400);
  }
}
