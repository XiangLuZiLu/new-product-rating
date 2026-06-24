export async function onRequestPost() {
  return new Response(JSON.stringify({ ok: true }), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'Set-Cookie': 'session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0'
    }
  });
}
