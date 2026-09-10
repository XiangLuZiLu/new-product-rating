评分结果筛选栏优化 v2

修复：
1. 修复选择评分链接后仍显示其他评分链接结果的问题。
   原因：v1 在 loadScores() 前把 select 设为 disabled，浏览器 FormData 会自动忽略 disabled 控件，
   导致 review_link_code 根本没有发送到 /api/scores。
2. 本版不再禁用 select，选择链接后立即带 review_link_code 请求后端筛选。

下拉框美化：
3. 不再直接显示浏览器原生 select。
4. 增加自定义评分链接下拉菜单，支持：
   - 链接名称 + 链接代码双行显示
   - 当前项高亮
   - Hover 效果
   - 展开/收起动画
   - 点击页面其它位置或 ESC 关闭
   - 移动端自适应
5. 原生 select 隐藏保留，仍参与 FormData 和导出参数，不破坏现有后端逻辑。

继续保留：
- 删除日期输入框
- 删除查询按钮
- 搜索框输入自动筛选
- 重置恢复全部结果
- 已修好的 Excel 图片导出逻辑不受影响

覆盖文件：
- functions/[[path]].js
- edge-functions/[[path]].js
- public/assets/admin.js
- public/assets/style.css

无需删除旧文件。
