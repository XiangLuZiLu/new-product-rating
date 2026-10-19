function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}

export async function onRequestGet() {
  return json({
    ok: false,
    code: 'REVIEW_LINK_REQUIRED',
    message: '访问地址有问题，请联系管理员获取正确的评分链接。'
  }, 403);
}
