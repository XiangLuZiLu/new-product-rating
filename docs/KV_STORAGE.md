# KV 数据存储说明

`STORAGE_DRIVER=kv` 时，系统会把评分记录、修改历史、后台评分份数配置保存到 Cloudflare KV。

## 创建 KV Namespace

```bash
npx wrangler kv namespace create product-review-kv
```

执行后会得到类似：

```toml
[[kv_namespaces]]
binding = "KV"
id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

把它填入 `wrangler.toml`。

## 环境变量

```text
STORAGE_DRIVER=kv
KV_PREFIX=product-review:
```

`KV_PREFIX` 可选，用于多个系统共用同一个 KV 时区分数据。

## 注意

KV 更适合小规模、低频后台管理数据。它不是关系型数据库，复杂筛选、强一致性、并发写入要求高的场景建议使用 D1 或自建数据库。
