import { getStorage, gradeByScore } from '../_shared/storage.js';

function csvCell(value) {
  const text = String(value ?? '');
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}
function normalizeMaxScore(value) {
  const n = Number.parseInt(value ?? 10, 10);
  if (!Number.isFinite(n) || n <= 0) return 10;
  return Math.max(1, Math.min(100, n));
}
function scoreTypeId(item) {
  return String(item?.score_type || item?.type || 'main').trim() || 'main';
}
function scoreTypeLabel(item) {
  return String(item?.score_type_label || item?.type_label || scoreTypeId(item)).trim() || scoreTypeId(item);
}
function scoreSystemSummaries(items = []) {
  const groups = new Map();
  for (const item of items || []) {
    const id = scoreTypeId(item);
    if (!groups.has(id)) groups.set(id, { id, label: scoreTypeLabel(item), total: 0, max: 0 });
    const group = groups.get(id);
    group.total += Number(item.score || 0);
    group.max += normalizeMaxScore(item.max_score);
  }
  return Array.from(groups.values()).map(group => ({ ...group, text: `${group.total}/${group.max} ${gradeByScore(group.total, group.max)}` }));
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
    const scoreColumns = [];
    const systemColumns = [];
    for (const score of scores) {
      for (const item of score.score_items || []) {
        const key = `${scoreTypeId(item)}::${item.label}`;
        const title = `${scoreTypeLabel(item)}-${item.label}`;
        if (!scoreColumns.some(col => col.key === key)) scoreColumns.push({ key, title });
      }
      for (const system of scoreSystemSummaries(score.score_items || [])) {
        if (!systemColumns.some(col => col.id === system.id)) systemColumns.push({ id: system.id, title: `${system.label}总分` });
      }
    }
    const headers = ['产品图', '款式编码', '季节', '基本售价', ...scoreColumns.map(col => col.title), ...systemColumns.map(col => col.title), '评分人', '评分日期', '备注', '创建时间'];
    const rows = scores.map(score => {
      const values = Object.fromEntries((score.score_items || []).map(item => [`${scoreTypeId(item)}::${item.label}`, item.score]));
      const systems = Object.fromEntries(scoreSystemSummaries(score.score_items || []).map(item => [item.id, item.text]));
      return [
        score.product_image,
        score.style_code,
        score.season,
        score.base_price,
        ...scoreColumns.map(col => values[col.key] ?? ''),
        ...systemColumns.map(col => systems[col.id] ?? ''),
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
