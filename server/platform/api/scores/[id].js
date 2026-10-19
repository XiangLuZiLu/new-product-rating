import { getStorage } from '../../_shared/storage.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
}

function readOnly() {
  return json({ ok: false, message: '评分结果只允许查看或删除，不能编辑修改。' }, 405);
}

export async function onRequestPut() {
  return readOnly();
}

export async function onRequestDelete({ env, params }) {
  try {
    await getStorage(env).deleteScore(params.id);
    return json({ ok: true });
  } catch (error) {
    return json({ ok: false, message: error.message || '删除评分结果失败' }, error.status || 500);
  }
}
