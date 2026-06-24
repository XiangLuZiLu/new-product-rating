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

const defaultScoreFields = [
  { id: 'appearance', label: '外观设计' },
  { id: 'material', label: '材质触感' },
  { id: 'craftsmanship', label: '工艺细节' },
  { id: 'capacity', label: '容量收纳' },
  { id: 'comfort', label: '背负舒适度' }
];

let scoreFields = defaultScoreFields.map(item => ({ ...item }));
let reviewer = '';
let styles = [];
let drafts = [];
let currentIndex = 0;
let isRendering = false;
let scrollTimer = null;

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

function normalizeScoreFields(fields) {
  if (!Array.isArray(fields)) return defaultScoreFields.map(item => ({ ...item }));
  const normalized = fields.map((field, index) => ({
    id: String(field.id || `field_${index + 1}`).trim() || `field_${index + 1}`,
    label: String(field.label || '').trim()
  })).filter(field => field.label);
  return normalized.length ? normalized : defaultScoreFields.map(item => ({ ...item }));
}

function showMessage(text, type = 'success') {
  messageBox.textContent = text;
  messageBox.classList.toggle('error', type === 'error');
  messageBox.classList.remove('hidden');
  window.clearTimeout(showMessage.timer);
  showMessage.timer = window.setTimeout(() => messageBox.classList.add('hidden'), 3600);
}

function gradeByScore(total) {
  if (total >= 40) return '大单';
  if (total >= 30) return '中单';
  if (total >= 20) return '小单试水';
  return '建议不下';
}

function makeDraft(style) {
  return {
    style_id: style.id,
    reviewer,
    review_date: today(),
    remark: '',
    submitted: false,
    score_id: null,
    scores: Object.fromEntries(scoreFields.map(field => [field.id, 0])),
    total_score: 0,
    grade: gradeByScore(0)
  };
}

function calculate(index) {
  const draft = drafts[index];
  if (!draft) return;
  let total = 0;
  for (const field of scoreFields) {
    const value = Math.min(10, Math.max(0, Number.parseInt(draft.scores?.[field.id], 10) || 0));
    draft.scores[field.id] = value;
    total += value;
  }
  draft.total_score = total;
  draft.grade = gradeByScore(total);
}

function missingFields(draft) {
  const missing = [];
  const noScore = scoreFields.filter(field => Number(draft?.scores?.[field.id] || 0) <= 0).map(field => field.label);
  if (noScore.length) missing.push(`${noScore.length} 个评分项`);
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
  scoreFields = normalizeScoreFields(data.score_fields || defaultScoreFields);
  styles = data.styles || [];
  drafts = styles.map(makeDraft);
  currentIndex = 0;
  renderSlides();
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
      ? `<img class="public-style-image" src="${escapeHtml(style.product_image)}" alt="${escapeHtml(style.style_code)}" />`
      : '<div class="public-style-image placeholder">暂无图片</div>';
    return `
      <article class="score-slide" data-index="${index}">
        <div class="slide-inner public-slide-inner">
          <header class="slide-header public-style-header">
            <div>
              <h3>${escapeHtml(style.style_code)}</h3>
              <p>第 ${index + 1} 款 / 共 ${styles.length} 款</p>
            </div>
            ${draft.submitted ? '<span class="edit-badge saved-badge">已提交</span>' : ''}
          </header>

          <div class="public-style-card">
            ${image}
            <div class="public-style-info">
              <div><span>季节</span><strong>${escapeHtml(style.season || '-')}</strong></div>
              <div><span>基本售价</span><strong>${style.base_price == null ? '-' : Number(style.base_price).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}</strong></div>
              ${style.style_remark ? `<p>${escapeHtml(style.style_remark)}</p>` : ''}
            </div>
          </div>

          <fieldset class="mobile-score-panel">
            <legend>滑动评分，每项 0-10 分 <span class="required">*</span></legend>
            ${scoreFields.map(field => `
              <label class="score-row">
                <span>${escapeHtml(field.label)}</span>
                <input data-field="${escapeHtml(field.id)}" type="range" min="0" max="10" step="1" value="${Number(draft.scores[field.id] || 0)}" ${draft.submitted ? 'disabled' : ''} />
                <output>${Number(draft.scores[field.id] || 0)}</output>
              </label>
            `).join('')}
            <div class="total-box">
              <span>总分</span>
              <strong data-role="total">${draft.total_score}</strong>
              <em data-role="grade">${draft.grade}</em>
            </div>
          </fieldset>

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
  slide.querySelector('[data-role="total"]').textContent = drafts[index].total_score;
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
    slideHint.textContent = isLast ? '当前款已提交，可以完成' : '当前款已提交，可以进入下一页';
  } else {
    slideHint.textContent = complete ? '当前款已填写完整，可以进入下一页' : `填写完整后才能进入下一页，还缺：${missing.join('、')}`;
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
    btn.textContent = isLast ? '完成' : '下一页';
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
  if (!draft) return;
  if (!draft.submitted && !isComplete(draft)) {
    showMessage(`请先完成当前款评分：${missingFields(draft).join('、')}`, 'error');
    updateStatus();
    return;
  }

  try {
    if (!draft.submitted) {
      const payload = {
        reviewer,
        style_id: styles[currentIndex].id,
        review_date: today(),
        remark: draft.remark,
        score_items: scoreFields.map(field => ({ id: field.id, label: field.label, score: Number(draft.scores[field.id] || 0) }))
      };
      const data = await requestJson('/api/public/scores', {
        method: 'POST',
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body: JSON.stringify(payload)
      });
      draft.submitted = true;
      draft.score_id = data.score?.id || null;
    }

    if (currentIndex < styles.length - 1) {
      const nextIndex = currentIndex + 1;
      renderSlides();
      currentIndex = nextIndex - 1;
      goToSlide(nextIndex, true, true);
      showMessage(`第 ${nextIndex} 款已提交，已进入第 ${nextIndex + 1} 款`);
    } else {
      showView(doneView);
      doneText.textContent = `${reviewer}，你已完成 ${styles.length} 个款式的评分。`;
    }
  } catch (e) {
    showMessage(e.message, 'error');
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

scoreCarousel.addEventListener('input', (event) => {
  const input = event.target.closest('[data-field]');
  if (!input) return;
  const slide = input.closest('.score-slide');
  const index = Number(slide.dataset.index);
  if (input.dataset.field === 'remark') {
    drafts[index].remark = input.value;
  } else {
    drafts[index].scores[input.dataset.field] = Number(input.value || 0);
    input.nextElementSibling.textContent = input.value;
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
  reviewerForm.reset();
  showView(nameView);
});
