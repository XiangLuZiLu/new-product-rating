const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const loginView = $('#loginView');
const appView = $('#appView');
const loginForm = $('#loginForm');
const logoutBtn = $('#logoutBtn');
const searchForm = $('#searchForm');
const itemsBody = $('#itemsBody');
const messageBox = $('#message');
const statsGrid = $('#statsGrid');
const historyPanel = $('#historyPanel');
const historyList = $('#historyList');
const scoreCarousel = $('#scoreCarousel');
const slideDots = $('#slideDots');
const slideCounter = $('#slideCounter');
const slideHint = $('#slideHint');
const pageCountInput = $('#pageCountInput');
const prevSlideBtn = $('#prevSlideBtn');
const nextSlideBtn = $('#nextSlideBtn');
const saveAndNextBtn = $('#saveAndNextBtn');
const bottomPrevBtn = $('#bottomPrevBtn');
const bottomSaveNextBtn = $('#bottomSaveNextBtn');

let items = [];
let drafts = [];
let pageCount = 3;
let currentIndex = 0;
let scrollTimer = null;
let isRendering = false;

const scoreFields = [
  { key: 'appearance_score', label: '外观设计' },
  { key: 'material_score', label: '材质触感' },
  { key: 'craftsmanship_score', label: '工艺细节' },
  { key: 'capacity_score', label: '容量收纳' },
  { key: 'comfort_score', label: '背负舒适度' }
];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function emptyDraft() {
  return {
    id: null,
    product_image: '',
    style_code: '',
    season: '',
    base_price: '',
    reviewer: '',
    review_date: today(),
    remark: '',
    appearance_score: 0,
    material_score: 0,
    craftsmanship_score: 0,
    capacity_score: 0,
    comfort_score: 0,
    total_score: 0,
    grade: gradeByScore(0)
  };
}

function itemToDraft(item) {
  return {
    id: item.id ?? null,
    product_image: item.product_image || '',
    style_code: item.style_code || '',
    season: item.season || '',
    base_price: item.base_price ?? '',
    reviewer: item.reviewer || '',
    review_date: item.review_date || today(),
    remark: item.remark || '',
    appearance_score: Number(item.appearance_score || 0),
    material_score: Number(item.material_score || 0),
    craftsmanship_score: Number(item.craftsmanship_score || 0),
    capacity_score: Number(item.capacity_score || 0),
    comfort_score: Number(item.comfort_score || 0),
    total_score: Number(item.total_score || 0),
    grade: item.grade || gradeByScore(Number(item.total_score || 0))
  };
}

function gradeByScore(total) {
  if (total >= 40) return '大单';
  if (total >= 30) return '中单';
  if (total >= 20) return '小单试水';
  return '建议不下';
}

function showMessage(text, type = 'success') {
  messageBox.textContent = text;
  messageBox.classList.toggle('error', type === 'error');
  messageBox.classList.remove('hidden');
  window.clearTimeout(showMessage.timer);
  showMessage.timer = window.setTimeout(() => messageBox.classList.add('hidden'), 3600);
}

function showLogin() {
  appView.classList.add('hidden');
  loginView.classList.remove('hidden');
}

function showApp() {
  loginView.classList.add('hidden');
  appView.classList.remove('hidden');
}

async function requestJson(path, options = {}) {
  const headers = options.headers || {};
  const response = await fetch(path, {
    credentials: 'include',
    ...options,
    headers
  });

  if (response.status === 401) {
    showLogin();
    throw new Error('请先登录');
  }

  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await response.json() : null;
  if (!response.ok || (data && data.ok === false)) {
    throw new Error((data && data.message) || '请求失败');
  }
  return data;
}

async function uploadImageFile(file, index) {
  if (!file) return;
  if (!file.type.startsWith('image/')) throw new Error('请选择图片文件');
  const form = new FormData();
  form.append('file', file);
  const response = await fetch('/api/upload-image', {
    method: 'POST',
    credentials: 'include',
    body: form
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data || data.ok === false) {
    throw new Error(data?.message || '图片上传失败');
  }
  const url = data.url || data.image?.url;
  if (!url) throw new Error('图片上传成功，但没有返回图片地址');
  drafts[index].product_image = url;
  const slide = scoreCarousel.querySelector(`.score-slide[data-index="${index}"]`);
  const urlInput = slide?.querySelector('[data-field="product_image"]');
  if (urlInput) urlInput.value = url;
  const preview = slide?.querySelector('[data-image-preview]');
  if (preview) preview.innerHTML = `<img class="image-preview" src="${escapeHtml(url)}" alt="产品图预览" />`;
  showMessage('图片已上传，并已填入产品图链接');
  if (index === currentIndex) updateSlideStatus();
}

function ensureDraftCount(count) {
  const n = Math.max(1, Math.min(50, Number.parseInt(count, 10) || 1));
  pageCount = n;
  while (drafts.length < pageCount) drafts.push(emptyDraft());
  if (drafts.length > pageCount) drafts = drafts.slice(0, pageCount);
  if (currentIndex >= pageCount) currentIndex = pageCount - 1;
  pageCountInput.value = pageCount;
}

function calculateDraft(index) {
  const draft = drafts[index];
  if (!draft) return;
  let total = 0;
  for (const { key } of scoreFields) {
    const value = Math.min(10, Math.max(0, Number.parseInt(draft[key], 10) || 0));
    draft[key] = value;
    total += value;
  }
  draft.total_score = total;
  draft.grade = gradeByScore(total);
}

function draftHasContent(draft) {
  if (!draft) return false;
  return Boolean(
    draft.id ||
    String(draft.product_image || '').trim() ||
    String(draft.style_code || '').trim() ||
    String(draft.season || '').trim() ||
    String(draft.base_price ?? '').trim() ||
    String(draft.reviewer || '').trim() ||
    String(draft.remark || '').trim() ||
    scoreFields.some(({ key }) => Number(draft[key] || 0) > 0)
  );
}

function getDraftMissingFields(draft) {
  const missing = [];
  if (!String(draft?.style_code || '').trim()) missing.push('款式编码');
  if (!String(draft?.season || '').trim()) missing.push('季节');
  if (!String(draft?.base_price ?? '').trim()) missing.push('基本售价');
  if (!String(draft?.reviewer || '').trim()) missing.push('评审人');
  if (!String(draft?.review_date || '').trim()) missing.push('评审日期');
  const noScore = scoreFields.filter(({ key }) => Number(draft?.[key] || 0) <= 0).map(({ label }) => label);
  if (noScore.length) missing.push(`${noScore.length} 个评分项`);
  return missing;
}

function isDraftComplete(draft) {
  return getDraftMissingFields(draft).length === 0;
}

function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderSlides() {
  isRendering = true;
  ensureDraftCount(pageCount);
  drafts.forEach((_, index) => calculateDraft(index));

  scoreCarousel.innerHTML = drafts.map((draft, index) => `
    <article class="score-slide" data-index="${index}">
      <div class="slide-inner">
        <header class="slide-header">
          <div>
            <h3>第 ${index + 1} 款评分</h3>
            <p>${draft.id ? `正在编辑历史记录 #${draft.id}` : '新增款式记录'}</p>
          </div>
          ${draft.id ? '<span class="edit-badge">编辑中</span>' : ''}
        </header>

        <div class="slide-form">
          <label class="wide image-field">
            产品图链接 / 上传图片
            <div class="image-input-row">
              <input data-field="product_image" value="${escapeHtml(draft.product_image)}" placeholder="可手动填写图片 URL，也可选择图片自动上传" />
              <input class="file-input" data-image-file type="file" accept="image/*" />
            </div>
            <small>图片会上传到你配置的 R2/S3/OSS；D1/KV 只保存图片地址。</small>
            <div class="image-preview-wrap" data-image-preview>
              ${draft.product_image ? `<img class="image-preview" src="${escapeHtml(draft.product_image)}" alt="产品图预览" />` : '<span>暂无图片</span>'}
            </div>
          </label>
          <label>
            款式编码 <span class="required">*</span>
            <input data-field="style_code" value="${escapeHtml(draft.style_code)}" placeholder="例如 XA2408A" />
          </label>
          <label>
            季节 <span class="required">*</span>
            <input data-field="season" value="${escapeHtml(draft.season)}" placeholder="例如 秋冬 / 春夏" />
          </label>
          <label>
            基本售价 <span class="required">*</span>
            <input data-field="base_price" type="number" step="0.01" min="0" value="${escapeHtml(draft.base_price)}" placeholder="例如 138" />
          </label>
          <label>
            评审人 <span class="required">*</span>
            <input data-field="reviewer" value="${escapeHtml(draft.reviewer)}" placeholder="评审人姓名" />
          </label>
          <label>
            评审日期 <span class="required">*</span>
            <input data-field="review_date" type="date" value="${escapeHtml(draft.review_date || today())}" />
          </label>

          <fieldset class="mobile-score-panel">
            <legend>滑动评分，每项 0-10 分 <span class="required">*</span></legend>
            ${scoreFields.map(({ key, label }) => `
              <label class="score-row">
                <span>${label}</span>
                <input data-field="${key}" type="range" min="0" max="10" step="1" value="${Number(draft[key] || 0)}" />
                <output>${Number(draft[key] || 0)}</output>
              </label>
            `).join('')}
            <div class="total-box">
              <span>总分</span>
              <strong data-role="total">${draft.total_score}</strong>
              <em data-role="grade">${draft.grade}</em>
            </div>
          </fieldset>

          <label class="wide">
            备注
            <textarea data-field="remark" rows="3" placeholder="记录版型、材质、是否下单等补充说明">${escapeHtml(draft.remark)}</textarea>
          </label>
        </div>
      </div>
    </article>
  `).join('');

  slideDots.innerHTML = drafts.map((draft, index) => `
    <button class="slide-dot ${index === currentIndex ? 'active' : ''} ${draft.id ? 'saved' : ''}" type="button" data-index="${index}" aria-label="跳到第 ${index + 1} 款"></button>
  `).join('');

  updateSlideStatus();
  setTimeout(() => {
    goToSlide(currentIndex, false);
    isRendering = false;
  }, 0);
}

function updateSlideStatus() {
  slideCounter.textContent = `第 ${currentIndex + 1} / ${pageCount} 款`;
  const draft = drafts[currentIndex];
  const missing = getDraftMissingFields(draft);
  const complete = missing.length === 0;
  slideHint.textContent = draft?.id
    ? (complete ? `当前页可进入下一款：${draft.style_code || `记录 #${draft.id}`}` : `当前页正在编辑，还缺：${missing.join('、')}`)
    : (complete ? '当前款已填写完整，可以进入下一款' : `填写完整后才能进入下一款，还缺：${missing.join('、')}`);

  const isFirst = currentIndex === 0;
  const isLast = currentIndex === pageCount - 1;
  [prevSlideBtn, bottomPrevBtn].forEach((btn) => {
    if (!btn) return;
    btn.disabled = isFirst;
    btn.classList.toggle('disabled', isFirst);
  });

  const nextDisabled = !complete;
  [nextSlideBtn, bottomSaveNextBtn, saveAndNextBtn].forEach((btn) => {
    if (!btn) return;
    btn.disabled = nextDisabled;
    btn.classList.toggle('disabled', nextDisabled);
    btn.title = nextDisabled ? `请先填写完整：${missing.join('、')}` : '';
  });

  const nextLabel = isLast ? '完成' : '下一页';
  [nextSlideBtn, saveAndNextBtn, bottomSaveNextBtn].forEach((btn) => {
    if (btn) btn.textContent = nextLabel;
  });

  $$('.slide-dot').forEach((dot, index) => {
    dot.classList.toggle('active', index === currentIndex);
    dot.classList.toggle('saved', Boolean(drafts[index]?.id));
    dot.disabled = index > currentIndex && !complete;
    dot.classList.toggle('disabled', dot.disabled);
  });
}

function updateSlideTotal(index) {
  calculateDraft(index);
  const slide = scoreCarousel.querySelector(`.score-slide[data-index="${index}"]`);
  if (!slide) return;
  slide.querySelector('[data-role="total"]').textContent = drafts[index].total_score;
  slide.querySelector('[data-role="grade"]').textContent = drafts[index].grade;
}

function goToSlide(index, smooth = true, force = false) {
  const target = Math.max(0, Math.min(pageCount - 1, index));
  if (!force && target > currentIndex && !isDraftComplete(drafts[currentIndex])) {
    const missing = getDraftMissingFields(drafts[currentIndex]);
    showMessage(`请先填写完整当前款：${missing.join('、')}`, 'error');
    updateSlideStatus();
    return false;
  }
  currentIndex = target;
  const slideWidth = scoreCarousel.clientWidth || 1;
  scoreCarousel.scrollTo({ left: slideWidth * currentIndex, behavior: smooth ? 'smooth' : 'auto' });
  updateSlideStatus();
  return true;
}

function setActiveTab(targetId) {
  $$('.tab').forEach(tab => tab.classList.toggle('active', tab.dataset.target === targetId));
  $('#scoreSection').classList.toggle('hidden', targetId !== 'scoreSection');
  $('#listSection').classList.toggle('hidden', targetId !== 'listSection');
  if (targetId === 'scoreSection') setTimeout(() => goToSlide(currentIndex, false), 0);
}

function normalizeDraftForSave(draft) {
  calculateDraft(drafts.indexOf(draft));
  const data = { ...draft };
  data.product_image = String(data.product_image || '').trim();
  data.style_code = String(data.style_code || '').trim();
  data.season = String(data.season || '').trim();
  data.reviewer = String(data.reviewer || '').trim();
  data.remark = String(data.remark || '').trim();
  data.review_date = data.review_date || today();
  data.base_price = data.base_price === '' || data.base_price == null ? null : Number(data.base_price);
  if (!data.style_code) throw new Error('请先填写款式编码');
  if (data.base_price !== null && !Number.isFinite(data.base_price)) throw new Error('基本售价格式不正确');
  return data;
}

async function saveDraft(index, silent = false) {
  const draft = drafts[index];
  const data = normalizeDraftForSave(draft);
  const path = draft.id ? `/api/items/${encodeURIComponent(draft.id)}` : '/api/items';
  const method = draft.id ? 'PUT' : 'POST';
  const result = await requestJson(path, {
    method,
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify(data)
  });
  drafts[index] = itemToDraft(result.item);
  if (!silent) showMessage(draft.id ? '当前款已更新' : '当前款已保存');
  renderSlides();
  await loadItems();
  return result.item;
}

async function autoSaveAndGoNext() {
  const savingIndex = currentIndex;
  const missing = getDraftMissingFields(drafts[savingIndex]);
  if (missing.length) {
    showMessage(`请先填写完整当前款：${missing.join('、')}`, 'error');
    updateSlideStatus();
    return;
  }

  try {
    await saveDraft(savingIndex, true);
    if (savingIndex < pageCount - 1) {
      const nextIndex = savingIndex + 1;
      currentIndex = savingIndex;
      goToSlide(nextIndex, true, true);
      showMessage(`第 ${savingIndex + 1} 款已自动保存，已进入第 ${nextIndex + 1} 款`);
    } else {
      showMessage('最后一款已自动保存，本批评分已完成');
      setActiveTab('listSection');
    }
  } catch (e) {
    showMessage(e.message, 'error');
  }
}

function clearDraft(index) {
  drafts[index] = emptyDraft();
  renderSlides();
}

function resetBatch() {
  drafts = Array.from({ length: pageCount }, () => emptyDraft());
  currentIndex = 0;
  renderSlides();
}

async function loadSettings() {
  try {
    const data = await requestJson('/api/settings');
    pageCount = Number(data.settings?.score_page_count || 3);
  } catch (e) {
    pageCount = 3;
  }
  ensureDraftCount(pageCount);
  renderSlides();
}

async function saveSettings() {
  const newCount = Math.max(1, Math.min(50, Number.parseInt(pageCountInput.value, 10) || 1));
  if (newCount < drafts.length && drafts.slice(newCount).some(draftHasContent)) {
    if (!confirm('减少份数会清空超出页数的未保存草稿，确定继续吗？')) {
      pageCountInput.value = pageCount;
      return;
    }
  }
  const data = await requestJson('/api/settings', {
    method: 'PUT',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ score_page_count: newCount })
  });
  pageCount = Number(data.settings.score_page_count || newCount);
  ensureDraftCount(pageCount);
  renderSlides();
  showMessage(`评分份数已设置为 ${pageCount} 份`);
}

function formatMoney(value) {
  if (value === null || value === undefined || value === '') return '';
  return Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 2 });
}

function renderStats() {
  const count = items.length;
  const avg = count ? (items.reduce((s, item) => s + Number(item.total_score || 0), 0) / count).toFixed(1) : '0';
  const big = items.filter(item => Number(item.total_score || 0) >= 40).length;
  const needDrop = items.filter(item => Number(item.total_score || 0) < 20).length;

  statsGrid.innerHTML = `
    <div class="stat-card"><span>当前记录数</span><strong>${count}</strong></div>
    <div class="stat-card"><span>平均分</span><strong>${avg}</strong></div>
    <div class="stat-card"><span>大单建议</span><strong>${big}</strong></div>
    <div class="stat-card"><span>建议不下</span><strong>${needDrop}</strong></div>
  `;
}

function renderTable() {
  renderStats();
  if (!items.length) {
    itemsBody.innerHTML = '<tr><td class="empty" colspan="15">暂无数据，请先新增评审记录。</td></tr>';
    return;
  }

  itemsBody.innerHTML = items.map(item => {
    const image = item.product_image
      ? `<img class="photo" src="${escapeHtml(item.product_image)}" alt="产品图" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'photo-placeholder',textContent:'无图'}))">`
      : '<span class="photo-placeholder">无图</span>';
    return `
      <tr>
        <td>${image}</td>
        <td><strong>${escapeHtml(item.style_code)}</strong></td>
        <td>${escapeHtml(item.season)}</td>
        <td>${formatMoney(item.base_price)}</td>
        <td class="score-cell">${item.appearance_score}</td>
        <td class="score-cell">${item.material_score}</td>
        <td class="score-cell">${item.craftsmanship_score}</td>
        <td class="score-cell">${item.capacity_score}</td>
        <td class="score-cell">${item.comfort_score}</td>
        <td class="total-cell">${item.total_score}</td>
        <td><strong>${escapeHtml(item.grade)}</strong></td>
        <td>${escapeHtml(item.reviewer)}</td>
        <td>${escapeHtml(item.review_date)}</td>
        <td class="remark-cell" title="${escapeHtml(item.remark)}">${escapeHtml(item.remark)}</td>
        <td class="no-print">
          <div class="actions">
            <button class="ghost" data-action="edit" data-id="${escapeHtml(item.id)}">编辑</button>
            <button class="ghost" data-action="history" data-id="${escapeHtml(item.id)}">历史</button>
            <button class="danger-light" data-action="delete" data-id="${escapeHtml(item.id)}">删除</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

async function loadItems() {
  const params = new URLSearchParams(new FormData(searchForm));
  const data = await requestJson(`/api/items?${params.toString()}`);
  items = data.items || [];
  renderTable();
}

async function checkLogin() {
  try {
    await requestJson('/api/me');
    showApp();
    await loadSettings();
    await loadItems();
  } catch {
    showLogin();
  }
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const username = loginForm.elements.username.value.trim();
  const password = loginForm.elements.password.value;
  try {
    await requestJson('/api/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ username, password })
    });
    loginForm.reset();
    showApp();
    await loadSettings();
    await loadItems();
  } catch (e) {
    showMessage(e.message, 'error');
  }
});

logoutBtn.addEventListener('click', async () => {
  await fetch('/api/logout', { method: 'POST', credentials: 'include' });
  showLogin();
});

scoreCarousel.addEventListener('input', (event) => {
  const input = event.target.closest('[data-field]');
  if (!input) return;
  const slide = input.closest('.score-slide');
  const index = Number(slide.dataset.index);
  const field = input.dataset.field;
  drafts[index][field] = input.value;
  if (input.type === 'range') {
    input.nextElementSibling.textContent = input.value;
    updateSlideTotal(index);
  }
  if (index === currentIndex) updateSlideStatus();
});

scoreCarousel.addEventListener('change', async (event) => {
  const imageInput = event.target.closest('[data-image-file]');
  if (imageInput) {
    const slide = imageInput.closest('.score-slide');
    const index = Number(slide.dataset.index);
    try {
      imageInput.disabled = true;
      await uploadImageFile(imageInput.files?.[0], index);
      imageInput.value = '';
    } catch (e) {
      showMessage(e.message, 'error');
    } finally {
      imageInput.disabled = false;
    }
    return;
  }

  const input = event.target.closest('[data-field]');
  if (!input) return;
  const slide = input.closest('.score-slide');
  const index = Number(slide.dataset.index);
  const field = input.dataset.field;
  drafts[index][field] = input.value;
  if (index === currentIndex) updateSlideStatus();
});

scoreCarousel.addEventListener('scroll', () => {
  if (isRendering) return;
  window.clearTimeout(scrollTimer);
  scrollTimer = window.setTimeout(() => {
    const slideWidth = scoreCarousel.clientWidth || 1;
    const targetIndex = Math.max(0, Math.min(pageCount - 1, Math.round(scoreCarousel.scrollLeft / slideWidth)));
    if (targetIndex > currentIndex && !isDraftComplete(drafts[currentIndex])) {
      goToSlide(currentIndex, false, true);
      return;
    }
    currentIndex = targetIndex;
    updateSlideStatus();
  }, 80);
});

prevSlideBtn?.addEventListener('click', () => goToSlide(currentIndex - 1));
nextSlideBtn?.addEventListener('click', autoSaveAndGoNext);
bottomPrevBtn?.addEventListener('click', () => goToSlide(currentIndex - 1));
saveAndNextBtn?.addEventListener('click', autoSaveAndGoNext);
bottomSaveNextBtn?.addEventListener('click', autoSaveAndGoNext);
slideDots.addEventListener('click', (event) => {
  const btn = event.target.closest('.slide-dot');
  if (btn && !btn.disabled) goToSlide(Number(btn.dataset.index));
});

$('#saveCurrentBtn')?.addEventListener('click', async () => {
  try {
    await saveDraft(currentIndex);
  } catch (e) {
    showMessage(e.message, 'error');
  }
});

$('#saveAllBtn')?.addEventListener('click', async () => {
  try {
    let saved = 0;
    for (let i = 0; i < drafts.length; i++) {
      if (!draftHasContent(drafts[i])) continue;
      if (!String(drafts[i].style_code || '').trim()) {
        goToSlide(i);
        throw new Error(`第 ${i + 1} 款已填写内容，但缺少款式编码`);
      }
      await saveDraft(i, true);
      saved += 1;
    }
    showMessage(saved ? `已保存 ${saved} 款` : '没有需要保存的款式');
    renderSlides();
    await loadItems();
  } catch (e) {
    showMessage(e.message, 'error');
  }
});

$('#clearCurrentBtn').addEventListener('click', () => {
  if (draftHasContent(drafts[currentIndex]) && !confirm('确定清空当前页吗？未保存内容会丢失。')) return;
  clearDraft(currentIndex);
});

$('#newBatchBtn').addEventListener('click', () => {
  if (drafts.some(draftHasContent) && !confirm('确定重新开始吗？所有当前草稿页会被清空，已保存到历史的数据不受影响。')) return;
  resetBatch();
});

$('#savePageCountBtn').addEventListener('click', async () => {
  try {
    await saveSettings();
  } catch (e) {
    showMessage(e.message, 'error');
  }
});

$$('.tab').forEach(tab => {
  tab.addEventListener('click', () => setActiveTab(tab.dataset.target));
});

searchForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    await loadItems();
  } catch (e) {
    showMessage(e.message, 'error');
  }
});

itemsBody.addEventListener('click', async (event) => {
  const btn = event.target.closest('button[data-action]');
  if (!btn) return;
  const id = String(btn.dataset.id || '');
  const action = btn.dataset.action;
  const item = items.find(row => String(row.id) === id);

  if (action === 'edit' && item) {
    if (drafts.some(draftHasContent) && !confirm('载入历史记录会覆盖当前滑动评分草稿，确定继续吗？')) return;
    drafts = Array.from({ length: pageCount }, () => emptyDraft());
    drafts[0] = itemToDraft(item);
    currentIndex = 0;
    renderSlides();
    setActiveTab('scoreSection');
    $('#scoreSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
    showMessage('已载入到第 1 款页面，填写完整后点击下一页会自动更新');
    return;
  }

  if (action === 'delete') {
    if (!confirm('确定删除这条评审记录吗？删除后普通列表不再显示，但修改历史中仍会保留快照。')) return;
    try {
      await requestJson(`/api/items/${encodeURIComponent(id)}`, { method: 'DELETE' });
      showMessage('记录已删除');
      await loadItems();
    } catch (e) {
      showMessage(e.message, 'error');
    }
    return;
  }

  if (action === 'history') {
    try {
      const data = await requestJson(`/api/items/${encodeURIComponent(id)}/history`);
      renderHistory(data.history || []);
      historyPanel.classList.remove('hidden');
      historyPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) {
      showMessage(e.message, 'error');
    }
  }
});

function renderHistory(history) {
  if (!history.length) {
    historyList.innerHTML = '<p class="tip">暂无修改历史。</p>';
    return;
  }
  historyList.innerHTML = '';
  for (const record of history) {
    const div = document.createElement('div');
    div.className = 'history-item';
    const snapshot = JSON.parse(record.snapshot_json || '{}');
    div.innerHTML = `
      <header><span>${escapeHtml(record.action)}</span><time>${escapeHtml(record.changed_at)}</time></header>
      <pre></pre>
    `;
    div.querySelector('pre').textContent = JSON.stringify(snapshot, null, 2);
    historyList.appendChild(div);
  }
}

$('#clearSearchBtn').addEventListener('click', async () => {
  searchForm.reset();
  await loadItems();
});
$('#closeHistoryBtn').addEventListener('click', () => historyPanel.classList.add('hidden'));
$('#printBtn').addEventListener('click', () => {
  setActiveTab('listSection');
  setTimeout(() => window.print(), 120);
});

checkLogin();
