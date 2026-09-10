console.info("product-review rating version: 20260722-performance-v12");
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const accessErrorView = $('#accessErrorView');
const accessErrorText = $('#accessErrorText');
const publicTopbar = $('#publicTopbar');
const nameView = $('#nameView');
const ratingView = $('#ratingView');
const doneView = $('#doneView');
const reviewerForm = $('#reviewerForm');
const reviewerNameText = $('#reviewerNameText');
const messageBox = $('#message');
const scoreCarousel = $('#scoreCarousel');
const slideDots = $('#slideDots');
const slideCounter = $('#slideCounter');
const slideHint = $('#slideHint');
const prevSlideBtn = $('#prevSlideBtn');
const nextSlideBtn = $('#nextSlideBtn');
const bottomPrevBtn = $('#bottomPrevBtn');
const bottomNextBtn = $('#bottomNextBtn');
const doneText = $('#doneText');
const restartBtn = $('#restartBtn');

const defaultScoreTypes = [
  { id: 'main', label: '综合评分' },
  { id: 'independent', label: '独立评分' }
];
const defaultScoreFields = [
  { id: 'appearance', label: '外观设计', max_score: 10, score_type: 'main', score_type_label: '综合评分' },
  { id: 'material', label: '材质触感', max_score: 10, score_type: 'main', score_type_label: '综合评分' },
  { id: 'craftsmanship', label: '工艺细节', max_score: 10, score_type: 'main', score_type_label: '综合评分' },
  { id: 'capacity', label: '容量收纳', max_score: 10, score_type: 'main', score_type_label: '综合评分' },
  { id: 'comfort', label: '背负舒适度', max_score: 10, score_type: 'main', score_type_label: '综合评分' }
];


const defaultGradeRules = {
  description: '评分项和满分由后台配置；80%以上大单，60%以上中单，40%以上小单试水，40%以下建议不下',
  rules: [
    { label: '大单', min_percent: 80 },
    { label: '中单', min_percent: 60 },
    { label: '小单试水', min_percent: 40 },
    { label: '建议不下', min_percent: 0 }
  ]
};
const gradeRuleIntro = $('#gradeRuleIntro');
const nameGradeRuleIntro = $('#nameGradeRuleIntro');

let scoreTypes = defaultScoreTypes.map(item => ({ ...item }));
let gradeRules = null;
let currentImageSettings = { image_key_prefix: 'review-images', public_image_base_url: '', public_image_path_prefix: '', s3_endpoint: '', s3_bucket: '' };
let reviewLinkCode = (() => {
  const parts = window.location.pathname.split('/').filter(Boolean);
  if (parts.length !== 1) return '';
  const code = parts[0];
  if (/^(assets|api|admin)$/i.test(code) || code.includes('.')) return '';
  return code;
})();
let reviewLinkInfo = null;
let reviewLinkUnavailable = false;
const ACCESS_ERROR_MESSAGE = '访问地址有问题，请联系管理员获取正确的评分链接。';
const EXPIRED_ERROR_MESSAGE = '该评分链接已过期，请联系管理员重新生成。';

let scoreFields = defaultScoreFields.map(item => ({ ...item }));
let reviewer = '';
let styles = [];
let drafts = [];
let currentIndex = 0;
let isRendering = false;
let scrollTimer = null;
let submittingAll = false;
let draftSaveTimer = null;
let draftSaving = false;

let activeNetworkRequests = 0;
function ensureNetworkProgressBar() {
  let bar = document.getElementById('networkProgressBar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'networkProgressBar';
    bar.className = 'network-progress-bar';
    bar.setAttribute('aria-hidden', 'true');
    document.body.appendChild(bar);
  }
  return bar;
}
function beginNetworkActivity() {
  activeNetworkRequests += 1;
  ensureNetworkProgressBar();
  document.body.classList.add('network-busy');
}
function endNetworkActivity() {
  activeNetworkRequests = Math.max(0, activeNetworkRequests - 1);
  if (!activeNetworkRequests) document.body.classList.remove('network-busy');
}
function waitForNextPaint() {
  return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}
function setButtonBusy(button, busy, text = '处理中...') {
  if (!button) return;
  if (busy) {
    if (!button.dataset.originalText) button.dataset.originalText = button.textContent;
    button.textContent = text;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    button.classList.add('is-busy');
  } else {
    if (button.dataset.originalText) button.textContent = button.dataset.originalText;
    button.disabled = false;
    button.removeAttribute('aria-busy');
    button.classList.remove('is-busy');
    delete button.dataset.originalText;
  }
}

function today() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function safeDraftName(name) {
  return encodeURIComponent(String(name || '').trim().replace(/\s+/g, ' '));
}

function draftStoragePrefix() {
  return `new-product-rating:draft:${today()}:${reviewLinkCode ? `link-${safeDraftName(reviewLinkCode)}:` : 'all:'}`;
}

function draftStorageKey(name = reviewer) {
  return `${draftStoragePrefix()}${safeDraftName(name)}`;
}

function purgeExpiredDrafts() {
  const activePrefix = draftStoragePrefix();
  const remove = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key && key.startsWith('new-product-rating:draft:') && !key.startsWith(activePrefix)) remove.push(key);
  }
  remove.forEach(key => localStorage.removeItem(key));
}

function serializeDraft(draft) {
  return {
    style_id: draft.style_id,
    season: draft.season || '',
    base_price: draft.base_price ?? '',
    remark: draft.remark || '',
    scores: draft.scores || {},
    touched_scores: draft.touched_scores || {}
  };
}


function buildDraftPayload() {
  return {
    draft_date: today(),
    reviewer,
    current_index: currentIndex,
    updated_at: new Date().toISOString(),
    review_link_code: reviewLinkCode,
    style_ids: styles.map(item => item.id),
    score_field_ids: scoreFields.map(item => item.id),
    drafts: drafts.map(serializeDraft)
  };
}

function applyDraftProgress(saved, name = reviewer) {
  if (!saved || saved.draft_date !== today() || String(saved.reviewer || '').trim() !== String(name || '').trim()) return false;
  const savedDrafts = Array.isArray(saved.drafts) ? saved.drafts : [];
  if (!savedDrafts.length || !drafts.length) return false;
  const byStyle = new Map(savedDrafts.map(item => [String(item.style_id || ''), item]));
  drafts = drafts.map((draft, index) => {
    const savedDraft = byStyle.get(String(draft.style_id || '')) || savedDrafts[index];
    if (!savedDraft) return draft;
    const scores = { ...draft.scores };
    const touched_scores = { ...draft.touched_scores };
    for (const field of scoreFields) {
      if (savedDraft.scores && Object.prototype.hasOwnProperty.call(savedDraft.scores, field.id)) {
        const max = normalizeMaxScore(field.max_score);
        scores[field.id] = Math.min(max, Math.max(0, Number.parseInt(savedDraft.scores[field.id], 10) || 0));
      }
      if (savedDraft.touched_scores && Object.prototype.hasOwnProperty.call(savedDraft.touched_scores, field.id)) {
        touched_scores[field.id] = Boolean(savedDraft.touched_scores[field.id]);
      }
    }
    return {
      ...draft,
      season: savedDraft.season ?? draft.season,
      base_price: savedDraft.base_price ?? draft.base_price,
      remark: savedDraft.remark ?? draft.remark,
      scores,
      touched_scores
    };
  });
  currentIndex = Math.max(0, Math.min(styles.length - 1, Number.parseInt(saved.current_index ?? saved.currentIndex, 10) || 0));
  drafts.forEach((_, index) => calculate(index));
  return true;
}

function saveDraftProgress() {
  if (!reviewer || !Array.isArray(drafts) || !drafts.length || submittingAll) return;
  try {
    const payload = buildDraftPayload();
    localStorage.setItem(draftStorageKey(), JSON.stringify({
      date: payload.draft_date,
      reviewer: payload.reviewer,
      currentIndex: payload.current_index,
      updatedAt: payload.updated_at,
      styleIds: payload.style_ids,
      scoreFieldIds: payload.score_field_ids,
      drafts: payload.drafts
    }));
  } catch (e) {
    console.warn('保存本地评分进度失败', e);
  }
  scheduleServerDraftSave();
}

function clearDraftProgress(name = reviewer) {
  if (!name) return;
  try {
    localStorage.removeItem(draftStorageKey(name));
  } catch (e) {
    console.warn('清理本地评分进度失败', e);
  }
}


function scheduleServerDraftSave(delay = 800) {
  if (!reviewer || !drafts.length || submittingAll) return;
  window.clearTimeout(draftSaveTimer);
  draftSaveTimer = window.setTimeout(() => saveServerDraftProgress(), delay);
}

async function saveServerDraftProgress() {
  if (!reviewer || !drafts.length || submittingAll || draftSaving) return;
  draftSaving = true;
  try {
    await requestJson('/api/public/draft', {
      method: 'PUT',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify(buildDraftPayload())
    });
  } catch (e) {
    console.warn('保存服务端评分草稿失败，将保留本机临时草稿', e);
  } finally {
    draftSaving = false;
  }
}

async function clearServerDraftProgress(name = reviewer) {
  if (!name) return;
  try {
    await requestJson(`/api/public/draft?reviewer=${encodeURIComponent(name)}${reviewLinkCode ? `&link_code=${encodeURIComponent(reviewLinkCode)}` : ''}`, { method: 'DELETE' });
  } catch (e) {
    console.warn('清理服务端评分草稿失败', e);
  }
}

function restoreDraftProgress(name = reviewer) {
  purgeExpiredDrafts();
  if (!name || !drafts.length) return false;
  try {
    const raw = localStorage.getItem(draftStorageKey(name));
    if (!raw) return false;
    const saved = JSON.parse(raw);
    if (!saved || saved.date !== today() || String(saved.reviewer || '').trim() !== String(name || '').trim()) {
      localStorage.removeItem(draftStorageKey(name));
      return false;
    }
    return applyDraftProgress({
      reviewer: saved.reviewer,
      draft_date: saved.date,
      current_index: saved.currentIndex,
      drafts: saved.drafts
    }, name);
  } catch (e) {
    console.warn('恢复本地评分进度失败', e);
    try { localStorage.removeItem(draftStorageKey(name)); } catch (_) {}
    return false;
  }
}

async function restoreServerDraftProgress(name = reviewer) {
  if (!name || !drafts.length) return false;
  try {
    const data = await requestJson(`/api/public/draft?reviewer=${encodeURIComponent(name)}${reviewLinkCode ? `&link_code=${encodeURIComponent(reviewLinkCode)}` : ''}`);
    if (!data.draft) return false;
    return applyDraftProgress(data.draft, name);
  } catch (e) {
    console.warn('恢复服务端评分草稿失败，尝试读取本机草稿', e);
    return false;
  }
}

function stripImageProxyValue(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw, window.location.origin);
    if (url.pathname === '/api/public/image-proxy') return url.searchParams.get('url') || raw;
  } catch (_) {}
  return raw;
}
function trimBaseUrl(value) { return String(value || '').trim().replace(/\/+$/, ''); }
function cleanPathPrefix(value) { return String(value || '').trim().replace(/^\/+|\/+$/g, ''); }
function encodePath(value) { return String(value || '').split('/').filter(Boolean).map(encodeURIComponent).join('/'); }
function decodePath(value) {
  return String(value || '').split('/').filter(Boolean).map(part => {
    try { return decodeURIComponent(part); } catch (_) { return part; }
  }).join('/');
}
function looksLikeManagedKey(path, settings = {}) {
  const clean = cleanPathPrefix(path);
  if (!clean || clean.includes('..')) return false;
  const prefix = cleanPathPrefix(settings.image_key_prefix || 'review-images');
  return !prefix || clean === prefix || clean.startsWith(`${prefix}-`) || clean.startsWith(`${prefix}/`);
}
function buildPublicImageUrlFromKey(key, settings = {}) {
  const base = trimBaseUrl(settings.public_image_base_url);
  if (!base || !key) return '';
  const prefix = cleanPathPrefix(settings.public_image_path_prefix);
  const keyPath = encodePath(key);
  return prefix ? `${base}/${encodePath(prefix)}/${keyPath}` : `${base}/${keyPath}`;
}
function normalizeImageUrlToCurrentPublicDomain(value, settings = currentImageSettings || {}) {
  const raw = stripImageProxyValue(value);
  if (!raw || !/^https?:\/\//i.test(raw)) return raw;
  const publicBase = trimBaseUrl(settings.public_image_base_url);
  if (!publicBase) return raw;
  const pathPrefix = cleanPathPrefix(settings.public_image_path_prefix);
  let url;
  let base;
  try { url = new URL(raw); base = new URL(publicBase); } catch (_) { return raw; }
  let key = '';
  const rawPath = decodePath(url.pathname);
  const path = cleanPathPrefix(rawPath);
  if (url.origin === base.origin) {
    const basePath = cleanPathPrefix(base.pathname);
    let relative = path;
    if (basePath && relative === basePath) relative = '';
    else if (basePath && relative.startsWith(`${basePath}/`)) relative = relative.slice(basePath.length + 1);
    if (pathPrefix && looksLikeManagedKey(relative, settings)) {
      return buildPublicImageUrlFromKey(relative, settings);
    }
    return raw;
  }
  if (pathPrefix && path.startsWith(`${pathPrefix}/`)) {
    key = path.slice(pathPrefix.length + 1);
  }
  const endpoint = trimBaseUrl(settings.s3_endpoint);
  const bucket = String(settings.s3_bucket || '').trim();
  if (!key && endpoint && bucket) {
    try {
      const ep = new URL(endpoint);
      if (url.hostname === ep.hostname) {
        let relative = path;
        if (relative.startsWith(`${bucket}/`)) relative = relative.slice(bucket.length + 1);
        if (pathPrefix && relative.startsWith(`${pathPrefix}/`)) relative = relative.slice(pathPrefix.length + 1);
        if (looksLikeManagedKey(relative, settings)) key = relative;
      } else if (url.hostname === `${bucket}.${ep.hostname}`) {
        let relative = path;
        if (pathPrefix && relative.startsWith(`${pathPrefix}/`)) relative = relative.slice(pathPrefix.length + 1);
        if (looksLikeManagedKey(relative, settings)) key = relative;
      }
    } catch (_) {}
  }
  if (!key && looksLikeManagedKey(path, settings)) key = path;
  if (!key) {
    const managedPrefix = cleanPathPrefix(settings.image_key_prefix || 'review-images');
    const marker = managedPrefix ? `${managedPrefix}-` : '';
    if (marker) {
      const parts = path.split('/');
      const index = parts.findIndex(part => part.startsWith(marker));
      if (index >= 0) key = parts.slice(index).join('/');
    }
  }
  return key ? buildPublicImageUrlFromKey(key, settings) : raw;
}
function displayImageUrl(value) {
  // 图片已经通过 EdgeOne HTTPS 加速，直接访问公开地址。
  // 不再经过 /api/public/image-proxy，避免接口不存在导致 404。
  return normalizeImageUrlToCurrentPublicDomain(value);
}

function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeMaxScore(value) {
  const n = Number.parseInt(value ?? 10, 10);
  if (!Number.isFinite(n) || n <= 0) return 10;
  return Math.max(1, Math.min(100, n));
}

function makeScoreTypeId(value, index = 0) {
  const raw = String(value || '').trim();
  const lowered = raw.toLowerCase();
  if (['main', 'general', 'total', '综合', '综合评分', '计入总分'].includes(lowered)) return 'main';
  if (['independent', 'standalone', 'single', 'extra', 'separate', '独立', '独立评分', '不计入总分'].includes(lowered)) return 'independent';
  return raw.replace(/[^a-zA-Z0-9_\u4e00-\u9fa5-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 48) || `type_${index + 1}`;
}
function normalizeScoreType(value) { return makeScoreTypeId(value, 0); }
function normalizeBool(value, fallback = true) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const text = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'on', '计入', '计入总分'].includes(text)) return true;
  if (['false', '0', 'no', 'off', '不计入', '不计入总分'].includes(text)) return false;
  return fallback;
}
function normalizeScoreTypes(types) {
  const list = Array.isArray(types) ? types : defaultScoreTypes;
  const used = new Set();
  const normalized = list.map((type, index) => {
    const label = String(type?.label || type?.name || '').trim();
    if (!label) return null;
    let id = makeScoreTypeId(type.id || type.key || label, index);
    let suffix = 2;
    const base = id;
    while (used.has(id)) id = `${base}_${suffix++}`;
    used.add(id);
    return { id, label };
  }).filter(Boolean);
  return normalized.length ? normalized : defaultScoreTypes.map(item => ({ ...item }));
}
function scoreTypeMeta(value, fallback = {}) {
  const id = normalizeScoreType(value || fallback.score_type || fallback.type || 'main');
  const found = normalizeScoreTypes(scoreTypes).find(item => item.id === id);
  if (found) return found;
  return {
    id,
    label: String(fallback.score_type_label || fallback.type_label || id || '综合评分')
  };
}
function isMainScoreField(field) {
  // 兼容旧函数名；新版所有评分类型都作为独立评分体系累计。
  return true;
}
function scoreTypeLabel(value, field = {}) { return scoreTypeMeta(value, field).label; }
function getScoreFieldGroups() {
  const groups = new Map();
  for (const type of normalizeScoreTypes(scoreTypes)) groups.set(type.id, { ...type, fields: [] });
  for (const field of scoreFields) {
    const meta = scoreTypeMeta(field.score_type, field);
    if (!groups.has(meta.id)) groups.set(meta.id, { ...meta, fields: [] });
    groups.get(meta.id).fields.push(field);
  }
  return Array.from(groups.values()).filter(group => group.fields.length);
}
function sumMaxScore(fields) {
  return fields.reduce((sum, field) => sum + normalizeMaxScore(field.max_score), 0);
}

function normalizeScoreFields(fields) {
  if (!Array.isArray(fields)) return defaultScoreFields.map(item => ({ ...item }));
  scoreTypes = normalizeScoreTypes(scoreTypes);
  const normalized = fields.map((field, index) => {
    const typeId = normalizeScoreType(field.score_type ?? field.type ?? field.group ?? field.category);
    const meta = scoreTypeMeta(typeId, field);
    return {
      id: String(field.id || `field_${index + 1}`).trim() || `field_${index + 1}`,
      label: String(field.label || '').trim(),
      max_score: normalizeMaxScore(field.max_score ?? field.maxScore ?? field.max ?? field.score_max ?? 10),
      score_type: typeId,
      score_type_label: String(field.score_type_label || field.type_label || meta.label || typeId)
    };
  }).filter(field => field.label);
  return normalized.length ? normalized : defaultScoreFields.map(item => ({ ...item }));
}

function showMessage(text, type = 'success') {
  messageBox.textContent = text;
  messageBox.classList.toggle('error', type === 'error');
  messageBox.classList.remove('hidden');
  window.clearTimeout(showMessage.timer);
  showMessage.timer = window.setTimeout(() => messageBox.classList.add('hidden'), 3600);
}


function normalizeGradeRules(value = defaultGradeRules) {
  let input = value;
  if (typeof value === 'string') {
    try { input = JSON.parse(value); } catch { input = defaultGradeRules; }
  }
  if (!input || typeof input !== 'object') input = defaultGradeRules;
  const description = String(input.description ?? input.text ?? defaultGradeRules.description).trim() || defaultGradeRules.description;
  const rawRules = Array.isArray(input.rules) && input.rules.length ? input.rules : defaultGradeRules.rules;
  const rules = rawRules.map((rule, index) => {
    const label = String(rule?.label ?? rule?.name ?? '').trim();
    if (!label) return null;
    let min = Number(rule?.min_percent ?? rule?.min ?? 0);
    if (!Number.isFinite(min)) min = 0;
    min = Math.max(0, Math.min(100, Math.round(min * 10) / 10));
    return { label, min_percent: min, order: index };
  }).filter(Boolean).sort((a, b) => b.min_percent - a.min_percent || a.order - b.order)
    .map(({ label, min_percent }) => ({ label, min_percent }));
  return { description, rules: rules.length ? rules : defaultGradeRules.rules.map(item => ({ ...item })) };
}
function applyGradeRuleIntro() {
  const config = normalizeGradeRules(gradeRules || defaultGradeRules);
  if (gradeRuleIntro) gradeRuleIntro.textContent = config.description;
  if (nameGradeRuleIntro) nameGradeRuleIntro.textContent = config.description;
}


function publicDataUrl() {
  if (!reviewLinkCode) throw new Error(ACCESS_ERROR_MESSAGE);
  return `/api/public/review-link/${encodeURIComponent(reviewLinkCode)}`;
}
function showAccessError(message = ACCESS_ERROR_MESSAGE) {
  reviewLinkUnavailable = true;
  if (accessErrorText) accessErrorText.textContent = message || ACCESS_ERROR_MESSAGE;
  [nameView, ratingView, doneView].forEach(el => el?.classList.add('hidden'));
  accessErrorView?.classList.remove('hidden');
  publicTopbar?.classList.add('hidden');
  messageBox?.classList.add('hidden');
}
function handleReviewLinkAccessError(error) {
  const expired = error?.code === 'LINK_EXPIRED' || Number(error?.status) === 410 || String(error?.message || '').includes('已过期');
  showAccessError(expired ? EXPIRED_ERROR_MESSAGE : ACCESS_ERROR_MESSAGE);
}

async function loadPublicIntro() {
  if (!reviewLinkCode) {
    showAccessError();
    return false;
  }
  try {
    const data = await requestJson(publicDataUrl());
    reviewLinkInfo = data.review_link || null;
    if (reviewLinkInfo && document.querySelector('.public-topbar h1')) document.querySelector('.public-topbar h1').textContent = reviewLinkInfo.name || '新品评审评分';
    gradeRules = normalizeGradeRules(data.grade_rules || defaultGradeRules);
    applyGradeRuleIntro();
    reviewLinkUnavailable = false;
    accessErrorView?.classList.add('hidden');
    nameView?.classList.remove('hidden');
    publicTopbar?.classList.remove('hidden');
    return true;
  } catch (e) {
    console.warn('加载前端说明文字失败，继续使用默认说明', e);
    if (reviewLinkCode) handleReviewLinkAccessError(e);
    applyGradeRuleIntro();
    return false;
  }
}
function gradeByScore(total, maxTotal = 50) {
  const max = Number(maxTotal);
  if (!Number.isFinite(max) || max <= 0) return '不参与评级';
  const percent = (Number(total || 0) / max) * 100;
  const config = normalizeGradeRules(gradeRules || defaultGradeRules);
  const matched = config.rules.find(rule => percent >= Number(rule.min_percent || 0));
  return matched?.label || config.rules[config.rules.length - 1]?.label || '建议不下';
}

function makeDraft(style) {
  const maxTotal = sumMaxScore(scoreFields);
  return {
    style_id: style.id,
    reviewer,
    review_date: today(),
    product_image: style.product_image || '',
    style_code: style.style_code || '',
    season: style.season || '',
    base_price: style.base_price ?? '',
    remark: '',
    submitted: false,
    score_id: null,
    scores: Object.fromEntries(scoreFields.map(field => [field.id, 0])),
    touched_scores: Object.fromEntries(scoreFields.map(field => [field.id, false])),
    total_score: 0,
    max_total_score: maxTotal,
    grade: gradeByScore(0, maxTotal),
    score_systems: []
  };
}

function calculate(index) {
  const draft = drafts[index];
  if (!draft) return;
  let total = 0;
  let maxTotal = 0;
  const groups = new Map();
  for (const field of scoreFields) {
    const max = normalizeMaxScore(field.max_score);
    const value = Math.min(max, Math.max(0, Number.parseInt(draft.scores?.[field.id], 10) || 0));
    draft.scores[field.id] = value;
    const meta = scoreTypeMeta(field.score_type, field);
    if (!groups.has(meta.id)) groups.set(meta.id, { id: meta.id, label: meta.label, total: 0, max: 0 });
    const group = groups.get(meta.id);
    group.total += value;
    group.max += max;
    total += value;
    maxTotal += max;
  }
  draft.total_score = total;
  draft.max_total_score = maxTotal;
  draft.grade = gradeByScore(total, maxTotal);
  draft.score_systems = Array.from(groups.values()).map(group => ({ ...group, grade: gradeByScore(group.total, group.max) }));
}

function missingFields(draft) {
  const missing = [];
  const untouched = scoreFields.filter(field => !draft?.touched_scores?.[field.id]).map(field => field.label);
  if (untouched.length) missing.push(`${untouched.length} 个评分项`);
  return missing;
}

function isComplete(draft) {
  return missingFields(draft).length === 0;
}

function showView(view) {
  [accessErrorView, nameView, ratingView, doneView].forEach(el => el?.classList.add('hidden'));
  view?.classList.remove('hidden');
}

async function requestJson(path, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  if (method !== 'GET') await waitForNextPaint();
  beginNetworkActivity();
  try {
    const response = await fetch(path, {
      ...options,
      headers: options.headers || {}
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || data?.ok === false) {
      const error = new Error(data?.message || '请求失败');
      error.code = data?.code || '';
      error.status = response.status;
      throw error;
    }
    return data;
  } finally {
    endNetworkActivity();
  }
}

async function loadStyles() {
  const data = await requestJson(publicDataUrl());
  reviewLinkInfo = data.review_link || null;
  scoreTypes = normalizeScoreTypes(data.score_types || defaultScoreTypes);
  scoreFields = normalizeScoreFields(data.score_fields || defaultScoreFields);
  gradeRules = normalizeGradeRules(data.grade_rules || defaultGradeRules);
  currentImageSettings = data.image_settings || currentImageSettings;
  applyGradeRuleIntro();
  styles = data.styles || [];
  if (reviewLinkCode && !styles.length) throw new Error('该评分链接没有可评分款式，请联系管理员重新生成。');
  drafts = styles.map(makeDraft);
  currentIndex = 0;
  let restored = await restoreServerDraftProgress(reviewer);
  if (!restored) restored = restoreDraftProgress(reviewer);
  renderSlides();
  return restored;
}


function renderScoreRows(fields, draft) {
  return fields.map(field => `
    <label class="score-row">
      <span>${escapeHtml(field.label)}</span>
      <input data-field="${escapeHtml(field.id)}" type="range" min="0" max="${normalizeMaxScore(field.max_score)}" step="1" value="${Number(draft.scores[field.id] || 0)}" ${draft.submitted ? 'disabled' : ''} />
      <output>${Number(draft.scores[field.id] || 0)} / ${normalizeMaxScore(field.max_score)}</output>
    </label>
  `).join('');
}


function renderScorePanels(draft) {
  calculate(drafts.indexOf(draft));
  const groups = getScoreFieldGroups();
  if (!groups.length) return '<p class="tip">暂无评分项。</p>';
  return groups.map(group => {
    const summary = (draft.score_systems || []).find(item => item.id === group.id) || { total: 0, max: sumMaxScore(group.fields), grade: gradeByScore(0, sumMaxScore(group.fields)) };
    return `
      <fieldset class="mobile-score-panel score-system-panel" data-score-system="${escapeHtml(group.id)}">
        <legend>${escapeHtml(group.label)} <span class="required">*</span></legend>
        ${renderScoreRows(group.fields, draft)}
        <div class="total-box score-system-total-box">
          <span>${escapeHtml(group.label)}得分</span>
          <strong data-system-total="${escapeHtml(group.id)}">${summary.total} / ${summary.max}</strong>
          <em data-system-grade="${escapeHtml(group.id)}">${summary.grade}</em>
        </div>
      </fieldset>
    `;
  }).join('');
}

function renderSlides() {
  isRendering = true;
  drafts.forEach((_, index) => calculate(index));
  if (!styles.length) {
    scoreCarousel.innerHTML = '<div class="empty-public">后台还没有配置需要评分的款式，请联系管理员。</div>';
    slideDots.innerHTML = '';
    updateStatus();
    isRendering = false;
    return;
  }

  scoreCarousel.innerHTML = styles.map((style, index) => {
    const draft = drafts[index];
    const image = style.product_image
      ? `<img class="public-style-image" src="${escapeHtml(displayImageUrl(style.product_image))}" data-preview-image="${escapeHtml(displayImageUrl(style.product_image))}" alt="${escapeHtml(style.style_code)}" loading="lazy" referrerpolicy="no-referrer" />`
      : '<div class="public-style-image placeholder">暂无图片</div>';
    return `
      <article class="score-slide" data-index="${index}">
        <div class="slide-inner public-slide-inner">
          <header class="slide-header public-style-header">
            <div>
              <h3>${escapeHtml(style.style_code)}</h3>
              <p>第 ${index + 1} 款 / 共 ${styles.length} 款</p>
            </div>
            ${draft.submitted ? '<span class="edit-badge saved-badge">已提交</span>' : (isComplete(draft) ? '<span class="edit-badge saved-badge">已填写</span>' : '')}
          </header>

          <div class="public-style-card">
            ${image}
            <div class="public-style-info editable-style-info">
              <label>季节<input data-field="season" value="${escapeHtml(draft.season || '')}" placeholder="可修改本次评分季节" ${draft.submitted ? 'disabled' : ''} /></label>
              <label>基本售价<input data-field="base_price" type="number" min="0" step="0.01" value="${escapeHtml(draft.base_price ?? '')}" placeholder="可修改本次评分售价" ${draft.submitted ? 'disabled' : ''} /></label>
              ${style.style_remark ? `<p>${escapeHtml(style.style_remark)}</p>` : ''}
              <small>这里的修改只保存到本次评分记录，不会影响后台已配置款式。</small>
            </div>
          </div>

          ${renderScorePanels(draft)}

          <label class="wide public-remark">
            备注
            <textarea data-field="remark" rows="3" placeholder="可填写对当前款的补充意见" ${draft.submitted ? 'disabled' : ''}>${escapeHtml(draft.remark)}</textarea>
          </label>
        </div>
      </article>
    `;
  }).join('');

  slideDots.innerHTML = styles.map((_, index) => `
    <button class="slide-dot ${index === currentIndex ? 'active' : ''} ${drafts[index]?.submitted ? 'saved' : ''}" type="button" data-index="${index}" aria-label="跳到第 ${index + 1} 款"></button>
  `).join('');

  updateStatus();
  setTimeout(() => {
    goToSlide(currentIndex, false, true);
    isRendering = false;
  }, 0);
}

function updateSlideTotal(index) {
  calculate(index);
  const slide = scoreCarousel.querySelector(`.score-slide[data-index="${index}"]`);
  if (!slide) return;
  for (const group of drafts[index].score_systems || []) {
    const totalEl = Array.from(slide.querySelectorAll('[data-system-total]')).find(el => el.dataset.systemTotal === group.id);
    const gradeEl = Array.from(slide.querySelectorAll('[data-system-grade]')).find(el => el.dataset.systemGrade === group.id);
    if (totalEl) totalEl.textContent = `${group.total} / ${group.max}`;
    if (gradeEl) gradeEl.textContent = group.grade;
  }
}

function updateStatus() {
  const draft = drafts[currentIndex];
  const missing = missingFields(draft);
  const complete = styles.length && isComplete(draft);
  const isFirst = currentIndex === 0;
  const isLast = currentIndex === styles.length - 1;

  slideCounter.textContent = styles.length ? `第 ${currentIndex + 1} / ${styles.length} 款` : '暂无款式';
  if (!styles.length) {
    slideHint.textContent = '暂无可评分款式';
  } else if (draft?.submitted) {
    slideHint.textContent = isLast ? '评分已提交' : '当前款已提交，可以进入下一页';
  } else {
    slideHint.textContent = complete ? (isLast ? '当前款已填写完整，可以提交全部评分' : '当前款已填写完整，可以进入下一页') : `填写完整后才能进入下一页，还缺：${missing.join('、')}`;
  }

  [prevSlideBtn, bottomPrevBtn].forEach(btn => {
    if (!btn) return;
    btn.disabled = isFirst || !styles.length;
    btn.classList.toggle('disabled', btn.disabled);
  });

  const nextDisabled = !styles.length || (!draft?.submitted && !complete);
  [nextSlideBtn, bottomNextBtn].forEach(btn => {
    if (!btn) return;
    btn.disabled = nextDisabled;
    btn.classList.toggle('disabled', nextDisabled);
    btn.textContent = isLast ? '提交' : '下一页';
    btn.title = nextDisabled ? `请先填写完整：${missing.join('、')}` : '';
  });

  $$('.slide-dot').forEach((dot, index) => {
    dot.classList.toggle('active', index === currentIndex);
    dot.classList.toggle('saved', Boolean(drafts[index]?.submitted));
    dot.disabled = index > currentIndex && !draft?.submitted && !complete;
    dot.classList.toggle('disabled', dot.disabled);
  });
}

function goToSlide(index, smooth = true, force = false) {
  if (!styles.length) return false;
  const target = Math.max(0, Math.min(styles.length - 1, index));
  const draft = drafts[currentIndex];
  if (!force && target > currentIndex && !draft.submitted && !isComplete(draft)) {
    showMessage(`请先完成当前款评分：${missingFields(draft).join('、')}`, 'error');
    updateStatus();
    return false;
  }
  currentIndex = target;
  saveDraftProgress();
  const slideWidth = scoreCarousel.clientWidth || 1;
  scoreCarousel.scrollTo({ left: slideWidth * currentIndex, behavior: smooth ? 'smooth' : 'auto' });
  updateStatus();
  return true;
}

async function submitCurrentAndNext() {
  const draft = drafts[currentIndex];
  if (!draft || submittingAll) return;
  if (!isComplete(draft)) {
    showMessage(`请先完成当前款评分：${missingFields(draft).join('、')}`, 'error');
    updateStatus();
    return;
  }

  if (currentIndex < styles.length - 1) {
    const nextIndex = currentIndex + 1;
    goToSlide(nextIndex, true, true);
    showMessage(`第 ${nextIndex} 款已填写，最终提交前不会写入数据库`);
    return;
  }

  const incompleteIndex = drafts.findIndex(item => !isComplete(item));
  if (incompleteIndex !== -1) {
    goToSlide(incompleteIndex, true, true);
    showMessage(`请先完成第 ${incompleteIndex + 1} 款评分`, 'error');
    return;
  }

  submittingAll = true;
  [nextSlideBtn, bottomNextBtn].forEach(btn => setButtonBusy(btn, true, '提交中...'));
  try {
    const payload = {
      reviewer,
      review_link_code: reviewLinkCode,
      review_date: today(),
      scores: drafts.map((item, index) => ({
        reviewer,
        style_id: styles[index].id,
        product_image: item.product_image || styles[index].product_image || '',
        style_code: item.style_code || styles[index].style_code || '',
        season: item.season || '',
        base_price: item.base_price,
        review_date: today(),
        remark: item.remark,
        score_items: scoreFields.map(field => ({
          id: field.id,
          label: field.label,
          max_score: normalizeMaxScore(field.max_score),
          score_type: normalizeScoreType(field.score_type),
          score_type_label: scoreTypeLabel(field.score_type, field),
          score: Number(item.scores[field.id] || 0)
        }))
      }))
    };
    const data = await requestJson('/api/public/submit', {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify(payload)
    });
    (data.scores || []).forEach((score, index) => {
      if (drafts[index]) {
        drafts[index].submitted = true;
        drafts[index].score_id = score?.id || null;
      }
    });
    clearDraftProgress();
    clearServerDraftProgress();
    showView(doneView);
    doneText.textContent = `${reviewer}，你已提交 ${data.scores?.length || styles.length} 个款式的评分。`;
  } catch (e) {
    showMessage(e.message, 'error');
    submittingAll = false;
    [nextSlideBtn, bottomNextBtn].forEach(btn => setButtonBusy(btn, false));
    updateStatus();
  }
}
reviewerForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (reviewLinkUnavailable) { showMessage('该评分链接不可用，请联系管理员重新生成。', 'error'); return; }
  reviewer = reviewerForm.elements.reviewer.value.trim();
  if (!reviewer) {
    showMessage('请先输入评分人姓名', 'error');
    return;
  }
  const submitBtn = reviewerForm.querySelector('button[type="submit"]');
  reviewerNameText.textContent = reviewer;
  setButtonBusy(submitBtn, true, '加载中...');
  try {
    const restored = await loadStyles();
    showView(ratingView);
    if (restored) showMessage(`已恢复 ${reviewer} 今天未提交的评分进度，继续从第 ${currentIndex + 1} 款开始。`);
  } catch (e) {
    showMessage(e.message, 'error');
  } finally {
    setButtonBusy(submitBtn, false);
  }
});


scoreCarousel.addEventListener('pointerdown', (event) => {
  const input = event.target.closest('input[type="range"][data-field]');
  if (!input) return;
  const slide = input.closest('.score-slide');
  const index = Number(slide.dataset.index);
  if (drafts[index]) {
    drafts[index].touched_scores[input.dataset.field] = true;
    saveDraftProgress();
    if (index === currentIndex) updateStatus();
  }
});

scoreCarousel.addEventListener('change', (event) => {
  const input = event.target.closest('input[type="range"][data-field]');
  if (!input) return;
  const slide = input.closest('.score-slide');
  const index = Number(slide.dataset.index);
  if (drafts[index]) {
    drafts[index].touched_scores[input.dataset.field] = true;
    saveDraftProgress();
    if (index === currentIndex) updateStatus();
  }
});

scoreCarousel.addEventListener('input', (event) => {
  const input = event.target.closest('[data-field]');
  if (!input) return;
  const slide = input.closest('.score-slide');
  const index = Number(slide.dataset.index);
  if (input.dataset.field === 'remark') {
    drafts[index].remark = input.value;
  } else if (input.dataset.field === 'season') {
    drafts[index].season = input.value;
  } else if (input.dataset.field === 'base_price') {
    drafts[index].base_price = input.value;
  } else {
    drafts[index].scores[input.dataset.field] = Number(input.value || 0);
    drafts[index].touched_scores[input.dataset.field] = true;
    input.nextElementSibling.textContent = `${input.value} / ${input.max}`;
    updateSlideTotal(index);
  }
  saveDraftProgress();
  if (index === currentIndex) updateStatus();
});

scoreCarousel.addEventListener('scroll', () => {
  if (isRendering) return;
  window.clearTimeout(scrollTimer);
  scrollTimer = window.setTimeout(() => {
    const slideWidth = scoreCarousel.clientWidth || 1;
    const targetIndex = Math.max(0, Math.min(styles.length - 1, Math.round(scoreCarousel.scrollLeft / slideWidth)));
    const draft = drafts[currentIndex];
    if (targetIndex > currentIndex && !draft.submitted && !isComplete(draft)) {
      goToSlide(currentIndex, false, true);
      return;
    }
    currentIndex = targetIndex;
    saveDraftProgress();
    updateStatus();
  }, 80);
});

prevSlideBtn.addEventListener('click', () => goToSlide(currentIndex - 1));
nextSlideBtn.addEventListener('click', submitCurrentAndNext);
bottomPrevBtn.addEventListener('click', () => goToSlide(currentIndex - 1));
bottomNextBtn.addEventListener('click', submitCurrentAndNext);
slideDots.addEventListener('click', (event) => {
  const btn = event.target.closest('.slide-dot');
  if (btn && !btn.disabled) goToSlide(Number(btn.dataset.index));
});
restartBtn.addEventListener('click', () => {
  clearDraftProgress();
  reviewer = '';
  styles = [];
  drafts = [];
  currentIndex = 0;
  submittingAll = false;
  reviewerForm.reset();
  showView(nameView);
});

window.addEventListener('beforeunload', () => {
  saveDraftProgress();
  if (reviewer && drafts.length && !submittingAll) {
    try {
      fetch('/api/public/draft', {
        method: 'PUT',
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body: JSON.stringify(buildDraftPayload()),
        keepalive: true
      });
    } catch (_) {}
  }
});
purgeExpiredDrafts();

applyGradeRuleIntro();
if (reviewLinkCode) loadPublicIntro();
else showAccessError();


// image preview loader
(function(){var s=document.createElement('script');s.src='/assets/image-preview.js';document.head.appendChild(s);})();


// product image viewer loader
(function(){if(!window.__productImageViewerLoaded){window.__productImageViewerLoaded=true;var s=document.createElement('script');s.src='/assets/image-viewer.js';document.head.appendChild(s);var l=document.createElement('link');l.rel='stylesheet';l.href='/assets/image-viewer.css';document.head.appendChild(l);}})();
