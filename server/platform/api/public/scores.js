function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}

export async function onRequestPost() {
  return json({
    ok: false,
    code: 'LEGACY_SCORE_ENDPOINT_DISABLED',
    message: '该评分入口已关闭，请通过管理员生成的有效评分链接进入。'
  }, 403);
}
