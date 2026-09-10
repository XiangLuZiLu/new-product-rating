import { getStorage, normalizeStylePayload } from '../../_shared/storage.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
}

function cleanText(value) {
  return String(value ?? '').trim();
}

function normalizePrice(value) {
  const text = cleanText(value).replace(/[￥¥,，\s]/g, '');
  if (!text) return '';
  const match = text.match(/-?\d+(?:\.\d+)?/);
  return match ? match[0] : '';
}

function styleCodeKey(value) {
  return cleanText(value).toLowerCase();
}

function normalizeImportRows(input) {
  const rows = Array.isArray(input) ? input : [];
  const map = new Map();
  let skipped = 0;
  for (const row of rows) {
    const styleCode = cleanText(row?.style_code ?? row?.['款式编码'] ?? row?.code ?? row?.sku);
    if (!styleCode) { skipped += 1; continue; }
    map.set(styleCodeKey(styleCode), {
      style_code: styleCode,
      season: cleanText(row?.season ?? row?.['季节'] ?? ''),
      base_price: normalizePrice(row?.base_price ?? row?.['基本售价'] ?? row?.price ?? '')
    });
  }
  return { rows: Array.from(map.values()), skipped_count: skipped };
}

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json().catch(() => ({}));
    const { rows, skipped_count } = normalizeImportRows(body.styles || body.rows || []);
    if (!rows.length) return json({ ok: false, message: '没有可导入的款式数据' }, 400);
    if (rows.length > 1000) return json({ ok: false, message: '一次最多导入 1000 个款式，请分批导入' }, 400);

    const storage = getStorage(env);
    const existingRows = await storage.listStyles({});
    const existingByCode = new Map((existingRows || [])
      .filter(row => row && row.style_code)
      .map(row => [styleCodeKey(row.style_code), row]));

    let created = 0;
    let updated = 0;
    const resultRows = [];

    for (const item of rows) {
      const key = styleCodeKey(item.style_code);
      const old = existingByCode.get(key);
      if (old) {
        const payload = normalizeStylePayload({
          product_image: old.product_image || '',
          style_code: old.style_code || item.style_code,
          season: item.season,
          base_price: item.base_price,
          style_remark: old.style_remark || '',
          sort_order: old.sort_order || 0,
          active: old.active ?? 1
        });
        const style = await storage.updateStyle(old.id, payload);
        existingByCode.set(key, style);
        resultRows.push({ id: style.id, style_code: style.style_code, action: 'updated' });
        updated += 1;
      } else {
        const payload = normalizeStylePayload({
          product_image: '',
          style_code: item.style_code,
          season: item.season,
          base_price: item.base_price,
          style_remark: '',
          sort_order: 0,
          active: 1
        });
        const style = await storage.createStyle(payload);
        existingByCode.set(key, style);
        resultRows.push({ id: style.id, style_code: style.style_code, action: 'created' });
        created += 1;
      }
    }

    return json({
      ok: true,
      created_count: created,
      updated_count: updated,
      skipped_count,
      imported_count: resultRows.length,
      rows: resultRows
    });
  } catch (e) {
    return json({ ok: false, message: e.message || '导入款式失败' }, e.status || 500);
  }
}
