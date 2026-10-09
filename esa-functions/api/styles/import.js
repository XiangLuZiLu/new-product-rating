import { normalizeStylePayload } from '../../_shared/storage.js';

// ESA EdgeKV currently permits 8 KV fetch calls per Functions invocation.
// Each request below uses at most 7 calls (scan), 6 (write), or 2 (commit).
const MAX_SCAN_ROWS = 6;
const MAX_WRITE_ROWS = 3;
const MAX_IMPORT_ROWS = 1000;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });
}

const cleanText = value => String(value ?? '').trim();
const codeKey = value => cleanText(value).toLowerCase();
function normalizePrice(value) {
  const raw = cleanText(value).replace(/[￥¥,，\s]/g, '');
  const match = raw.match(/-?\d+(?:\.\d+)?/);
  return match ? match[0] : '';
}

function normalizeItem(row) {
  const style_code = cleanText(row?.style_code ?? row?.['款式编码'] ?? row?.code ?? row?.sku);
  if (!style_code) throw Object.assign(new Error('款式编码不能为空'), { status: 400 });
  return {
    style_code,
    season: cleanText(row?.season ?? row?.['季节'] ?? ''),
    base_price: normalizePrice(row?.base_price ?? row?.['基本售价'] ?? row?.price ?? ''),
    existing_id: cleanText(row?.existing_id)
  };
}

// A stable ID makes retrying a partially written batch idempotent.
// Collisions are never overwritten silently: each write checks style_code.
function stableImportId(styleCode) {
  const str = codeKey(styleCode);
  const seeds = [0x811c9dc5, 0x9e3779b9, 0x165667b1, 0x27d4eb2f];
  let hashes = seeds.slice();
  for (let i = 0; i < str.length; i += 1) {
    const c = str.charCodeAt(i);
    for (let j = 0; j < hashes.length; j += 1) {
      hashes[j] = Math.imul(hashes[j] ^ (c + j * 131), 0x01000193) >>> 0;
      hashes[j] ^= hashes[j] >>> 13;
    }
  }
  return 'import_' + hashes.map(h => h.toString(16).padStart(8, '0')).join('');
}

function edgeStore(env) {
  const Class = globalThis.EdgeKV || env.EdgeKV;
  if (typeof Class !== 'function') {
    throw Object.assign(new Error('ESA EdgeKV 运行时不可用'), { status: 500 });
  }
  const namespace = cleanText(env.ESA_KV_NAMESPACE || env.KV_NAMESPACE || 'product_review');
  const prefix = cleanText(env.KV_PREFIX || 'product-review_');
  const key = suffix => `${prefix}${suffix}`.replace(/[^a-zA-Z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 512);
  const kv = new Class({ namespace });
  let calls = 0;
  async function invoke(op, suffix, action) {
    calls += 1;
    if (calls > 8) throw Object.assign(new Error('ESA KV 请求预算超限（内部保护）'), { status: 503 });
    const k = key(suffix);
    try { return await action(k); }
    catch (error) {
      throw Object.assign(new Error(`${error?.message || error} [ESA KV #${calls} ${op} ${k}]`), { status: error?.status || 503 });
    }
  }
  return {
    async get(suffix) {
      const value = await invoke('GET', suffix, k => kv.get(k, { type: 'json' }));
      if (typeof value === 'string') {
        try { return JSON.parse(value); } catch { return null; }
      }
      return value ?? null;
    },
    async put(suffix, value) {
      return invoke('PUT', suffix, k => kv.put(k, JSON.stringify(value)));
    }
  };
}

async function scanRows(kv, body) {
  const offset = Number(body.offset);
  const limit = Number(body.limit ?? MAX_SCAN_ROWS);
  if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > MAX_SCAN_ROWS) {
    return json({ ok: false, message: '分页参数无效，每页最多读取 6 个款式' }, 400);
  }
  const ids = await kv.get('styles:index'); // 1 GET
  if (ids !== null && !Array.isArray(ids)) throw new Error('款式索引格式错误，请不要继续导入');
  const allIds = ids || [];
  const slice = allIds.slice(offset, offset + limit);
  const rows = await Promise.all(slice.map(id => kv.get(`style:${id}`))); // up to 6 GET
  return json({
    ok: true,
    mode: 'scan',
    total: allIds.length,
    offset,
    next_offset: offset + slice.length,
    rows: rows.filter(row => row && !row.deleted_at)
  });
}

async function writeRows(kv, body) {
  const raw = body.rows;
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > MAX_WRITE_ROWS) {
    return json({ ok: false, message: '每批只能写入 1～3 个款式' }, 400);
  }
  const input = raw.map(normalizeItem);
  if (new Set(input.map(item => codeKey(item.style_code))).size !== input.length) {
    return json({ ok: false, message: '同一批次存在重复款式编码' }, 400);
  }
  const output = [];
  const timestamp = new Date().toISOString();
  for (const item of input) {
    const id = item.existing_id || stableImportId(item.style_code);
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id)) {
      return json({ ok: false, message: '已有款式 ID 格式不正确' }, 400);
    }
    const existing = await kv.get(`style:${id}`); // 1 GET
    if (existing && (existing.deleted_at || codeKey(existing.style_code) !== codeKey(item.style_code))) {
      throw Object.assign(new Error(`款式 ${item.style_code} 已被删除或发生 ID 冲突，导入已停止`), { status: 409 });
    }
    if (item.existing_id && !existing) {
      throw Object.assign(new Error(`无法读取已有款式 ${item.style_code}，可能尚未完成 KV 同步，请稍后重试`), { status: 409 });
    }
    const updated = existing
      ? {
          ...existing,
          season: item.season,
          base_price: normalizeStylePayload({ style_code: existing.style_code, base_price: item.base_price }).base_price,
          updated_at: timestamp
        }
      : {
          id,
          ...normalizeStylePayload({
            product_image: '', style_code: item.style_code,
            season: item.season, base_price: item.base_price,
            style_remark: '', sort_order: 0, active: 1
          }),
          created_at: timestamp,
          updated_at: timestamp,
          deleted_at: null
        };
    await kv.put(`style:${id}`, updated); // 1 PUT: 3 rows = max 6 calls
    output.push({ id, style_code: updated.style_code, action: existing ? 'updated' : 'created' });
  }
  // Intentionally do not rewrite the shared styles:index on each tiny batch.
  // A single commit after all batches greatly reduces stale-index overwrites.
  return json({ ok: true, mode: 'write', rows: output,
    created_count: output.filter(r => r.action === 'created').length,
    updated_count: output.filter(r => r.action === 'updated').length });
}

async function commitRows(kv, body) {
  if (!Array.isArray(body.ids) || body.ids.length > 20000 || !body.ids.length) {
    return json({ ok: false, message: '提交款式索引需要非空的 ID 清单' }, 400);
  }
  const ids = Array.from(new Set(body.ids.map(v => cleanText(v))));
  if (ids.some(id => !/^[a-zA-Z0-9_-]{1,128}$/.test(id))) {
    return json({ ok: false, message: '款式 ID 格式有误' }, 400);
  }
  const before = await kv.get('styles:index'); // 1 GET
  if (before !== null && !Array.isArray(before)) throw new Error('款式索引格式错误，已停止提交');
  const merged = Array.from(new Set([...(before || []).map(String), ...ids]));
  if (new TextEncoder().encode(JSON.stringify(merged)).length > 1_650_000) {
    throw Object.assign(new Error('款式索引已接近单个 KV Value 容量限制，请迁移数据库'), { status: 507 });
  }
  await kv.put('styles:index', merged); // 1 PUT
  return json({ ok: true, mode: 'commit', committed_count: ids.length, total_index_count: merged.length,
    message: '索引写入完成；跨节点可见性受 ESA EdgeKV 最终一致性影响' });
}

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json().catch(() => ({}));
    const mode = body?.mode;
    if (!['scan', 'write', 'commit'].includes(mode)) {
      return json({ ok: false,
        message: '批量导入接口已升级，请刷新后台页面以加载新版脚本（旧版整批导入已禁用，防止 KV 超限）' }, 409);
    }
    if (mode === 'write' && Array.isArray(body.rows) && body.rows.length > MAX_IMPORT_ROWS) {
      return json({ ok: false, message: '一次最多导入 1000 个款式' }, 400);
    }
    const kv = edgeStore(env);
    if (mode === 'scan') return await scanRows(kv, body);
    if (mode === 'write') return await writeRows(kv, body);
    return await commitRows(kv, body);
  } catch (error) {
    return json({ ok: false, message: error?.message || '款式导入失败' }, error?.status || 500);
  }
}
