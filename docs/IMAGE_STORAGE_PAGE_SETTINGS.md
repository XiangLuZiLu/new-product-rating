# 图片存储改为后台页面配置

新版把图片存储配置放到后台页面：`图片存储配置`。

## Cloudflare 环境变量保留最小化

仍建议保留：

```text
ADMIN_PATH=review-admin-2026
ADMIN_USERNAME=admin
STORAGE_DRIVER=d1
SESSION_IDLE_MINUTES=120
```

Secrets：

```text
ADMIN_PASSWORD=你的后台密码
SESSION_SECRET=一串随机字符串
```

不再需要把这些图片参数放到 Cloudflare 环境变量：

```text
IMAGE_STORAGE_DRIVER
IMAGE_MAX_SIZE_MB
IMAGE_KEY_PREFIX
PUBLIC_IMAGE_BASE_URL
S3_ENDPOINT
S3_BUCKET
S3_REGION
S3_ACCESS_KEY_ID
S3_SECRET_ACCESS_KEY
S3_FORCE_PATH_STYLE
```

## 使用 R2

1. Cloudflare Pages → Settings → Bindings。
2. 绑定 R2 bucket，变量名必须是：`IMAGE_BUCKET`。
3. 后台页面 → 图片存储配置：选择 `Cloudflare R2`。
4. 可选填写图片公开访问域名；不填时通过 `/api/images/...` 读取。

## 使用七牛云 / 阿里云 OSS / 腾讯云 COS / MinIO

后台页面 → 图片存储配置：选择 `S3兼容OSS`，填写：

```text
S3 Endpoint
Bucket / 空间名
Region / 区域
AccessKey ID
SecretKey
图片公开访问域名
Path Style
```

七牛云一般使用 Path Style；阿里云 OSS、腾讯云 COS 通常可关闭 Path Style，具体以服务商 S3 兼容说明为准。

## 安全说明

为了减少 Cloudflare 环境变量，S3 SecretKey 会保存到当前系统的数据存储里，例如 D1 的 `app_settings` 表。后台 API 不会把 SecretKey 明文返回到页面，编辑时留空表示不修改已有 SecretKey。


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
