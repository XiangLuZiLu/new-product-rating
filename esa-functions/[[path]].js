function normalizeAdminPath(value) {
  const raw = String(value || 'admin').trim().replace(/^\/+|\/+$/g, '');
  return '/' + (raw || 'admin');
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
  <link rel="stylesheet" href="/assets/style.css?v=20260814-review-datetime-v21" />
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
      <div id="loginMessage" class="message hidden"></div>
      <form id="loginForm" class="login-form">
        <label>管理账号<input type="text" name="username" placeholder="请输入后台管理账号" autocomplete="username" required /></label>
        <label>管理密码<input type="password" name="password" placeholder="请输入后台管理密码" autocomplete="current-password" required /></label>
        <button type="submit" class="primary full">登录后台</button>
      </form>
      <p class="tip">后台入口：<code>${adminPath}</code>。评分人员只能通过管理员生成的有效评分链接进入。</p>
    </section>

    <section id="appView" class="hidden">
      <header class="topbar">
        <div>
          <h1>新品评审后台</h1>
          <p>配置“哪些款需要评分”和“评分项”；评分人员通过管理员生成的有效链接逐款评分。</p>
        </div>
        <div class="top-actions">
          <button id="printBtn" class="ghost" type="button">打印评分结果</button>
          <button id="clearAllDataBtn" class="danger-light" type="button">清空全部数据</button>
          <button id="logoutBtn" class="danger-light" type="button">退出</button>
        </div>
      </header>

      <div id="message" class="message hidden"></div>
      <section class="stats-grid" id="statsGrid"></section>

      <nav class="view-tabs no-print" aria-label="功能切换">
        <button class="tab active" type="button" data-target="styleSection">款式配置</button>
        <button class="tab" type="button" data-target="scoreSection">评分结果</button>
        <button class="tab" type="button" data-target="linkSection">评分链接</button>
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
              <p class="tip">图片存储方式直接在后台设置里配置，不再依赖环境变量。国内建议使用七牛云、阿里云 OSS、腾讯云 COS 等 S3 兼容 OSS。</p>
            </div>
            <div class="form-actions">
              <button id="saveImageSettingsBtn" class="primary" type="submit" form="imageStorageForm">保存图片配置</button>
            </div>
          </div>
          <form id="imageStorageForm" class="image-settings-form">
            <label class="image-driver-field">图片存储方式
              <select class="pretty-select image-pretty-select" name="driver">
                <option value="url">只粘贴图片链接</option>
                <option value="s3">国内OSS / S3兼容：七牛云、阿里云OSS、腾讯云COS</option>
                <option value="r2">Cloudflare R2（仅 Cloudflare Pages 使用）</option>
              </select>
            </label>
            <div class="image-config-row image-config-row-three">
              <label class="s3-dependent">国内OSS服务商
                <select class="pretty-select image-pretty-select" name="s3_provider">
                  <option value="custom">自定义 S3 兼容</option>
                  <option value="qiniu">七牛云 Kodo</option>
                  <option value="aliyun">阿里云 OSS</option>
                  <option value="tencent">腾讯云 COS</option>
                  <option value="minio">MinIO / 其他 S3</option>
                </select>
              </label>
              <label>上传大小上限MB<input name="image_max_size_mb" type="number" min="1" max="50" step="1" placeholder="10" /></label>
              <label>文件名前缀<input name="image_key_prefix" placeholder="review-images" /></label>
            </div>
            <div class="image-config-row image-config-row-two">
              <label>图片公开访问域名 / CDN域名<input name="public_image_base_url" placeholder="例如 https://img.example.com；国内OSS建议配置 CDN 或公开访问域名" /></label>
              <label>公开访问路径前缀<input name="public_image_path_prefix" placeholder="例如七牛需要 /xianglupiju 时填 xianglupiju；不需要则留空" /></label>
            </div>
            <div class="s3-settings wide s3-dependent">
              <label>S3 Endpoint<input name="s3_endpoint" placeholder="例如七牛云 https://s3-cn-east-1.qiniucs.com" /></label>
              <label>Bucket / 空间名<input name="s3_bucket" placeholder="你的 Bucket 或七牛空间名" /></label>
              <label>Region / 区域<input name="s3_region" placeholder="例如 cn-east-1 / oss-cn-guangzhou" /></label>
              <label>AccessKey ID<input name="s3_access_key_id" autocomplete="off" /></label>
              <label class="secret-key-label">SecretKey
                <div class="secret-input-wrap">
                  <input name="s3_secret_access_key" type="password" autocomplete="new-password" placeholder="留空表示不修改已有 SecretKey" />
                  <button class="icon-btn secret-toggle" type="button" data-target="s3_secret_access_key" aria-label="显示或隐藏 SecretKey" title="显示/隐藏 SecretKey">👁</button>
                </div>
              </label>
              <label class="switch-label"><span>Path Style</span><input name="s3_force_path_style" type="checkbox" checked /></label>
            </div>
          </form>
        </section>



        <section class="card nested-card no-print">
          <div class="section-title">
            <div>
              <h2>前端说明文字</h2>
              <p class="tip">这里控制前端评分页顶部显示的说明文字，只修改展示文案，不显示等级区间配置。</p>
            </div>
            <div class="form-actions">
              <button id="saveGradeRulesBtn" class="primary" type="submit" form="gradeRuleForm">保存说明文字</button>
            </div>
          </div>
          <form id="gradeRuleForm" class="grade-rule-form">
            <label class="wide">前端说明文字
              <textarea name="description" placeholder="例如：评分项和满分由后台配置；80%以上大单，60%以上中单，40%以上小单试水，40%以下建议不下"></textarea>
            </label>
            <p class="tip wide">评分等级区间不在页面配置；这里只保留前端顶部说明文字。</p>
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
            <div id="styleDropZone" class="drop-zone" tabindex="0" role="button" aria-label="拖拽、点击或粘贴上传产品图">
              <div id="stylePreview" class="drop-preview"><span>拖拽图片到这里、点击选择，或复制图片后按 Ctrl+V 粘贴</span></div>
              <div class="drop-text">
                <strong>上传产品图</strong>
                <span>支持点击选择、拖拽、复制图片后 Ctrl+V 粘贴；先本地预览，点击保存款式后才上传到 R2/S3/OSS。</span>
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
            <button class="primary-light" type="button" id="generateReviewLinkBtn">生成评分链接</button>
            <button class="danger-light" type="button" id="deleteAllStylesBtn">选中删除</button>
          </form>
        </div>
        <div class="mobile-help no-print">手机端列表可左右滑动查看完整字段。</div>
        <div class="table-wrap">
          <table class="review-table style-table">
            <thead><tr><th class="no-print select-col"><label class="select-all-toggle"><input type="checkbox" id="styleSelectAll" data-style-select-all /> <span>全选</span></label></th><th>产品图</th><th>款式编码</th><th>季节</th><th>基本售价</th><th>状态</th><th>备注</th><th>创建时间</th><th class="no-print">操作</th></tr></thead>
            <tbody id="stylesBody"></tbody>
          </table>
        </div>
      </section>

      <section id="linkSection" class="card list-card hidden">
        <div class="section-title search-title">
          <div>
            <h2>评分链接管理</h2>
            <p class="tip">在“已配置款式”勾选款式后生成独立评分链接；链接到期后无法访问和提交，后台记录仍可手动删除。</p>
          </div>
          <div class="form-actions">
            <button id="refreshReviewLinksBtn" class="ghost" type="button">刷新</button>
            <button id="deleteSelectedReviewLinksBtn" class="danger-light" type="button">选中删除</button>
          </div>
        </div>
        <div class="mobile-help no-print">复制链接发给评分人，评分人只能看到该链接包含的款式。</div>
        <div class="table-wrap">
          <table class="review-table link-table">
            <thead><tr><th class="no-print select-col"><label class="select-all-toggle"><input type="checkbox" data-review-link-select-all /> <span>全选</span></label></th><th>链接名称</th><th>评分链接</th><th>款式数</th><th>有效期至</th><th>状态</th><th>创建时间</th><th class="no-print">操作</th></tr></thead>
            <tbody id="reviewLinksBody"></tbody>
          </table>
        </div>
      </section>

      <section id="scoreSection" class="card list-card hidden">
        <div class="section-title search-title">
          <h2>评分结果</h2>
          <form id="scoreSearchForm" class="search-form score-search-form">
            <input name="search" class="score-search-input" placeholder="搜索款式、季节、评分人、备注" autocomplete="off" />
            <div class="score-link-filter-shell" id="scoreReviewLinkDropdown">
              <button class="score-link-filter-trigger" id="scoreReviewLinkTrigger" type="button"
                      aria-haspopup="listbox" aria-expanded="false" title="选择评分链接后自动筛选">
                <span class="score-link-filter-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="17" height="17">
                    <path d="M10.6 13.4a4 4 0 0 0 5.7 0l2.1-2.1a4 4 0 0 0-5.7-5.7l-1.2 1.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                    <path d="M13.4 10.6a4 4 0 0 0-5.7 0l-2.1 2.1a4 4 0 0 0 5.7 5.7l1.2-1.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                  </svg>
                </span>
                <span class="score-link-filter-label" id="scoreReviewLinkLabel">全部评分链接</span>
                <span class="score-link-filter-caret" aria-hidden="true"></span>
              </button>
              <div class="score-link-filter-menu hidden" id="scoreReviewLinkMenu" role="listbox"
                   aria-label="评分链接"></div>
              <select name="review_link_code" id="scoreReviewLinkFilter" class="score-link-filter-native"
                      aria-hidden="true" tabindex="-1">
                <option value="">全部评分链接</option>
              </select>
            </div>
            <button class="ghost" type="button" id="clearScoreSearchBtn">重置</button>
            <button class="primary-light" type="button" id="exportBtn">导出</button>
            <button class="danger-light" type="button" id="deleteAllScoresBtn">选中删除</button>
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
  <script src="/assets/admin.js?v=20260914-esa-fast-access-v6" defer></script>
</body>
</html>`;
}

function ratingHtml() {
  return "<!doctype html>\n<html lang=\"zh-CN\">\n<head>\n  <meta charset=\"utf-8\" />\n  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1, viewport-fit=cover\" />\n  <title>新品评审评分</title>\n  <link rel=\"stylesheet\" href=\"/assets/style.css?v=20260814-review-datetime-v21\" />\n</head>\n<body>\n  <div class=\"page-bg\"></div>\n  <main class=\"container public-container\">\n    <header id=\"publicTopbar\" class=\"topbar public-topbar hidden\">\n      <div>\n        <h1>新品评审评分</h1>\n        <p id=\"gradeRuleIntro\">评分项和满分由后台配置；80%以上大单，60%以上中单，40%以上小单试水，40%以下建议不下</p>\n      </div>\n    </header>\n\n    <section id=\"accessErrorView\" class=\"login-card card access-error-card hidden\" role=\"alert\">\n      <div class=\"brand\">\n        <div class=\"brand-mark access-error-mark\">!</div>\n        <div>\n          <h1>无法进入评分</h1>\n        </div>\n      </div>\n      <p id=\"accessErrorText\" class=\"access-error-tip\">访问地址有问题，请联系管理员获取正确的评分链接。</p>\n    </section>\n\n    <div id=\"message\" class=\"message hidden\"></div>\n\n    <section id=\"nameView\" class=\"login-card card hidden\">\n      <div class=\"brand\">\n        <div class=\"brand-mark\">评</div>\n        <div>\n          <h1>开始评分</h1>\n          <p>请先输入你的姓名，之后系统会按后台配置的款式逐个评分。</p>\n          <p id=\"nameGradeRuleIntro\" class=\"tip name-rule-tip\">评分项和满分由后台配置；80%以上大单，60%以上中单，40%以上小单试水，40%以下建议不下</p>\n        </div>\n      </div>\n      <form id=\"reviewerForm\" class=\"login-form\">\n        <label>\n          评分人姓名 <span class=\"required\">*</span>\n          <input name=\"reviewer\" placeholder=\"请输入你的姓名\" autocomplete=\"name\" required />\n        </label>\n        <button type=\"submit\" class=\"primary full\">进入评分</button>\n      </form>\n      <p class=\"tip\">评分必须通过管理员生成的有效链接进入，不需要后台账号。</p>\n    </section>\n\n    <section id=\"ratingView\" class=\"card score-card hidden\">\n      <div class=\"section-title score-title\">\n        <div>\n          <h2>逐款评分</h2>\n          <p class=\"tip\">当前款评分完整后，“下一页”才会亮起；最后一款点击“提交”后，才会一次性写入数据库。</p>\n        </div>\n        <div class=\"reviewer-pill\">评分人：<strong id=\"reviewerNameText\"></strong></div>\n      </div>\n\n      <div class=\"score-toolbar no-print\">\n        <button id=\"prevSlideBtn\" class=\"ghost\" type=\"button\">上一页</button>\n        <div class=\"slide-status\">\n          <strong id=\"slideCounter\">第 1 / 1 款</strong>\n          <span id=\"slideHint\">请完成当前款评分</span>\n        </div>\n        <button id=\"nextSlideBtn\" class=\"ghost\" type=\"button\" disabled>下一页</button>\n      </div>\n\n      <div id=\"scoreCarousel\" class=\"score-carousel\" aria-live=\"polite\"></div>\n      <div id=\"slideDots\" class=\"slide-dots no-print\"></div>\n\n      <div class=\"page-bottom-nav no-print\" role=\"navigation\" aria-label=\"评分分页操作\">\n        <button id=\"bottomPrevBtn\" class=\"bottom-nav-btn\" type=\"button\">上一页</button>\n        <button id=\"bottomNextBtn\" class=\"bottom-nav-btn primary-bottom\" type=\"button\" disabled>下一页</button>\n      </div>\n    </section>\n\n    <section id=\"doneView\" class=\"login-card card hidden\">\n      <div class=\"brand\">\n        <div class=\"brand-mark\">✓</div>\n        <div>\n          <h1>评分完成</h1>\n          <p id=\"doneText\">本次评分已提交。</p>\n        </div>\n      </div>\n      <button id=\"restartBtn\" type=\"button\" class=\"primary full\">重新评分</button>\n    </section>\n  </main>\n  <script>\n    (() => {\n      const parts = window.location.pathname.split('/').filter(Boolean);\n      const code = parts.length === 1 ? parts[0] : '';\n      const looksLikeReviewLink = !!code && !/^(assets|api|admin)$/i.test(code) && !code.includes('.');\n      const target = document.getElementById(looksLikeReviewLink ? 'nameView' : 'accessErrorView');\n      if (target) target.classList.remove('hidden');\n      if (looksLikeReviewLink) document.getElementById('publicTopbar')?.classList.remove('hidden');\n    })();\n  </script>\n  <script src=\"/assets/rating.js?v=20260914-esa-fast-access-v6\" defer></script>\n</body>\n</html>\n";
}

function accessErrorHtml() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>无法进入评分</title>
  <link rel="stylesheet" href="/assets/style.css?v=20260814-review-datetime-v21" />
</head>
<body>
  <div class="page-bg"></div>
  <main class="container public-container">
    <section class="login-card card access-error-card" role="alert">
      <div class="brand">
        <div class="brand-mark access-error-mark">!</div>
        <div>
          <h1>无法进入评分</h1>
        </div>
      </div>
      <p class="access-error-tip">请勿直接访问系统域名，评分必须通过管理员生成的有效链接进入。</p>
    </section>
  </main>
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
  const normalizedPath = url.pathname.replace(/\/+$/, '') || '/';

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method Not Allowed', {
      status: 405,
      headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }
    });
  }

  if (normalizedPath === adminPath) {
    return responseHtml(adminHtml(adminPath, sessionIdleMinutes));
  }

  if (normalizedPath === '/') {
    return responseHtml(accessErrorHtml());
  }

  const pathParts = normalizedPath.split('/').filter(Boolean);
  const code = pathParts.length === 1 ? pathParts[0] : '';
  const reserved = /^(assets|api|admin)$/i.test(code);
  const isReviewLinkPath = Boolean(code) && !reserved && /^[a-zA-Z0-9_-]{1,32}$/.test(code);

  if (isReviewLinkPath) {
    return responseHtml(ratingHtml());
  }

  return responseHtml(accessErrorHtml(), 404);
}
