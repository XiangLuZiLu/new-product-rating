# 新品评审评分系统

> 已新增阿里云 ESA Pages 兼容入口：`esa-functions/` 与 `esa.jsonc`。部署说明见 `docs/ESA_PAGES_SETUP.md`。原 EdgeOne / Cloudflare 目录继续保留。



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
- 后台“设置 → 评分项配置”增加“类型”：每个类型都是独立评分体系，例如 A 类型只累计 A 下的评分项，B 类型只累计 B 下的评分项。
- 图片显示继续使用 `referrerpolicy="no-referrer"`，提升外链图片兼容性。

本次不需要新增数据库表，也不强制执行新的 SQL。旧的评分项未设置类型时默认按“综合评分”处理。

## 2026-06 自定义评分类型更新

- 后台“设置 → 评分项配置”新增“评分类型”配置。
- 评分类型可自定义名称，不再局限于“综合评分 / 独立评分”。
- 不再设置“是否计入综合总分”；有几个评分类型，就形成几个独立评分体系。
- 评分项可选择任意评分类型；前端评分时会按类型分组展示，并分别显示每个评分体系的得分和等级。
- 前端评分页中，备注位置已调整到所有评分体系之后。
- 本次更新不需要新增数据库表，也不需要执行新的 SQL；配置会保存到 app_settings。



- Cloudflare 推荐：`STORAGE_DRIVER=d1`，图片可用 R2 或后台配置 S3/OSS。




- Cloudflare 仍可继续使用 `STORAGE_DRIVER=d1` + D1 Binding。




```bash
npm run build
```

静态资源目录仍为：

```text
public
```

需要配置的变量：

```text
ADMIN_PATH=admin
ADMIN_USERNAME=admin
ADMIN_PASSWORD=你的后台密码
SESSION_SECRET=一串随机字符串
SESSION_IDLE_MINUTES=60
STORAGE_DRIVER=edgekv
```

## EdgeOne Pages 部署


- 静态目录：`public`
- Functions：`functions`

详细部署见：`docs/EDGEONE_PAGES_SETUP.md`


## EdgeOne Pages 部署

当前版本移除阿里云 ESA 部署方式，统一适配 Cloudflare Pages 和腾讯 EdgeOne Pages。

EdgeOne Pages 使用项目内 `functions` 目录作为 Pages Functions 路由，继续保留现有 API 结构。EdgeOne Pages Functions 支持 `functions` 目录和 `onRequest` Handler。

推荐环境变量：

```text
ADMIN_PATH=admin
ADMIN_USERNAME=admin
ADMIN_PASSWORD=你的密码
SESSION_SECRET=随机字符串
SESSION_IDLE_MINUTES=60
STORAGE_DRIVER=edgeone-kv
EDGEONE_KV_NAMESPACE=product_review
```

数据存储：

- Cloudflare Pages：继续使用 D1 / KV / R2。
- EdgeOne Pages：使用 EdgeOne KV。

图片存储建议使用后台“图片存储配置”里的 S3 兼容 OSS。

## 2026-07-10 EdgeOne 登录空闲超时修复

本版修复 EdgeOne Pages 下登录状态不会按空闲时间过期的问题：

- `/api/me` 现在会直接校验登录 Cookie，过期会返回 401；不再依赖中间件是否被 EdgeOne 执行。
- 后台前端增加本地空闲检测，超过 `SESSION_IDLE_MINUTES` 未操作会自动退出。
- 用户切回标签页或重新打开页面时，会立即检查是否已经超时。

EdgeOne 环境变量继续保留：

```text
SESSION_IDLE_MINUTES=60
SESSION_SECRET=一串较长随机字符串
```

## 2026-07-10 更新：EdgeOne KV 服务端评分草稿

- 普通评分人在填写过程中，系统会自动把未最终提交的评分进度暂存在 EdgeOne KV 草稿区。
- 断网、刷新、浏览器关闭、设备关机，甚至更换设备后，当天再次进入首页并输入相同评分人姓名，会自动恢复到上次退出时的款式页，并保留已填写评分、季节、售价和备注。
- 未完全评完或未点击最终“提交”前，草稿不会进入后台“评分结果”，后台评分结果只显示正式提交的数据。
- 暂存只保留当天；到当天 24 点后不会再恢复旧草稿。系统保存草稿时会设置当天到期时间，并在同名评分人再次进入时自动忽略/清理过期草稿。
- 最后一款点击“提交”成功后，才会写入正式评分结果；提交成功后会自动删除当天草稿。
- 为避免重名覆盖，建议内部评分人姓名保持唯一；如果确实存在重名，可在姓名里加工号或手机号后四位，例如“张三-001”。


## 本版更新：北京时间和每日提交限制

- 评分最终提交时间统一按中国北京时间保存。
- 同一评分人同一天只能正式提交一次评分。
- 未完成评分仍只保存到草稿，不进入评分结果；最终提交成功后才写入正式评分结果。
- EdgeOne KV 提交逻辑改为批量写入，减少最终提交等待时间。


## 本版说明

- 后台设置页保留“前端说明文字”，用于控制评分页顶部说明。
- 删除等级区间输入框，仅保留说明文字配置。
- 评分结果仍只读，EdgeOne KV 草稿、北京时间、每日一次提交功能保留。


### 七牛云公开访问路径前缀

如果七牛云实际图片地址类似：

```text
http://ti9dkt322.hn-bkt.clouddn.com/xianglupiju/review-images-xxx.png
```

后台“图片公开访问域名 / CDN域名”填写自定义域名，例如：

```text
https://xianglu.dragon-sturgeon.cn
```

同时“公开访问路径前缀”填写：

```text
xianglupiju
```

系统最终会拼接为：

```text
https://xianglu.dragon-sturgeon.cn/xianglupiju/review-images-xxx.png
```

如果你的自定义 CDN 域名已经直接绑定到空间根路径，不需要 `/xianglupiju`，则路径前缀留空。


## 本次更新：新增产品图复制粘贴上传

- “新增评分款式”的产品图上传区域新增复制粘贴模式。
- 支持三种方式：点击选择、拖拽图片、复制图片后按 Ctrl+V 粘贴。
- 粘贴图片后仍然只做浏览器本地预览，不会立即上传七牛云/OSS；点击“保存款式”后才会真正上传。


## 本次更新：登录后刷新后台

- 后台登录成功后不再继续停留在登录前的页面状态。
- 每次登录都会重新加载后台页面，恢复为初始后台状态。
- 这样可以避免登录后回到上一次未完成表单、弹框、筛选状态或上一次停留的功能页。
