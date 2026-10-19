import { DatabaseSync } from 'node:sqlite';
import { randomUUID, randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  DEFAULT_SCORE_TYPES, DEFAULT_SCORE_FIELDS, DEFAULT_GRADE_RULES, DEFAULT_IMAGE_SETTINGS,
  normalizeScoreTypes, normalizeScoreFields, normalizeGradeRules, normalizeImageSettings,
  imageSettingsFromEnv, normalizeScorePayload, normalizeStylePayload
} from './platform/_shared/storage.js';

const clean = value => String(value ?? '').trim();
const normalizeName = value => clean(value).replace(/\s+/g, ' ');
const normalizeCode = value => clean(value).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32);
const now = () => new Date(Date.now() + 8 * 3600000).toISOString().replace('T', ' ').slice(0, 19);
const today = () => now().slice(0, 10);
const parse = (raw, fallback = null) => { try { return JSON.parse(raw); } catch { return fallback; } };
const fail = (message, status = 400, code) => { const error = new Error(message); error.status = status; if (code) error.code = code; throw error; };
const obj = row => row ? parse(row.json, null) : null;
const scoreId = () => randomUUID();

let shared;
export function createSqliteStorage(env = {}) {
  const dbPath = resolve(String(env.DB_PATH || '/opt/new-product-rating/data/rating.sqlite'));
  if (shared?.path === dbPath) return shared.api;
  if (shared && shared.path !== dbPath) throw new Error('不允许在同一进程内切换 SQLite 数据库路径');
  mkdirSync(dirname(dbPath), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(dbPath, { timeout: 8000 });
  db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=8000; PRAGMA foreign_keys=ON;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS styles (
      id TEXT PRIMARY KEY, style_code TEXT NOT NULL, season TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL, deleted_at TEXT, json TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS ux_styles_code ON styles(style_code COLLATE NOCASE) WHERE deleted_at IS NULL;
    CREATE TABLE IF NOT EXISTS review_links (
      code TEXT PRIMARY KEY, created_at TEXT NOT NULL, deleted_at TEXT, json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS scores (
      id TEXT PRIMARY KEY, review_link_code TEXT NOT NULL, reviewer TEXT NOT NULL,
      review_date TEXT NOT NULL, style_id TEXT NOT NULL, created_at TEXT NOT NULL,
      deleted_at TEXT, json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS ix_scores_link ON scores(review_link_code, review_date DESC);
    CREATE INDEX IF NOT EXISTS ix_scores_deleted ON scores(deleted_at);
    CREATE TABLE IF NOT EXISTS score_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT, score_id TEXT NOT NULL, action TEXT NOT NULL,
      snapshot_json TEXT NOT NULL, changed_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY, value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS submissions (
      review_link_code TEXT NOT NULL, reviewer_key TEXT NOT NULL, review_date TEXT NOT NULL,
      submission_id TEXT NOT NULL UNIQUE, submitted_at TEXT NOT NULL,
      PRIMARY KEY(review_link_code, reviewer_key, review_date)
    );
    CREATE TABLE IF NOT EXISTS drafts (
      review_link_code TEXT NOT NULL, reviewer_key TEXT NOT NULL, draft_date TEXT NOT NULL,
      json TEXT NOT NULL, updated_at TEXT NOT NULL,
      PRIMARY KEY(review_link_code, reviewer_key, draft_date)
    );
    CREATE TABLE IF NOT EXISTS review_progress (
      review_link_code TEXT NOT NULL, reviewer_key TEXT NOT NULL, review_date TEXT NOT NULL,
      reviewer TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('in_progress', 'completed')),
      started_at TEXT NOT NULL, updated_at TEXT NOT NULL, submitted_at TEXT,
      PRIMARY KEY(review_link_code, reviewer_key, review_date)
    );
    CREATE INDEX IF NOT EXISTS ix_progress_code ON review_progress(review_link_code, updated_at DESC);
  `);
  const q = (sql, ...values) => db.prepare(sql).get(...values);
  const all = (sql, ...values) => db.prepare(sql).all(...values);
  const run = (sql, ...values) => db.prepare(sql).run(...values);
  function transaction(fn) {
    db.exec('BEGIN IMMEDIATE');
    try { const ret = fn(); db.exec('COMMIT'); return ret; }
    catch (e) { db.exec('ROLLBACK'); throw e; }
  }
  function getSetting(key, fallback) { return parse(q('SELECT value FROM app_settings WHERE key=?', key)?.value, fallback); }
  function setSetting(key, value) {
    run('INSERT INTO app_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', key, JSON.stringify(value));
    return value;
  }
  function scoreTypes() { return normalizeScoreTypes(getSetting('score_types', DEFAULT_SCORE_TYPES)); }
  function scoreFields() { return normalizeScoreFields(getSetting('score_fields', DEFAULT_SCORE_FIELDS), scoreTypes()); }
  function gradeRules() { return normalizeGradeRules(getSetting('score_grade_rules', DEFAULT_GRADE_RULES)); }
  function imageSettings() { return normalizeImageSettings(getSetting('image_storage_settings', DEFAULT_IMAGE_SETTINGS), imageSettingsFromEnv(env)); }
  const styleById = id => obj(q('SELECT json FROM styles WHERE id=? AND deleted_at IS NULL', clean(id)));
  const linkByCode = code => obj(q('SELECT json FROM review_links WHERE code=? AND deleted_at IS NULL', normalizeCode(code)));
  const scoreById = id => obj(q('SELECT json FROM scores WHERE id=? AND deleted_at IS NULL', clean(id)));
  const linkStatus = raw => raw ? ({...raw, style_ids: raw.style_ids || [], style_count: (raw.style_ids || []).length,
      expired: Boolean(raw.expires_at && raw.expires_at <= now()),
      status: Number(raw.active ?? 1) !== 1 ? 'disabled' : raw.expires_at && raw.expires_at <= now() ? 'expired' : 'active'}) : null;
  function styles(filters = {}) {
    const rows = all('SELECT json FROM styles WHERE deleted_at IS NULL ORDER BY created_at ASC, rowid ASC').map(obj).filter(Boolean);
    const keyword = clean(filters.search).toLowerCase();
    return rows.filter(x => (!filters.activeOnly || Number(x.active ?? 1) === 1) &&
      (!keyword || [x.style_code, x.season, x.style_remark].some(v=>clean(v).toLowerCase().includes(keyword))));
  }
  function saveStyle(row) {
    run('UPDATE styles SET style_code=?,season=?,json=? WHERE id=? AND deleted_at IS NULL', row.style_code, row.season || '', JSON.stringify(row), row.id);
    return row;
  }
  function createStyle(data, id = scoreId()) {
    const normalized = normalizeStylePayload(data);
    const stamp = now();
    const row = { id, ...normalized, created_at:stamp, updated_at:stamp, deleted_at:null };
    try {run('INSERT INTO styles(id,style_code,season,created_at,json) VALUES(?,?,?,?,?)', id,row.style_code,row.season,stamp,JSON.stringify(row));}
    catch(e) {if (String(e.message).includes('UNIQUE')) fail(`款式编码 ${row.style_code} 已存在`,409); throw e;}
    return row;
  }
  function softDeleteStyle(id) {
    const row = styleById(id);
    if (!row) fail('款式不存在',404);
    const next = {...row, active:0, deleted_at:now(),updated_at:now()};
    run('UPDATE styles SET deleted_at=?,json=? WHERE id=?',next.deleted_at,JSON.stringify(next),next.id);
    return next;
  }
  function makeLinkPayload(payload) {
    const requested = Array.isArray(payload.style_ids || payload.styleIds) ? payload.style_ids || payload.styleIds : [];
    const available = new Map(styles({activeOnly:true}).map(s=>[String(s.id),s]));
    const ids = [...new Set(requested.map(String).filter(id=>available.has(id)))];
    if (!ids.length) fail('请至少选择一个有效款式');
    let expiration = clean(payload.expires_at || payload.expiresAt).replace('T',' ');
    if (!expiration) expiration = new Date(Date.now()+86400000+28800000).toISOString().replace('T',' ').slice(0,19);
    else if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(expiration)) expiration += ':00';
    else expiration = expiration.slice(0,19);
    if (!/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(expiration) || expiration <= now()) fail('有效期必须晚于当前时间');
    const snapshot = {
      styles: ids.map(id => available.get(id)), score_types:scoreTypes(), score_fields:scoreFields(),
      grade_rules:gradeRules(), image_settings: (()=>{ const s=imageSettings(); return {
        image_key_prefix:s.image_key_prefix,public_image_base_url:s.public_image_base_url,
        public_image_path_prefix:s.public_image_path_prefix,s3_endpoint:s.s3_endpoint,s3_bucket:s.s3_bucket}; })()
    };
    return { name: clean(payload.name).slice(0,80) || `${today().slice(5)}评分-${ids.length}款`,
      style_ids:ids, style_ids_json:JSON.stringify(ids), expires_at:expiration,
      active: payload.active===false || payload.active===0 || payload.active==='0' ? 0 : 1,
      remark:clean(payload.remark).slice(0,200),public_snapshot:snapshot };
  }
  function generateLinkCode() {
    const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for(let attempt=0;attempt<30;attempt++) {
      const bytes=randomBytes(8);
      const code=Array.from(bytes,n=>alphabet[n%alphabet.length]).join('');
      if(!q('SELECT code FROM review_links WHERE code=?',code)) return code;
    }
    fail('无法生成不重复的评分链接',500);
  }
  function createLink(payload) {
    const stamp=now();
    const row={code:generateLinkCode(),...makeLinkPayload(payload),created_at:stamp,updated_at:stamp,deleted_at:null};
    run('INSERT INTO review_links(code,created_at,json) VALUES(?,?,?)',row.code,row.created_at,JSON.stringify(row));
    return linkStatus(row);
  }
  function updateLink(code,payload) {
    const previous=linkByCode(code);
    if(!previous) fail('评分链接不存在',404);
    const row={...previous,...makeLinkPayload({...previous,...payload}),updated_at:now()};
    run('UPDATE review_links SET json=? WHERE code=? AND deleted_at IS NULL',JSON.stringify(row),row.code);
    return linkStatus(row);
  }
  function deleteLink(code) {
    const row=linkByCode(code);
    if(!row) fail('评分链接不存在',404);
    const next={...row,active:0,deleted_at:now(),updated_at:now()};
    run('UPDATE review_links SET deleted_at=?,json=? WHERE code=?',next.deleted_at,JSON.stringify(next),next.code);
    return true;
  }
  function getDailySubmission(reviewer,date,code) {
    const x=q('SELECT * FROM submissions WHERE review_link_code=? AND reviewer_key=? AND review_date=?',normalizeCode(code),normalizeName(reviewer),clean(date));
    return x ? {reviewer:normalizeName(reviewer),review_date:x.review_date,review_link_code:x.review_link_code,submission_id:x.submission_id,submitted_at:x.submitted_at}:null;
  }
  function progressStart(code, reviewer) {
    code=normalizeCode(code);reviewer=normalizeName(reviewer);
    if(!reviewer || reviewer.length>100) fail('评分人姓名不能为空或过长');
    const link=linkByCode(code);
    if(!link || Number(link.active ?? 1)!==1) fail('评分链接不存在或已停用',404);
    if(link.expires_at && link.expires_at<=now()) fail('评分链接已过期',410);
    const time=now();
    const existing=q('SELECT status FROM review_progress WHERE review_link_code=? AND reviewer_key=? AND review_date=?',code,reviewer,today());
    // 已经完成的链接无需回退到“评分中”
    if(existing?.status==='completed') return {reviewer,status:'completed'};
    run(`INSERT INTO review_progress(review_link_code,reviewer_key,review_date,reviewer,status,started_at,updated_at)
      VALUES(?,?,?,?,'in_progress',?,?) ON CONFLICT(review_link_code,reviewer_key,review_date)
      DO UPDATE SET reviewer=excluded.reviewer,updated_at=excluded.updated_at WHERE review_progress.status!='completed'`,
      code,reviewer,today(),reviewer,time,time);
    return {reviewer,status:'in_progress',updated_at:time};
  }
  function progressRows(code) {
    if(!linkByCode(code)) fail('评分链接不存在或已删除',404);
    return all(`SELECT reviewer,review_date,status,started_at,updated_at,submitted_at
      FROM review_progress WHERE review_link_code=? ORDER BY updated_at DESC, reviewer ASC`,normalizeCode(code))
      .map(x=>({...x, rating_time:x.status==='completed'?x.submitted_at:x.updated_at}));
  }
  function draftSave(payload) {
    const reviewer=normalizeName(payload.reviewer), code=normalizeCode(payload.review_link_code||payload.reviewLinkCode);
    if(!reviewer || !code) fail('评分人或链接不存在');
    const draft_date=today(),time=now();
    progressStart(code,reviewer);
    const completed=q("SELECT status FROM review_progress WHERE review_link_code=? AND reviewer_key=? AND review_date=?",code,reviewer,today());
    if(completed?.status==='completed') return null;
    const draft={reviewer,review_link_code:code,draft_date, current_index: Math.max(0,Math.min(999,Number(payload.current_index ?? payload.currentIndex)||0)),
      drafts:Array.isArray(payload.drafts)?payload.drafts.slice(0,200):[],
      style_ids:Array.isArray(payload.style_ids)?payload.style_ids:[],
      score_field_ids:Array.isArray(payload.score_field_ids)?payload.score_field_ids:[],
      updated_at:time, expires_at:`${draft_date}T23:59:59+08:00`};
    run(`INSERT INTO drafts(review_link_code,reviewer_key,draft_date,json,updated_at) VALUES(?,?,?,?,?)
      ON CONFLICT(review_link_code,reviewer_key,draft_date) DO UPDATE SET json=excluded.json,updated_at=excluded.updated_at`,
      code,reviewer,draft_date,JSON.stringify(draft),time);
    return draft;
  }
  function draftGet(reviewer,code) {return obj(q('SELECT json FROM drafts WHERE review_link_code=? AND reviewer_key=? AND draft_date=?',normalizeCode(code),normalizeName(reviewer),today()));}
  function draftDelete(reviewer,code) {run('DELETE FROM drafts WHERE review_link_code=? AND reviewer_key=?',normalizeCode(code),normalizeName(reviewer));return true;}
  function getScores(filters={}) {
    const limit=Math.max(1,Math.min(10000,Number.parseInt(filters.limit||'1000',10)||1000));
    const where=['deleted_at IS NULL'], bind=[];
    if(clean(filters.review_link_code)) {where.push('review_link_code=?');bind.push(normalizeCode(filters.review_link_code));}
    if(clean(filters.date_from)) {where.push('review_date >= ?');bind.push(clean(filters.date_from));}
    if(clean(filters.date_to)) {where.push('review_date <= ?');bind.push(clean(filters.date_to));}
    let rows=all(`SELECT json FROM scores WHERE ${where.join(' AND ')} ORDER BY review_date DESC, created_at DESC`,...bind).map(obj);
    const search=clean(filters.search).toLowerCase();
    if(search) rows=rows.filter(x=>[x.style_code,x.season,x.reviewer,x.remark,x.review_link_code].some(v=>clean(v).toLowerCase().includes(search)));
    return rows.slice(0,limit);
  }
  function insertScore(normalized, id=scoreId(),stamp=now()) {
    const style=styleById(normalized.style_id);
    if(!style || Number(style.active ?? 1)!==1) fail('款式不存在或未启用',404);
    const row={ id, ...normalized, style_id:style.id,
      product_image:normalized.product_image||style.product_image||'',style_code:normalized.style_code||style.style_code,
      season:normalized.season||style.season||'',base_price:normalized.base_price===undefined?style.base_price:normalized.base_price,
      score_items:normalized.score_items || parse(normalized.score_items_json,[]),
      created_at:stamp,updated_at:stamp,deleted_at:null };
    run(`INSERT INTO scores(id,review_link_code,reviewer,review_date,style_id,created_at,json)
      VALUES(?,?,?,?,?,?,?)`,row.id,row.review_link_code||'',row.reviewer,row.review_date,row.style_id,row.created_at,JSON.stringify(row));
    run('INSERT INTO score_history(score_id,action,snapshot_json,changed_at) VALUES(?,?,?,?)',row.id,'create',JSON.stringify(row),stamp);
    return row;
  }
  function submitScoresFast(raw, meta) {
    if(!Array.isArray(raw)||!raw.length) fail('没有需要提交的评分',400);
    const reviewer=normalizeName(meta.reviewer||raw[0]?.reviewer),code=normalizeCode(meta.review_link_code),date=clean(meta.review_date)||today(),time=clean(meta.submitted_at)||now(),id=clean(meta.submission_id)||scoreId();
    return transaction(()=>{
      const link=linkByCode(code);
      if(!link || Number(link.active ?? 1)!==1) fail('评分链接不存在或已停用',404);
      if(link.expires_at && link.expires_at<=now()) fail('评分链接已过期',410);
      if(getDailySubmission(reviewer,date,code)) fail(`${reviewer} 今天已经通过该评分链接提交过评分，不能重复提交。`,409,'DUPLICATE_DAILY_SUBMISSION');
      const ids=raw.map(s=>clean(s.style_id));
      if(new Set(ids).size!==ids.length || ids.length!==link.style_ids.length || link.style_ids.some(x=>!ids.includes(String(x)))) fail('必须完整提交此链接的全部款式评分',400);
      const fields=link.public_snapshot?.score_fields || scoreFields();
      const rules=link.public_snapshot?.grade_rules || gradeRules();
      const normalized=raw.map(x=>normalizeScorePayload({...x,reviewer,review_date:date,submission_id:id,submitted_at:time,review_link_code:code},fields,rules));
      run('INSERT INTO submissions(review_link_code,reviewer_key,review_date,submission_id,submitted_at) VALUES(?,?,?,?,?)',code,reviewer,date,id,time);
      const scores=normalized.map(x=>insertScore(x,scoreId(),time));
      run('DELETE FROM drafts WHERE review_link_code=? AND reviewer_key=?',code,reviewer);
      run(`INSERT INTO review_progress(review_link_code,reviewer_key,review_date,reviewer,status,started_at,updated_at,submitted_at)
        VALUES(?,?,?,?,'completed',?,?,?) ON CONFLICT(review_link_code,reviewer_key,review_date)
        DO UPDATE SET reviewer=excluded.reviewer,status='completed',updated_at=excluded.updated_at,submitted_at=excluded.submitted_at`,
        code,reviewer,date,reviewer,time,time,time);
      return {scores,marker:null};
    });
  }
  function scoreDelete(id) {
    const old=scoreById(id);
    if(!old) fail('评分记录不存在',404);
    const time=now();
    transaction(()=>{
      const next={...old,deleted_at:time,updated_at:time};
      run('UPDATE scores SET deleted_at=?,json=? WHERE id=?',time,JSON.stringify(next),id);
      run('INSERT INTO score_history(score_id,action,snapshot_json,changed_at) VALUES(?,?,?,?)',id,'delete',JSON.stringify(old),time);
    });
    return true;
  }
  const api={
    getStyle:async id=>styleById(id),listStyles:async filters=>styles(filters),
    createStyle:async data=>createStyle(data),updateStyle:async(id,data)=>{
      const row=styleById(id);if(!row) fail('款式不存在',404);
      const normalized=normalizeStylePayload(data);
      try{return saveStyle({...row,...normalized,updated_at:now()});}
      catch(e){if(String(e.message).includes('UNIQUE'))fail('款式编码已存在',409);throw e;}
    },
    deleteStyle:async id=>softDeleteStyle(id) && true,
    deleteStyleKeys:async ids=>transaction(()=>({deleted_ids:ids.map(id=>softDeleteStyle(id).id),deleted_count:ids.length})),
    cleanupStylesIndex:async ids=>({cleaned_ids:ids,cleaned_count:ids.length}),
    upsertImportedStyles:async records=>transaction(()=>records.map(x=>{
      const input=normalizeStylePayload({product_image:'',style_code:x.style_code,season:x.season,base_price:x.base_price});
      const old=x.existing_id?styleById(x.existing_id):styles().find(v=>v.style_code.toLowerCase()===input.style_code.toLowerCase());
      if(x.existing_id && !old) fail('已配置款式不存在，请刷新页面重试',409);
      if(old){saveStyle({...old,season:input.season,base_price:input.base_price,updated_at:now()});return{id:old.id,style_code:old.style_code,action:'updated'};}
      const created=createStyle(input);return{id:created.id,style_code:created.style_code,action:'created'};
    })),
    createScore:async data=>insertScore(data),
    listScores:async filters=>getScores(filters),
    getDailySubmission:async(r,d,c)=>getDailySubmission(r,d,c),
    submitScoresFast:async(raw,meta)=>submitScoresFast(raw,meta),
    createScoresBatch:async(items,meta)=>submitScoresFast(items,meta).scores,
    deleteScore:async id=>scoreDelete(id),
    deleteScoresBatch:async ids=>transaction(()=>{for(const id of ids){const old=scoreById(id);if(!old)continue;const time=now();run('UPDATE scores SET deleted_at=?,json=? WHERE id=?',time,JSON.stringify({...old,deleted_at:time,updated_at:time}),id);run('INSERT INTO score_history(score_id,action,snapshot_json,changed_at) VALUES(?,?,?,?)',id,'delete',JSON.stringify(old),time);}return ids.length;}),
    getScoreHistory:async id=>all('SELECT id,score_id,action,snapshot_json,changed_at FROM score_history WHERE score_id=? ORDER BY id DESC LIMIT 100',clean(id)),
    getScorePageCount:async()=>getSetting('score_page_count',3),setScorePageCount:async n=>setSetting('score_page_count',Math.max(1,Math.min(200,Number.parseInt(n)||3))),
    getScoreTypes:async()=>scoreTypes(),setScoreTypes:async a=>setSetting('score_types',normalizeScoreTypes(a)),
    getScoreFields:async()=>scoreFields(),setScoreFields:async a=>setSetting('score_fields',normalizeScoreFields(a,scoreTypes())),
    getGradeRules:async()=>gradeRules(),setGradeRules:async a=>setSetting('score_grade_rules',normalizeGradeRules(a)),
    getImageSettings:async()=>imageSettings(),setImageSettings:async a=>setSetting('image_storage_settings',normalizeImageSettings(a,imageSettings())),
    listReviewLinks:async()=>all('SELECT json FROM review_links WHERE deleted_at IS NULL ORDER BY created_at DESC').map(x=>linkStatus(obj(x))),
    getReviewLink:async code=>linkStatus(linkByCode(code)),createReviewLinkFast:async p=>createLink(p),createReviewLink:async p=>createLink(p),
    ensureReviewLinkIndexed:async()=>true,updateReviewLink:async(code,p)=>updateLink(code,p),deleteReviewLink:async code=>deleteLink(code),
    deleteReviewLinkKeys:async codes=>transaction(()=>({deleted_codes:codes.map(code=>{deleteLink(code);return code;}),deleted_count:codes.length})),
    cleanupReviewLinksIndex:async codes=>({cleaned_codes:codes,cleaned_count:codes.length}),
    deleteReviewLinksBatch:async codes=>transaction(()=>({deleted_codes:codes.map(code=>{deleteLink(code);return code;}),deleted_count:codes.length})),
    getPublicDraft:async(r,c)=>draftGet(r,c),savePublicDraft:async p=>draftSave(p),deletePublicDraft:async(r,c)=>draftDelete(r,c),
    markReviewStarted:async(code,reviewer)=>progressStart(code,reviewer),listReviewProgress:async code=>progressRows(code),
    clearAllData:async()=>transaction(()=>{const counts={deleted_style_count:q('SELECT COUNT(*) AS n FROM styles WHERE deleted_at IS NULL').n,deleted_score_count:q('SELECT COUNT(*) AS n FROM scores WHERE deleted_at IS NULL').n};for(const tbl of ['styles','scores','review_links','drafts','review_progress','submissions','score_history'])db.exec(`DELETE FROM ${tbl}`);return counts;}),
    _db:db
  };
  shared={path:dbPath,api};
  return api;
}
