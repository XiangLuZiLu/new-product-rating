# 新品评审评分系统（Cloudflare Pages 版）

适合搭建到 Cloudflare Pages 的新品评审评分系统，支持手机端分页评分、每个款式独立一页、当前款填写完整后才能进入下一款、评分份数后台自定义、历史数据查询编辑、导出 CSV、后台入口自定义，以及图片/数据分离存储。

## 功能

- 手机端适配：每款单独一页评分，底部固定“上一页 / 下一页”，当前款填写完整后“下一页”才可点击，进入下一款时自动保存。
- 后台入口隐藏：通过 `域名/自定义后缀` 访问后台，首页不显示后台入口。
- 后台账号密码可配置：`ADMIN_PATH`、`ADMIN_USERNAME`、`ADMIN_PASSWORD`。
- 图片单独存储：支持 Cloudflare R2，也支持大部分 S3 兼容对象存储，例如七牛云 Kodo、阿里云 OSS、腾讯云 COS、MinIO 等。
- 评分/历史数据可配置：支持 D1、KV、自定义 HTTP 数据接口。
- 数据库只保存图片 URL，不保存图片二进制内容，避免图片占用数据库空间。
- 登录状态按浏览器保存：换浏览器需要重新登录；可配置空闲超时时间，长时间未操作后需要重新输入密码。

## 一、安装依赖

```bash
npm install
npx wrangler login
```

## 二、选择评分/历史数据存储

### 方案 A：D1 存评分/历史数据

```bash
npx wrangler d1 create product-review-db
```

把命令输出的配置填入 `wrangler.toml`：

```toml
[[d1_databases]]
binding = "DB"
database_name = "product-review-db"
database_id = "你的database_id"
```

初始化表：

```bash
npx wrangler d1 execute product-review-db --file=migrations/0001_init.sql --remote
npx wrangler d1 execute product-review-db --file=migrations/0002_app_settings.sql --remote
```

环境变量：

```text
STORAGE_DRIVER=d1
```

### 方案 B：KV 存评分/历史数据

```bash
npx wrangler kv namespace create product-review-kv
```

把命令输出的配置填入 `wrangler.toml`：

```toml
[[kv_namespaces]]
binding = "KV"
id = "你的KV namespace id"
```

环境变量：

```text
STORAGE_DRIVER=kv
KV_PREFIX=product-review:
```

KV 适合轻量后台记录。如果记录量大、并发高，建议使用 D1 或自建数据库。

### 方案 C：自定义 HTTP 数据接口

环境变量：

```text
STORAGE_DRIVER=http
STORAGE_API_URL=https://your-api.example.com/product-review
STORAGE_API_TOKEN=your-api-token
```

接口规范见：`docs/CUSTOM_STORAGE.md`。

## 三、选择图片存储

### 方案 A：R2 存图片

```bash
npx wrangler r2 bucket create product-review-images
```

填入 `wrangler.toml`：

```toml
[[r2_buckets]]
binding = "IMAGE_BUCKET"
bucket_name = "product-review-images"
```

环境变量：

```text
IMAGE_STORAGE_DRIVER=r2
IMAGE_MAX_SIZE_MB=10
IMAGE_KEY_PREFIX=review-images
```

如果你给 R2 配了公开域名，例如 `https://img.example.com`，再配置：

```text
PUBLIC_IMAGE_BASE_URL=https://img.example.com
```

不配置公开域名也可以，系统会用 `/api/images/<key>` 从 R2 读取图片。

### 方案 B：七牛云 / OSS / COS / MinIO 等 S3 兼容对象存储

环境变量：

```text
IMAGE_STORAGE_DRIVER=s3
S3_ENDPOINT=https://你的S3兼容Endpoint
S3_BUCKET=你的Bucket名称
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=你的AccessKey
S3_SECRET_ACCESS_KEY=你的SecretKey
S3_PUBLIC_BASE_URL=https://你的CDN域名或Bucket公开域名
S3_FORCE_PATH_STYLE=true
IMAGE_MAX_SIZE_MB=10
IMAGE_KEY_PREFIX=review-images
```

如果服务商要求 `bucket.endpoint/key` 这种地址形式，把：

```text
S3_FORCE_PATH_STYLE=false
```

更详细说明见：`docs/IMAGE_STORAGE.md`。

### 方案 C：只保存图片链接，不上传图片

```text
IMAGE_STORAGE_DRIVER=url
```

后台可以手动填写图片 URL，但不会自动上传图片。

## 四、后台入口和账号密码

在 Cloudflare Pages 项目里配置环境变量/Secrets：

```text
ADMIN_PATH=review-admin-2026
ADMIN_USERNAME=admin
ADMIN_PASSWORD=你的强密码
SESSION_SECRET=一串较长随机字符
SESSION_IDLE_MINUTES=120
```

后台访问：

```text
https://你的域名/review-admin-2026
```

说明：`SESSION_IDLE_MINUTES` 是后台登录空闲超时时间，单位分钟。默认建议 `120`，表示当前浏览器 120 分钟无操作后需要重新输入密码。更换浏览器或更换设备访问时，因为没有当前浏览器的登录 Cookie，也需要重新输入密码。


## 五、部署

首次创建 Pages 项目：

```bash
npx wrangler pages project create product-review-pages
```

部署：

```bash
npm run deploy
```

## 六、推荐组合

### 快速上线测试

```text
STORAGE_DRIVER=d1
IMAGE_STORAGE_DRIVER=r2
```

### 想减少数据库压力

```text
STORAGE_DRIVER=kv
IMAGE_STORAGE_DRIVER=r2
```

### 已有七牛云/OSS/COS

```text
STORAGE_DRIVER=d1
IMAGE_STORAGE_DRIVER=s3
```

或者：

```text
STORAGE_DRIVER=kv
IMAGE_STORAGE_DRIVER=s3
```

## 七、后台使用方式

进入后台后，先在右上角设置“本次评分份数”，系统会按份数生成独立款式页。每一页需要填写款式编码、季节、基本售价、评审人、评审日期以及五个评分项；未填写完整时“下一页”按钮不可点击。填写完整后点击“下一页”，系统会自动保存当前款并进入下一款；最后一页按钮会变成“完成”。

在每个款式评分页的“产品图链接 / 上传图片”区域：

1. 可以直接粘贴图片 URL；
2. 也可以选择本地图片，系统会自动上传到你配置的 R2/S3/OSS；
3. 保存记录时，D1/KV/自定义数据库只保存图片地址。


## Cloudflare Pages 后台配置版说明

本版本已删除 `wrangler.toml`，适合通过 Cloudflare Pages 控制台管理所有配置。

导入 GitHub 部署时：

- Framework preset：None
- Build command：留空，或 `echo no build needed`
- Build output directory：`public`
- Root directory：仓库根目录就留空；如果项目在子目录，填写子目录名

D1、R2、KV、环境变量、Secrets 都在 Cloudflare Pages 项目的 Settings 里配置，不要写到仓库文件里。详细步骤见 `docs/CF_PAGES_DASHBOARD_SETUP.md`。
