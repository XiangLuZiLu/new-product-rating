导出图片最终修复 v9

问题根因：
历史款式的 product_image 保存为：
/api/public/image-proxy?url=http%3A%2F%2Fxianglu.dragon-sturgeon.cn%2Freview-images-....jpg

旧导出代码把整个 /api/public/image-proxy?... 当成图片对象路径，
错误拼成：
https://xianglu.dragon-sturgeon.cn/xianglupiju/api/public/image-proxy?...

因此图片抓取返回 404，Excel 中没有 xl/media 图片文件。

本版修复：
1. 导出前先解析 /api/public/image-proxy?url=...，取出真正图片 URL。
2. 按当前图片公开域名和公开路径前缀重新生成 CDN URL。
3. 历史 http 地址自动升级为 https。
4. 已经是外部完整 URL 时不会错误拼接本站路径。
5. 保留“导出诊断”，诊断版本升级为 v2。

覆盖文件：
- functions/api/export.js
- edge-functions/api/export.js

无需删除旧文件。
