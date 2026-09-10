import { uploadImageFromRequest } from '../_shared/imageStorage.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  });
}

export async function onRequestPost({ request, env }) {
  try {
    const image = await uploadImageFromRequest(request, env);
    return json({ ok: true, image, url: image.url, key: image.key });
  } catch (e) {
    return json({ ok: false, message: e.message || '图片上传失败' }, e.status || 400);
  }
}
