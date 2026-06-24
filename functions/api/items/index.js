const SCORE_FIELDS = ['appearance_score', 'material_score', 'craftsmanship_score', 'capacity_score', 'comfort_score'];

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  });
}

function gradeByScore(total) {
  if (total >= 40) return '大单';
  if (total >= 30) return '中单';
  if (total >= 20) return '小单试水';
  return '建议不下';
}

function toScore(value, name) {
  const n = Number(value ?? 0);
  if (!Number.isInteger(n) || n < 0 || n > 10) throw new Error(`${name} 必须是 0-10 的整数`);
  return n;
}

function normalizePayload(payload) {
  const data = {
    product_image: String(payload.product_image || '').trim(),
    style_code: String(payload.style_code || '').trim(),
    season: String(payload.season || '').trim(),
    base_price: payload.base_price === '' || payload.base_price == null ? null : Number(payload.base_price),
    remark: String(payload.remark || '').trim(),
    reviewer: String(payload.reviewer || '').trim(),
    review_date: String(payload.review_date || new Date().toISOString().slice(0, 10)).trim()
  };
  if (!data.style_code) throw new Error('款式编码不能为空');
  if (data.base_price !== null && !Number.isFinite(data.base_price)) throw new Error('基本售价格式不正确');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.review_date)) throw new Error('评审日期格式应为 YYYY-MM-DD');
  let total = 0;
  for (const field of SCORE_FIELDS) {
    data[field] = toScore(payload[field], field);
    total += data[field];
  }
  data.total_score = total;
  data.grade = gradeByScore(total);
  return data;
}

async function getById(DB, id) {
  return DB.prepare('SELECT * FROM review_items WHERE id = ?').bind(id).first();
}

async function addHistory(DB, itemId, action, snapshot) {
  await DB.prepare('INSERT INTO review_item_history (item_id, action, snapshot_json) VALUES (?, ?, ?)')
    .bind(itemId, action, JSON.stringify(snapshot || {}))
    .run();
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const keyword = (url.searchParams.get('search') || '').trim();
  const dateFrom = (url.searchParams.get('date_from') || '').trim();
  const dateTo = (url.searchParams.get('date_to') || '').trim();

  const where = ['deleted_at IS NULL'];
  const binds = [];
  if (keyword) {
    where.push('(style_code LIKE ? OR season LIKE ? OR reviewer LIKE ? OR remark LIKE ?)');
    const like = `%${keyword}%`;
    binds.push(like, like, like, like);
  }
  if (dateFrom) {
    where.push('review_date >= ?');
    binds.push(dateFrom);
  }
  if (dateTo) {
    where.push('review_date <= ?');
    binds.push(dateTo);
  }

  const sql = `SELECT * FROM review_items WHERE ${where.join(' AND ')} ORDER BY review_date DESC, id DESC LIMIT 500`;
  const { results } = await env.DB.prepare(sql).bind(...binds).all();
  return json({ ok: true, items: results || [] });
}

export async function onRequestPost({ request, env }) {
  let payload = {};
  try {
    payload = await request.json();
    const data = normalizePayload(payload);
    const result = await env.DB.prepare(`
      INSERT INTO review_items (
        product_image, style_code, season, base_price,
        appearance_score, material_score, craftsmanship_score, capacity_score, comfort_score,
        total_score, grade, remark, reviewer, review_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      data.product_image, data.style_code, data.season, data.base_price,
      data.appearance_score, data.material_score, data.craftsmanship_score, data.capacity_score, data.comfort_score,
      data.total_score, data.grade, data.remark, data.reviewer, data.review_date
    ).run();

    const id = result.meta.last_row_id;
    const item = await getById(env.DB, id);
    await addHistory(env.DB, id, 'create', item);
    return json({ ok: true, item }, 201);
  } catch (e) {
    return json({ ok: false, message: e.message || '保存失败' }, 400);
  }
}
