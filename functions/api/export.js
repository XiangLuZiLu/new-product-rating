import { getStorage } from '../_shared/storage.js';

function csvCell(value) {
  const text = String(value ?? '');
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export async function onRequestGet({ request, env }) {
  try {
    const url = new URL(request.url);
    const storage = getStorage(env);
    const scores = await storage.listScores({
      search: url.searchParams.get('search') || '',
      date_from: url.searchParams.get('date_from') || '',
      date_to: url.searchParams.get('date_to') || '',
      limit: '10000'
    });
    const scoreLabels = [];
    for (const score of scores) {
      for (const item of score.score_items || []) {
        if (!scoreLabels.includes(item.label)) scoreLabels.push(item.label);
      }
    }
    const headers = ['产品图', '款式编码', '季节', '基本售价', ...scoreLabels, '总分', '等级', '评分人', '评分日期', '备注', '创建时间'];
    const rows = scores.map(score => {
      const values = Object.fromEntries((score.score_items || []).map(item => [item.label, item.score]));
      return [
        score.product_image,
        score.style_code,
        score.season,
        score.base_price,
        ...scoreLabels.map(label => values[label] ?? ''),
        score.total_score,
        score.grade,
        score.reviewer,
        score.review_date,
        score.remark,
        score.created_at
      ];
    });
    const csv = [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\n');
    return new Response('\ufeff' + csv, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': 'attachment; filename="review-scores.csv"'
      }
    });
  } catch (e) {
    return new Response(e.message || '导出失败', { status: 500 });
  }
}
