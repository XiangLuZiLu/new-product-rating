# 自定义数据库 HTTP 存储接口规范

系统默认可用 Cloudflare D1，也可以通过 `STORAGE_DRIVER=http` 切换到你自己的数据库接口。
这个接口可以由你的服务器连接 MySQL、PostgreSQL、MongoDB、SQL Server、Supabase、腾讯云数据库、阿里云数据库等。
Cloudflare Pages Functions 只负责调用 HTTP 接口，不直接绑定某一种数据库。

## 环境变量

```text
STORAGE_DRIVER=http
STORAGE_API_URL=https://your-api.example.com/product-review
STORAGE_API_TOKEN=your-secret-token
```

系统会在请求头中发送：

```http
Authorization: Bearer your-secret-token
```

如果你不需要鉴权，也可以不配置 `STORAGE_API_TOKEN`，但生产环境不建议这样做。

## 数据字段

`review_items` 记录建议包含：

| 字段 | 类型 | 说明 |
|---|---|---|
| id | number/string | 主键 |
| product_image | string | 产品图 URL，只存链接，不存图片文件 |
| style_code | string | 款式编码，必填 |
| season | string | 季节 |
| base_price | number/null | 基本售价 |
| appearance_score | number | 外观设计 0-10 |
| material_score | number | 材质触感 0-10 |
| craftsmanship_score | number | 工艺细节 0-10 |
| capacity_score | number | 容量收纳 0-10 |
| comfort_score | number | 背负舒适度 0-10 |
| total_score | number | 总分，系统已计算 |
| grade | string | 大单 / 中单 / 小单试水 / 建议不下 |
| remark | string | 备注 |
| reviewer | string | 评审人 |
| review_date | string | YYYY-MM-DD |
| created_at | string | 创建时间 |
| updated_at | string | 更新时间 |
| deleted_at | string/null | 删除时间，软删除可用 |

## 必须实现的接口

### 查询记录

```http
GET /items?search=&date_from=&date_to=&limit=500
```

返回：

```json
{
  "ok": true,
  "items": []
}
```

### 新增记录

```http
POST /items
Content-Type: application/json
```

请求体就是一条评审记录，返回：

```json
{
  "ok": true,
  "item": {}
}
```

### 更新记录

```http
PUT /items/:id
Content-Type: application/json
```

返回：

```json
{
  "ok": true,
  "item": {}
}
```

### 删除记录

```http
DELETE /items/:id
```

返回：

```json
{
  "ok": true
}
```

### 读取修改历史

```http
GET /items/:id/history
```

返回：

```json
{
  "ok": true,
  "history": []
}
```

`history` 中建议包含：

```json
{
  "id": 1,
  "item_id": 1,
  "action": "create/update/delete",
  "snapshot_json": "{}",
  "changed_at": "2026-06-24 10:00:00"
}
```

### 读取系统设置

```http
GET /settings
```

返回：

```json
{
  "ok": true,
  "settings": {
    "score_page_count": 3
  }
}
```

### 保存系统设置

```http
PUT /settings
Content-Type: application/json

{
  "score_page_count": 5
}
```

返回：

```json
{
  "ok": true,
  "settings": {
    "score_page_count": 5
  }
}
```

## 图片存储建议

本系统的 `product_image` 只保存图片 URL，不保存图片文件本身，所以不会因为图片本体写入 D1 或数据库而增加数据库体积。
如果后续要上传图片，建议把图片放到以下任一位置，数据库仍然只保存 URL：

- 你自己的服务器
- 阿里云 OSS
- 腾讯云 COS
- 七牛云
- Cloudflare R2
- 其他图床或对象存储
