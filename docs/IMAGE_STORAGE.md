# 图片存储配置说明

系统现在把“图片文件”和“评分/历史数据”分开存储：

- 图片文件：建议放 R2、七牛云 Kodo、阿里云 OSS、腾讯云 COS、MinIO 等对象存储。
- 评分/历史数据：可放 D1、KV 或你自己的 HTTP 数据接口。
- 数据库里只保存图片 URL，不保存图片二进制内容。

## 方案一：Cloudflare R2 存图片

### 1. 创建 R2 Bucket

```bash
npx wrangler r2 bucket create product-review-images
```

### 2. 在 `wrangler.toml` 绑定 R2

```toml
[[r2_buckets]]
binding = "IMAGE_BUCKET"
bucket_name = "product-review-images"
```

`binding` 建议保持 `IMAGE_BUCKET`，项目代码会通过它访问 R2。

### 3. 配置环境变量

```text
IMAGE_STORAGE_DRIVER=r2
IMAGE_MAX_SIZE_MB=10
IMAGE_KEY_PREFIX=review-images
```

如果你给 R2 绑定了公开自定义域名，例如：

```text
https://img.example.com
```

则额外配置：

```text
PUBLIC_IMAGE_BASE_URL=https://img.example.com
```

不配置 `PUBLIC_IMAGE_BASE_URL` 也可以，系统会返回：

```text
/api/images/<图片key>
```

由 Pages Function 从 R2 读取图片。

## 方案二：七牛云 / OSS / COS / MinIO 等 S3 兼容对象存储

很多对象存储都支持 S3 兼容 API。配置如下：

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

说明：

- `S3_PUBLIC_BASE_URL` 推荐配置成 CDN 域名或公开访问域名，否则图片可能无法在浏览器正常显示。
- `S3_FORCE_PATH_STYLE=true` 代表上传地址类似 `endpoint/bucket/key`。
- 如果服务商要求 `bucket.endpoint/key`，把 `S3_FORCE_PATH_STYLE=false`。
- 七牛云如果使用 Kodo，请优先开启或使用它的 S3 兼容访问方式，然后按上面配置。

## 方案三：只填写图片 URL，不上传图片

如果你暂时不想接对象存储：

```text
IMAGE_STORAGE_DRIVER=url
```

后台评分页仍然可以手动填写图片链接，但“选择图片自动上传”会提示未启用上传。

## 和评分数据存储的组合

### 图片 R2 + 评分数据 D1

```text
IMAGE_STORAGE_DRIVER=r2
STORAGE_DRIVER=d1
```

需要绑定：

```toml
[[r2_buckets]]
binding = "IMAGE_BUCKET"
bucket_name = "product-review-images"

[[d1_databases]]
binding = "DB"
database_name = "product-review-db"
database_id = "你的D1 database_id"
```

### 图片 R2 + 评分数据 KV

```text
IMAGE_STORAGE_DRIVER=r2
STORAGE_DRIVER=kv
```

需要绑定：

```toml
[[r2_buckets]]
binding = "IMAGE_BUCKET"
bucket_name = "product-review-images"

[[kv_namespaces]]
binding = "KV"
id = "你的KV namespace id"
```

### 图片七牛云/OSS + 评分数据 D1 或 KV

```text
IMAGE_STORAGE_DRIVER=s3
STORAGE_DRIVER=d1
```

或：

```text
IMAGE_STORAGE_DRIVER=s3
STORAGE_DRIVER=kv
```

此时图片不走 Cloudflare R2，而是上传到你配置的 S3 兼容对象存储。
