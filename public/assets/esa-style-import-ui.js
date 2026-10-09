/* ESA Pages: batch style import + read-after-write visibility verification.
 * Compatible with /api/styles/import modes scan, write and commit.
 * Only loaded on the ESA admin page; Cloudflare and EdgeOne are unaffected.
 */
(() => {
  'use strict';

  const API = '/api/styles/import';
  const SCAN_SIZE = 6; // one index GET plus six style GETs = <= 7 calls
  const WRITE_SIZE = 3; // each style one GET + one PUT = <= 6 calls
  const MAX_ROWS = 1000;
  const VERIFY_TIMEOUT_MS = 5 * 60 * 1000;
  const SESSION_KEY = '__esaStyleImportBusy';
  let inProgress = false;
  let pendingVerification = null;
  let pendingVerificationModal = null;

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const norm = value => String(value ?? '').trim();
  const codeKey = value => norm(value).toLowerCase();
  const priceKey = value => (value === '' || value == null) ? '' : String(Number(value));
  const percentage = (done, total, verified) => total < 1 ? 0 :
    (verified ? 100 : Math.min(99, Math.round(done * 100 / total)));

  async function call(body) {
    const response = await fetch(API, {
      method: 'POST', credentials: 'include', cache: 'no-store',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify(body)
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || data?.ok === false) {
      const error = new Error(data?.message || (response.status === 401
        ? '后台登录已过期，请重新登录' : `接口返回 HTTP ${response.status}`));
      error.status = response.status;
      throw error;
    }
    return data || {};
  }

  async function callWithRetry(body, maxAttempts = 3) {
    let lastError;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try { return await call(body); }
      catch (error) {
        lastError = error;
        const isKvPropagation = error.status === 409 && /KV 同步|无法读取已有款式/.test(error.message || '');
        const retryable = isKvPropagation || [429, 502, 503, 504].includes(error.status) || !error.status;
        if (!retryable || attempt === maxAttempts - 1) break;
        await sleep(450 * (2 ** attempt));
      }
    }
    throw lastError;
  }

  async function scanAll(onPage = () => {}) {
    let offset = 0;
    let total = null;
    const rows = [];
    for (let page = 0; page < 10000; page += 1) {
      const data = await callWithRetry({ mode: 'scan', offset, limit: SCAN_SIZE });
      if (data.mode !== 'scan' || !Number.isInteger(data.total) ||
          !Number.isInteger(data.next_offset) || data.total < 0 ||
          (total !== null && total !== data.total)) {
        throw new Error('款式索引分页前后不一致，稍后重新检查');
      }
      total = data.total;
      if (data.next_offset <= offset && offset < total) {
        throw new Error('款式索引分页没有继续推进');
      }
      rows.push(...(Array.isArray(data.rows) ? data.rows : []));
      offset = data.next_offset;
      onPage(Math.min(offset, total), total);
      if (offset >= total) return rows;
    }
    throw new Error('款式索引超过分页保护上限');
  }

  function collectRows(source, existingRows) {
    const existingByCode = new Map();
    for (const row of existingRows) {
      if (row?.id && row.style_code && !row.deleted_at) existingByCode.set(codeKey(row.style_code), row);
    }
    const unique = new Map();
    let skipped = 0;
    for (const row of source) {
      const style_code = norm(row?.style_code ?? row?.['款式编码'] ?? row?.code ?? row?.sku);
      if (!style_code) { skipped += 1; continue; }
      const key = codeKey(style_code);
      if (unique.has(key)) skipped += 1;
      unique.set(key, {
        style_code,
        season: norm(row?.season ?? row?.['季节']),
        base_price: norm(row?.base_price ?? row?.['基本售价'] ?? row?.price),
        existing_id: norm(existingByCode.get(key)?.id)
      });
    }
    const rows = Array.from(unique.values());
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
      if (panel) panel.after(root);
      else modal.querySelector('.confirm-body')?.append(root);
      root.prepend(css);
    }
    root.hidden = false;
    return {
      render({ done = 0, total = 0, stage = '', detail = '', verified = false, error = '' } = {}) {
        const pct = percentage(done, total, verified);
        const circumference = 414.69;
        root.querySelector('[data-esa-percent]').textContent = `${pct}%`;
        root.querySelector('[data-esa-count]').textContent = `${done} / ${total} 款`;
        root.querySelector('.esa-current').setAttribute('stroke-dashoffset',
          String((circumference * (1 - pct / 100)).toFixed(2)));
        root.querySelector('[data-esa-stage]').textContent = stage;
        root.querySelector('[data-esa-detail]').textContent = detail;
        root.querySelector('[data-esa-error]').textContent = error;
      }
    };
  }

  function setPageStyles(rows) {
    if (typeof styles === 'undefined' || typeof renderStyles !== 'function') return;
    let keyword = '';
    const form = document.querySelector('#styleSearchForm');
    if (form) keyword = codeKey(new URLSearchParams(new FormData(form)).get('search'));
    styles = rows
      .filter(row => row && !row.deleted_at)
      .filter(row => !keyword || [row.style_code, row.season, row.style_remark]
        .some(value => codeKey(value).includes(keyword)))
      .sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')) ||
        String(a.id).localeCompare(String(b.id)));
    renderStyles();
  }

  async function reloadStylesPaged() {
    const rows = await scanAll();
    setPageStyles(rows);
  }

  // Check all previously visible IDs still exist and every imported style has
  // the expected ID, code, season, and base_price. A successful index PUT alone
  // does NOT demonstrate read-after-write visibility in ESA EdgeKV.
  function inspectVisibility(rows, ctx) {
    const byId = new Map(rows.filter(row => row?.id).map(row => [String(row.id), row]));
    let missingOld = 0;
    for (const [id, expectedCode] of ctx.priorIds) {
      const row = byId.get(id);
      if (!row || codeKey(row.style_code) !== expectedCode) missingOld += 1;
    }
    let visible = 0;
    for (const [id, target] of ctx.confirmedRows) {
      const row = byId.get(id);
      if (row && codeKey(row.style_code) === codeKey(target.style_code) &&
          norm(row.season) === norm(target.season) &&
          priceKey(row.base_price) === priceKey(target.base_price)) visible += 1;
    }
    return { visible, missingOld, total: ctx.confirmedRows.size,
      complete: visible === ctx.confirmedRows.size && missingOld === 0 };
  }

  async function waitForVisibility(ctx, update) {
    const startedAt = Date.now();
    let round = 0;
    let lastStatus = '等待读取';
    while (Date.now() - startedAt < VERIFY_TIMEOUT_MS) {
      round += 1;
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      update('已保存，正在等待 ESA KV 同步…', `核验第 ${round} 次 · 已等待 ${elapsed} 秒（最长 300 秒）`);
      try {
        const rows = await scanAll();
        const result = inspectVisibility(rows, ctx);
        lastStatus = `本次导入已可见 ${result.visible}/${result.total} 款；原有款式尚未可见 ${result.missingOld} 款`;
        update(result.complete ? '已核验全部款式' : '已写入，正在同步款式数据…', lastStatus);
        if (result.complete) return rows;
      } catch (error) {
        if (error?.status === 401 || error?.status === 403) throw error;
        lastStatus = `本次核验暂时失败：${error?.message || '数据读取异常'}`;
        update('等待同步，正在重新检查…', lastStatus);
      }
      const remaining = VERIFY_TIMEOUT_MS - (Date.now() - startedAt);
      if (remaining <= 0) break;
      const delay = Math.min(15000, 2000 + round * 1000);
      await sleep(Math.min(delay, remaining));
    }
    const error = new Error(`已保存 ${ctx.saved} 款，但在 300 秒内未确认全部可见。${lastStatus}。请点“重新核验”，不要立即重复导入。`);
    error.verificationTimeout = true;
    throw error;
  }

  async function finalizeVerification(ctx, modal, btn, progress) {
    const update = (stage, detail = '', verified = false, error = '') =>
      progress.render({ done: ctx.saved, total: ctx.total, stage, detail, verified, error });
    try {
      const verifiedRows = await waitForVisibility(ctx, update);
      pendingVerification = null;
      pendingVerificationModal = null;
      update('导入完成，数据已核验', `新增 ${ctx.created} · 更新 ${ctx.updated} · 跳过 ${ctx.skipped}`, true);
      // Use the data from the successful verification itself; a second GET
      // could hit another POP and replace all 17 rows with an old 9-row view.
      setPageStyles(verifiedRows);
      await sleep(550);
      if (modal.isConnected && typeof closeStyleImportDialog === 'function') closeStyleImportDialog();
      if (typeof showMessage === 'function') showMessage(
        `导入并核验完成：新增 ${ctx.created}，更新 ${ctx.updated}，跳过 ${ctx.skipped}。`
      );
      return true;
    } catch (error) {
      pendingVerification = ctx;
      pendingVerificationModal = modal;
      update('数据已写入，尚未全部核验', `已确认写入 ${ctx.saved}/${ctx.total} 款`, false, error.message);
      if (typeof showMessage === 'function') showMessage(
        `款式已写入，但尚未确认全部可见：${error.message}`, 'error'
      );
      return false;
    }
  }

  async function performImport(btn) {
    if (inProgress) return;
    const modal = document.querySelector('#styleImportModal');
    if (!modal) return;
    // Closing the old dialog and opening a new Excel import must not reuse an
    // unfinished verification from a different import session.
    if (pendingVerificationModal && pendingVerificationModal !== modal) {
      pendingVerification = null;
      pendingVerificationModal = null;
    }
    const verifyingOnly = Boolean(pendingVerification);
    const records = typeof pendingStyleImportRecords === 'undefined' ? null : pendingStyleImportRecords;
    if (!verifyingOnly && (!Array.isArray(records) || records.length < 1)) {
      if (typeof showMessage === 'function') showMessage('请先选择要导入的款式', 'error');
      return;
    }
    inProgress = true;
    window[SESSION_KEY] = true;
    modal.dataset.esaImportRunning = '1';
    const progress = progressView(modal);
    const previousLabel = btn.textContent;
    btn.disabled = true;
    btn.textContent = verifyingOnly ? '核验中…' : '导入中…';

    if (verifyingOnly) {
      try {
        const verified = await finalizeVerification(pendingVerification, modal, btn, progress);
        if (!verified) btn.textContent = '重新核验';
      } finally {
        inProgress = false;
        window[SESSION_KEY] = false;
        if (modal.isConnected) {
          delete modal.dataset.esaImportRunning;
          btn.disabled = false;
        }
      }
      return;
    }

    let saved = 0;
    let total = records.length;
    let created = 0;
    let updated = 0;
    let skipped = 0;
    let indexed = false;
    const confirmed = new Map();
    const update = (stage, detail = '', verified = false, error = '') =>
      progress.render({ done: saved, total, stage, detail, verified, error });

    try {
      if (records.length > MAX_ROWS) throw new Error(`一次最多导入 ${MAX_ROWS} 个款式`);
      update('正在检查已配置款式…');
      const oldRows = await scanAll((n, count) => update('正在检查已配置款式…', `已检查索引 ${n}/${count}`));
      const work = collectRows(records, oldRows);
      total = work.rows.length;
      skipped = work.skipped;
      const priorIds = new Map(oldRows.filter(row => row?.id && row.style_code)
        .map(row => [String(row.id), codeKey(row.style_code)]));
      update('开始导入款式…', `共 ${total} 款，每批最多 ${WRITE_SIZE} 款`);

      for (let start = 0; start < total; start += WRITE_SIZE) {
        const chunk = work.rows.slice(start, start + WRITE_SIZE);
        update('正在保存款式…', `第 ${start + 1}～${Math.min(start + chunk.length, total)} 款`);
        const result = await callWithRetry({ mode: 'write', rows: chunk });
        if (result.mode !== 'write' || !Array.isArray(result.rows) || result.rows.length !== chunk.length) {
          throw new Error('服务器返回的款式数量不完整，导入暂停；可能有部分数据已经写入');
        }
        for (let i = 0; i < result.rows.length; i += 1) {
          const row = result.rows[i];
          if (!row.id || !['created', 'updated'].includes(row.action) ||
              codeKey(row.style_code) !== codeKey(chunk[i].style_code)) {
            throw new Error('服务器返回了无效的款式记录，导入暂停');
          }
          const target = chunk[i];
          confirmed.set(String(row.id), {
            style_code: target.style_code,
            season: target.season,
            base_price: target.base_price
          });
          if (row.action === 'created') created += 1;
          else updated += 1;
          saved += 1;
          update('正在保存款式…', `新增 ${created} · 更新 ${updated} · 跳过 ${skipped}`);
          if (result.rows.length > 1) await sleep(90);
        }
      }

      update('正在更新款式索引…', `${saved}/${total} 款写入请求成功`);
      await callWithRetry({ mode: 'commit', ids: Array.from(confirmed.keys()) });
      indexed = true;
      const ctx = { saved, total, created, updated, skipped, confirmedRows: confirmed, priorIds };
      pendingVerification = ctx;
      pendingVerificationModal = modal;
      const verified = await finalizeVerification(ctx, modal, btn, progress);
      if (!verified) btn.textContent = '重新核验';
    } catch (error) {
      let indexWarning = '';
      if (!indexed && confirmed.size > 0) {
        try {
          update('正在保护已保存的数据…', `已确认 ${confirmed.size} 款`);
          await callWithRetry({ mode: 'commit', ids: Array.from(confirmed.keys()) });
          // A write batch can fail halfway through; do NOT claim all rows saved.
        } catch (commitError) {
          indexWarning = `；索引提交尚未确认：${commitError.message}`;
        }
      }
      update('导入中断，请检查后重试', `已确认写入 ${saved}/${total} 款`, false,
        (error?.message || '未知错误') + indexWarning);
      if (typeof showMessage === 'function') showMessage(
        `导入中断：${error?.message || '未知错误'}。已经返回成功的款式 ${saved} 款。${indexWarning}`, 'error'
      );
    } finally {
      inProgress = false;
      window[SESSION_KEY] = false;
      if (modal.isConnected) {
        delete modal.dataset.esaImportRunning;
        btn.disabled = false;
        if (!pendingVerification) btn.textContent = previousLabel;
      }
    }
  }

  // Existing admin.js list route GET reads all styles in one invocation and
  // can exceed ESA's eight-KV call budget. Keep pagination for ESA only.
  if (typeof loadStyles === 'function') loadStyles = reloadStylesPaged;

  // Capture before the legacy click handler to prevent the old {styles:[...]}
  // POST that returns HTTP 409 on the new scan/write/commit backend.
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

  console.info('[product-review] ESA safe style import UI v3 (visibility verified) loaded');
})();
