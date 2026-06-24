# 新品评审评分系统（Cloudflare Pages + D1）

这是一个可部署到 Cloudflare Pages 的新品评审评分系统，字段参考纸质「新品评审评分表」。

## 已包含功能

- 管理员登录
- 手机端适配：手机也可以录入和编辑评分
- 每个款式独立一页：左右滑动切换，每页填写一个款
- 滑块评分：外观设计、材质触感、工艺细节、容量收纳、背负舒适度均为 0-10 分滑动评分
- 后台自定义本次评分份数：例如设置为 8，就生成 8 个款式评分页
- 保存当前款 / 批量保存全部已填写款
- 历史数据查询：关键词、日期区间
- 后台管理编辑：历史列表中点「编辑」会载入到滑动评分第一页进行修改
- 删除评审记录
- 自动计算总分，并自动给出「大单 / 中单 / 小单试水 / 建议不下」
- 修改历史：每次新增、修改、删除都会写入快照
- CSV 导出
- 打印当前列表
- Cloudflare D1 数据库存储

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

## 使用方式

1. 登录后台。
2. 在「本次评分份数」里设置这次要评几个款，例如 5 份。
3. 系统会生成 5 个独立评分页。
4. 手机端可左右滑动切换款式，每个款独立填写和评分。
5. 可点「保存当前款」，也可点「保存全部已填写款」。
6. 历史列表里可查询、编辑、删除、查看修改历史。

## 本地开发

```bash
npm install
npx wrangler login
npm run dev
```

本地开发时如果还没配置 D1，可先完成下面的 D1 创建和建表步骤。

## Cloudflare 部署步骤

### 1. 创建 D1 数据库

```bash
npx wrangler d1 create product-review-db
```

命令输出里会包含 `database_id`，复制后替换 `wrangler.toml` 中的：

```toml
database_id = "REPLACE_WITH_YOUR_D1_DATABASE_ID"
```

### 2. 初始化数据库表

新部署请依次执行两个 SQL：

```bash
npx wrangler d1 execute product-review-db --file=migrations/0001_init.sql --remote
npx wrangler d1 execute product-review-db --file=migrations/0002_app_settings.sql --remote
```

如果你之前已经部署过旧版，只需要追加执行：

```bash
npx wrangler d1 execute product-review-db --file=migrations/0002_app_settings.sql --remote
```

### 3. 设置后台密码和会话密钥

```bash
npx wrangler pages secret put ADMIN_PASSWORD --project-name=product-review-pages
npx wrangler pages secret put SESSION_SECRET --project-name=product-review-pages
```

`ADMIN_PASSWORD` 是后台登录密码。  
`SESSION_SECRET` 用于登录 Cookie 签名，建议使用一串较长随机字符。

### 4. 部署到 Cloudflare Pages

方式一：命令行直接部署

```bash
npm run deploy
```

方式二：Git 仓库部署

把代码推送到 GitHub/GitLab 后，在 Cloudflare Pages 中选择该仓库：

- Build command：留空或填写 `echo no build needed`
- Build output directory：`public`
- D1 binding：变量名填 `DB`，选择 `product-review-db`
- Environment variables：添加 `ADMIN_PASSWORD` 和 `SESSION_SECRET`

## 图片说明

当前版本的「产品图」使用图片 URL 存储，适合先快速上线。若后续需要直接上传图片文件，建议再接入 Cloudflare R2，把图片文件放到 R2，D1 里只保存图片地址。

## 注意事项

- 「评分份数」只是本次录入时生成多少个款式页面，不限制历史记录总数。
- 删除是软删除：普通列表不显示，但删除前快照会进入历史表。
- CSV 导出依赖当前登录 Cookie，未登录时无法导出。
- 建议生产环境使用强密码，并不要把真实密码写进代码仓库。
