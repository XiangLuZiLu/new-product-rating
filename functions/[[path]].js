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
  <link rel="stylesheet" href="/assets/style.css?v=20260624-score-systems-v1" />
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
        <button class="tab" type="button" data-target="settingsSection">设置</button>
      </nav>

      <section id="settingsSection" class="card list-card hidden">
        <div class="section-title search-title">
          <div>
            <h2>系统设置</h2>
            <p class="tip">图片存储、评分项等通用配置集中放在这里，避免和款式新增编辑混在一起。</p>
          </div>
        </div>

        <section class="card nested-card no-print">
          <div class="section-title">
            <div>
              <h2>图片存储配置</h2>
              <p class="tip">图片存储方式在这里配置，减少 Cloudflare 环境变量数量。R2 仍需要在 Pages 后台绑定 IMAGE_BUCKET；七牛云/OSS/COS 等 S3 兼容参数可直接填在这里。</p>
            </div>
            <div class="form-actions">
              <button id="saveImageSettingsBtn" class="primary" type="submit" form="imageStorageForm">保存图片配置</button>
            </div>
          </div>
          <form id="imageStorageForm" class="image-settings-form">
            <label>图片存储方式
              <select name="driver">
                <option value="url">只粘贴图片链接</option>
                <option value="r2">Cloudflare R2</option>
                <option value="s3">S3兼容OSS / 七牛云 / 阿里云OSS / 腾讯云COS</option>
              </select>
            </label>
            <label>上传大小上限MB<input name="image_max_size_mb" type="number" min="1" max="50" step="1" placeholder="10" /></label>
            <label>文件名前缀<input name="image_key_prefix" placeholder="review-images" /></label>
            <label class="wide">图片公开访问域名<input name="public_image_base_url" placeholder="https://img.example.com，可不填；R2不填时走 /api/images" /></label>
            <div class="s3-settings wide">
              <label>S3 Endpoint<input name="s3_endpoint" placeholder="例如 https://s3-cn-east-1.qiniucs.com" /></label>
              <label>Bucket / 空间名<input name="s3_bucket" placeholder="你的 Bucket 或七牛空间名" /></label>
              <label>Region / 区域<input name="s3_region" placeholder="例如 cn-east-1 / oss-cn-guangzhou" /></label>
              <label>AccessKey ID<input name="s3_access_key_id" autocomplete="off" /></label>
              <label>SecretKey<input name="s3_secret_access_key" type="password" autocomplete="new-password" placeholder="留空表示不修改已有 SecretKey" /></label>
              <label class="switch-label"><span>Path Style</span><input name="s3_force_path_style" type="checkbox" checked /></label>
            </div>
          </form>
        </section>

        <section class="card nested-card no-print">
          <div class="section-title">
            <div>
              <h2>评分项配置</h2>
              <p class="tip">这里可以自定义评分类型和评分项；每个评分类型都是一个独立评分体系，系统会分别累计该类型下的评分项。</p>
            </div>
            <div class="form-actions">
              <button id="addScoreTypeBtn" class="ghost" type="button">新增类型</button>
              <button id="addScoreFieldBtn" class="ghost" type="button">新增评分项</button>
              <button id="saveScoreFieldsBtn" class="primary" type="button">保存配置</button>
            </div>
          </div>
          <div class="score-config-subtitle">评分类型</div>
          <div id="scoreTypeList" class="score-type-list"></div>
          <div class="score-config-subtitle">评分项</div>
          <div id="scoreFieldList" class="score-field-list"></div>
        </section>
      </section>

      <section id="styleSection" class="card list-card">


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
          <label class="style-code-field">款式编码 <span class="required">*</span><input name="style_code" placeholder="例如 XA2408A" required /></label>
          <label class="season-field">季节<input name="season" placeholder="例如 秋冬 / 春夏" /></label>
          <label class="price-field">基本售价<input name="base_price" type="number" min="0" step="0.01" placeholder="例如 138" /></label>
          <label class="switch-label"><span>启用评分</span><input name="active" type="checkbox" checked /></label>
          <label class="style-remark-field">款式备注<textarea name="style_remark" rows="2" placeholder="可填写材质、颜色、版型等说明"></textarea></label>
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
            <thead><tr><th>产品图</th><th>款式编码</th><th>季节</th><th>基本售价</th><th>状态</th><th>备注</th><th>创建时间</th><th class="no-print">操作</th></tr></thead>
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
  <script src="/assets/admin.js?v=20260624-score-systems-v1" defer></script>
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
