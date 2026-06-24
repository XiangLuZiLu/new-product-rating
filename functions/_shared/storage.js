export const DEFAULT_SCORE_FIELDS = [
  { id: 'appearance', key: 'appearance_score', label: '外观设计', max_score: 10 },
  { id: 'material', key: 'material_score', label: '材质触感', max_score: 10 },
  { id: 'craftsmanship', key: 'craftsmanship_score', label: '工艺细节', max_score: 10 },
  { id: 'capacity', key: 'capacity_score', label: '容量收纳', max_score: 10 },
  { id: 'comfort', key: 'comfort_score', label: '背负舒适度', max_score: 10 }
];


export const DEFAULT_IMAGE_SETTINGS = {
  driver: 'url',
  image_max_size_mb: 10,
  image_key_prefix: 'review-images',
  public_image_base_url: '',
  s3_endpoint: '',
  s3_bucket: '',
  s3_region: 'us-east-1',
  s3_access_key_id: '',
  s3_secret_access_key: '',
  s3_force_path_style: true
};

function normalizeImageDriverValue(value) {
  const raw = String(value || 'url').trim().toLowerCase();
  if (['r2', 'cloudflare-r2'].includes(raw)) return 'r2';
  if (['s3', 'oss', 'cos', 'minio', 'qiniu', 'qiniu-s3', 'aws-s3'].includes(raw)) return 's3';
  return 'url';
}

function normalizeImageMaxSize(value) {
  const n = Number(value ?? 10);
  return Math.max(1, Math.min(50, Number.isFinite(n) ? Math.round(n) : 10));
}

function normalizeBoolSetting(value, fallback = true) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const text = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'on'].includes(text)) return true;
  if (['false', '0', 'no', 'n', 'off'].includes(text)) return false;
  return fallback;
}

export function imageSettingsFromEnv(env = {}) {
  return normalizeImageSettings({
    driver: env.IMAGE_STORAGE_DRIVER || env.IMAGE_DRIVER || 'url',
    image_max_size_mb: env.IMAGE_MAX_SIZE_MB || 10,
    image_key_prefix: env.IMAGE_KEY_PREFIX || 'review-images',
    public_image_base_url: env.PUBLIC_IMAGE_BASE_URL || env.R2_PUBLIC_BASE_URL || env.IMAGE_PUBLIC_BASE_URL || env.S3_PUBLIC_BASE_URL || env.OSS_PUBLIC_BASE_URL || '',
    s3_endpoint: env.S3_ENDPOINT || env.OSS_ENDPOINT || env.IMAGE_S3_ENDPOINT || '',
    s3_bucket: env.S3_BUCKET || env.OSS_BUCKET || env.IMAGE_S3_BUCKET || '',
    s3_region: env.S3_REGION || env.OSS_REGION || 'us-east-1',
    s3_access_key_id: env.S3_ACCESS_KEY_ID || env.OSS_ACCESS_KEY_ID || '',
    s3_secret_access_key: env.S3_SECRET_ACCESS_KEY || env.OSS_SECRET_ACCESS_KEY || '',
    s3_force_path_style: env.S3_FORCE_PATH_STYLE ?? true
  });
}

export function normalizeImageSettings(value = {}, previous = DEFAULT_IMAGE_SETTINGS) {
  let input = value;
  if (typeof value === 'string') {
    try { input = JSON.parse(value); } catch { input = {}; }
  }
  if (!input || typeof input !== 'object') input = {};
  let prev = previous;
  if (typeof previous === 'string') {
    try { prev = JSON.parse(previous); } catch { prev = DEFAULT_IMAGE_SETTINGS; }
  }
  if (!prev || typeof prev !== 'object') prev = DEFAULT_IMAGE_SETTINGS;
  const keepSecretTokens = new Set(['********', '••••••••', '__KEEP__', '__SECRET_SET__']);
  const secretInput = input.s3_secret_access_key ?? input.S3_SECRET_ACCESS_KEY ?? input.oss_secret_access_key;
  const secret = secretInput === undefined || keepSecretTokens.has(String(secretInput))
    ? String(prev.s3_secret_access_key || '')
    : String(secretInput || '').trim();
  return {
    driver: normalizeImageDriverValue(input.driver ?? input.image_storage_driver ?? input.IMAGE_STORAGE_DRIVER ?? prev.driver),
    image_max_size_mb: normalizeImageMaxSize(input.image_max_size_mb ?? input.max_size_mb ?? input.IMAGE_MAX_SIZE_MB ?? prev.image_max_size_mb),
    image_key_prefix: String(input.image_key_prefix ?? input.key_prefix ?? input.IMAGE_KEY_PREFIX ?? prev.image_key_prefix ?? 'review-images').trim().replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'review-images',
    public_image_base_url: String(input.public_image_base_url ?? input.public_base_url ?? input.PUBLIC_IMAGE_BASE_URL ?? input.S3_PUBLIC_BASE_URL ?? prev.public_image_base_url ?? '').trim().replace(/\/+$/, ''),
    s3_endpoint: String(input.s3_endpoint ?? input.S3_ENDPOINT ?? input.oss_endpoint ?? prev.s3_endpoint ?? '').trim().replace(/\/+$/, ''),
    s3_bucket: String(input.s3_bucket ?? input.S3_BUCKET ?? input.oss_bucket ?? prev.s3_bucket ?? '').trim(),
    s3_region: String(input.s3_region ?? input.S3_REGION ?? input.oss_region ?? prev.s3_region ?? 'us-east-1').trim() || 'us-east-1',
    s3_access_key_id: String(input.s3_access_key_id ?? input.S3_ACCESS_KEY_ID ?? input.oss_access_key_id ?? prev.s3_access_key_id ?? '').trim(),
    s3_secret_access_key: secret,
    s3_force_path_style: normalizeBoolSetting(input.s3_force_path_style ?? input.S3_FORCE_PATH_STYLE ?? prev.s3_force_path_style, true)
  };
}

const LEGACY_KEYS = DEFAULT_SCORE_FIELDS.map(item => item.key);
const LEGACY_KEY_BY_ID = Object.fromEntries(DEFAULT_SCORE_FIELDS.map(item => [item.id, item.key]));
const LEGACY_ID_BY_KEY = Object.fromEntries(DEFAULT_SCORE_FIELDS.map(item => [item.key, item.id]));
const LEGACY_LABEL_BY_ID = Object.fromEntries(DEFAULT_SCORE_FIELDS.map(item => [item.id, item.label]));

export function gradeByScore(total, maxTotal = 50) {
  const max = Number(maxTotal);
  const rate = Number.isFinite(max) && max > 0 ? Number(total || 0) / max : 0;
  if (rate >= 0.8) return '大单';
  if (rate >= 0.6) return '中单';
  if (rate >= 0.4) return '小单试水';
  return '建议不下';
}

function toIntId(value, label = 'ID') {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    const error = new Error(`${label} 不正确`);
    error.status = 400;
    throw error;
  }
  return n;
}

function normalizeMaxScore(value) {
  const n = Number.parseInt(value ?? 10, 10);
  if (!Number.isFinite(n) || n <= 0) return 10;
  return Math.max(1, Math.min(100, n));
}

function toScore(value, label, maxScore = 10) {
  const max = normalizeMaxScore(maxScore);
  const n = Number(value ?? 0);
  if (!Number.isInteger(n) || n < 0 || n > max) throw new Error(`${label} 必须是 0-${max} 的整数`);
  return n;
}

function toRequiredScore(value, label, maxScore = 10) {
  return toScore(value, label, maxScore);
}

function toPrice(value) {
  if (value === '' || value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new Error('基本售价格式不正确');
  return n;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function nowDateTime() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function newSubmissionId() {
  return (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function')
    ? globalThis.crypto.randomUUID()
    : `submission_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function normalizeDriver(env) {
  return String(env.STORAGE_DRIVER || env.DATA_DRIVER || 'd1').trim().toLowerCase();
}

function makeFieldId(value, index) {
  const raw = String(value || '').trim();
  const normalized = raw
    .replace(/_score$/i, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
  return normalized || `field_${index + 1}`;
}

export function normalizeScoreFields(value) {
  let list = value;
  if (typeof value === 'string') {
    try { list = JSON.parse(value); } catch { list = null; }
  }
  if (!Array.isArray(list)) list = DEFAULT_SCORE_FIELDS;

  const used = new Set();
  const fields = [];
  for (let i = 0; i < list.length; i++) {
    const item = list[i] || {};
    const label = String(item.label || item.name || '').trim();
    if (!label) continue;
    let id = makeFieldId(item.id || LEGACY_ID_BY_KEY[item.key] || item.key || label, i);
    let suffix = 2;
    const base = id;
    while (used.has(id)) id = `${base}_${suffix++}`;
    used.add(id);
    const max_score = normalizeMaxScore(item.max_score ?? item.maxScore ?? item.max ?? item.score_max ?? 10);
    fields.push({ id, label, max_score });
    if (fields.length >= 20) break;
  }
  return fields.length ? fields : DEFAULT_SCORE_FIELDS.map(({ id, label, max_score }) => ({ id, label, max_score }));
}

export function normalizeStylePayload(payload = {}) {
  const data = {
    product_image: String(payload.product_image || '').trim(),
    style_code: String(payload.style_code || '').trim(),
    season: String(payload.season || '').trim(),
    base_price: toPrice(payload.base_price),
    style_remark: String(payload.style_remark || payload.remark || '').trim(),
    sort_order: Number.parseInt(payload.sort_order ?? '0', 10) || 0,
    active: payload.active === false || payload.active === 0 || payload.active === '0' ? 0 : 1
  };
  if (!data.style_code) throw new Error('款式编码不能为空');
  return data;
}

function getScoreValueFromPayload(payload, field) {
  if (payload?.scores && Object.prototype.hasOwnProperty.call(payload.scores, field.id)) return payload.scores[field.id];
  if (payload?.score_values && Object.prototype.hasOwnProperty.call(payload.score_values, field.id)) return payload.score_values[field.id];
  if (Object.prototype.hasOwnProperty.call(payload, field.id)) return payload[field.id];
  const legacyKey = LEGACY_KEY_BY_ID[field.id] || field.key;
  if (legacyKey && Object.prototype.hasOwnProperty.call(payload, legacyKey)) return payload[legacyKey];
  if (Object.prototype.hasOwnProperty.call(payload, `${field.id}_score`)) return payload[`${field.id}_score`];
  return field.score ?? 0;
}

function fieldsFromPayloadOrDefault(payload, scoreFields) {
  const configured = normalizeScoreFields(scoreFields);
  if (configured.length) return configured;
  if (Array.isArray(payload.score_items) && payload.score_items.length) {
    return normalizeScoreFields(payload.score_items.map(item => ({ id: item.id, label: item.label || item.name, max_score: item.max_score ?? item.maxScore ?? item.max })));
  }
  return configured;
}

export function normalizeScorePayload(payload = {}, scoreFields = DEFAULT_SCORE_FIELDS) {
  const fields = fieldsFromPayloadOrDefault(payload, scoreFields);
  const data = {
    style_id: toIntId(payload.style_id, '款式ID'),
    reviewer: String(payload.reviewer || '').trim(),
    review_date: String(payload.review_date || today()).trim(),
    remark: String(payload.remark || '').trim(),
    submission_id: String(payload.submission_id || '').trim(),
    submitted_at: String(payload.submitted_at || '').trim()
  };
  if (!data.reviewer) throw new Error('评分人姓名不能为空');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.review_date)) throw new Error('评审日期格式应为 YYYY-MM-DD');

  let total = 0;
  let maxTotal = 0;
  const payloadItemsById = new Map((Array.isArray(payload.score_items) ? payload.score_items : []).map(item => [String(item.id || ''), item]));
  data.score_items = fields.map(field => {
    const source = payloadItemsById.get(field.id) || field;
    const max_score = normalizeMaxScore(field.max_score);
    const score = toRequiredScore(getScoreValueFromPayload(payload, { ...field, score: source.score }), field.label, max_score);
    total += score;
    maxTotal += max_score;
    return { id: field.id, label: field.label, score, max_score };
  });
  data.score_items_json = JSON.stringify(data.score_items);
  data.total_score = total;
  data.grade = gradeByScore(total, maxTotal);

  const legacy = legacyScoresFromItems(data.score_items);
  Object.assign(data, legacy);
  return data;
}

export function normalizeScoreUpdatePayload(payload = {}, scoreFields = DEFAULT_SCORE_FIELDS) {
  return normalizeScorePayload(payload, scoreFields);
}

function safeCount(value, fallback = 3) {
  const n = Number.parseInt(value, 10);
  return Math.max(1, Math.min(50, Number.isFinite(n) ? n : fallback));
}

export function getStorage(env) {
  const driver = normalizeDriver(env);
  if (['http', 'external', 'api', 'custom'].includes(driver)) return createHttpStorage(env);
  if (['kv', 'cloudflare-kv', 'workers-kv'].includes(driver)) return createKVStorage(env);
  return createD1Storage(env);
}

function requireD1(env) {
  if (!env.DB) throw new Error('当前使用 D1 存储，但未绑定 D1 数据库。请在 Cloudflare Pages 设置中绑定 D1，变量名必须是 DB。');
  return env.DB;
}

function rowActive(row) {
  return Number(row?.active ?? 1) === 1;
}

function legacyScoresFromItems(items = []) {
  const values = Object.fromEntries(LEGACY_KEYS.map(key => [key, 0]));
  for (const item of items) {
    const key = LEGACY_KEY_BY_ID[item.id];
    if (key) values[key] = Number(item.score || 0);
  }
  return values;
}

function parseScoreItems(row, fallbackFields = DEFAULT_SCORE_FIELDS) {
  if (!row) return [];
  if (row.score_items_json) {
    try {
      const items = JSON.parse(row.score_items_json);
      if (Array.isArray(items) && items.length) {
        return items.map((item, index) => ({
          id: makeFieldId(item.id || item.key || `field_${index + 1}`, index),
          label: String(item.label || item.name || LEGACY_LABEL_BY_ID[item.id] || `评分项${index + 1}`),
          score: Number(item.score || 0),
          max_score: normalizeMaxScore(item.max_score ?? item.maxScore ?? item.max ?? fallbackFields[index]?.max_score)
        }));
      }
    } catch {}
  }
  return normalizeScoreFields(fallbackFields).map(field => {
    const key = LEGACY_KEY_BY_ID[field.id] || field.key;
    return { id: field.id, label: field.label, score: key ? Number(row[key] || 0) : 0, max_score: normalizeMaxScore(field.max_score) };
  });
}

function attachScoreItems(row, fields) {
  if (!row) return row;
  const score_items = parseScoreItems(row, fields);
  return { ...row, score_items };
}

async function ensureD1Column(db, table, column, definition) {
  const { results } = await db.prepare(`PRAGMA table_info(${table})`).all();
  const exists = (results || []).some(row => row.name === column);
  if (!exists) await db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
}

function createD1Storage(env) {
  const DB = () => requireD1(env);

  async function ensureTables() {
    await DB().prepare(`
      CREATE TABLE IF NOT EXISTS review_styles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_image TEXT,
        style_code TEXT NOT NULL,
        season TEXT,
        base_price REAL,
        style_remark TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        deleted_at TEXT
      )
    `).run();
    await DB().prepare(`
      CREATE TABLE IF NOT EXISTS review_scores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        style_id INTEGER NOT NULL,
        product_image TEXT,
        style_code TEXT NOT NULL,
        season TEXT,
        base_price REAL,
        appearance_score INTEGER NOT NULL DEFAULT 0,
        material_score INTEGER NOT NULL DEFAULT 0,
        craftsmanship_score INTEGER NOT NULL DEFAULT 0,
        capacity_score INTEGER NOT NULL DEFAULT 0,
        comfort_score INTEGER NOT NULL DEFAULT 0,
        score_items_json TEXT,
        total_score INTEGER NOT NULL DEFAULT 0,
        grade TEXT,
        remark TEXT,
        reviewer TEXT NOT NULL,
        review_date TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        deleted_at TEXT,
        FOREIGN KEY(style_id) REFERENCES review_styles(id)
      )
    `).run();
    await ensureD1Column(DB(), 'review_scores', 'score_items_json', 'TEXT');
    await ensureD1Column(DB(), 'review_scores', 'submission_id', 'TEXT');
    await ensureD1Column(DB(), 'review_scores', 'submitted_at', 'TEXT');
    await DB().prepare(`
      CREATE TABLE IF NOT EXISTS review_score_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        score_id INTEGER NOT NULL,
        action TEXT NOT NULL,
        snapshot_json TEXT NOT NULL,
        changed_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY(score_id) REFERENCES review_scores(id)
      )
    `).run();
    await DB().prepare(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `).run();
  }

  async function getSetting(key, fallback = null) {
    await ensureTables();
    const row = await DB().prepare('SELECT value FROM app_settings WHERE key = ?').bind(key).first();
    return row?.value ?? fallback;
  }

  async function setSetting(key, value) {
    await ensureTables();
    await DB().prepare(`
      INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
    `).bind(key, String(value)).run();
  }

  async function getScoreFields() {
    const value = await getSetting('score_fields', JSON.stringify(DEFAULT_SCORE_FIELDS));
    return normalizeScoreFields(value);
  }

  async function getStyleById(id) {
    await ensureTables();
    return DB().prepare('SELECT * FROM review_styles WHERE id = ? AND deleted_at IS NULL').bind(toIntId(id, '款式ID')).first();
  }

  async function getScoreById(id) {
    await ensureTables();
    const row = await DB().prepare('SELECT * FROM review_scores WHERE id = ? AND deleted_at IS NULL').bind(toIntId(id, '评分ID')).first();
    return attachScoreItems(row, await getScoreFields());
  }

  async function addScoreHistory(scoreId, action, snapshot) {
    await ensureTables();
    await DB().prepare('INSERT INTO review_score_history (score_id, action, snapshot_json) VALUES (?, ?, ?)')
      .bind(toIntId(scoreId, '评分ID'), action, JSON.stringify(snapshot || {}))
      .run();
  }

  return {
    async listStyles(filters = {}) {
      await ensureTables();
      const where = ['deleted_at IS NULL'];
      const binds = [];
      const keyword = String(filters.search || '').trim();
      if (filters.activeOnly) where.push('active = 1');
      if (keyword) {
        where.push('(style_code LIKE ? OR season LIKE ? OR style_remark LIKE ?)');
        const like = `%${keyword}%`;
        binds.push(like, like, like);
      }
      const sql = `SELECT * FROM review_styles WHERE ${where.join(' AND ')} ORDER BY id ASC`;
      const { results } = await DB().prepare(sql).bind(...binds).all();
      return results || [];
    },

    async createStyle(data) {
      await ensureTables();
      const result = await DB().prepare(`
        INSERT INTO review_styles (product_image, style_code, season, base_price, style_remark, sort_order, active)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(data.product_image, data.style_code, data.season, data.base_price, data.style_remark, data.sort_order, data.active).run();
      return getStyleById(result.meta.last_row_id);
    },

    async updateStyle(id, data) {
      await ensureTables();
      const old = await getStyleById(id);
      if (!old) { const error = new Error('款式不存在'); error.status = 404; throw error; }
      await DB().prepare(`
        UPDATE review_styles SET product_image = ?, style_code = ?, season = ?, base_price = ?, style_remark = ?, sort_order = ?, active = ?, updated_at = datetime('now')
        WHERE id = ? AND deleted_at IS NULL
      `).bind(data.product_image, data.style_code, data.season, data.base_price, data.style_remark, data.sort_order, data.active, toIntId(id, '款式ID')).run();
      return getStyleById(id);
    },

    async deleteStyle(id) {
      await ensureTables();
      const old = await getStyleById(id);
      if (!old) { const error = new Error('款式不存在'); error.status = 404; throw error; }
      await DB().prepare("UPDATE review_styles SET deleted_at = datetime('now'), updated_at = datetime('now'), active = 0 WHERE id = ? AND deleted_at IS NULL")
        .bind(toIntId(id, '款式ID')).run();
      return true;
    },

    async createScore(data) {
      await ensureTables();
      const style = await getStyleById(data.style_id);
      if (!style || !rowActive(style)) { const error = new Error('该款式不存在或未启用评分'); error.status = 404; throw error; }
      const result = await DB().prepare(`
        INSERT INTO review_scores (
          style_id, product_image, style_code, season, base_price,
          appearance_score, material_score, craftsmanship_score, capacity_score, comfort_score, score_items_json,
          total_score, grade, remark, reviewer, review_date, submission_id, submitted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        style.id, style.product_image || '', style.style_code, style.season || '', style.base_price,
        data.appearance_score, data.material_score, data.craftsmanship_score, data.capacity_score, data.comfort_score, data.score_items_json,
        data.total_score, data.grade, data.remark, data.reviewer, data.review_date,
        data.submission_id || newSubmissionId(), data.submitted_at || nowDateTime()
      ).run();
      const score = await getScoreById(result.meta.last_row_id);
      await addScoreHistory(score.id, 'create', score);
      return score;
    },

    async listScores(filters = {}) {
      await ensureTables();
      const where = ['deleted_at IS NULL'];
      const binds = [];
      const keyword = String(filters.search || '').trim();
      const dateFrom = String(filters.date_from || '').trim();
      const dateTo = String(filters.date_to || '').trim();
      if (keyword) {
        where.push('(style_code LIKE ? OR season LIKE ? OR reviewer LIKE ? OR remark LIKE ?)');
        const like = `%${keyword}%`;
        binds.push(like, like, like, like);
      }
      if (dateFrom) { where.push('review_date >= ?'); binds.push(dateFrom); }
      if (dateTo) { where.push('review_date <= ?'); binds.push(dateTo); }
      const limit = Math.max(1, Math.min(10000, Number.parseInt(filters.limit || '1000', 10) || 1000));
      const sql = `SELECT * FROM review_scores WHERE ${where.join(' AND ')} ORDER BY review_date DESC, id DESC LIMIT ${limit}`;
      const { results } = await DB().prepare(sql).bind(...binds).all();
      const fields = await getScoreFields();
      return (results || []).map(row => attachScoreItems(row, fields));
    },

    async updateScore(id, data) {
      await ensureTables();
      const old = await getScoreById(id);
      if (!old) { const error = new Error('评分记录不存在'); error.status = 404; throw error; }
      const style = await getStyleById(data.style_id || old.style_id);
      if (!style) throw new Error('关联款式不存在');
      await DB().prepare(`
        UPDATE review_scores SET
          style_id = ?, product_image = ?, style_code = ?, season = ?, base_price = ?,
          appearance_score = ?, material_score = ?, craftsmanship_score = ?, capacity_score = ?, comfort_score = ?, score_items_json = ?,
          total_score = ?, grade = ?, remark = ?, reviewer = ?, review_date = ?, updated_at = datetime('now')
        WHERE id = ? AND deleted_at IS NULL
      `).bind(
        style.id, style.product_image || '', style.style_code, style.season || '', style.base_price,
        data.appearance_score, data.material_score, data.craftsmanship_score, data.capacity_score, data.comfort_score, data.score_items_json,
        data.total_score, data.grade, data.remark, data.reviewer, data.review_date, toIntId(id, '评分ID')
      ).run();
      const score = await getScoreById(id);
      await addScoreHistory(id, 'update', { before: old, after: score });
      return score;
    },

    async deleteScore(id) {
      await ensureTables();
      const old = await getScoreById(id);
      if (!old) { const error = new Error('评分记录不存在'); error.status = 404; throw error; }
      await DB().prepare("UPDATE review_scores SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ? AND deleted_at IS NULL")
        .bind(toIntId(id, '评分ID')).run();
      await addScoreHistory(id, 'delete', old);
      return true;
    },

    async getScoreHistory(id) {
      await ensureTables();
      const { results } = await DB().prepare('SELECT id, score_id, action, snapshot_json, changed_at FROM review_score_history WHERE score_id = ? ORDER BY id DESC LIMIT 100')
        .bind(toIntId(id, '评分ID')).all();
      return results || [];
    },

    async getScorePageCount() {
      const row = await getSetting('score_page_count', '3');
      return safeCount(row, 3);
    },

    async setScorePageCount(count) {
      const value = safeCount(count, 1);
      await setSetting('score_page_count', String(value));
      return value;
    },

    async getScoreFields() { return getScoreFields(); },

    async setScoreFields(fields) {
      const normalized = normalizeScoreFields(fields);
      await setSetting('score_fields', JSON.stringify(normalized));
      return normalized;
    },

    async getImageSettings() {
      const value = await getSetting('image_storage_settings', null);
      return normalizeImageSettings(value || {}, imageSettingsFromEnv(env));
    },

    async setImageSettings(settings) {
      const currentValue = await getSetting('image_storage_settings', null);
      const current = normalizeImageSettings(currentValue || {}, imageSettingsFromEnv(env));
      const normalized = normalizeImageSettings(settings, current);
      await setSetting('image_storage_settings', JSON.stringify(normalized));
      return normalized;
    }
  };
}

function createKVStorage(env) {
  const kv = env.KV || env.REVIEW_KV || env.DATA_KV;
  if (!kv || typeof kv.get !== 'function') throw new Error('当前使用 KV 存储，但未绑定 KV namespace。变量名建议为 KV。');
  const prefix = String(env.KV_PREFIX || 'product-review:').trim() || 'product-review:';
  const now = () => new Date().toISOString();
  const key = (name) => `${prefix}${name}`;
  const keyStyle = (id) => key(`style:${id}`);
  const keyScore = (id) => key(`score:${id}`);
  const keyScoreHistory = (id) => key(`score-history:${id}`);

  async function getJson(k, fallback) {
    const value = await kv.get(k, { type: 'json' });
    return value ?? fallback;
  }
  async function putJson(k, value) { await kv.put(k, JSON.stringify(value)); }
  async function getIndex(name) {
    const value = await getJson(key(`${name}:index`), []);
    return Array.isArray(value) ? value : [];
  }
  async function setIndex(name, ids) { await putJson(key(`${name}:index`), Array.from(new Set(ids.map(String)))); }
  async function getSettings() { return getJson(key('settings'), {}); }
  async function setSettings(settings) { await putJson(key('settings'), settings); }
  async function getStyleById(id) { return id ? getJson(keyStyle(String(id)), null) : null; }
  async function getScoreById(id) {
    const row = id ? await getJson(keyScore(String(id)), null) : null;
    return attachScoreItems(row, await getScoreFields());
  }
  async function getScoreFields() {
    const s = await getSettings();
    return normalizeScoreFields(s.score_fields || DEFAULT_SCORE_FIELDS);
  }
  async function addScoreHistory(scoreId, action, snapshot) {
    const id = String(scoreId);
    const list = await getJson(keyScoreHistory(id), []);
    list.unshift({ id: crypto.randomUUID(), score_id: id, action, snapshot_json: JSON.stringify(snapshot || {}), changed_at: now() });
    await putJson(keyScoreHistory(id), list.slice(0, 100));
  }

  return {
    async listStyles(filters = {}) {
      const ids = await getIndex('styles');
      const keyword = String(filters.search || '').trim().toLowerCase();
      const rows = (await Promise.all(ids.map(getStyleById))).filter(row => row && !row.deleted_at);
      return rows
        .filter(row => !filters.activeOnly || Number(row.active ?? 1) === 1)
        .filter(row => !keyword || [row.style_code, row.season, row.style_remark].some(v => String(v || '').toLowerCase().includes(keyword)))
        .sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')) || String(a.id).localeCompare(String(b.id)));
    },
    async createStyle(data) {
      const id = crypto.randomUUID();
      const row = { id, ...data, created_at: now(), updated_at: now(), deleted_at: null };
      await putJson(keyStyle(id), row);
      const ids = await getIndex('styles');
      await setIndex('styles', [...ids, id]);
      return row;
    },
    async updateStyle(id, data) {
      const old = await getStyleById(id);
      if (!old || old.deleted_at) throw new Error('款式不存在');
      const row = { ...old, ...data, updated_at: now() };
      await putJson(keyStyle(String(id)), row);
      return row;
    },
    async deleteStyle(id) {
      const old = await getStyleById(id);
      if (!old || old.deleted_at) throw new Error('款式不存在');
      await putJson(keyStyle(String(id)), { ...old, active: 0, deleted_at: now(), updated_at: now() });
      return true;
    },
    async createScore(data) {
      const style = await getStyleById(data.style_id);
      if (!style || style.deleted_at || Number(style.active ?? 1) !== 1) throw new Error('该款式不存在或未启用评分');
      const id = crypto.randomUUID();
      const row = {
        id,
        ...data,
        submission_id: data.submission_id || newSubmissionId(),
        submitted_at: data.submitted_at || now(),
        style_id: style.id,
        product_image: style.product_image || '',
        style_code: style.style_code,
        season: style.season || '',
        base_price: style.base_price,
        created_at: now(), updated_at: now(), deleted_at: null
      };
      await putJson(keyScore(id), row);
      const ids = await getIndex('scores');
      await setIndex('scores', [id, ...ids]);
      await addScoreHistory(id, 'create', row);
      return attachScoreItems(row, await getScoreFields());
    },
    async listScores(filters = {}) {
      const ids = await getIndex('scores');
      const keyword = String(filters.search || '').trim().toLowerCase();
      const dateFrom = String(filters.date_from || '');
      const dateTo = String(filters.date_to || '');
      const fields = await getScoreFields();
      const rows = (await Promise.all(ids.map(getScoreById))).filter(row => row && !row.deleted_at);
      return rows
        .map(row => attachScoreItems(row, fields))
        .filter(row => !keyword || [row.style_code, row.season, row.reviewer, row.remark].some(v => String(v || '').toLowerCase().includes(keyword)))
        .filter(row => !dateFrom || String(row.review_date || '') >= dateFrom)
        .filter(row => !dateTo || String(row.review_date || '') <= dateTo)
        .sort((a, b) => String(b.review_date || '').localeCompare(String(a.review_date || '')) || String(b.created_at || '').localeCompare(String(a.created_at || '')));
    },
    async updateScore(id, data) {
      const old = await getScoreById(id);
      if (!old || old.deleted_at) throw new Error('评分记录不存在');
      const style = await getStyleById(data.style_id || old.style_id);
      if (!style) throw new Error('关联款式不存在');
      const row = { ...old, ...data, style_id: style.id, product_image: style.product_image || '', style_code: style.style_code, season: style.season || '', base_price: style.base_price, updated_at: now() };
      await putJson(keyScore(String(id)), row);
      await addScoreHistory(id, 'update', { before: old, after: row });
      return attachScoreItems(row, await getScoreFields());
    },
    async deleteScore(id) {
      const old = await getScoreById(id);
      if (!old || old.deleted_at) throw new Error('评分记录不存在');
      await putJson(keyScore(String(id)), { ...old, deleted_at: now(), updated_at: now() });
      await addScoreHistory(id, 'delete', old);
      return true;
    },
    async getScoreHistory(id) { return getJson(keyScoreHistory(String(id)), []); },
    async getScorePageCount() { const s = await getSettings(); return safeCount(s.score_page_count || '3', 3); },
    async setScorePageCount(count) { const s = await getSettings(); s.score_page_count = safeCount(count, 1); await setSettings(s); return s.score_page_count; },
    async getScoreFields() { return getScoreFields(); },
    async setScoreFields(fields) { const s = await getSettings(); s.score_fields = normalizeScoreFields(fields); await setSettings(s); return s.score_fields; },
    async getImageSettings() { const s = await getSettings(); return normalizeImageSettings(s.image_storage_settings || {}, imageSettingsFromEnv(env)); },
    async setImageSettings(settings) { const s = await getSettings(); const current = normalizeImageSettings(s.image_storage_settings || {}, imageSettingsFromEnv(env)); s.image_storage_settings = normalizeImageSettings(settings, current); await setSettings(s); return s.image_storage_settings; }
  };
}

function createHttpStorage(env) {
  const base = String(env.STORAGE_API_URL || '').replace(/\/+$/, '');
  const token = String(env.STORAGE_API_TOKEN || '');
  if (!base) throw new Error('当前使用 HTTP 自定义存储，但未配置 STORAGE_API_URL。');

  async function call(path, options = {}) {
    const headers = { 'content-type': 'application/json; charset=utf-8', ...(options.headers || {}) };
    if (token) headers.authorization = `Bearer ${token}`;
    const res = await fetch(`${base}${path}`, { ...options, headers });
    const data = await res.json().catch(() => null);
    if (!res.ok || data?.ok === false) throw new Error(data?.message || `自定义存储接口请求失败：${path}`);
    return data;
  }

  return {
    async listStyles(filters = {}) { const qs = new URLSearchParams(filters); return (await call(`/styles?${qs}`)).styles || []; },
    async createStyle(data) { return (await call('/styles', { method: 'POST', body: JSON.stringify(data) })).style; },
    async updateStyle(id, data) { return (await call(`/styles/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(data) })).style; },
    async deleteStyle(id) { await call(`/styles/${encodeURIComponent(id)}`, { method: 'DELETE' }); return true; },
    async createScore(data) { return (await call('/scores', { method: 'POST', body: JSON.stringify(data) })).score; },
    async listScores(filters = {}) { const qs = new URLSearchParams(filters); return (await call(`/scores?${qs}`)).scores || []; },
    async updateScore(id, data) { return (await call(`/scores/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(data) })).score; },
    async deleteScore(id) { await call(`/scores/${encodeURIComponent(id)}`, { method: 'DELETE' }); return true; },
    async getScoreHistory(id) { return (await call(`/scores/${encodeURIComponent(id)}/history`)).history || []; },
    async getScorePageCount() { return Number((await call('/settings')).settings?.score_page_count || 3); },
    async setScorePageCount(count) { return Number((await call('/settings', { method: 'PUT', body: JSON.stringify({ score_page_count: count }) })).settings?.score_page_count || count); },
    async getScoreFields() { return normalizeScoreFields((await call('/settings')).settings?.score_fields || DEFAULT_SCORE_FIELDS); },
    async setScoreFields(fields) { return normalizeScoreFields((await call('/settings', { method: 'PUT', body: JSON.stringify({ score_fields: normalizeScoreFields(fields) }) })).settings?.score_fields || fields); },
    async getImageSettings() { return normalizeImageSettings((await call('/settings')).settings?.image_settings || {}, imageSettingsFromEnv(env)); },
    async setImageSettings(settings) { return normalizeImageSettings((await call('/settings', { method: 'PUT', body: JSON.stringify({ image_settings: settings }) })).settings?.image_settings || settings, imageSettingsFromEnv(env)); }
  };
}
