# 阿里云 ESA Pages 部署说明

本项目同时支持 Cloudflare Pages 和阿里云 ESA Functions & Pages。

## 一、重要区别

Cloudflare Pages 可以直接绑定 D1、KV、R2；阿里云 ESA Pages 不支持 Cloudflare D1/R2 绑定，所以在阿里云部署时建议使用：

- 数据：阿里云 ESA EdgeKV，或自建 HTTP 数据接口
- 图片：阿里云 OSS / 七牛云 / 腾讯云 COS 等 S3 兼容对象存储

如果你要一套代码同时在两个平台部署：

- Cloudflare：`STORAGE_DRIVER=d1`，图片可用 R2 或 S3
- 阿里云：`STORAGE_DRIVER=edgekv`，图片建议用 S3/OSS

## 二、阿里云 ESA Pages 构建配置

仓库根目录已提供 `esa.jsonc`：

```json
{
  "name": "new-product-rating",
  "entry": "./aliyun/entry.js",
  "installCommand": "",
  "buildCommand": "",
  "assets": {
    "directory": "./public"
  }
}
```

阿里云 ESA Pages 会优先读取 `esa.jsonc`，所以控制台里的构建命令可能会被该文件覆盖。

## 三、阿里云需要配置的变量

在阿里云 ESA Pages 的环境变量里配置：

```text
ADMIN_PATH=admin
ADMIN_USERNAME=admin
ADMIN_PASSWORD=你的后台密码
SESSION_SECRET=一串随机密钥
SESSION_IDLE_MINUTES=60
STORAGE_DRIVER=edgekv
EDGEKV_NAMESPACE=product_review
```

说明：

- `EDGEKV_NAMESPACE` 必须和阿里云 ESA 控制台里创建的 KV 存储空间名称一致。
- 由于阿里云 EdgeKV 的 Key 只允许字母、数字、`-`、`_`，项目已自动把内部 key 转成合法格式。

## 四、阿里云创建 EdgeKV

进入阿里云 ESA 控制台：

```text
边缘计算和 AI → KV 存储 → 创建存储空间
```

建议名称：

```text
product_review
```

然后环境变量：

```text
EDGEKV_NAMESPACE=product_review
```

## 五、图片存储配置

阿里云部署不建议使用 Cloudflare R2。登录后台后进入：

```text
设置 → 图片存储配置
```

建议选择：

```text
S3兼容OSS / 七牛云 / 阿里云OSS / 腾讯云COS
```

阿里云 OSS 参考配置：

```text
S3 Endpoint：https://oss-cn-guangzhou.aliyuncs.com
Bucket：你的 OSS Bucket
Region：oss-cn-guangzhou
AccessKey ID：你的 AccessKey
SecretKey：你的 SecretKey
Path Style：一般不勾选
图片公开访问域名：https://你的图片域名
```

## 六、Cloudflare 部署不受影响

Cloudflare Pages 仍然按原方式部署：

```text
Framework preset：None
Build command：留空或 echo no build needed
Build output directory：public
```

Bindings：

```text
D1：DB
R2：IMAGE_BUCKET，可选
```

环境变量保留：

```text
ADMIN_PATH
ADMIN_USERNAME
STORAGE_DRIVER=d1
SESSION_IDLE_MINUTES
```

Secrets：

```text
ADMIN_PASSWORD
SESSION_SECRET
```

`esa.jsonc` 只给阿里云 ESA Pages 使用，不影响 Cloudflare Pages。
