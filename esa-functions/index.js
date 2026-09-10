import { onRequest as pagesRouter } from './[[path]].js';
import { onRequest as authMiddleware } from './api/_middleware.js';

import { onRequestDelete as clearAllData } from './api/data/clear-all.js';
import { onRequestGet as exportScores } from './api/export.js';
import { onRequestGet as getImage } from './api/images/[key].js';
import { onRequestPost as login } from './api/login.js';
import { onRequestPost as logout } from './api/logout.js';
import { onRequestGet as me } from './api/me.js';
import {
  onRequestGet as getDraft,
  onRequestPut as putDraft,
  onRequestPost as postDraft,
  onRequestDelete as deleteDraft
} from './api/public/draft.js';
import { onRequestGet as imageProxy } from './api/public/image-proxy.js';
import { onRequestGet as getPublicReviewLink } from './api/public/review-link/[code].js';
import { onRequestPost as legacyPublicScores } from './api/public/scores.js';
import { onRequestGet as legacyPublicStyles } from './api/public/styles.js';
import { onRequestPost as submitScores } from './api/public/submit.js';
import {
  onRequestGet as getReviewLink,
  onRequestPut as putReviewLink,
  onRequestDelete as deleteReviewLink
} from './api/review-links/[code].js';
import { onRequestDelete as deleteSelectedReviewLinks } from './api/review-links/delete-selected.js';
import {
  onRequestGet as listReviewLinks,
  onRequestPost as createReviewLink
} from './api/review-links/index.js';
import {
  onRequestPut as putScore,
  onRequestDelete as deleteScore
} from './api/scores/[id].js';
import { onRequestGet as scoreHistory } from './api/scores/[id]/history.js';
import { onRequestDelete as deleteScores } from './api/scores/delete-all.js';
import {
  onRequestGet as listScores,
  onRequestPost as createScore
} from './api/scores/index.js';
import {
  onRequestGet as getSettings,
  onRequestPut as putSettings
} from './api/settings.js';
import {
  onRequestPut as putStyle,
  onRequestDelete as deleteStyle
} from './api/styles/[id].js';
import { onRequestDelete as deleteStyles } from './api/styles/delete-all.js';
import { onRequestPost as importStyles } from './api/styles/import.js';
import {
  onRequestGet as listStyles,
  onRequestPost as createStyle
} from './api/styles/index.js';
import { onRequestPost as uploadImage } from './api/upload-image.js';

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...headers
    }
  });
}

function methodNotAllowed(allowed = []) {
  return json(
    { ok: false, message: 'Method Not Allowed' },
    405,
    allowed.length ? { allow: allowed.join(', ') } : {}
  );
}

function decodeParam(value) {
  try { return decodeURIComponent(value); } catch { return value; }
}

function routeApi(request) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const method = request.method.toUpperCase();

  const exact = (pathname, handlers) => {
    if (path !== pathname) return null;
    const handler = handlers[method];
    return handler
      ? { handler, params: {}, public: Boolean(handlers.public) }
      : { response: methodNotAllowed(Object.keys(handlers).filter(k => k !== 'public')) };
  };

  let match;

  match = exact('/api/login', { POST: login, public: true }); if (match) return match;
  match = exact('/api/logout', { POST: logout, public: true }); if (match) return match;
  match = exact('/api/me', { GET: me }); if (match) return match;
  match = exact('/api/settings', { GET: getSettings, PUT: putSettings }); if (match) return match;
  match = exact('/api/export', { GET: exportScores }); if (match) return match;
  match = exact('/api/upload-image', { POST: uploadImage }); if (match) return match;
  match = exact('/api/data/clear-all', { DELETE: clearAllData }); if (match) return match;

  match = exact('/api/public/draft', {
    GET: getDraft,
    PUT: putDraft,
    POST: postDraft,
    DELETE: deleteDraft,
    public: true
  }); if (match) return match;
  match = exact('/api/public/image-proxy', { GET: imageProxy, public: true }); if (match) return match;
  match = exact('/api/public/scores', { POST: legacyPublicScores, public: true }); if (match) return match;
  match = exact('/api/public/styles', { GET: legacyPublicStyles, public: true }); if (match) return match;
  match = exact('/api/public/submit', { POST: submitScores, public: true }); if (match) return match;

  let m = path.match(/^\/api\/public\/review-link\/([^/]+)$/);
  if (m) {
    if (method !== 'GET') return { response: methodNotAllowed(['GET']) };
    return { handler: getPublicReviewLink, params: { code: decodeParam(m[1]) }, public: true };
  }

  match = exact('/api/review-links/delete-selected', { DELETE: deleteSelectedReviewLinks }); if (match) return match;
  match = exact('/api/review-links', { GET: listReviewLinks, POST: createReviewLink }); if (match) return match;
  m = path.match(/^\/api\/review-links\/([^/]+)$/);
  if (m) {
    const handlers = { GET: getReviewLink, PUT: putReviewLink, DELETE: deleteReviewLink };
    const handler = handlers[method];
    return handler
      ? { handler, params: { code: decodeParam(m[1]) }, public: false }
      : { response: methodNotAllowed(Object.keys(handlers)) };
  }

  match = exact('/api/styles/delete-all', { DELETE: deleteStyles }); if (match) return match;
  match = exact('/api/styles/import', { POST: importStyles }); if (match) return match;
  match = exact('/api/styles', { GET: listStyles, POST: createStyle }); if (match) return match;
  m = path.match(/^\/api\/styles\/([^/]+)$/);
  if (m) {
    const handlers = { PUT: putStyle, DELETE: deleteStyle };
    const handler = handlers[method];
    return handler
      ? { handler, params: { id: decodeParam(m[1]) }, public: false }
      : { response: methodNotAllowed(Object.keys(handlers)) };
  }

  match = exact('/api/scores/delete-all', { DELETE: deleteScores }); if (match) return match;
  match = exact('/api/scores', { GET: listScores, POST: createScore }); if (match) return match;
  m = path.match(/^\/api\/scores\/([^/]+)\/history$/);
  if (m) {
    if (method !== 'GET') return { response: methodNotAllowed(['GET']) };
    return { handler: scoreHistory, params: { id: decodeParam(m[1]) }, public: false };
  }
  m = path.match(/^\/api\/scores\/([^/]+)$/);
  if (m) {
    const handlers = { PUT: putScore, DELETE: deleteScore };
    const handler = handlers[method];
    return handler
      ? { handler, params: { id: decodeParam(m[1]) }, public: false }
      : { response: methodNotAllowed(Object.keys(handlers)) };
  }

  m = path.match(/^\/api\/images\/([^/]+)$/);
  if (m) {
    if (method !== 'GET') return { response: methodNotAllowed(['GET']) };
    return { handler: getImage, params: { key: decodeParam(m[1]) }, public: false };
  }

  return { response: json({ ok: false, message: 'API Not Found' }, 404) };
}

async function runApi(request, env) {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        allow: 'GET, POST, PUT, DELETE, OPTIONS',
        'cache-control': 'no-store'
      }
    });
  }

  const route = routeApi(request);
  if (route.response) return route.response;

  const invoke = () => route.handler({ request, env, params: route.params || {} });
  if (route.public) return invoke();

  return authMiddleware({
    request,
    env,
    next: invoke
  });
}

export default {
  async fetch(request, context, env = {}) {
    try {
      const url = new URL(request.url);
      if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
        return await runApi(request, env);
      }

      // Static files under ./public are served by ESA Pages before this entry runs.
      // Non-file paths such as /admin and /<review-code> arrive here.
      return await pagesRouter({ request, env, context });
    } catch (error) {
      console.log('ESA Pages unhandled error:', error?.stack || error?.message || String(error));
      return json({ ok: false, message: error?.message || '服务器内部错误' }, Number(error?.status) || 500);
    }
  }
};
