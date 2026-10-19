import { getImageObject } from '../../_shared/imageStorage.js';

export async function onRequestGet({ env, params }) {
  const key = decodeURIComponent(String(params.key || ''));
  if (!key) return new Response('Not found', { status: 404 });
  const object = await getImageObject(env, key);
  if (!object) return new Response('Not found', { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata?.(headers);
  headers.set('etag', object.httpEtag);
  headers.set('cache-control', headers.get('cache-control') || 'public, max-age=31536000, immutable');
  return new Response(object.body, { headers });
}
