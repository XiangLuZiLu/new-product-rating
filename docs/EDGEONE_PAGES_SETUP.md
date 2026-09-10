# EdgeOne Pages 部署

## 构建配置

```text
Framework: None
Build command: 留空或 echo no build needed
Output directory: public
```

## Functions

项目保留：

```text
functions/
```

用于：

```text
/api/*
```

## KV

EdgeOne Pages 环境变量：

```text
STORAGE_DRIVER=edgeone-kv
EDGEONE_KV_NAMESPACE=product_review
```

在 EdgeOne Pages 控制台绑定 KV 命名空间后使用。

## Cloudflare Pages

仍支持：

```text
STORAGE_DRIVER=d1
DB=D1 Binding
```

## KV 绑定变量名说明

EdgeOne Pages/Makers 的 KV 绑定变量名需要和代码读取的变量名一致。推荐绑定变量名使用：

```text
EDGEONE_KV
```

环境变量继续保留：

```text
STORAGE_DRIVER=edgeone-kv
EDGEONE_KV_NAMESPACE=product_review
```

如果你绑定 KV 时使用了其他变量名，例如 `MY_KV`，请额外添加环境变量：

```text
EDGEONE_KV_BINDING=MY_KV
```

配置或绑定修改后，需要重新部署才会生效。
