console.info("product-review rating version: 20260624-custom-score-types-v1");
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

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
  { id: 'main', label: '综合评分', include_total: true },
  { id: 'independent', label: '独立评分', include_total: false }
];
const defaultScoreFields = [
  { id: 'appearance', label: '外观设计', max_score: 10, score_type: 'main', score_type_label: '综合评分', score_type_include_total: true },
  { id: 'material', label: '材质触感', max_score: 10, score_type: 'main', score_type_label: '综合评分', score_type_include_total: true },
  { id: 'craftsmanship', label: '工艺细节', max_score: 10, score_type: 'main', score_type_label: '综合评分', score_type_include_total: true },
  { id: 'capacity', label: '容量收纳', max_score: 10, score_type: 'main', score_type_label: '综合评分', score_type_include_total: true },
  { id: 'comfort', label: '背负舒适度', max_score: 10, score_type: 'main', score_type_label: '综合评分', score_type_include_total: true }
];

let scoreTypes = defaultScoreTypes.map(item => ({ ...item }));
let scoreFields = defaultScoreFields.map(item => ({ ...item }));
let reviewer = '';
let styles = [];
let drafts = [];
let currentIndex = 0;
let isRendering = false;
let scrollTimer = null;
let submittingAll = false;

function today() {
  return new Date().toISOString().slice(0, 10);
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
    return { id, label, include_total: normalizeBool(type.include_total ?? type.includeTotal ?? type.counts_in_total, id !== 'independent') };
  }).filter(Boolean);
  return normalized.length ? normalized : defaultScoreTypes.map(item => ({ ...item }));
}
function scoreTypeMeta(value, fallback = {}) {
  const id = normalizeScoreType(value || fallback.score_type || fallback.type || 'main');
  const found = normalizeScoreTypes(scoreTypes).find(item => item.id === id);
  if (found) return found;
  return {
    id,
    label: String(fallback.score_type_label || fallback.type_label || id || '综合评分'),
    include_total: normalizeBool(fallback.score_type_include_total ?? fallback.include_total ?? fallback.includeTotal, id !== 'independent')
  };
}
function isMainScoreField(field) {
  if (field && (Object.prototype.hasOwnProperty.call(field, 'score_type_include_total') || Object.prototype.hasOwnProperty.call(field, 'include_total') || Object.prototype.hasOwnProperty.call(field, 'includeTotal'))) {
    return normalizeBool(field.score_type_include_total ?? field.include_total ?? field.includeTotal, true);
  }
  return scoreTypeMeta(field?.score_type ?? field?.type ?? field?.group ?? field?.category, field).include_total;
}
function scoreTypeLabel(value, field = {}) { return scoreTypeMeta(value, field).label; }
function getMainScoreFields() {
  return scoreFields.filter(isMainScoreField);
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
      score_type_label: String(field.score_type_label || field.type_label || meta.label || typeId),
      score_type_include_total: normalizeBool(field.score_type_include_total ?? field.include_total ?? field.includeTotal, meta.include_total)
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

function gradeByScore(total, maxTotal = 50) {
  const max = Number(maxTotal);
  if (!Number.isFinite(max) || max <= 0) return '不参与评级';
  const rate = Number(total || 0) / max;
  if (rate >= 0.8) return '大单';
  if (rate >= 0.6) return '中单';
  if (rate >= 0.4) return '小单试水';
  return '建议不下';
}

function makeDraft(style) {
  const mainFields = scoreFields.filter(isMainScoreField);
  const maxTotal = sumMaxScore(mainFields);
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
    grade: gradeByScore(0, maxTotal)
  };
}

function calculate(index) {
  const draft = drafts[index];
  if (!draft) return;
  let total = 0;
  let maxTotal = 0;
  for (const field of scoreFields) {
    const max = normalizeMaxScore(field.max_score);
    const value = Math.min(max, Math.max(0, Number.parseInt(draft.scores?.[field.id], 10) || 0));
    draft.scores[field.id] = value;
    if (isMainScoreField(field)) {
      total += value;
      maxTotal += max;
    }
  }
  draft.total_score = total;
  draft.max_total_score = maxTotal;
  draft.grade = gradeByScore(total, maxTotal);
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
  [nameView, ratingView, doneView].forEach(el => el.classList.add('hidden'));
  view.classList.remove('hidden');
}

async function requestJson(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: options.headers || {}
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || data?.ok === false) {
    throw new Error(data?.message || '请求失败');
  }
  return data;
}

async function loadStyles() {
  const data = await requestJson('/api/public/styles');
  scoreTypes = normalizeScoreTypes(data.score_types || defaultScoreTypes);
  scoreFields = normalizeScoreFields(data.score_fields || defaultScoreFields);
  styles = data.styles || [];
  drafts = styles.map(makeDraft);
  currentIndex = 0;
  renderSlides();
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


function renderNonTotalScorePanels(draft) {
  const groups = new Map();
  scoreFields.filter(field => !isMainScoreField(field)).forEach(field => {
    const meta = scoreTypeMeta(field.score_type, field);
    if (!groups.has(meta.id)) groups.set(meta.id, { ...meta, fields: [] });
    groups.get(meta.id).fields.push(field);
  });
  return Array.from(groups.values()).map(group => `
    <fieldset class="mobile-score-panel independent-score-panel">
      <legend>${escapeHtml(group.label)}，不计入综合总分 <span class="required">*</span></legend>
      ${renderScoreRows(group.fields, draft)}
    </fieldset>
  `).join('');
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
      ? `<img class="public-style-image" src="${escapeHtml(style.product_image)}" alt="${escapeHtml(style.style_code)}" loading="lazy" referrerpolicy="no-referrer" />`
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

          <fieldset class="mobile-score-panel">
            <legend>综合评分，计入总分 <span class="required">*</span></legend>
            ${renderScoreRows(scoreFields.filter(isMainScoreField), draft) || '<p class="tip">暂无综合评分项。</p>'}
            <div class="total-box">
              <span>综合总分</span>
              <strong data-role="total">${draft.total_score} / ${draft.max_total_score}</strong>
              <em data-role="grade">${draft.grade}</em>
            </div>
          </fieldset>

          <label class="wide public-remark">
            备注
            <textarea data-field="remark" rows="3" placeholder="可填写对当前款的补充意见" ${draft.submitted ? 'disabled' : ''}>${escapeHtml(draft.remark)}</textarea>
          </label>

          ${renderNonTotalScorePanels(draft)}
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
  slide.querySelector('[data-role="total"]').textContent = `${drafts[index].total_score} / ${drafts[index].max_total_score}`;
  slide.querySelector('[data-role="grade"]').textContent = drafts[index].grade;
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
  [nextSlideBtn, bottomNextBtn].forEach(btn => { if (btn) { btn.disabled = true; btn.textContent = '提交中...'; } });
  try {
    const payload = {
      reviewer,
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
          score_type_include_total: isMainScoreField(field),
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
    showView(doneView);
    doneText.textContent = `${reviewer}，你已提交 ${data.scores?.length || styles.length} 个款式的评分。`;
  } catch (e) {
    showMessage(e.message, 'error');
    submittingAll = false;
    updateStatus();
  }
}
reviewerForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  reviewer = reviewerForm.elements.reviewer.value.trim();
  if (!reviewer) {
    showMessage('请先输入评分人姓名', 'error');
    return;
  }
  reviewerNameText.textContent = reviewer;
  try {
    await loadStyles();
    showView(ratingView);
  } catch (e) {
    showMessage(e.message, 'error');
  }
});


scoreCarousel.addEventListener('pointerdown', (event) => {
  const input = event.target.closest('input[type="range"][data-field]');
  if (!input) return;
  const slide = input.closest('.score-slide');
  const index = Number(slide.dataset.index);
  if (drafts[index]) {
    drafts[index].touched_scores[input.dataset.field] = true;
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
  reviewer = '';
  styles = [];
  drafts = [];
  currentIndex = 0;
  submittingAll = false;
  reviewerForm.reset();
  showView(nameView);
});
