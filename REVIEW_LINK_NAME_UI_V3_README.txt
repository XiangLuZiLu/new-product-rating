评分链接名称与下拉框优化 v3

本次调整：
1. “评分结果”中的评分链接下拉框只显示“链接名称”。
   - 不再显示括号中的链接 code。
   - 展开菜单也不再显示第二行 code。
   - code 仍作为内部筛选 value 使用，不影响筛选和导出。
2. 生成评分链接时，默认链接名称改为：
   MM月DD日评分-N款
   例如：08月24日评分-3款
3. 前端按 Asia/Shanghai（北京时间）生成默认名称。
4. 后端 storage 同步加入相同兜底规则，防止前端未提交名称时出现旧格式。
5. 下拉选项改为单行样式，并略微加宽显示区域。

覆盖文件：
- public/assets/admin.js
- public/assets/style.css
- functions/_shared/storage.js
- edge-functions/_shared/storage.js

无需删除旧文件。
不会修改 Excel 图片导出相关文件。
