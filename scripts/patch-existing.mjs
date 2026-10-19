import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const root=resolve(import.meta.dirname,'..');
// 把原来的 ESA 业务模块转为 VPS 私有目录；不会在 vps 分支留下 esa-functions/。
const from=resolve(root,'esa-functions'), to=resolve(root,'server/platform');
if (existsSync(from) && !existsSync(to)) { mkdirSync(resolve(root,'server'),{recursive:true}); renameSync(from,to); console.log('已移动业务模块到 server/platform/'); }
else if (existsSync(from) && existsSync(to)) throw new Error('esa-functions 与 server/platform 同时存在，请人工检查');
else if (!existsSync(to)) throw new Error('缺少业务模块：请先从 main 恢复 esa-functions/');
// Normalize Windows checkout CRLF to LF before exact-string patches.
// This also makes reruns safe after a partially applied patch.
const read=f=>readFileSync(resolve(root,f),'utf8').replace(/\r\n?/g,'\n');
const write=(f,s)=>writeFileSync(resolve(root,f),s,'utf8');
function patch(file,needle,replacement,marker){
  let source=read(file);
  if(marker && source.includes(marker)){console.log('已处理:',file);return;}
  if(!source.includes(needle))throw new Error(`文件内容与 main 不一致，已停止修改：${file}，查找 ${needle.slice(0,70)}`);
  source=source.replace(needle,replacement);
  write(file,source);
  console.log('已修改:',file);
}
const storage='server/platform/_shared/storage.js';
patch(storage,'export const DEFAULT_SCORE_TYPES = [',
  "import { createSqliteStorage } from '../../sqlite-storage.js';\n\nexport const DEFAULT_SCORE_TYPES = [",
  "import { createSqliteStorage } from '../../sqlite-storage.js';");
patch(storage,'  const driver = normalizeDriver(env);\n',
  "  const driver = normalizeDriver(env);\n  if (driver === 'sqlite') return createSqliteStorage(env);\n",
  "if (driver === 'sqlite') return createSqliteStorage(env);");
const admin='public/assets/admin.js';
patch(admin,
  '<td><strong>${escapeHtml(link.name || link.code)}</strong>${link.remark ?',
  '<td><button type="button" class="review-status-link" data-review-link-progress="${escapeHtml(link.code)}" title="查看评分状态">${escapeHtml(link.name || link.code)}</button>${link.remark ?',
  'data-review-link-progress=');
const dialog="\nasync function showReviewProgressDialog(link) {\n  if (!link) return;\n  document.getElementById('vpsReviewProgressBackdrop')?.remove();\n  const backdrop = document.createElement('div');\n  backdrop.id = 'vpsReviewProgressBackdrop';\n  backdrop.className = 'modal-backdrop vps-progress-backdrop';\n  backdrop.innerHTML = `\n    <div class=\"confirm-dialog vps-progress-dialog\" role=\"dialog\" aria-modal=\"true\" aria-labelledby=\"vpsProgressTitle\">\n      <div class=\"vps-progress-head\">\n        <div><h3 id=\"vpsProgressTitle\">评分状态记录</h3><p class=\"tip\">${escapeHtml(link.name || link.code)}</p></div>\n        <button type=\"button\" class=\"ghost\" data-progress-close aria-label=\"关闭\">✕</button>\n      </div>\n      <div class=\"vps-progress-table-wrap\">\n        <table class=\"review-table vps-progress-table\"><thead><tr><th>评分人</th><th>评分状态</th><th>评分时间（北京时间）</th></tr></thead>\n          <tbody data-progress-rows><tr><td colspan=\"3\" class=\"empty\">正在读取记录…</td></tr></tbody></table>\n      </div>\n      <p class=\"tip\">评分中显示最后保存时间，已完成显示正式提交时间。</p>\n      <div class=\"confirm-actions\"><button type=\"button\" class=\"ghost\" data-progress-close>关闭</button><button type=\"button\" class=\"primary\" data-progress-refresh>刷新记录</button></div>\n    </div>`;\n  document.body.appendChild(backdrop);\n  const close = () => { document.removeEventListener('keydown', esc); backdrop.remove(); };\n  const esc = (event) => { if (event.key === 'Escape') close(); };\n  document.addEventListener('keydown', esc);\n  backdrop.addEventListener('click', e => {\n    if (e.target === backdrop || e.target.closest('[data-progress-close]')) close();\n    if (e.target.closest('[data-progress-refresh]')) refresh();\n  });\n  async function refresh() {\n    const body = backdrop.querySelector('[data-progress-rows]');\n    body.innerHTML = '<tr><td colspan=\"3\" class=\"empty\">正在读取记录…</td></tr>';\n    try {\n      const data = await requestJson(`/api/review-links/${encodeURIComponent(link.code)}/progress`);\n      const list = data.items || [];\n      body.innerHTML = list.length ? list.map(item => `\n        <tr><td>${escapeHtml(item.reviewer || '')}</td>\n          <td><span class=\"vps-state ${item.status === 'completed' ? 'vps-state-done' : 'vps-state-active'}\">${item.status === 'completed' ? '已完成' : '评分中'}</span></td>\n          <td>${escapeHtml(item.rating_time || '-')}</td></tr>`).join('') : '<tr><td colspan=\"3\" class=\"empty\">当前还没有评分人员记录</td></tr>';\n    } catch(e) {\n      body.innerHTML = `<tr><td colspan=\"3\" class=\"empty\">${escapeHtml(e.message || '读取失败')}</td></tr>`;\n    }\n  }\n  await refresh();\n}\n";
patch(admin,'function renderReviewLinks() {',dialog+'\nfunction renderReviewLinks() {','async function showReviewProgressDialog(');
patch(admin,
  "  reviewLinksBody.addEventListener('click', async (event) => {\n    const btn = event.target.closest('button[data-link-action]');",
  "  reviewLinksBody.addEventListener('click', async (event) => {\n    const progressBtn = event.target.closest('[data-review-link-progress]');\n    if (progressBtn) {\n      const selected = reviewLinks.find(x => String(x.code) === String(progressBtn.dataset.reviewLinkProgress));\n      await showReviewProgressDialog(selected);\n      return;\n    }\n    const btn = event.target.closest('button[data-link-action]');",
  'const progressBtn = event.target.closest(');
const rating='public/assets/rating.js';
patch(rating,
  '    const restored = await loadStyles();\n    showView(ratingView);',
  "    const restored = await loadStyles();\n    try {\n      await requestJson('/api/public/progress', { method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8' }, body: JSON.stringify({reviewer, review_link_code: reviewLinkCode}) });\n    } catch (error) { console.warn('记录开始评分状态失败', error); }\n    showView(ratingView);",
  "requestJson('/api/public/progress'");
const css='public/assets/style.css';
let s=read(css);
if(!s.includes('/* VPS PROGRESS UI */')){
  s+=`\n/* VPS PROGRESS UI */\n.review-status-link { border:0;background:transparent;color:#2563eb;text-decoration:underline;text-underline-offset:3px;font:inherit;font-weight:700;cursor:pointer;padding:2px 0;text-align:left; }\n.review-status-link:hover { color:#1d4ed8; }\n.vps-progress-backdrop { position:fixed;inset:0;z-index:9999;display:flex;justify-content:center;align-items:center;background:rgba(15,23,42,.58);padding:14px; }\n.vps-progress-dialog { width:min(760px,100%);max-height:85vh;overflow:auto;padding:22px;background:#fff;border-radius:16px; }\n.vps-progress-head { display:flex;align-items:start;justify-content:space-between;gap:12px; }\n.vps-progress-head h3 { margin:0 0 7px; }\n.vps-progress-table-wrap { margin:14px 0;max-height:55vh;overflow:auto; }\n.vps-progress-table { width:100%; }\n.vps-state { display:inline-block;border-radius:999px;padding:3px 9px;font-weight:700;font-size:.85em;white-space:nowrap; }\n.vps-state-done { color:#166534;background:#dcfce7; }\n.vps-state-active { color:#92400e;background:#fef3c7; }\n@media(max-width:600px){.vps-progress-dialog{padding:15px}.vps-progress-table{min-width:470px}}\n`;
  write(css,s);console.log('已添加状态弹框 CSS');
}
const router='server/platform/[[path]].js';
s=read(router);
s=s.replaceAll('20260914-esa-parallel-delete-v7','20261017-vps-v1').replaceAll('20260914-esa-fast-access-v6','20261017-vps-v1').replaceAll('20260814-review-datetime-v21','20261017-vps-v1');
write(router,s);
console.log('VPS 兼容补丁已应用。');
