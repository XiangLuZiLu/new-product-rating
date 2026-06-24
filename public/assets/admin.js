const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const loginView = $('#loginView');
const appView = $('#appView');
const loginForm = $('#loginForm');
const logoutBtn = $('#logoutBtn');
const messageBox = $('#message');
const styleForm = $('#styleForm');
const styleFormTitle = $('#styleFormTitle');
const cancelStyleEditBtn = $('#cancelStyleEditBtn');
const stylesBody = $('#stylesBody');
const styleSearchForm = $('#styleSearchForm');
const scoreSearchForm = $('#scoreSearchForm');
const scoresHead = $('#scoresHead');
const scoresBody = $('#scoresBody');
const statsGrid = $('#statsGrid');
const historyPanel = $('#historyPanel');
const historyList = $('#historyList');
const scoreEditPanel = $('#scoreEditPanel');
const scoreEditForm = $('#scoreEditForm');
const cancelScoreEditBtn = $('#cancelScoreEditBtn');
const scoreFieldList = $('#scoreFieldList');
const addScoreFieldBtn = $('#addScoreFieldBtn');
const saveScoreFieldsBtn = $('#saveScoreFieldsBtn');
const styleDropZone = $('#styleDropZone');
const styleImageFile = $('#styleImageFile');
const stylePreview = $('#stylePreview');

let styles = [];
let scores = [];
let scoreFields = [];
let editingStyleId = null;
let editingScoreId = null;
let editingScoreMeta = null;
let sessionGuardStarted = false;
let sessionIdleTimer = null;
let sessionLastRefreshAt = 0;
const sessionIdleMinutes = Number(window.__SESSION_IDLE_MINUTES__ || 120);
const sessionIdleMs = Math.max(1, sessionIdleMinutes) * 60 * 1000;
const sessionRefreshIntervalMs = Math.min(5 * 60 * 1000, Math.max(30 * 1000, sessionIdleMs / 3));

function instantButtonFeedback(button) {
  if (!button || button.disabled) return;
  button.classList.add('instant-tap');
  window.setTimeout(() => button.classList.remove('instant-tap'), 120);
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
document.addEventListener('click', (event) => {
  const control = event.target.closest('button, a.ghost');
  instantButtonFeedback(control);
}, { passive: true });

const defaultScoreFields = [
  { id: 'appearance', label: '外观设计' },
  { id: 'material', label: '材质触感' },
  { id: 'craftsmanship', label: '工艺细节' },
  { id: 'capacity', label: '容量收纳' },
  { id: 'comfort', label: '背负舒适度' }
];

function today() { return new Date().toISOString().slice(0, 10); }
function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function gradeByScore(total) {
  if (total >= 40) return '大单';
  if (total >= 30) return '中单';
  if (total >= 20) return '小单试水';
  return '建议不下';
}
function formatMoney(value) {
  if (value === null || value === undefined || value === '') return '';
  return Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 2 });
}
function showMessage(text, type = 'success') {
  messageBox.textContent = text;
  messageBox.classList.toggle('error', type === 'error');
  messageBox.classList.remove('hidden');
  window.clearTimeout(showMessage.timer);
  showMessage.timer = window.setTimeout(() => messageBox.classList.add('hidden'), 3600);
}
function normalizeScoreFieldsLocal(fields) {
  if (!Array.isArray(fields)) return defaultScoreFields.map(item => ({ ...item }));
  const used = new Set();
  const normalized = fields.map((field, index) => {
    const label = String(field.label || '').trim();
    if (!label) return null;
    let id = String(field.id || label || `field_${index + 1}`).trim().replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || `field_${index + 1}`;
    let suffix = 2;
    const base = id;
    while (used.has(id)) id = `${base}_${suffix++}`;
    used.add(id);
    return { id, label };
  }).filter(Boolean);
  return normalized.length ? normalized : defaultScoreFields.map(item => ({ ...item }));
}
function makeScoreFieldId() {
  return `field_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}
function showLogin() {
  stopSessionIdleGuard();
  appView.classList.add('hidden');
  loginView.classList.remove('hidden');
}
function showApp() {
  loginView.classList.add('hidden');
  appView.classList.remove('hidden');
  startSessionIdleGuard();
}
function startSessionIdleGuard() {
  if (sessionGuardStarted) { resetSessionIdleTimer(false); return; }
  sessionGuardStarted = true;
  sessionLastRefreshAt = Date.now();
  ['click', 'input', 'keydown', 'touchstart', 'mousemove'].forEach(name => document.addEventListener(name, handleSessionActivity, { passive: true }));
  resetSessionIdleTimer(false);
}
function stopSessionIdleGuard() {
  if (!sessionGuardStarted) return;
  sessionGuardStarted = false;
  window.clearTimeout(sessionIdleTimer);
  ['click', 'input', 'keydown', 'touchstart', 'mousemove'].forEach(name => document.removeEventListener(name, handleSessionActivity));
}
function handleSessionActivity() {
  if (loginView && !loginView.classList.contains('hidden')) return;
  resetSessionIdleTimer(true);
}
function resetSessionIdleTimer(shouldRefresh) {
  window.clearTimeout(sessionIdleTimer);
  sessionIdleTimer = window.setTimeout(async () => {
    await fetch('/api/logout', { method: 'POST', credentials: 'include' }).catch(() => null);
    showLogin();
    showMessage('长时间未操作，请重新登录', 'error');
  }, sessionIdleMs);
  if (!shouldRefresh) return;
  const now = Date.now();
  if (now - sessionLastRefreshAt < sessionRefreshIntervalMs) return;
  sessionLastRefreshAt = now;
  fetch('/api/me', { credentials: 'include' }).then(response => {
    if (response.status === 401) {
      showLogin();
      showMessage('登录已过期，请重新登录', 'error');
    }
  }).catch(() => null);
}
async function requestJson(path, options = {}) {
  const response = await fetch(path, { credentials: 'include', ...options, headers: options.headers || {} });
  if (response.status === 401) {
    showLogin();
    throw new Error('请先登录');
  }
  const data = await response.json().catch(() => null);
  if (!response.ok || data?.ok === false) throw new Error(data?.message || '请求失败');
  return data;
}
async function uploadImageFile(file) {
  if (!file) return '';
  if (!file.type.startsWith('image/')) throw new Error('请选择图片文件');
  const form = new FormData();
  form.append('file', file);
  const response = await fetch('/api/upload-image', { method: 'POST', credentials: 'include', body: form });
  const data = await response.json().catch(() => null);
  if (!response.ok || data?.ok === false) throw new Error(data?.message || '图片上传失败');
  return data.url || data.image?.url || '';
}
function setActiveTab(targetId) {
  $$('.tab').forEach(tab => tab.classList.toggle('active', tab.dataset.target === targetId));
  $('#styleSection').classList.toggle('hidden', targetId !== 'styleSection');
  $('#scoreSection').classList.toggle('hidden', targetId !== 'scoreSection');
}
function renderStats() {
  const activeStyles = styles.filter(s => Number(s.active ?? 1) === 1).length;
  const scoreCount = scores.length;
  const avg = scoreCount ? (scores.reduce((sum, row) => sum + Number(row.total_score || 0), 0) / scoreCount).toFixed(1) : '0';
  const reviewerCount = new Set(scores.map(s => String(s.reviewer || '').trim()).filter(Boolean)).size;
  statsGrid.innerHTML = `
    <div class="stat-card"><span>启用款式</span><strong>${activeStyles}</strong></div>
    <div class="stat-card"><span>评分记录</span><strong>${scoreCount}</strong></div>
    <div class="stat-card"><span>评分人数</span><strong>${reviewerCount}</strong></div>
    <div class="stat-card"><span>平均分</span><strong>${avg}</strong></div>
  `;
}
function renderScoreFieldEditor() {
  scoreFields = normalizeScoreFieldsLocal(scoreFields);
  scoreFieldList.innerHTML = scoreFields.map((field, index) => `
    <div class="score-field-editor-row" data-index="${index}" data-id="${escapeHtml(field.id)}">
      <span class="score-field-order">${index + 1}</span>
      <input data-score-field-label value="${escapeHtml(field.label)}" placeholder="评分项名称，例如 外观设计" />
      <button class="danger-light" type="button" data-score-field-action="delete">删除</button>
    </div>
  `).join('');
}
function readScoreFieldsFromEditor() {
  const rows = Array.from(scoreFieldList.querySelectorAll('.score-field-editor-row'));
  const fields = rows.map((row, index) => ({
    id: row.dataset.id || makeScoreFieldId(),
    label: row.querySelector('[data-score-field-label]')?.value?.trim() || ''
  })).filter(field => field.label);
  if (!fields.length) throw new Error('至少保留 1 个评分项');
  return normalizeScoreFieldsLocal(fields);
}
function getScoreItems(score) {
  if (Array.isArray(score?.score_items) && score.score_items.length) return score.score_items;
  return scoreFields.map(field => ({ id: field.id, label: field.label, score: Number(score?.[field.id] || 0) }));
}
function renderStyles() {
  renderStats();
  if (!styles.length) {
    stylesBody.innerHTML = '<tr><td class="empty" colspan="8">暂无款式，请先在后台新增需要评分的款式。</td></tr>';
    return;
  }
  stylesBody.innerHTML = styles.map(style => {
    const image = style.product_image
      ? `<img class="photo" src="${escapeHtml(style.product_image)}" alt="产品图" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'photo-placeholder',textContent:'无图'}))">`
      : '<span class="photo-placeholder">无图</span>';
    return `
      <tr>
        <td>${image}</td>
        <td><strong>${escapeHtml(style.style_code)}</strong></td>
        <td>${escapeHtml(style.season || '')}</td>
        <td>${formatMoney(style.base_price)}</td>
        <td>${Number(style.active ?? 1) === 1 ? '<strong class="status-on">启用</strong>' : '<span class="status-off">停用</span>'}</td>
        <td class="remark-cell" title="${escapeHtml(style.style_remark || '')}">${escapeHtml(style.style_remark || '')}</td>
        <td>${escapeHtml(style.created_at || '')}</td>
        <td class="no-print"><div class="actions">
          <button class="ghost" data-style-action="edit" data-id="${escapeHtml(style.id)}">编辑</button>
          <button class="danger-light" data-style-action="delete" data-id="${escapeHtml(style.id)}">删除</button>
        </div></td>
      </tr>
    `;
  }).join('');
}
function renderScores() {
  renderStats();
  const dynamicLabels = [];
  for (const score of scores) {
    for (const item of getScoreItems(score)) {
      if (!dynamicLabels.includes(item.label)) dynamicLabels.push(item.label);
    }
  }
  if (!dynamicLabels.length) dynamicLabels.push(...scoreFields.map(item => item.label));
  scoresHead.innerHTML = `
    <tr>
      <th>产品图</th><th>款式编码</th><th>季节</th><th>基本售价</th>
      ${dynamicLabels.map(label => `<th>${escapeHtml(label)}</th>`).join('')}
      <th>总分</th><th>等级</th><th>评分人</th><th>日期</th><th>备注</th><th>提交时间</th><th class="no-print">操作</th>
    </tr>`;
  if (!scores.length) {
    scoresBody.innerHTML = `<tr><td class="empty" colspan="${dynamicLabels.length + 11}">暂无评分记录。</td></tr>`;
    return;
  }
  scoresBody.innerHTML = scores.map(score => {
    const image = score.product_image
      ? `<img class="photo" src="${escapeHtml(score.product_image)}" alt="产品图" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'photo-placeholder',textContent:'无图'}))">`
      : '<span class="photo-placeholder">无图</span>';
    const values = Object.fromEntries(getScoreItems(score).map(item => [item.label, item.score]));
    return `
      <tr>
        <td>${image}</td>
        <td><strong>${escapeHtml(score.style_code)}</strong></td>
        <td>${escapeHtml(score.season || '')}</td>
        <td>${formatMoney(score.base_price)}</td>
        ${dynamicLabels.map(label => `<td class="score-cell">${values[label] ?? ''}</td>`).join('')}
        <td class="total-cell">${score.total_score}</td>
        <td><strong>${escapeHtml(score.grade)}</strong></td>
        <td>${escapeHtml(score.reviewer)}</td>
        <td>${escapeHtml(score.review_date)}</td>
        <td class="remark-cell" title="${escapeHtml(score.remark || '')}">${escapeHtml(score.remark || '')}</td>
        <td>${escapeHtml(score.created_at || '')}</td>
        <td class="no-print"><div class="actions">
          <button class="ghost" data-score-action="edit" data-id="${escapeHtml(score.id)}">编辑</button>
          <button class="ghost" data-score-action="history" data-id="${escapeHtml(score.id)}">历史</button>
          <button class="danger-light" data-score-action="delete" data-id="${escapeHtml(score.id)}">删除</button>
        </div></td>
      </tr>
    `;
  }).join('');
}
async function loadSettings() {
  const data = await requestJson('/api/settings');
  scoreFields = normalizeScoreFieldsLocal(data.settings?.score_fields || defaultScoreFields);
  renderScoreFieldEditor();
}
async function loadStyles() {
  const params = new URLSearchParams(new FormData(styleSearchForm));
  const data = await requestJson(`/api/styles?${params}`);
  styles = data.styles || [];
  renderStyles();
}
async function loadScores() {
  const params = new URLSearchParams(new FormData(scoreSearchForm));
  const data = await requestJson(`/api/scores?${params}`);
  scores = data.scores || [];
  renderScores();
}
function setImagePreview(url) {
  const safe = String(url || '').trim();
  styleForm.elements.product_image.value = safe;
  if (styleForm.elements.product_image_url) styleForm.elements.product_image_url.value = safe;
  stylePreview.innerHTML = safe ? `<img class="image-preview" src="${escapeHtml(safe)}" alt="产品图预览" />` : '<span>拖拽图片到这里，或点击选择图片</span>';
}
function resetStyleForm() {
  editingStyleId = null;
  styleForm.reset();
  styleForm.elements.active.checked = true;
  styleFormTitle.textContent = '新增评分款式';
  cancelStyleEditBtn.classList.add('hidden');
  setImagePreview('');
}
function fillStyleForm(style) {
  editingStyleId = style.id;
  styleFormTitle.textContent = `编辑款式：${style.style_code}`;
  setImagePreview(style.product_image || '');
  styleForm.elements.style_code.value = style.style_code || '';
  styleForm.elements.season.value = style.season || '';
  styleForm.elements.base_price.value = style.base_price ?? '';
  styleForm.elements.active.checked = Number(style.active ?? 1) === 1;
  styleForm.elements.style_remark.value = style.style_remark || '';
  cancelStyleEditBtn.classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function fillScoreEditForm(score) {
  editingScoreId = score.id;
  const items = getScoreItems(score).map(item => ({ id: item.id, label: item.label, score: Number(item.score || 0) }));
  editingScoreMeta = { style_id: score.style_id, reviewer: score.reviewer || '', review_date: score.review_date || today(), score_items: items };
  scoreEditPanel.classList.remove('hidden');
  scoreEditForm.elements.style_id.value = score.style_id || '';
  scoreEditForm.elements.style_info.value = `${score.style_code || ''} ${score.season || ''}`.trim();
  scoreEditForm.elements.remark.value = score.remark || '';
  $('#scoreEditItems').innerHTML = `
    <legend>评分项</legend>
    ${items.map(item => `
      <label class="score-row">
        <span>${escapeHtml(item.label)}</span>
        <input data-score-item-id="${escapeHtml(item.id)}" data-score-item-label="${escapeHtml(item.label)}" type="range" min="0" max="10" step="1" value="${Number(item.score || 0)}" />
        <output>${Number(item.score || 0)}</output>
      </label>
    `).join('')}
    <div class="total-box"><span>总分</span><strong id="scoreEditTotal">0</strong><em id="scoreEditGrade">建议不下</em></div>`;
  updateScoreEditTotal();
  scoreEditPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function updateScoreEditTotal() {
  let total = 0;
  scoreEditForm.querySelectorAll('[data-score-item-id]').forEach(input => { total += Number(input.value || 0); });
  $('#scoreEditTotal').textContent = total;
  $('#scoreEditGrade').textContent = gradeByScore(total);
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const submitBtn = loginForm.querySelector('button[type="submit"]');
  setButtonBusy(submitBtn, true, '登录中...');
  try {
    await requestJson('/api/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ username: loginForm.elements.username.value.trim(), password: loginForm.elements.password.value })
    });
    loginForm.reset();
    showApp();
    await loadSettings();
    await Promise.all([loadStyles(), loadScores()]);
  } catch (e) { showMessage(e.message, 'error'); }
  finally { setButtonBusy(submitBtn, false); }
});
logoutBtn.addEventListener('click', async () => {
  setButtonBusy(logoutBtn, true, '退出中...');
  await fetch('/api/logout', { method: 'POST', credentials: 'include' }).catch(() => null);
  setButtonBusy(logoutBtn, false);
  showLogin();
});
$$('.tab').forEach(tab => tab.addEventListener('click', () => setActiveTab(tab.dataset.target)));

addScoreFieldBtn.addEventListener('click', () => {
  scoreFields.push({ id: makeScoreFieldId(), label: `评分项${scoreFields.length + 1}` });
  renderScoreFieldEditor();
});
scoreFieldList.addEventListener('click', (event) => {
  const btn = event.target.closest('[data-score-field-action="delete"]');
  if (!btn) return;
  const row = btn.closest('.score-field-editor-row');
  const rows = Array.from(scoreFieldList.querySelectorAll('.score-field-editor-row'));
  if (rows.length <= 1) { showMessage('至少保留 1 个评分项', 'error'); return; }
  row.remove();
});
saveScoreFieldsBtn.addEventListener('click', async () => {
  setButtonBusy(saveScoreFieldsBtn, true, '保存中...');
  try {
    const fields = readScoreFieldsFromEditor();
    const data = await requestJson('/api/settings', {
      method: 'PUT',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ score_fields: fields })
    });
    scoreFields = normalizeScoreFieldsLocal(data.settings?.score_fields || fields);
    renderScoreFieldEditor();
    showMessage('评分项已保存，前端评分页会按新配置显示');
    await loadScores();
  } catch (e) { showMessage(e.message, 'error'); }
  finally { setButtonBusy(saveScoreFieldsBtn, false); }
});

async function uploadAndSetPreview(file) {
  const url = await uploadImageFile(file);
  if (url) setImagePreview(url);
  return url;
}
styleDropZone.addEventListener('click', () => styleImageFile.click());
styleDropZone.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); styleImageFile.click(); }
});
['dragenter', 'dragover'].forEach(name => styleDropZone.addEventListener(name, (event) => {
  event.preventDefault();
  styleDropZone.classList.add('drag-over');
}));
['dragleave', 'drop'].forEach(name => styleDropZone.addEventListener(name, (event) => {
  event.preventDefault();
  styleDropZone.classList.remove('drag-over');
}));
styleDropZone.addEventListener('drop', async (event) => {
  const file = event.dataTransfer?.files?.[0];
  if (!file) return;
  try { await uploadAndSetPreview(file); showMessage('图片已上传'); } catch(e) { showMessage(e.message, 'error'); }
});
styleImageFile.addEventListener('change', async () => {
  const file = styleImageFile.files?.[0];
  if (!file) return;
  try { await uploadAndSetPreview(file); showMessage('图片已上传'); } catch(e) { showMessage(e.message, 'error'); }
  finally { styleImageFile.value = ''; }
});
styleForm.elements.product_image_url.addEventListener('input', () => setImagePreview(styleForm.elements.product_image_url.value.trim()));

styleForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const submitBtn = styleForm.querySelector('button[type="submit"]');
  setButtonBusy(submitBtn, true, editingStyleId ? '更新中...' : '保存中...');
  try {
    const file = styleImageFile.files?.[0];
    if (file) await uploadAndSetPreview(file);
    const payload = {
      product_image: styleForm.elements.product_image.value.trim() || styleForm.elements.product_image_url.value.trim(),
      style_code: styleForm.elements.style_code.value.trim(),
      season: styleForm.elements.season.value.trim(),
      base_price: styleForm.elements.base_price.value,
      active: styleForm.elements.active.checked ? 1 : 0,
      style_remark: styleForm.elements.style_remark.value.trim()
    };
    await requestJson(editingStyleId ? `/api/styles/${encodeURIComponent(editingStyleId)}` : '/api/styles', {
      method: editingStyleId ? 'PUT' : 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify(payload)
    });
    showMessage(editingStyleId ? '款式已更新' : '款式已新增');
    resetStyleForm();
    await loadStyles();
  } catch (e) { showMessage(e.message, 'error'); }
  finally { setButtonBusy(submitBtn, false); }
});
cancelStyleEditBtn.addEventListener('click', resetStyleForm);
styleSearchForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const submitBtn = event.submitter || styleSearchForm.querySelector('button[type="submit"]');
  setButtonBusy(submitBtn, true, '查询中...');
  try { await loadStyles(); } catch(e) { showMessage(e.message, 'error'); }
  finally { setButtonBusy(submitBtn, false); }
});
$('#clearStyleSearchBtn').addEventListener('click', async (event) => {
  setButtonBusy(event.currentTarget, true, '重置中...');
  styleSearchForm.reset();
  try { await loadStyles(); } finally { setButtonBusy(event.currentTarget, false); }
});
stylesBody.addEventListener('click', async (event) => {
  const btn = event.target.closest('button[data-style-action]');
  if (!btn) return;
  const style = styles.find(row => String(row.id) === String(btn.dataset.id));
  if (!style) return;
  if (btn.dataset.styleAction === 'edit') fillStyleForm(style);
  if (btn.dataset.styleAction === 'delete') {
    if (!confirm(`确定删除款式 ${style.style_code} 吗？已产生的评分记录不会删除。`)) return;
    try { await requestJson(`/api/styles/${encodeURIComponent(style.id)}`, { method: 'DELETE' }); showMessage('款式已删除'); await loadStyles(); } catch(e) { showMessage(e.message, 'error'); }
  }
});

scoreSearchForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const submitBtn = event.submitter || scoreSearchForm.querySelector('button[type="submit"]');
  setButtonBusy(submitBtn, true, '查询中...');
  try { await loadScores(); } catch(e) { showMessage(e.message, 'error'); }
  finally { setButtonBusy(submitBtn, false); }
});
$('#clearScoreSearchBtn').addEventListener('click', async (event) => {
  setButtonBusy(event.currentTarget, true, '重置中...');
  scoreSearchForm.reset();
  try { await loadScores(); } finally { setButtonBusy(event.currentTarget, false); }
});
scoresBody.addEventListener('click', async (event) => {
  const btn = event.target.closest('button[data-score-action]');
  if (!btn) return;
  const score = scores.find(row => String(row.id) === String(btn.dataset.id));
  if (!score) return;
  if (btn.dataset.scoreAction === 'edit') fillScoreEditForm(score);
  if (btn.dataset.scoreAction === 'history') {
    try {
      const data = await requestJson(`/api/scores/${encodeURIComponent(score.id)}/history`);
      historyPanel.classList.remove('hidden');
      historyList.innerHTML = (data.history || []).length ? data.history.map(item => `
        <article class="history-item"><header><span>${escapeHtml(item.action)}</span><span>${escapeHtml(item.changed_at)}</span></header><pre>${escapeHtml(item.snapshot_json)}</pre></article>
      `).join('') : '<p class="tip">暂无修改历史。</p>';
      historyPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch(e) { showMessage(e.message, 'error'); }
  }
  if (btn.dataset.scoreAction === 'delete') {
    if (!confirm(`确定删除 ${score.reviewer} 对 ${score.style_code} 的评分吗？`)) return;
    try { await requestJson(`/api/scores/${encodeURIComponent(score.id)}`, { method: 'DELETE' }); showMessage('评分已删除'); await loadScores(); } catch(e) { showMessage(e.message, 'error'); }
  }
});
scoreEditForm.addEventListener('input', (event) => {
  const range = event.target.closest('[data-score-item-id]');
  if (!range) return;
  range.nextElementSibling.textContent = range.value;
  updateScoreEditTotal();
});
scoreEditForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!editingScoreId || !editingScoreMeta) return;
  const submitBtn = scoreEditForm.querySelector('button[type="submit"]');
  setButtonBusy(submitBtn, true, '保存中...');
  try {
    const items = Array.from(scoreEditForm.querySelectorAll('[data-score-item-id]')).map(input => ({
      id: input.dataset.scoreItemId,
      label: input.dataset.scoreItemLabel,
      score: Number(input.value || 0)
    }));
    const payload = {
      style_id: editingScoreMeta.style_id,
      reviewer: editingScoreMeta.reviewer,
      review_date: editingScoreMeta.review_date,
      remark: scoreEditForm.elements.remark.value.trim(),
      score_items: items
    };
    await requestJson(`/api/scores/${encodeURIComponent(editingScoreId)}`, {
      method: 'PUT', headers: { 'content-type': 'application/json; charset=utf-8' }, body: JSON.stringify(payload)
    });
    showMessage('评分记录已更新');
    editingScoreId = null;
    editingScoreMeta = null;
    scoreEditPanel.classList.add('hidden');
    scoreEditForm.reset();
    await loadScores();
  } catch(e) { showMessage(e.message, 'error'); }
  finally { setButtonBusy(submitBtn, false); }
});
cancelScoreEditBtn.addEventListener('click', () => { editingScoreId = null; editingScoreMeta = null; scoreEditPanel.classList.add('hidden'); scoreEditForm.reset(); });
$('#closeHistoryBtn').addEventListener('click', () => historyPanel.classList.add('hidden'));
$('#printBtn').addEventListener('click', () => window.print());

async function checkLogin() {
  try {
    await requestJson('/api/me');
    showApp();
    resetStyleForm();
    await loadSettings();
    await Promise.all([loadStyles(), loadScores()]);
  } catch { showLogin(); }
}
checkLogin();
