/* ESA Pages / new-product-rating: fix HTTP 409 from old admin.js import payload.
 * Requires the existing ESA /api/styles/import supporting scan, write, commit.
 * No change to the Cloudflare / EdgeOne versions of the project.
 */
(() => {
  'use strict';
  const API = '/api/styles/import';
  const SCAN_SIZE = 6; // 1 index GET + up to 6 record GETs, stays under ESA 8-KV limit
  const WRITE_SIZE = 3; // 3 GET + 3 PUT, stays under ESA 8-KV limit
  const MAX_ROWS = 1000;
  const SESSION_KEY = '__esaStyleImportBusy';
  let inProgress = false;

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const norm = val => String(val ?? '').trim();
  const codeKey = val => norm(val).toLowerCase();
  const percent = (done, total, indexed) => total <= 0 ? 0 :
    (indexed ? 100 : Math.min(99, Math.round((done / total) * 100)));

  async function call(body) {
    const response = await fetch(API, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify(body),
      cache: 'no-store'
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || data?.ok === false) {
      const msg = data?.message || (response.status === 401
        ? '后台登录已过期，请重新登录。' : `接口返回 HTTP ${response.status}`);
      const error = new Error(msg);
      error.status = response.status;
      throw error;
    }
    return data || {};
  }

  async function callWithRetry(body, maxAttempts = 3) {
    let lastError;
    for (let n = 0; n < maxAttempts; n += 1) {
      try { return await call(body); }
      catch (error) {
        lastError = error;
        const message = error.message || '';
        const propagation = error.status === 409 && /KV 同步|无法读取已有款式/.test(message);
        const retryable = propagation || error.status === 503 || error.status === 502 ||
          error.status === 504 || error.status === 429 || !error.status;
        if (!retryable || n === maxAttempts - 1) break;
        await sleep(450 * (2 ** n));
      }
    }
    throw lastError;
  }

  // IMPORTANT: a new request gets a new eight-call budget. Each scan page is 1 + 6 calls.
  async function scanAll(onPage = () => {}) {
    const found = [];
    let offset = 0;
    let total = null;
    for (let page = 0; page < 10000; page += 1) {
      const data = await callWithRetry({ mode: 'scan', offset, limit: SCAN_SIZE });
      if (data.mode !== 'scan' || !Number.isInteger(data.total) ||
          !Number.isInteger(data.next_offset) || data.total < 0 ||
          (total !== null && total !== data.total)) {
        throw new Error('款式索引分页不一致，停止导入以防止覆盖错误数据。请稍后重试。');
      }
      total = data.total;
      const next = data.next_offset;
      if (next <= offset && offset < total) throw new Error('读取款式索引时分页未推进');
      found.push(...(Array.isArray(data.rows) ? data.rows : []));
      onPage(Math.min(next, total), total);
      offset = next;
      if (offset >= total) return found;
    }
    throw new Error('款式数量超过分页保护上限，请联系管理员');
  }

  function collectRows(source, oldRows) {
    const existing = new Map();
    for (const row of oldRows) if (row?.id && row.style_code && !row.deleted_at)
      existing.set(codeKey(row.style_code), row);
    const input = new Map();
    let skipped = 0;
    for (const row of source) {
      const style_code = norm(row?.style_code ?? row?.['款式编码'] ?? row?.code ?? row?.sku);
      if (!style_code) { skipped++; continue; }
      const key = codeKey(style_code);
      if (input.has(key)) skipped++;
      input.set(key, {
        style_code,
        season: norm(row?.season ?? row?.['季节']),
        base_price: norm(row?.base_price ?? row?.['基本售价'] ?? row?.price),
        existing_id: norm(existing.get(key)?.id)
      });
    }
    const rows = Array.from(input.values());
    if (!rows.length) throw new Error('没有可导入的有效款式');
    if (rows.length > MAX_ROWS) throw new Error(`一次最多导入 ${MAX_ROWS} 个款式`);
    return { rows, skipped };
  }

  function progressView(modal) {
    let root = modal.querySelector('#esaImportProgress');
    if (!root) {
      const css = document.createElement('style');
      css.textContent = `
        #esaImportProgress{padding:14px 8px;text-align:center}
        #esaImportProgress .esa-ring{width:150px;height:150px;margin:0 auto 12px;position:relative}
        #esaImportProgress .esa-ring svg{width:100%;height:100%;transform:rotate(-90deg)}
        #esaImportProgress .esa-ring circle{fill:none;stroke-width:10}
        #esaImportProgress .esa-track{stroke:#ddd;opacity:.7}
        #esaImportProgress .esa-current{stroke:#16a34a;stroke-linecap:round;transition:stroke-dashoffset .2s ease}
        #esaImportProgress .esa-count{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:100%}
        #esaImportProgress .esa-count strong{display:block;font-size:30px;font-weight:750}
        #esaImportProgress .esa-count small{display:block;font-size:12px;opacity:.75}
        #esaImportProgress .esa-stage{font-size:14px;font-weight:600}
        #esaImportProgress .esa-detail{font-size:12px;color:#64748b;margin-top:5px}
        #esaImportProgress .esa-error{font-size:12px;color:#dc2626;margin-top:9px;overflow-wrap:anywhere}
      `;
      root = document.createElement('div');
      root.id = 'esaImportProgress';
      root.setAttribute('role', 'status');
      root.setAttribute('aria-live', 'polite');
      root.innerHTML = `
        <div class="esa-ring">
          <svg viewBox="0 0 160 160" aria-hidden="true">
            <circle class="esa-track" cx="80" cy="80" r="66"></circle>
            <circle class="esa-current" cx="80" cy="80" r="66" stroke-dasharray="414.69" stroke-dashoffset="414.69"></circle>
          </svg>
          <div class="esa-count"><strong data-esa-percent>0%</strong><small data-esa-count>0 / 0 款</small></div>
        </div>
        <div class="esa-stage" data-esa-stage>正在检查已有款式…</div>
        <div class="esa-detail" data-esa-detail></div>
        <div class="esa-error" data-esa-error></div>
      `;
      const panel = modal.querySelector('#styleImportModalPreview');
      if (panel) { panel.after(root); }
      else modal.querySelector('.confirm-body')?.append(root);
      root.prepend(css);
    }
    root.hidden = false;
    return {
      render({ done = 0, total = 0, stage = '', detail = '', indexed = false, error = '' } = {}) {
        const ratio = percent(done, total, indexed);
        const circumference = 414.69;
        root.querySelector('[data-esa-percent]').textContent = `${ratio}%`;
        root.querySelector('[data-esa-count]').textContent = `${done} / ${total} 款`;
        root.querySelector('.esa-current').setAttribute('stroke-dashoffset',
          String((circumference * (1 - ratio / 100)).toFixed(2)));
        root.querySelector('[data-esa-stage]').textContent = stage;
        root.querySelector('[data-esa-detail]').textContent = detail;
        root.querySelector('[data-esa-error]').textContent = error;
      }
    };
  }

  async function performImport(btn) {
    if (inProgress) return;
    const modal = document.querySelector('#styleImportModal');
    const records = typeof pendingStyleImportRecords === 'undefined'
      ? null : pendingStyleImportRecords;
    if (!modal || !Array.isArray(records) || !records.length) {
      if (typeof showMessage === 'function') showMessage('请先选择要导入的款式', 'error');
      return;
    }
    inProgress = true;
    window[SESSION_KEY] = true;
    modal.dataset.esaImportRunning = '1';
    const progress = progressView(modal);
    let saved = 0;
    let total = records.length;
    let created = 0;
    let updated = 0;
    let skipped = 0;
    const confirmed = new Set();
    let commitRequired = false;
    const update = (stage, detail = '', indexed = false, error = '') =>
      progress.render({ done: saved, total, stage, detail, indexed, error });
    const initialLabel = btn.textContent;
    btn.disabled = true;
    btn.textContent = '导入中…';
    try {
      if (records.length > MAX_ROWS) throw new Error(`一次最多导入 ${MAX_ROWS} 个款式`);
      update('正在检查已配置款式…');
      const oldRows = await scanAll((n, count) => update('正在检查已配置款式…', `已检查索引 ${n}/${count}`));
      const work = collectRows(records, oldRows);
      total = work.rows.length;
      skipped = work.skipped;
      update('开始导入款式…', `共 ${total} 款，每批最多 ${WRITE_SIZE} 款`);

      for (let start = 0; start < total; start += WRITE_SIZE) {
        const chunk = work.rows.slice(start, start + WRITE_SIZE);
        update('正在保存款式…', `第 ${start + 1}～${Math.min(start + chunk.length, total)} 款`);
        const result = await callWithRetry({ mode: 'write', rows: chunk });
        if (result.mode !== 'write' || !Array.isArray(result.rows) || result.rows.length !== chunk.length) {
          throw new Error('服务器返回不完整的批次结果，停止导入；请稍后重试');
        }
        for (let i = 0; i < result.rows.length; i++) {
          const row = result.rows[i];
          if (!row.id || !['created','updated'].includes(row.action)) {
            throw new Error('服务器返回了无效款式记录，停止导入');
          }
          confirmed.add(String(row.id));
          commitRequired = true;
          if (row.action === 'created') created++;
          else updated++;
          saved++;
          update('正在保存款式…', `新增 ${created} · 更新 ${updated} · 跳过 ${skipped}`);
          // The server returns up to three confirmations together. Animate
          // each confirmed row in order (not optimistic progress).
          if (result.rows.length > 1) await sleep(90);
        }
      }
      if (commitRequired) {
        update('正在确认款式索引…', `全部 ${saved} 款已完成写入`);
        await callWithRetry({ mode: 'commit', ids: Array.from(confirmed) });
      }
      update('导入完成', `新增 ${created} · 更新 ${updated} · 跳过 ${skipped}`, true);
      await sleep(500);
      if (typeof closeStyleImportDialog === 'function') closeStyleImportDialog();
      if (typeof showMessage === 'function') showMessage(
        `导入完成：新增 ${created}，更新 ${updated}，跳过 ${skipped}。如暂未显示，可能正在等待 ESA KV 同步。`
      );
      try {
        await reloadStylesPaged();
      } catch (refreshError) {
        console.warn('[ESA style import] 数据已保存但列表刷新失败:', refreshError);
        if (typeof showMessage === 'function')
          showMessage('导入已经完成，但款式列表暂未同步。请稍后点击查询/刷新。');
      }
    } catch (error) {
      const rawMessage = error?.message || '网络或 EdgeKV 操作失败';
      let indexWarning = '';
      if (commitRequired && confirmed.size) {
        try {
          update('正在保护已写入款式…', `已确认 ${confirmed.size} 款`);
          await callWithRetry({ mode: 'commit', ids: Array.from(confirmed) });
        } catch (commitError) {
          indexWarning = `；已写入款式索引未全部确认：${commitError.message || '请稍后重试'}`;
        }
      }
      update('导入中断，请检查并重试', `已确认 ${saved}/${total} 款；新增 ${created}，更新 ${updated}`, false, rawMessage + indexWarning);
      if (typeof showMessage === 'function')
        showMessage(`导入中断：${rawMessage}。${saved ? `已确认写入 ${saved} 款。` : ''}重新点击导入会核对并覆盖相同编码，不会盲目追加。`, 'error');
      // Keep the Excel preview and modal; the user can retry later.
    } finally {
      inProgress = false;
      window[SESSION_KEY] = false;
      if (modal.isConnected) {
        delete modal.dataset.esaImportRunning;
        btn.disabled = false;
        btn.textContent = initialLabel;
      }
    }
  }

  async function reloadStylesPaged() {
    const rows = await scanAll();
    if (typeof styles === 'undefined' || typeof renderStyles !== 'function') return;
    const form = document.querySelector('#styleSearchForm');
    let keyword = '';
    if (form) {
      const params = new URLSearchParams(new FormData(form));
      keyword = codeKey(params.get('search'));
    }
    styles = rows
      .filter(row => !keyword || [row.style_code, row.season, row.style_remark]
        .some(value => codeKey(value).includes(keyword)))
      .sort((a,b) => String(a.created_at || '').localeCompare(String(b.created_at || '')) || String(a.id).localeCompare(String(b.id)));
    renderStyles();
  }

  // The original admin list GET loads every style in one ESA invocation and
  // can itself exceed 8 calls. Replace only this ESA-side function with paging.
  if (typeof loadStyles === 'function') {
    loadStyles = reloadStylesPaged;
  }

  // DOM event capture stops the old click handler BEFORE it can send
  // {styles:[...]} (the incompatible legacy payload causing HTTP 409).
  document.addEventListener('click', event => {
    const target = event.target;
    const btn = target?.closest?.('#styleImportConfirmBtn');
    if (btn) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!inProgress && !btn.disabled) void performImport(btn);
      return;
    }
    if (!inProgress) return;
    if (target?.closest?.('#styleImportCancelBtn, #styleImportDropZone, #styleImportTemplateBtn, [data-import-backdrop]')) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);
  document.addEventListener('keydown', event => {
    if (inProgress && event.key === 'Escape') {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);

  console.info('[product-review] ESA safe style import UI v2 loaded');
})();
