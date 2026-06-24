console.info("product-review admin version: 20260624-oss-page-settings-v1");
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
const imageStorageForm = $('#imageStorageForm');
const saveImageSettingsBtn = $('#saveImageSettingsBtn');
const styleDropZone = $('#styleDropZone');
const styleImageFile = $('#styleImageFile');
const stylePreview = $('#stylePreview');

let styles = [];
let scores = [];
let scoreGroups = [];
let selectedScoreGroupKey = null;
let scoreFields = [];
let editingStyleId = null;
let inlineEditingStyleId = null;
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
  { id: 'appearance', label: '外观设计', max_score: 10 },
  { id: 'material', label: '材质触感', max_score: 10 },
  { id: 'craftsmanship', label: '工艺细节', max_score: 10 },
  { id: 'capacity', label: '容量收纳', max_score: 10 },
  { id: 'comfort', label: '背负舒适度', max_score: 10 }
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
function normalizeMaxScore(value) {
  const n = Number.parseInt(value ?? 10, 10);
  if (!Number.isFinite(n) || n <= 0) return 10;
  return Math.max(1, Math.min(100, n));
}
function gradeByScore(total, maxTotal = 50) {
  const max = Number(maxTotal);
  const rate = Number.isFinite(max) && max > 0 ? Number(total || 0) / max : 0;
  if (rate >= 0.8) return '大单';
  if (rate >= 0.6) return '中单';
  if (rate >= 0.4) return '小单试水';
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
    return { id, label, max_score: normalizeMaxScore(field.max_score ?? field.maxScore ?? field.max ?? field.score_max ?? 10) };
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
      <input data-score-field-label value="${escapeHtml(field.label)}" placeholder="评分项名称" />
      <label class="score-max-editor"><span>满分</span><input data-score-field-max type="number" min="1" max="100" step="1" value="${normalizeMaxScore(field.max_score)}" /></label>
      <button class="danger-light" type="button" data-score-field-action="delete">删除</button>
    </div>
  `).join('');
}

function normalizeImageSettingsLocal(settings = {}) {
  return {
    driver: String(settings.driver || 'url').trim().toLowerCase() || 'url',
    image_max_size_mb: Number(settings.image_max_size_mb || 10),
    image_key_prefix: String(settings.image_key_prefix || 'review-images').trim() || 'review-images',
    public_image_base_url: String(settings.public_image_base_url || '').trim(),
    s3_endpoint: String(settings.s3_endpoint || '').trim(),
    s3_bucket: String(settings.s3_bucket || '').trim(),
    s3_region: String(settings.s3_region || 'us-east-1').trim() || 'us-east-1',
    s3_access_key_id: String(settings.s3_access_key_id || '').trim(),
    s3_secret_access_key: String(settings.s3_secret_access_key || '').trim(),
    s3_force_path_style: settings.s3_force_path_style !== false
  };
}
function fillImageSettingsForm(settings = {}) {
  if (!imageStorageForm) return;
  const data = normalizeImageSettingsLocal(settings);
  imageStorageForm.elements.driver.value = ['url', 'r2', 's3'].includes(data.driver) ? data.driver : 'url';
  imageStorageForm.elements.image_max_size_mb.value = data.image_max_size_mb || 10;
  imageStorageForm.elements.image_key_prefix.value = data.image_key_prefix || 'review-images';
  imageStorageForm.elements.public_image_base_url.value = data.public_image_base_url || '';
  imageStorageForm.elements.s3_endpoint.value = data.s3_endpoint || '';
  imageStorageForm.elements.s3_bucket.value = data.s3_bucket || '';
  imageStorageForm.elements.s3_region.value = data.s3_region || 'us-east-1';
  imageStorageForm.elements.s3_access_key_id.value = data.s3_access_key_id || '';
  imageStorageForm.elements.s3_secret_access_key.value = data.s3_secret_access_key === '********' ? '' : data.s3_secret_access_key || '';
  imageStorageForm.elements.s3_force_path_style.checked = data.s3_force_path_style !== false;
  toggleImageSettingsFields();
}
function readImageSettingsForm() {
  const form = imageStorageForm;
  if (!form) return {};
  return {
    driver: form.elements.driver.value,
    image_max_size_mb: form.elements.image_max_size_mb.value,
    image_key_prefix: form.elements.image_key_prefix.value.trim(),
    public_image_base_url: form.elements.public_image_base_url.value.trim(),
    s3_endpoint: form.elements.s3_endpoint.value.trim(),
    s3_bucket: form.elements.s3_bucket.value.trim(),
    s3_region: form.elements.s3_region.value.trim(),
    s3_access_key_id: form.elements.s3_access_key_id.value.trim(),
    s3_secret_access_key: form.elements.s3_secret_access_key.value,
    s3_force_path_style: form.elements.s3_force_path_style.checked
  };
}
function toggleImageSettingsFields() {
  if (!imageStorageForm) return;
  const driver = imageStorageForm.elements.driver.value;
  const s3Box = imageStorageForm.querySelector('.s3-settings');
  if (s3Box) s3Box.classList.toggle('hidden', driver !== 's3');
}

function readScoreFieldsFromEditor() {
  const rows = Array.from(scoreFieldList.querySelectorAll('.score-field-editor-row'));
  const fields = rows.map((row, index) => ({
    id: row.dataset.id || makeScoreFieldId(),
    label: row.querySelector('[data-score-field-label]')?.value?.trim() || '',
    max_score: normalizeMaxScore(row.querySelector('[data-score-field-max]')?.value)
  })).filter(field => field.label);
  if (!fields.length) throw new Error('至少保留 1 个评分项');
  return normalizeScoreFieldsLocal(fields);
}
function getScoreItems(score) {
  if (Array.isArray(score?.score_items) && score.score_items.length) return score.score_items;
  return scoreFields.map(field => ({ id: field.id, label: field.label, max_score: normalizeMaxScore(field.max_score), score: Number(score?.[field.id] || 0) }));
}
function getScoreSubmitTime(score) {
  return String(score?.submitted_at || score?.created_at || score?.review_date || '').trim();
}
function getScoreGroupKey(score) {
  const submissionId = String(score?.submission_id || '').trim();
  if (submissionId) return `submission:${submissionId}`;
  return `legacy:${score?.id || ''}`;
}
function buildScoreGroups(rows) {
  const groups = new Map();
  for (const score of rows || []) {
    const key = getScoreGroupKey(score);
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        reviewer: String(score.reviewer || '').trim() || '未命名',
        submitted_at: getScoreSubmitTime(score),
        scores: []
      });
    }
    const group = groups.get(key);
    group.scores.push(score);
    if (getScoreSubmitTime(score) > group.submitted_at) group.submitted_at = getScoreSubmitTime(score);
  }
  return Array.from(groups.values())
    .map(group => ({ ...group, scores: group.scores.sort((a, b) => Number(a.style_id || 0) - Number(b.style_id || 0) || String(a.style_code || '').localeCompare(String(b.style_code || ''))) }))
    .sort((a, b) => String(b.submitted_at || '').localeCompare(String(a.submitted_at || '')));
}
function renderScoreGroupDetail(group) {
  const labels = [];
  for (const score of group.scores) {
    for (const item of getScoreItems(score)) {
      if (!labels.includes(item.label)) labels.push(item.label);
    }
  }
  if (!labels.length) labels.push(...scoreFields.map(item => item.label));
  return `
    <tr class="score-group-detail-row">
      <td colspan="3">
        <div class="score-group-detail">
          <div class="section-title compact-title">
            <div>
              <h3>${escapeHtml(group.reviewer)} 的本次提交明细</h3>
              <p class="tip">提交时间：${escapeHtml(group.submitted_at || '-')}，共 ${group.scores.length} 款。</p>
            </div>
          </div>
          <div class="table-wrap nested-table-wrap">
            <table class="review-table detail-score-table">
              <thead><tr>
                <th>产品图</th><th>款式编码</th><th>季节</th><th>基本售价</th>
                ${labels.map(label => `<th>${escapeHtml(label)}</th>`).join('')}
                <th>总分</th><th>等级</th><th>备注</th><th class="no-print">操作</th>
              </tr></thead>
              <tbody>
                ${group.scores.map(score => {
                  const image = score.product_image
                    ? `<img class="photo" src="${escapeHtml(score.product_image)}" alt="产品图" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'photo-placeholder',textContent:'无图'}))">`
                    : '<span class="photo-placeholder">无图</span>';
                  const values = Object.fromEntries(getScoreItems(score).map(item => [item.label, `${item.score} / ${normalizeMaxScore(item.max_score)}`]));
                  return `
                    <tr>
                      <td>${image}</td>
                      <td><strong>${escapeHtml(score.style_code)}</strong></td>
                      <td>${escapeHtml(score.season || '')}</td>
                      <td>${formatMoney(score.base_price)}</td>
                      ${labels.map(label => `<td class="score-cell">${escapeHtml(values[label] ?? '')}</td>`).join('')}
                      <td class="total-cell">${escapeHtml(score.total_score)}</td>
                      <td><strong>${escapeHtml(score.grade)}</strong></td>
                      <td class="remark-cell" title="${escapeHtml(score.remark || '')}">${escapeHtml(score.remark || '')}</td>
                      <td class="no-print"><div class="actions">
                        <button class="ghost" data-score-action="edit" data-id="${escapeHtml(score.id)}">编辑</button>
                        <button class="ghost" data-score-action="history" data-id="${escapeHtml(score.id)}">历史</button>
                        <button class="danger-light" data-score-action="delete" data-id="${escapeHtml(score.id)}">删除</button>
                      </div></td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </td>
    </tr>
  `;
}
function renderStylePhoto(url, className = 'photo') {
  const safe = String(url || '').trim();
  return safe
    ? `<img class="${className}" src="${escapeHtml(safe)}" alt="产品图" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'photo-placeholder',textContent:'无图'}))">`
    : '<span class="photo-placeholder">无图</span>';
}
function renderInlineStyleRow(style) {
  const activeChecked = Number(style.active ?? 1) === 1 ? 'checked' : '';
  return `
    <tr class="style-inline-edit-row" data-style-edit-id="${escapeHtml(style.id)}">
      <td>
        <div class="inline-image-editor">
          <div data-inline-image-preview>${renderStylePhoto(style.product_image, 'photo inline-photo')}</div>
          <input class="visually-hidden" data-inline-image-file type="file" accept="image/*" />
          <button class="ghost mini-btn" type="button" data-style-action="inline-upload" data-id="${escapeHtml(style.id)}">换图</button>
          <input class="inline-style-input image-url-input" data-inline-field="product_image" value="${escapeHtml(style.product_image || '')}" placeholder="图片链接" />
        </div>
      </td>
      <td><input class="inline-style-input" data-inline-field="style_code" value="${escapeHtml(style.style_code || '')}" placeholder="款式编码" required /></td>
      <td><input class="inline-style-input" data-inline-field="season" value="${escapeHtml(style.season || '')}" placeholder="季节" /></td>
      <td><input class="inline-style-input" data-inline-field="base_price" type="number" min="0" step="0.01" value="${escapeHtml(style.base_price ?? '')}" placeholder="售价" /></td>
      <td><label class="inline-switch"><input data-inline-field="active" type="checkbox" ${activeChecked} /> <span>启用</span></label></td>
      <td><textarea class="inline-style-input inline-remark" data-inline-field="style_remark" rows="2" placeholder="款式备注">${escapeHtml(style.style_remark || '')}</textarea></td>
      <td>${escapeHtml(style.created_at || '')}</td>
      <td class="no-print"><div class="actions inline-actions">
        <button class="primary" type="button" data-style-action="save-edit" data-id="${escapeHtml(style.id)}">保存</button>
        <button class="ghost" type="button" data-style-action="cancel-edit" data-id="${escapeHtml(style.id)}">取消</button>
        <button class="danger-light" type="button" data-style-action="delete" data-id="${escapeHtml(style.id)}">删除</button>
      </div></td>
    </tr>
  `;
}
function readInlineStylePayload(row) {
  const field = (name) => row.querySelector(`[data-inline-field="${name}"]`);
  const code = field('style_code')?.value?.trim() || '';
  if (!code) throw new Error('款式编码不能为空');
  return {
    product_image: field('product_image')?.value?.trim() || '',
    style_code: code,
    season: field('season')?.value?.trim() || '',
    base_price: field('base_price')?.value || '',
    active: field('active')?.checked ? 1 : 0,
    style_remark: field('style_remark')?.value?.trim() || ''
  };
}
function updateInlineImagePreview(row, url) {
  const preview = row.querySelector('[data-inline-image-preview]');
  const input = row.querySelector('[data-inline-field="product_image"]');
  if (input) input.value = String(url || '').trim();
  if (preview) preview.innerHTML = renderStylePhoto(url, 'photo inline-photo');
}
function renderStyles() {
  renderStats();
  if (!styles.length) {
    stylesBody.innerHTML = '<tr><td class="empty" colspan="8">暂无款式，请先在后台新增需要评分的款式。</td></tr>';
    return;
  }
  stylesBody.innerHTML = styles.map(style => {
    if (String(inlineEditingStyleId || '') === String(style.id)) return renderInlineStyleRow(style);
    const image = renderStylePhoto(style.product_image);
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
  scoreGroups = buildScoreGroups(scores);
  if (selectedScoreGroupKey && !scoreGroups.some(group => group.key === selectedScoreGroupKey)) selectedScoreGroupKey = null;

  scoresHead.innerHTML = `
    <tr>
      <th>评分人</th>
      <th>提交时间</th>
      <th class="no-print">操作</th>
    </tr>`;
  if (!scoreGroups.length) {
    scoresBody.innerHTML = '<tr><td class="empty" colspan="3">暂无评分记录。</td></tr>';
    return;
  }
  scoresBody.innerHTML = scoreGroups.map((group, index) => {
    const opened = selectedScoreGroupKey === group.key;
    return `
      <tr class="score-group-row ${opened ? 'opened' : ''}">
        <td>
          <button class="link-button reviewer-link" type="button" data-score-group-action="toggle" data-group-index="${index}">${escapeHtml(group.reviewer)}</button>
          <span class="group-count">${group.scores.length} 款</span>
        </td>
        <td>${escapeHtml(group.submitted_at || '-')}</td>
        <td class="no-print"><div class="actions">
          <button class="ghost" type="button" data-score-group-action="toggle" data-group-index="${index}">${opened ? '收起' : '查看'}</button>
          <button class="danger-light" type="button" data-score-group-action="delete" data-group-index="${index}">删除</button>
        </div></td>
      </tr>
      ${opened ? renderScoreGroupDetail(group) : ''}
    `;
  }).join('');
}
async function loadSettings() {
  const data = await requestJson('/api/settings');
  scoreFields = normalizeScoreFieldsLocal(data.settings?.score_fields || defaultScoreFields);
  renderScoreFieldEditor();
  fillImageSettingsForm(data.settings?.image_settings || {});
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
  // 已停用：已有款式编辑改为表格行内编辑，不再回填到新增区域。
  inlineEditingStyleId = style?.id || null;
  editingStyleId = null;
  resetStyleForm();
  renderStyles();
}

function fillScoreEditForm(score) {
  editingScoreId = score.id;
  const items = getScoreItems(score).map(item => ({ id: item.id, label: item.label, max_score: normalizeMaxScore(item.max_score), score: Number(item.score || 0) }));
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
        <input data-score-item-id="${escapeHtml(item.id)}" data-score-item-label="${escapeHtml(item.label)}" data-score-item-max="${normalizeMaxScore(item.max_score)}" type="range" min="0" max="${normalizeMaxScore(item.max_score)}" step="1" value="${Number(item.score || 0)}" />
        <output>${Number(item.score || 0)} / ${normalizeMaxScore(item.max_score)}</output>
      </label>
    `).join('')}
    <div class="total-box"><span>总分</span><strong id="scoreEditTotal">0</strong><em id="scoreEditGrade">建议不下</em></div>`;
  updateScoreEditTotal();
  scoreEditPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function updateScoreEditTotal() {
  let total = 0;
  let maxTotal = 0;
  scoreEditForm.querySelectorAll('[data-score-item-id]').forEach(input => {
    total += Number(input.value || 0);
    maxTotal += normalizeMaxScore(input.dataset.scoreItemMax || input.max);
  });
  $('#scoreEditTotal').textContent = `${total} / ${maxTotal}`;
  $('#scoreEditGrade').textContent = gradeByScore(total, maxTotal);
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


if (imageStorageForm) {
  imageStorageForm.elements.driver.addEventListener('change', toggleImageSettingsFields);
  imageStorageForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    setButtonBusy(saveImageSettingsBtn, true, '保存中...');
    try {
      const payload = readImageSettingsForm();
      if (payload.driver === 's3' && !payload.s3_secret_access_key) payload.s3_secret_access_key = '********';
      const data = await requestJson('/api/settings', {
        method: 'PUT',
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ image_settings: payload })
      });
      fillImageSettingsForm(data.settings?.image_settings || payload);
      showMessage('图片存储配置已保存');
    } catch (e) { showMessage(e.message, 'error'); }
    finally { setButtonBusy(saveImageSettingsBtn, false); }
  });
}

addScoreFieldBtn.addEventListener('click', () => {
  scoreFields.push({ id: makeScoreFieldId(), label: `评分项${scoreFields.length + 1}`, max_score: 10 });
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
cancelStyleEditBtn.addEventListener('click', () => { inlineEditingStyleId = null; resetStyleForm(); });
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
  const action = btn.dataset.styleAction;
  if (action === 'edit') {
    resetStyleForm();
    inlineEditingStyleId = style.id;
    renderStyles();
    return;
  }
  if (action === 'cancel-edit') {
    inlineEditingStyleId = null;
    renderStyles();
    return;
  }
  if (action === 'inline-upload') {
    const row = btn.closest('[data-style-edit-id]');
    row?.querySelector('[data-inline-image-file]')?.click();
    return;
  }
  if (action === 'save-edit') {
    const row = btn.closest('[data-style-edit-id]');
    if (!row) return;
    setButtonBusy(btn, true, '保存中...');
    try {
      const payload = readInlineStylePayload(row);
      await requestJson(`/api/styles/${encodeURIComponent(style.id)}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body: JSON.stringify(payload)
      });
      showMessage('款式已更新');
      inlineEditingStyleId = null;
      await loadStyles();
    } catch(e) { showMessage(e.message, 'error'); }
    finally { setButtonBusy(btn, false); }
    return;
  }
  if (action === 'delete') {
    if (!confirm(`确定删除款式 ${style.style_code} 吗？已产生的评分记录不会删除。`)) return;
    try { await requestJson(`/api/styles/${encodeURIComponent(style.id)}`, { method: 'DELETE' }); showMessage('款式已删除'); inlineEditingStyleId = null; await loadStyles(); } catch(e) { showMessage(e.message, 'error'); }
  }
});
stylesBody.addEventListener('change', async (event) => {
  const fileInput = event.target.closest('[data-inline-image-file]');
  if (!fileInput) return;
  const row = fileInput.closest('[data-style-edit-id]');
  const file = fileInput.files?.[0];
  if (!row || !file) return;
  try {
    const url = await uploadImageFile(file);
    updateInlineImagePreview(row, url);
    showMessage('图片已上传，点击保存后生效');
  } catch(e) { showMessage(e.message, 'error'); }
  finally { fileInput.value = ''; }
});
stylesBody.addEventListener('input', (event) => {
  const imageInput = event.target.closest('[data-inline-field="product_image"]');
  if (!imageInput) return;
  const row = imageInput.closest('[data-style-edit-id]');
  if (row) updateInlineImagePreview(row, imageInput.value.trim());
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
  const groupBtn = event.target.closest('button[data-score-group-action]');
  if (groupBtn) {
    const group = scoreGroups[Number(groupBtn.dataset.groupIndex)];
    if (!group) return;
    const action = groupBtn.dataset.scoreGroupAction;
    if (action === 'toggle') {
      selectedScoreGroupKey = selectedScoreGroupKey === group.key ? null : group.key;
      renderScores();
      return;
    }
    if (action === 'delete') {
      if (!confirm(`确定删除 ${group.reviewer} 在 ${group.submitted_at || '-'} 提交的 ${group.scores.length} 款评分吗？`)) return;
      setButtonBusy(groupBtn, true, '删除中...');
      try {
        for (const item of group.scores) {
          await requestJson(`/api/scores/${encodeURIComponent(item.id)}`, { method: 'DELETE' });
        }
        showMessage('本次提交已删除');
        selectedScoreGroupKey = null;
        await loadScores();
      } catch(e) { showMessage(e.message, 'error'); }
      finally { setButtonBusy(groupBtn, false); }
      return;
    }
  }

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
  range.nextElementSibling.textContent = `${range.value} / ${range.max}`;
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
      max_score: normalizeMaxScore(input.dataset.scoreItemMax || input.max),
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
