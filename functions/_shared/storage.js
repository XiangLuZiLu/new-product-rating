const SCORE_FIELDS = ['appearance_score', 'material_score', 'craftsmanship_score', 'capacity_score', 'comfort_score'];

export function gradeByScore(total) {
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

export function normalizePayload(payload = {}) {
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

function safeCount(value, fallback = 3) {
  const n = Number.parseInt(value, 10);
  return Math.max(1, Math.min(50, Number.isFinite(n) ? n : fallback));
}

function normalizeDriver(env) {
  return String(env.STORAGE_DRIVER || env.DATA_DRIVER || 'd1').trim().toLowerCase();
}

export function getStorage(env) {
  const driver = normalizeDriver(env);
  if (['http', 'external', 'api', 'custom'].includes(driver)) return createHttpStorage(env);
  return createD1Storage(env);
}

function requireD1(env) {
  if (!env.DB) {
    throw new Error('当前使用 D1 存储，但未绑定 D1 数据库。请配置 DB binding，或把 STORAGE_DRIVER 改为 http 并配置 STORAGE_API_URL。');
  }
  return env.DB;
}

function createD1Storage(env) {
  const DB = () => requireD1(env);

  function toD1Id(id) {
    const n = Number(id);
    if (!Number.isInteger(n)) {
      const error = new Error('ID 不正确');
      error.status = 400;
      throw error;
    }
    return n;
  }

  async function getById(id) {
    return DB().prepare('SELECT * FROM review_items WHERE id = ?').bind(toD1Id(id)).first();
  }

  async function addHistory(itemId, action, snapshot) {
    await DB().prepare('INSERT INTO review_item_history (item_id, action, snapshot_json) VALUES (?, ?, ?)')
      .bind(toD1Id(itemId), action, JSON.stringify(snapshot || {}))
      .run();
  }

  async function ensureSettingsTable() {
    await DB().prepare(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `).run();
  }

  return {
    async listItems(filters = {}) {
      const keyword = String(filters.search || '').trim();
      const dateFrom = String(filters.date_from || '').trim();
      const dateTo = String(filters.date_to || '').trim();

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

      const limit = Math.max(1, Math.min(5000, Number.parseInt(filters.limit || '500', 10) || 500));
      const sql = `SELECT * FROM review_items WHERE ${where.join(' AND ')} ORDER BY review_date DESC, id DESC LIMIT ${limit}`;
      const { results } = await DB().prepare(sql).bind(...binds).all();
      return results || [];
    },

    async createItem(data) {
      const result = await DB().prepare(`
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
      const item = await getById(id);
      await addHistory(id, 'create', item);
      return item;
    },

    async updateItem(id, data) {
      const oldItem = await getById(id);
      if (!oldItem || oldItem.deleted_at) {
        const error = new Error('记录不存在');
        error.status = 404;
        throw error;
      }

      await DB().prepare(`
        UPDATE review_items SET
          product_image = ?, style_code = ?, season = ?, base_price = ?,
          appearance_score = ?, material_score = ?, craftsmanship_score = ?, capacity_score = ?, comfort_score = ?,
          total_score = ?, grade = ?, remark = ?, reviewer = ?, review_date = ?, updated_at = datetime('now')
        WHERE id = ? AND deleted_at IS NULL
      `).bind(
        data.product_image, data.style_code, data.season, data.base_price,
        data.appearance_score, data.material_score, data.craftsmanship_score, data.capacity_score, data.comfort_score,
        data.total_score, data.grade, data.remark, data.reviewer, data.review_date, toD1Id(id)
      ).run();

      const item = await getById(id);
      await addHistory(id, 'update', { before: oldItem, after: item });
      return item;
    },

    async deleteItem(id) {
      const oldItem = await getById(id);
      if (!oldItem || oldItem.deleted_at) {
        const error = new Error('记录不存在');
        error.status = 404;
        throw error;
      }

      await DB().prepare("UPDATE review_items SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ? AND deleted_at IS NULL")
        .bind(toD1Id(id))
        .run();
      await addHistory(id, 'delete', oldItem);
      return true;
    },

    async getHistory(id) {
      const { results } = await DB().prepare('SELECT id, item_id, action, snapshot_json, changed_at FROM review_item_history WHERE item_id = ? ORDER BY id DESC LIMIT 100')
        .bind(toD1Id(id))
        .all();
      return results || [];
    },

    async getScorePageCount() {
      await ensureSettingsTable();
      const row = await DB().prepare("SELECT value FROM app_settings WHERE key = 'score_page_count'").first();
      return safeCount(row?.value || '3', 3);
    },

    async setScorePageCount(count) {
      await ensureSettingsTable();
      const value = safeCount(count, 1);
      await DB().prepare(`
        INSERT INTO app_settings (key, value, updated_at)
        VALUES ('score_page_count', ?, datetime('now'))
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
      `).bind(String(value)).run();
      return value;
    }
  };
}

function createHttpStorage(env) {
  const baseUrl = String(env.STORAGE_API_URL || '').trim().replace(/\/$/, '');
  const token = String(env.STORAGE_API_TOKEN || '').trim();
  if (!baseUrl) throw new Error('当前使用自定义 HTTP 存储，但未配置 STORAGE_API_URL');

  async function call(path, options = {}, query = {}) {
    const url = new URL(baseUrl + path);
    for (const [key, value] of Object.entries(query || {})) {
      if (value !== undefined && value !== null && String(value) !== '') url.searchParams.set(key, String(value));
    }

    const headers = { accept: 'application/json', ...(options.headers || {}) };
    if (token) headers.authorization = `Bearer ${token}`;
    if (options.body && !headers['content-type']) headers['content-type'] = 'application/json; charset=utf-8';

    const response = await fetch(url.toString(), { ...options, headers });
    const contentType = response.headers.get('content-type') || '';
    const body = contentType.includes('application/json') ? await response.json() : await response.text();
    if (!response.ok || (body && typeof body === 'object' && body.ok === false)) {
      const message = typeof body === 'object' ? body.message : body;
      const error = new Error(message || `自定义存储接口请求失败：${response.status}`);
      error.status = response.status;
      throw error;
    }
    return body;
  }

  return {
    async listItems(filters = {}) {
      const data = await call('/items', {}, filters);
      return data.items || data.results || [];
    },

    async createItem(data) {
      const result = await call('/items', { method: 'POST', body: JSON.stringify(data) });
      return result.item || result.data || result;
    },

    async updateItem(id, data) {
      const result = await call(`/items/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(data) });
      return result.item || result.data || result;
    },

    async deleteItem(id) {
      await call(`/items/${encodeURIComponent(id)}`, { method: 'DELETE' });
      return true;
    },

    async getHistory(id) {
      const result = await call(`/items/${encodeURIComponent(id)}/history`);
      return result.history || result.results || [];
    },

    async getScorePageCount() {
      const result = await call('/settings');
      return safeCount(result.settings?.score_page_count ?? result.score_page_count ?? 3, 3);
    },

    async setScorePageCount(count) {
      const value = safeCount(count, 1);
      const result = await call('/settings', {
        method: 'PUT',
        body: JSON.stringify({ score_page_count: value })
      });
      return safeCount(result.settings?.score_page_count ?? result.score_page_count ?? value, value);
    }
  };
}
