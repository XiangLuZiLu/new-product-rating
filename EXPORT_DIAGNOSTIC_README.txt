导出诊断模式使用方法

1. 覆盖 public/assets/admin.js、functions/api/export.js、edge-functions/api/export.js。
2. 重新部署 Makers，强制刷新后台。
3. 评分结果 -> 导出 -> 导出诊断。
4. 浏览器会下载“评分结果-导出诊断.json”。
5. 把该 JSON 文件发给 ChatGPT，即可精确判断：款式是否匹配、图片字段是什么、最终 URL 是什么、Edge 函数抓图返回何种状态。

诊断文件不会包含 AccessKey / SecretKey，也不会修改任何业务数据。
