# 新品评审评分系统（Cloudflare Pages 后台配置版）

当前版本流程：

- 后台通过 `域名/后台后缀` 登录，只负责配置哪些款式需要评分。
- 后台可拖拽/点击上传产品图，图片存 R2/S3/OSS，数据库只保存图片地址。
- 后台可自定义评分项，可新增、删除或减少评分项。
- 前端普通评分人员访问首页，先输入自己的姓名，再逐款评分。
- 当前款评分完整后，“下一页”才允许点击；只有最后一款点击“提交”后才会一次性写入数据库。
- 评分结果、历史记录、款式资料可存 D1，也可改为 KV/HTTP 自定义存储。

## 推荐 Cloudflare 配置

### Pages 构建配置

- Framework preset：`None`
- Build command：留空；如控制台不允许为空，填 `echo no build needed`
- Build output directory：`public`
- Root directory：仓库根目录就是本项目时留空

> 本版本不包含 `wrangler.toml`，绑定和变量均建议在 Cloudflare Pages 后台设置中配置。

### Bindings

在 Pages 项目 `设置 -> 绑定` 中添加：

- D1 database，变量名：`DB`，数据库：`product-review-db`
- R2 bucket，变量名：`IMAGE_BUCKET`，桶：`product-review-images`

变量名必须严格为 `DB` 和 `IMAGE_BUCKET`。

### Variables and Secrets

普通变量：

```text
ADMIN_PATH=review-admin-2026
ADMIN_USERNAME=admin
STORAGE_DRIVER=d1
IMAGE_STORAGE_DRIVER=r2
IMAGE_MAX_SIZE_MB=10
IMAGE_KEY_PREFIX=review-images
SESSION_IDLE_MINUTES=120
```

Secrets：

```text
ADMIN_PASSWORD=你的后台密码
SESSION_SECRET=一串较长随机字符串
```

后台访问地址示例：

```text
https://你的域名/review-admin-2026
```

普通评分地址：

```text
https://你的域名/
```

## D1 SQL 初始化

全新部署时依次执行：

```text
migrations/0001_init.sql
migrations/0002_app_settings.sql
```

如果你是从上一版“后台配置款式、前端评分”升级，只需要追加执行：

```text
migrations/0004_custom_score_fields.sql
```

如果你的数据库还没有 `review_styles` / `review_scores` 表，则先执行：

```text
migrations/0003_style_score_flow.sql
```

然后再执行：

```text
migrations/0004_custom_score_fields.sql
```

注意：Cloudflare D1 控制台只能粘贴 SQL 内容，不要粘贴 `npx wrangler ...` 命令。

## 更新部署

覆盖 GitHub 仓库后提交：

```bash
git add .
git commit -m "后台拖拽上传和自定义评分项"
git push
```

Cloudflare Pages 会自动重新部署。配置了绑定或变量后，请在 `部署` 页面点 `Retry deployment` 让配置生效。


## 2026-06-24 调整

- 后台款式配置的产品图已改为独立一行。
- 后台不再显示“排序”输入框，款式严格按添加顺序展示：先添加在上，后添加在下，启用/停用不会改变排序。
- 按钮增加即时点击反馈和处理中状态，减少重复点击导致的误操作。


## 本版更新

- 后台新增“设置”页签。
- 图片存储配置已移动到“设置”页中。
- 评分项配置也集中在“设置”页，款式配置页只负责新增和管理款式。


## 2026-06-24 图片外链显示修复

图片标签已增加 `referrerpolicy="no-referrer"`，用于减少部分 OSS/CDN 防盗链 Referer 导致的外链图片无法显示问题。若对象存储禁止空 Referer，仍需在 OSS/CDN 控制台放行当前 Pages 域名或改用系统上传。

## 2026-06 追加：评分时临时修改信息 + 评分项类型

本版本新增：

- 前端评分人员在评分页面可以临时修改“季节”和“基本售价”。这些修改只会随本次评分结果保存，不会回写后台的已配置款式。
- 后台“设置 → 评分项配置”增加“类型”：
  - 综合评分：计入总分和等级。
  - 独立评分：单独展示，不参与综合总分和等级。
- 图片显示继续使用 `referrerpolicy="no-referrer"`，提升外链图片兼容性。

本次不需要新增数据库表，也不强制执行新的 SQL。旧的评分项未设置类型时默认按“综合评分”处理。

## 2026-06 自定义评分类型更新

- 后台“设置 → 评分项配置”新增“评分类型”配置。
- 评分类型可自定义名称，不再局限于“综合评分 / 独立评分”。
- 每个评分类型可设置是否“计入综合总分”。
- 评分项可选择任意评分类型；前端评分时会按类型分组展示。
- 前端评分页中，备注位置已调整到独立/非总分评分类型之前。
- 本次更新不需要新增数据库表，也不需要执行新的 SQL；配置会保存到 app_settings。
