# 完全使用 Cloudflare Pages 后台配置

本版本已删除 `wrangler.toml`，Cloudflare Pages 不再通过仓库里的 Wrangler 配置管理项目。

请在 Cloudflare Pages 控制台完成这些配置：

## 构建设置

- Framework preset: None
- Build command: 留空，或 `echo no build needed`
- Build output directory: `public`
- Root directory: 仓库根目录就留空；如果项目在子文件夹，填子文件夹名称

## Bindings

Settings -> Bindings：

- D1 database
  - Variable name: `DB`
  - D1 database: 选择你的 D1，例如 `product-review-db`

- R2 bucket
  - Variable name: `IMAGE_BUCKET`
  - R2 bucket: 选择你的 R2，例如 `product-review-images`

## Variables and Secrets

Settings -> Variables and Secrets：

普通变量：

```text
ADMIN_PATH=review-admin-2026
ADMIN_USERNAME=admin
STORAGE_DRIVER=d1
IMAGE_STORAGE_DRIVER=r2
IMAGE_MAX_SIZE_MB=10
IMAGE_KEY_PREFIX=review-images
```

Secrets：

```text
ADMIN_PASSWORD=你的后台强密码
SESSION_SECRET=一串较长随机字符串
```

配置完成后，必须重新部署一次：

- Deployments -> Retry deployment

或提交一次 GitHub 代码触发自动部署。
