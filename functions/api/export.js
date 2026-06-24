import { getStorage } from '../_shared/storage.js';

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const s = String(value);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export async function onRequestGet({ env }) {
  try {
    const results = await getStorage(env).listItems({ limit: '5000' });
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
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, message: e.message || '导出失败' }), {
      status: e.status || 500,
      headers: { 'content-type': 'application/json; charset=utf-8' }
    });
  }
}
