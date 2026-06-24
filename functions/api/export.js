function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const s = String(value);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export async function onRequestGet({ env }) {
  const { results } = await env.DB.prepare(`
    SELECT review_date, reviewer, style_code, season, base_price,
      appearance_score, material_score, craftsmanship_score, capacity_score, comfort_score,
      total_score, grade, remark, product_image, created_at, updated_at
    FROM review_items
    WHERE deleted_at IS NULL
    ORDER BY review_date DESC, id DESC
  `).all();

  const headers = ['评审日期', '评审人', '款式编码', '季节', '基本售价', '外观设计', '材质触感', '工艺细节', '容量收纳', '背负舒适度', '总分', '等级', '备注', '产品图', '创建时间', '更新时间'];
  const keys = ['review_date', 'reviewer', 'style_code', 'season', 'base_price', 'appearance_score', 'material_score', 'craftsmanship_score', 'capacity_score', 'comfort_score', 'total_score', 'grade', 'remark', 'product_image', 'created_at', 'updated_at'];
  const lines = [headers.map(csvEscape).join(',')];
  for (const row of results || []) lines.push(keys.map(k => csvEscape(row[k])).join(','));
  const csv = '\ufeff' + lines.join('\n');
  return new Response(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="product-review.csv"'
    }
  });
}
