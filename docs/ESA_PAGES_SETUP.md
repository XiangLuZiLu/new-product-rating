# 阿里云 ESA Pages 部署说明

本项目现在同时保留 Cloudflare Pages / EdgeOne Pages 的原目录结构，并新增阿里云 ESA Pages 的单入口适配：

- ESA 函数目录：`./esa-functions/`
- ESA 入口：`./esa-functions/index.js`
- ESA 配置：`./esa.jsonc`
- 静态目录：`./public`
- 数据存储：ESA EdgeKV

## 1. 为什么原项目不能直接在 ESA Pages 跑

原项目的 `functions/` / `edge-functions/` 使用“文件即路由”的 Pages Functions 结构，例如：

- `functions/api/login.js` -> `/api/login`
- `functions/api/styles/[id].js` -> `/api/styles/:id`

ESA Pages 使用一个 `entry` 作为边缘函数入口，因此单独新增 `esa-functions/`。该目录拥有独立的 API、共享模块和统一入口 `esa-functions/index.js`，不再依赖 `edge-functions/` 或 `functions/`。

## 2. 目录隔离说明

三套平台函数现在完全分开：

```text
functions/          # Cloudflare Pages
edge-functions/     # Tencent EdgeOne Pages
esa-functions/      # Alibaba Cloud ESA Pages
public/             # 三个平台共用的静态前端
```

`esa-functions/index.js` 只引用 `esa-functions/` 自己目录下的模块，不会引用 `edge-functions/` 或 `functions/`。因此后续可以针对 ESA 单独修改存储、路由或运行时兼容逻辑，而不影响另外两个平台。

## 3. ESA Pages 构建配置

仓库根目录已提供 `esa.jsonc`：

```json
{
  "name": "new-product-rating",
  "entry": "./esa-functions/index.js",
  "installCommand": "",
  "buildCommand": "",
  "assets": {
    "directory": "./public"
  }
}
```

因此使用 GitHub 导入时，一般无需再在控制台重复填写构建命令。

如果控制台需要人工确认：

- 根目录：`/`
- 安装命令：留空
- 构建命令：留空
- 静态资源目录：`./public`
- 函数文件路径：`./esa-functions/index.js`

不要把 `notFoundStrategy` 设置成 `singlePageApplication`，否则 `/admin` 和评分链接 `/<code>` 这种导航请求可能先被静态 `index.html` 接管，无法进入动态函数路由。

## 4. 创建 EdgeKV 存储空间

在 ESA 控制台创建一个边缘 KV 存储空间，例如：

```text
product_review
```

项目会通过 ESA 运行时的：

```js
new EdgeKV({ namespace: 'product_review' })
```

访问数据。

## 5. 函数变量

生产环境至少配置：

```text
STORAGE_DRIVER=edgekv
ESA_KV_NAMESPACE=product_review
ADMIN_USERNAME=admin
ADMIN_PASSWORD=请改成你自己的强密码
SESSION_SECRET=请填写一串独立的随机长字符串
ADMIN_PATH=/admin
SESSION_IDLE_MINUTES=120
DRAFT_TIMEZONE=Asia/Shanghai
```

说明：

- `ESA_KV_NAMESPACE`：必须和 ESA 边缘 KV 的 Namespace 名称一致。
- 为兼容旧部署，代码也继续接受 `EDGEONE_KV_NAMESPACE`。
- `ADMIN_PASSWORD` 必填。
- `SESSION_SECRET` 建议不要和后台密码相同。
- 修改函数变量后需要重新部署/发布新版本才会生效。

## 6. 图片存储

ESA 不使用 Cloudflare R2。后台“图片存储配置”建议选择：

```text
国内OSS / S3兼容
```

可继续使用阿里云 OSS、七牛 Kodo、腾讯 COS 或其他 S3 兼容存储。

如果使用阿里云 OSS，建议填写：

- S3 Endpoint：对应 Bucket 地域的 OSS Endpoint
- Bucket：你的 Bucket 名称
- Region：例如 `oss-cn-guangzhou`
- AccessKey ID / Secret：建议使用最小权限 RAM 用户
- 图片公开访问域名：Bucket 公网域名或已绑定的 CDN/ESA 图片域名

## 7. 部署后验证

按顺序测试：

1. 访问 `/`：应显示“无法进入评分”的提示，而不是后台。
2. 访问 `/admin`：应显示后台登录页。
3. 登录后打开“设置”：接口 `/api/settings` 应返回 200。
4. 新建一个款式，再刷新页面：数据仍存在，证明 EdgeKV 写入成功。
5. 生成评分链接，访问 `/<评分码>`：应显示评分页面。
6. 提交一次评分，再到后台“评分结果”查看。
7. 如果配置了 OSS，再测试上传图片。

## 8. 与 EdgeOne 共存

本次没有删除原有：

- `functions/`
- `edge-functions/`
- `edgeone.json`

因此同一个仓库仍可保留原 EdgeOne / Cloudflare 部署方式；ESA 使用 `esa.jsonc + esa-functions/`，三套函数代码彼此独立。
