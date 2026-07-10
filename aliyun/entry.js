import * as middleware from '../functions/api/_middleware.js';
import * as login from '../functions/api/login.js';
import * as logout from '../functions/api/logout.js';
import * as me from '../functions/api/me.js';
import * as exportApi from '../functions/api/export.js';
import * as settings from '../functions/api/settings.js';
import * as uploadImage from '../functions/api/upload-image.js';
import * as imageGet from '../functions/api/images/[key].js';
import * as publicStyles from '../functions/api/public/styles.js';
import * as publicScores from '../functions/api/public/scores.js';
import * as publicSubmit from '../functions/api/public/submit.js';
import * as stylesIndex from '../functions/api/styles/index.js';
import * as styleItem from '../functions/api/styles/[id].js';
import * as scoresIndex from '../functions/api/scores/index.js';
import * as scoreItem from '../functions/api/scores/[id].js';
import * as scoreHistory from '../functions/api/scores/[id]/history.js';
import * as catchAll from '../functions/[[path]].js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  });
}

function getProcessEnv() {
  try {
    if (globalThis.process && globalThis.process.env) return globalThis.process.env;
  } catch {}
  return {};
}

function buildEnv(env = {}) {
  // 阿里云 ESA 的示例入口是 fetch(request)，部分环境变量通过 process.env 注入。
  // 这里同时兼容 fetch(request, env) 与 process.env 两种形式。
  return { ...getProcessEnv(), ...(env || {}) };
}

function methodHandler(mod, method) {
  const key = `onRequest${method[0]}${method.slice(1).toLowerCase()}`;
  return mod[key] || mod.onRequest;
}

async function callModule(mod, request, env, params = {}) {
  const method = request.method.toUpperCase();
  const handler = methodHandler(mod, method);
  if (!handler) return json({ ok: false, message: 'Method Not Allowed' }, 405);
  return handler({ request, env, params, data: {}, waitUntil: () => {} });
}

function normalizeAdminPath(value) {
  const raw = String(value || 'review-admin-2026').trim().replace(/^\/+|\/+$/g, '');
  return '/' + (raw || 'review-admin-2026');
}

async function handleApi(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';

  if (path === '/api/login') return callModule(login, request, env);
  if (path === '/api/logout') return callModule(logout, request, env);
  if (path === '/api/public/styles') return callModule(publicStyles, request, env);
  if (path === '/api/public/scores') return callModule(publicScores, request, env);
  if (path === '/api/public/submit') return callModule(publicSubmit, request, env);

  const protectedNext = async () => {
    if (path === '/api/me') return callModule(me, request, env);
    if (path === '/api/export') return callModule(exportApi, request, env);
    if (path === '/api/settings') return callModule(settings, request, env);
    if (path === '/api/upload-image') return callModule(uploadImage, request, env);
    const imageMatch = path.match(/^\/api\/images\/(.+)$/);
    if (imageMatch) return callModule(imageGet, request, env, { key: decodeURIComponent(imageMatch[1]) });
    if (path === '/api/styles') return callModule(stylesIndex, request, env);
    const styleMatch = path.match(/^\/api\/styles\/([^/]+)$/);
    if (styleMatch) return callModule(styleItem, request, env, { id: decodeURIComponent(styleMatch[1]) });
    if (path === '/api/scores') return callModule(scoresIndex, request, env);
    const historyMatch = path.match(/^\/api\/scores\/([^/]+)\/history$/);
    if (historyMatch) return callModule(scoreHistory, request, env, { id: decodeURIComponent(historyMatch[1]) });
    const scoreMatch = path.match(/^\/api\/scores\/([^/]+)$/);
    if (scoreMatch) return callModule(scoreItem, request, env, { id: decodeURIComponent(scoreMatch[1]) });
    return json({ ok: false, message: 'Not Found' }, 404);
  };

  return middleware.onRequest({ request, env, next: protectedNext });
}

async function handleRequest(request, rawEnv = {}) {
  const env = buildEnv(rawEnv);
  const url = new URL(request.url);
  if (url.pathname.startsWith('/api/')) return handleApi(request, env);

  // 静态资源由 ESA Pages assets 处理；只有后台自定义入口这类未命中静态资源的请求会进入函数。
  if (url.pathname === normalizeAdminPath(env.ADMIN_PATH)) {
    return catchAll.onRequest({ request, env, params: { path: url.pathname.slice(1) } });
  }

  // 对于直接访问未知页面，尽量返回首页，便于阿里云 Pages 路由兜底。
  return new Response(null, { status: 404 });
}

export default {
  async fetch(request, env, ctx) {
    return handleRequest(request, env || {});
  }
};
