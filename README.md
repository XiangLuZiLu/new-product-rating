# 新品评审评分系统（Cloudflare Pages 可部署版）

这是一个可部署到 Cloudflare Pages 的新品评审评分系统，字段参考纸质「新品评审评分表」。

本版本已根据追加要求调整：

- 后台入口不再通过首页按钮进入，而是通过 `域名/后缀` 访问。
- 后台访问后缀可配置，例如 `https://你的域名/review-admin-2026`。
- 后台账号和密码可配置。
- 手机端可直接操作评分。
- 每个款式独立一页，左右滑动切换。
- 本次评分份数由后台管理自定义。
- 数据存储可配置，默认支持 Cloudflare D1，也支持切换到自定义 HTTP 数据接口，用于连接 MySQL、PostgreSQL、MongoDB、Supabase、阿里云/腾讯云数据库等。
- 产品图默认只保存图片 URL，不把图片文件写入数据库，避免数据库因图片变大。

## 功能清单

- 管理员账号 + 密码登录
- 隐藏后台入口：只允许通过配置的后缀访问后台页面
- 手机端适配：手机也可以录入和编辑评分
- 每个款式独立一页：左右滑动切换，每页填写一个款
- 滑块评分：外观设计、材质触感、工艺细节、容量收纳、背负舒适度均为 0-10 分
- 后台自定义本次评分份数：例如设置为 8，就生成 8 个款式评分页
- 保存当前款 / 批量保存全部已填写款
- 历史数据查询：关键词、日期区间
- 后台管理编辑：历史列表中点「编辑」会载入到滑动评分第一页进行修改
- 删除评审记录
- 自动计算总分，并自动给出「大单 / 中单 / 小单试水 / 建议不下」
- 修改历史：每次新增、修改、删除都会写入快照
- CSV 导出
- 打印当前列表
- 可切换存储方式：D1 或自定义 HTTP 存储接口

## 字段

- 产品图链接
- 款式编码
- 季节
- 基本售价
- 外观设计 0-10
- 材质触感 0-10
- 工艺细节 0-10
- 容量收纳 0-10
- 背负舒适度 0-10
- 总分
- 等级
- 评审人
- 评审日期
- 备注

## 后台入口配置

后台不在首页放入口按钮。

通过环境变量设置后台访问后缀：

```text
ADMIN_PATH=review-admin-2026
```

访问方式：

```text
https://你的域名/review-admin-2026
```

也可以写成：

```text
ADMIN_PATH=/review-admin-2026
```

系统会自动处理开头的 `/`。

> 不建议使用简单后缀，例如 `admin`、`login`。建议使用不容易猜到的后缀，例如 `review-admin-2026`、`new-review-console-8x9p`。

## 后台账号密码配置

通过环境变量设置：

```text
ADMIN_USERNAME=admin
ADMIN_PASSWORD=你的强密码
SESSION_SECRET=一串较长随机字符
```

`ADMIN_USERNAME` 不配置时，默认账号是 `admin`。  
`ADMIN_PASSWORD` 必须配置。  
`SESSION_SECRET` 用于登录 Cookie 签名，建议使用一串较长随机字符。

## 数据存储配置

### 方案 A：使用 Cloudflare D1

适合轻量快速上线。

环境变量：

```text
STORAGE_DRIVER=d1
```

然后在 Cloudflare Pages 中绑定 D1，binding 名称必须是：

```text
DB
```

创建 D1：

```bash
npx wrangler d1 create product-review-db
```

把输出的 `database_id` 填入 `wrangler.toml`，取消 D1 配置注释：

```toml
[[d1_databases]]
binding = "DB"
database_name = "product-review-db"
database_id = "你的 D1 database_id"
```

初始化数据库：

```bash
npx wrangler d1 execute product-review-db --file=migrations/0001_init.sql --remote
npx wrangler d1 execute product-review-db --file=migrations/0002_app_settings.sql --remote
```

### 方案 B：使用自定义数据库

适合你不想绑定 D1，或者后续要接 MySQL、PostgreSQL、MongoDB、Supabase、自建服务器数据库等场景。

Cloudflare Pages Functions 本身调用你的 HTTP 接口，你的 HTTP 接口再连接实际数据库。

环境变量：

```text
STORAGE_DRIVER=http
STORAGE_API_URL=https://your-api.example.com/product-review
STORAGE_API_TOKEN=your-secret-token
```

接口规范见：

```text
docs/CUSTOM_STORAGE.md
```

简单理解就是你提供以下接口：

```text
GET    /items
POST   /items
PUT    /items/:id
DELETE /items/:id
GET    /items/:id/history
GET    /settings
PUT    /settings
```

这样系统就不依赖 D1，数据可以存到你自己的数据库里。

## 图片存储说明

当前版本的「产品图」字段只保存图片 URL，不上传、不压缩、不把图片二进制写进数据库。

推荐做法：

1. 图片放到你自己的服务器、阿里云 OSS、腾讯云 COS、七牛云、Cloudflare R2 或其他图床。
2. 系统里只填写图片 URL。
3. 数据库里只保存 URL 字符串。

这样可以避免图片越存越多导致数据库费用或容量压力增加。

## 本地开发

安装依赖：

```bash
npm install
npx wrangler login
```

普通启动：

```bash
npm run dev
```

如果本地要测试 D1：

```bash
npm run dev:d1
```

本地环境变量可以放到 `.dev.vars`：

```text
ADMIN_PATH=review-admin-2026
ADMIN_USERNAME=admin
ADMIN_PASSWORD=123456
SESSION_SECRET=local-random-secret
STORAGE_DRIVER=d1
```

本地访问：

```text
http://127.0.0.1:8788/review-admin-2026
```

## Cloudflare Pages 部署步骤

### 1. 创建 Pages 项目

可以使用命令行部署：

```bash
npm run deploy
```

也可以推送到 GitHub/GitLab 后，在 Cloudflare Pages 中连接仓库。

构建配置：

```text
Build command：留空或 echo no build needed
Build output directory：public
```

### 2. 配置环境变量

在 Cloudflare Pages 项目中配置：

```text
ADMIN_PATH=review-admin-2026
ADMIN_USERNAME=admin
ADMIN_PASSWORD=你的强密码
SESSION_SECRET=一串较长随机字符
STORAGE_DRIVER=d1
```

如果你使用自定义数据库，则改为：

```text
STORAGE_DRIVER=http
STORAGE_API_URL=https://your-api.example.com/product-review
STORAGE_API_TOKEN=your-secret-token
```

### 3. 如果使用 D1，绑定数据库

Pages 项目设置里添加 D1 binding：

```text
Variable name：DB
D1 database：product-review-db
```

并执行迁移 SQL：

```bash
npx wrangler d1 execute product-review-db --file=migrations/0001_init.sql --remote
npx wrangler d1 execute product-review-db --file=migrations/0002_app_settings.sql --remote
```

### 4. 访问后台

假设域名是：

```text
https://review.example.com
```

`ADMIN_PATH` 是：

```text
review-admin-2026
```

后台地址就是：

```text
https://review.example.com/review-admin-2026
```

首页不会显示后台按钮。

## 注意事项

- 「评分份数」只是本次录入时生成多少个款式页面，不限制历史记录总数。
- 删除是软删除：普通列表不显示，但删除前快照会进入历史表。
- CSV 导出依赖当前登录 Cookie，未登录时无法导出。
- 建议生产环境使用强密码，并不要把真实密码写进代码仓库。
- 后台访问后缀只是隐藏入口，不等于安全认证；真正的权限仍依赖账号和强密码。
- 如果使用自定义数据库，接口服务需要自己做好鉴权、备份、限流和日志。
