function normalizeAdminPath(value) {
  const raw = String(value || 'review-admin-2026').trim().replace(/^\/+|\/+$/g, '');
  return '/' + (raw || 'review-admin-2026');
}

function getSessionIdleMinutes(env) {
  const raw = Number(env.SESSION_IDLE_MINUTES || env.SESSION_TIMEOUT_MINUTES || 120);
  if (!Number.isFinite(raw) || raw <= 0) return 120;
  return Math.max(1, Math.min(Math.floor(raw), 43200));
}

function adminHtml(adminPath, sessionIdleMinutes) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>新品评审后台</title>
  <link rel="stylesheet" href="/assets/style.css" />
</head>
<body>
  <div class="page-bg"></div>
  <main class="container">
    <section id="loginView" class="login-card card hidden">
      <div class="brand">
        <div class="brand-mark">管</div>
        <div>
          <h1>新品评审后台</h1>
          <p>后台只负责配置需要评分的款式、产品图和评分项。</p>
        </div>
      </div>
      <form id="loginForm" class="login-form">
        <label>管理账号<input type="text" name="username" placeholder="请输入后台管理账号" autocomplete="username" required /></label>
        <label>管理密码<input type="password" name="password" placeholder="请输入后台管理密码" autocomplete="current-password" required /></label>
        <button type="submit" class="primary full">登录后台</button>
      </form>
      <p class="tip">后台入口：<code>${adminPath}</code>。普通评分人员访问首页，输入姓名后直接评分。</p>
    </section>

    <section id="appView" class="hidden">
      <header class="topbar">
        <div>
          <h1>新品评审后台</h1>
          <p>配置“哪些款需要评分”和“评分项”；前端评分人员输入姓名后逐款评分。</p>
        </div>
        <div class="top-actions">
          <button id="printBtn" class="ghost" type="button">打印评分结果</button>
          <a id="exportBtn" class="ghost" href="/api/export">导出评分 CSV</a>
          <button id="logoutBtn" class="danger-light" type="button">退出</button>
        </div>
      </header>

      <div id="message" class="message hidden"></div>
      <section class="stats-grid" id="statsGrid"></section>

      <nav class="view-tabs no-print" aria-label="功能切换">
        <button class="tab active" type="button" data-target="styleSection">款式配置</button>
        <button class="tab" type="button" data-target="scoreSection">评分结果</button>
      </nav>

      <section id="styleSection" class="card list-card">
        <section class="card nested-card no-print">
          <div class="section-title">
            <div>
              <h2>评分项配置</h2>
              <p class="tip">这里可以自定义前端要评分的项目，例如外观设计、材质触感；可新增、删除或减少。每项仍为 0-10 分。</p>
            </div>
            <div class="form-actions">
              <button id="addScoreFieldBtn" class="ghost" type="button">新增评分项</button>
              <button id="saveScoreFieldsBtn" class="primary" type="button">保存评分项</button>
            </div>
          </div>
          <div id="scoreFieldList" class="score-field-list"></div>
        </section>

        <div class="section-title search-title">
          <div>
            <h2 id="styleFormTitle">新增评分款式</h2>
            <p class="tip">后台只配置款式资料，不填写评审人和评审日期。只有“启用”的款式才会出现在前端评分页面。</p>
          </div>
        </div>

        <form id="styleForm" class="admin-style-form no-print">
          <label class="wide image-field">产品图 <span class="required">*</span>
            <input name="product_image" type="hidden" />
            <input class="visually-hidden" id="styleImageFile" name="image_file" type="file" accept="image/*" />
            <div id="styleDropZone" class="drop-zone" tabindex="0" role="button" aria-label="拖拽或点击上传产品图">
              <div id="stylePreview" class="drop-preview"><span>拖拽图片到这里，或点击选择图片</span></div>
              <div class="drop-text">
                <strong>拖拽上传产品图</strong>
                <span>支持手机点击选择图片；图片会上传到 R2/S3/OSS，数据库只保存图片地址。</span>
              </div>
            </div>
            <details class="url-details">
              <summary>也可以粘贴图片链接</summary>
              <input name="product_image_url" placeholder="https://..." />
            </details>
          </label>
          <label>款式编码 <span class="required">*</span><input name="style_code" placeholder="例如 XA2408A" required /></label>
          <label>季节<input name="season" placeholder="例如 秋冬 / 春夏" /></label>
          <label>基本售价<input name="base_price" type="number" min="0" step="0.01" placeholder="例如 138" /></label>
          <label>排序<input name="sort_order" type="number" step="1" value="0" /></label>
          <label class="switch-label"><span>启用评分</span><input name="active" type="checkbox" checked /></label>
          <label class="wide">款式备注<textarea name="style_remark" rows="3" placeholder="可填写材质、颜色、版型等说明，评分人员会看到"></textarea></label>
          <div class="form-actions wide">
            <button class="primary" type="submit">保存款式</button>
            <button id="cancelStyleEditBtn" class="ghost hidden" type="button">取消编辑</button>
          </div>
        </form>

        <div class="section-title search-title table-section-title">
          <h2>已配置款式</h2>
          <form id="styleSearchForm" class="search-form">
            <input name="search" placeholder="搜索款式、季节、备注" />
            <button class="primary" type="submit">查询</button>
            <button class="ghost" type="button" id="clearStyleSearchBtn">重置</button>
          </form>
        </div>
        <div class="mobile-help no-print">手机端列表可左右滑动查看完整字段。</div>
        <div class="table-wrap">
          <table class="review-table style-table">
            <thead><tr><th>产品图</th><th>款式编码</th><th>季节</th><th>基本售价</th><th>排序</th><th>状态</th><th>备注</th><th>创建时间</th><th class="no-print">操作</th></tr></thead>
            <tbody id="stylesBody"></tbody>
          </table>
        </div>
      </section>

      <section id="scoreSection" class="card list-card hidden">
        <div class="section-title search-title">
          <h2>评分结果 / 后台编辑</h2>
          <form id="scoreSearchForm" class="search-form">
            <input name="search" placeholder="搜索款式、季节、评分人、备注" />
            <input name="date_from" type="date" title="开始日期" />
            <input name="date_to" type="date" title="结束日期" />
            <button class="primary" type="submit">查询</button>
            <button class="ghost" type="button" id="clearScoreSearchBtn">重置</button>
          </form>
        </div>

        <section id="scoreEditPanel" class="card nested-card hidden no-print">
          <div class="section-title"><h2>编辑评分记录</h2><button id="cancelScoreEditBtn" class="ghost" type="button">取消</button></div>
          <form id="scoreEditForm" class="score-edit-form">
            <input name="style_id" type="hidden" />
            <label class="wide">款式<input name="style_info" disabled /></label>
            <fieldset id="scoreEditItems" class="mobile-score-panel wide">
              <legend>评分项</legend>
            </fieldset>
            <label class="wide">备注<textarea name="remark" rows="3"></textarea></label>
            <div class="form-actions wide"><button class="primary" type="submit">保存评分修改</button></div>
          </form>
        </section>

        <div class="mobile-help no-print">手机端列表可左右滑动查看完整字段。</div>
        <div class="table-wrap">
          <table class="review-table" id="scoresTable">
            <thead id="scoresHead"></thead>
            <tbody id="scoresBody"></tbody>
          </table>
        </div>
      </section>

      <section id="historyPanel" class="card history-card hidden no-print">
        <div class="section-title"><h2>评分修改历史</h2><button id="closeHistoryBtn" class="ghost" type="button">关闭</button></div>
        <div id="historyList" class="history-list"></div>
      </section>
    </section>
  </main>
  <script>window.__ADMIN_PATH__ = ${JSON.stringify(adminPath)}; window.__SESSION_IDLE_MINUTES__ = ${JSON.stringify(sessionIdleMinutes)};</script>
  <script src="/assets/admin.js" defer></script>
</body>
</html>`;
}

function responseHtml(html, status = 200) {
  return new Response(html, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const adminPath = normalizeAdminPath(env.ADMIN_PATH || env.ADMIN_SUFFIX);
  const sessionIdleMinutes = getSessionIdleMinutes(env);
  if (request.method === 'GET' || request.method === 'HEAD') {
    const normalizedPath = url.pathname.replace(/\/+$/, '') || '/';
    if (normalizedPath === adminPath) return responseHtml(adminHtml(adminPath, sessionIdleMinutes));
  }
  return env.ASSETS.fetch(request);
}
