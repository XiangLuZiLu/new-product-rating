// VPS-only encrypted business-data backup, without local image files.
// Uses Node 22's built-in SQLite online backup and transactional SQL restore.
import { DatabaseSync, backup as sqliteBackup } from 'node:sqlite';
import { createHash, randomBytes, scryptSync, createCipheriv, createDecipheriv } from 'node:crypto';
import { deflateRawSync, inflateRawSync } from 'node:zlib';
import { mkdtemp, mkdir, readFile, writeFile, chmod, rm } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const FORMAT = 'new-product-rating-vps-business-backup';
const TABLES = Object.freeze({
  styles: ['id','style_code','season','created_at','deleted_at','json'],
  review_links: ['code','created_at','deleted_at','json'],
  scores: ['id','review_link_code','reviewer','review_date','style_id','created_at','deleted_at','json'],
  score_history: ['id','score_id','action','snapshot_json','changed_at'],
  app_settings: ['key','value'],
  submissions: ['review_link_code','reviewer_key','review_date','submission_id','submitted_at'],
  drafts: ['review_link_code','reviewer_key','draft_date','json','updated_at'],
  review_progress: ['review_link_code','reviewer_key','review_date','reviewer','status','started_at','updated_at','submitted_at']
});
const TABLE_NAMES = Object.keys(TABLES);
const MAX_ARCHIVE = 120 * 1024 * 1024;
const MAX_DATABASE = 150 * 1024 * 1024;
const JSON_FILE = 'manifest.json';
const DB_FILE = 'database/rating.sqlite.enc';
const err = (message, status = 400) => Object.assign(new Error(message), { status });
const digest = b => createHash('sha256').update(b).digest('hex');
const nameTimestamp = () => new Date().toISOString().replace(/[-:]/g,'').replace(/\..+$/,'').replace('T','-');
const passcheck = password => { if (typeof password !== 'string' || password.length < 8 || password.length > 256) throw err('备份密码需要 8～256 个字符'); return password; };
const q = x => `"${x}"`; // table and field identifiers only come from TABLES constants.
const rowcount = (db, t) => Number(db.prepare(`SELECT count(*) AS n FROM ${q(t)}`).get().n);

// ZIP store-only writer/parser. No extraction to filesystem: eliminates path traversal.
const CRC_TABLE = Array.from({length:256}, (_, n)=>{let x=n;for(let j=0;j<8;j++)x=(x&1)?(0xedb88320^(x>>>1)):(x>>>1);return x>>>0;});
function crc32(buf) { let crc=0xffffffff; for(const b of buf)crc=CRC_TABLE[(crc^b)&255]^(crc>>>8);return (crc^0xffffffff)>>>0; }
function createZip(entries) {
  let position=0;const parts=[],center=[];
  for(const [filename, contents] of entries){
    const filenameBytes=Buffer.from(filename,'utf8'), data=Buffer.from(contents);
    const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);
    local.writeUInt16LE(0,6);local.writeUInt16LE(0,8); // no data descriptor, store method
    local.writeUInt32LE(crc32(data),14);local.writeUInt32LE(data.length,18);local.writeUInt32LE(data.length,22);
    local.writeUInt16LE(filenameBytes.length,26);parts.push(local,filenameBytes,data);
    const cen=Buffer.alloc(46);cen.writeUInt32LE(0x02014b50,0);cen.writeUInt16LE(20,4);cen.writeUInt16LE(20,6);
    cen.writeUInt32LE(crc32(data),16);cen.writeUInt32LE(data.length,20);cen.writeUInt32LE(data.length,24);
    cen.writeUInt16LE(filenameBytes.length,28);cen.writeUInt32LE(position,42);
    center.push(cen,filenameBytes);position+=30+filenameBytes.length+data.length;
  }
  const centerBuf=Buffer.concat(center), eocd=Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50,0);eocd.writeUInt16LE(entries.length,8);eocd.writeUInt16LE(entries.length,10);
  eocd.writeUInt32LE(centerBuf.length,12);eocd.writeUInt32LE(position,16);
  return Buffer.concat([...parts,centerBuf,eocd]);
}
function parseZip(source) {
  const b=Buffer.from(source);if(b.length>MAX_ARCHIVE)throw err('备份文件超出 120 MB 限制',413);
  if(b.length<22)throw err('文件不是有效的备份 ZIP');
  const eocd=b.length-22;
  if(b.readUInt32LE(eocd)!==0x06054b50||b.readUInt16LE(eocd+20)!==0)throw err('ZIP 结尾无效');
  const total=b.readUInt16LE(eocd+10),centerLen=b.readUInt32LE(eocd+12),centerStart=b.readUInt32LE(eocd+16);
  if(total!==2||b.readUInt16LE(eocd+8)!==total||centerStart+centerLen!==eocd)throw err('备份 ZIP 文件结构不正确');
  const entries=new Map();let pos=centerStart;
  for(let n=0;n<total;n++){
    if(pos+46>eocd||b.readUInt32LE(pos)!==0x02014b50)throw err('ZIP 文件目录损坏');
    const method=b.readUInt16LE(pos+10),flags=b.readUInt16LE(pos+8);
    const checksum=b.readUInt32LE(pos+16),length=b.readUInt32LE(pos+24),stored=b.readUInt32LE(pos+20);
    const nameLen=b.readUInt16LE(pos+28),extra=b.readUInt16LE(pos+30),comment=b.readUInt16LE(pos+32),offset=b.readUInt32LE(pos+42);
    if(pos+46+nameLen+extra+comment>eocd||method!==0||flags!==0||length!==stored)throw err('不支持的 ZIP 内容');
    const name=b.toString('utf8',pos+46,pos+46+nameLen);pos+=46+nameLen+extra+comment;
    if(![JSON_FILE,DB_FILE].includes(name)||entries.has(name))throw err('备份文件列表不符合本系统格式');
    if(offset+30>b.length||b.readUInt32LE(offset)!==0x04034b50)throw err('ZIP 文件内容损坏');
    if(b.readUInt16LE(offset+6)!==0||b.readUInt16LE(offset+8)!==0)throw err('不支持的 ZIP 条目');
    const localNameLen=b.readUInt16LE(offset+26), localExtraLen=b.readUInt16LE(offset+28);
    const locName=b.toString('utf8',offset+30,offset+30+localNameLen);
    const start=offset+30+localNameLen+localExtraLen;
    if(locName!==name||start+length>centerStart)throw err('ZIP 文件结构不一致');
    const data=b.subarray(start,start+length);
    if(crc32(data)!==checksum||b.readUInt32LE(offset+14)!==checksum)throw err('ZIP 文件校验失败');
    entries.set(name,data);
  }
  if(pos!==eocd||entries.size!==2)throw err('ZIP 文件目录格式不正确');
  return entries;
}
function manifestParse(raw) {
  if(raw.length>32*1024)throw err('备份描述信息过大');
  let m;try { m=JSON.parse(raw.toString('utf8')); } catch {throw err('备份描述信息损坏');}
  if(m?.format!==FORMAT||m.version!==1||m.includes_images!==false||m.encryption!=='aes-256-gcm'||m.compression!=='deflate-raw')throw err('不是受支持的本系统备份文件');
  if(!/^[a-f0-9]{64}$/.test(m.database_sha256)||!/^[a-f0-9]{64}$/.test(m.payload_sha256)|| !/^[a-f0-9]{32}$/.test(m.salt) || !/^[a-f0-9]{24}$/.test(m.iv))throw err('备份文件校验字段不合法');
  return m;
}
function validateSchema(db) {
  const result=db.prepare('PRAGMA integrity_check').all();
  if(result.length!==1||result[0].integrity_check!=='ok')throw err('备份 SQLite 完整性检查失败');
  const schema=db.prepare("SELECT name,type FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND type IN ('table','view','trigger')").all();
  if(schema.some(x=>x.type!=='table'||!TABLES[x.name]))throw err('备份包含不支持的数据库结构');
  const actualTables=new Set(schema.map(x=>x.name));
  if(TABLE_NAMES.some(x=>!actualTables.has(x)))throw err('备份数据库缺少业务表');
  for(const [table,fields] of Object.entries(TABLES)){
    const actual=db.prepare(`PRAGMA table_xinfo(${q(table)})`).all();
    if(actual.length!==fields.length||actual.some((f,i)=>f.name!==fields[i]||f.hidden))throw err(`备份数据表结构不兼容：${table}`);
  }
  return Object.fromEntries(TABLE_NAMES.map(t=>[t,rowcount(db,t)]));
}
function summary(counts){return {styles:counts.styles,scores:counts.scores,review_links:counts.review_links,settings:counts.app_settings,history:counts.score_history,submissions:counts.submissions,drafts:counts.drafts,progress:counts.review_progress};}
async function snapshot(path,destination) {
  const source=new DatabaseSync(path,{timeout:8000});
  try{await sqliteBackup(source,destination);}finally{source.close();}
}
function pathFromEnv(env){return resolve(String(env.DB_PATH||'/opt/new-product-rating/data/rating.sqlite'));}

export async function exportBusinessBackup(env,password) {
  passcheck(password);
  const temporary=await mkdtemp(join(tmpdir(),'rating-backup-'));
  try {
    const dest=join(temporary,'snapshot.sqlite');
    await snapshot(pathFromEnv(env),dest);
    const bytes=await readFile(dest);
    if(bytes.length>MAX_DATABASE)throw err('数据库超过当前备份大小上限（150 MB）',413);
    const db=new DatabaseSync(dest,{readOnly:true});let counts;
    try{counts=validateSchema(db);}finally{db.close();}
    const salt=randomBytes(16),iv=randomBytes(12),key=scryptSync(password,salt,32);
    const cipher=createCipheriv('aes-256-gcm',key,iv);
    const zipped=deflateRawSync(bytes);
    const encrypted=Buffer.concat([cipher.update(zipped),cipher.final(),cipher.getAuthTag()]);
    const manifest={format:FORMAT,version:1,created_at:new Date().toISOString(),includes_images:false,
      modules:['款式配置','评分结果','评分链接','设置'],encryption:'aes-256-gcm',compression:'deflate-raw',
      salt:salt.toString('hex'),iv:iv.toString('hex'),database_sha256:digest(bytes),payload_sha256:digest(encrypted),counts};
    const archive=createZip([[JSON_FILE,Buffer.from(JSON.stringify(manifest,null,2))],[DB_FILE,encrypted]]);
    if(archive.length>MAX_ARCHIVE)throw err('备份压缩包超过 120 MB 限制',413);
    return {bytes:archive,filename:`new-product-rating-backup-${nameTimestamp()}.zip`,summary:summary(counts)};
  }finally{await rm(temporary,{recursive:true,force:true});}
}
async function decodeArchive(zip,password) {
  passcheck(password);
  const entries=parseZip(zip);
  const manifest=manifestParse(entries.get(JSON_FILE));
  const payload=entries.get(DB_FILE);
  if(payload.length<17||digest(payload)!==manifest.payload_sha256)throw err('备份文件内容损坏或校验不通过');
  let raw;
  try {
    const salt=Buffer.from(manifest.salt,'hex'),iv=Buffer.from(manifest.iv,'hex');
    const key=scryptSync(password,salt,32), tag=payload.subarray(payload.length-16);
    const dec=createDecipheriv('aes-256-gcm',key,iv);dec.setAuthTag(tag);
    const zipped=Buffer.concat([dec.update(payload.subarray(0,-16)),dec.final()]);
    raw=inflateRawSync(zipped,{maxOutputLength:MAX_DATABASE});
  }catch {throw err('备份密码错误或文件损坏');}
  if(raw.length<100||raw.subarray(0,16).toString('ascii')!=='SQLite format 3\0'||digest(raw)!==manifest.database_sha256)throw err('备份数据库文件校验失败');
  return {raw,manifest};
}
async function withDecodedArchive(zip,password,callback) {
  const {raw,manifest}=await decodeArchive(zip,password);
  const temporary=await mkdtemp(join(tmpdir(),'rating-restore-'));
  try {
    const dbPath=join(temporary,'uploaded.sqlite');
    await writeFile(dbPath,raw,{mode:0o600});
    const db=new DatabaseSync(dbPath,{readOnly:true});
    try {
      const counts=validateSchema(db);
      for(const t of TABLE_NAMES){if(manifest.counts?.[t]!==counts[t])throw err('备份记录数量校验不通过');}
      return await callback(db,manifest,counts);
    }finally{db.close();}
  }finally{await rm(temporary,{recursive:true,force:true});}
}
export async function inspectBusinessBackup(zip,password) {
  return withDecodedArchive(zip,password,async (_db,m,counts)=>({created_at:m.created_at,counts:summary(counts),includes_images:false}));
}

function rows(db,table){return db.prepare(`SELECT * FROM ${q(table)}`).all();}
function insertRow(db,table,row,omit=[]){
  const fields=TABLES[table].filter(f=>!omit.includes(f));
  const stmt=db.prepare(`INSERT INTO ${q(table)} (${fields.map(q).join(',')}) VALUES (${fields.map(()=>'?').join(',')})`);
  return stmt.run(...fields.map(f=>row[f]));
}
const keyOf = r => String(r?.style_code || '').trim().toLowerCase();
const parseJson = (s) => {try{return JSON.parse(s);}catch{return null;}};
function replaceTables(dest,source) {
  const totals={};
  for(const name of [...TABLE_NAMES].reverse())dest.exec(`DELETE FROM ${q(name)}`);
  for(const name of TABLE_NAMES){let n=0;for(const row of rows(source,name)){insertRow(dest,name,row);n++;}totals[name]={added:n,skipped:0};}
  return totals;
}
function mergeTables(dest,source) {
  const totals=Object.fromEntries(TABLE_NAMES.map(t=>[t,{added:0,skipped:0}]));
  const present={
    styles:new Set(rows(dest,'styles').map(r=>r.id)),
    codes:new Set(rows(dest,'styles').filter(r=>r.deleted_at===null).map(r=>keyOf(r))),
    links:new Set(rows(dest,'review_links').map(r=>r.code)),
    scores:new Set(rows(dest,'scores').map(r=>r.id)),
    submissionIds:new Set(rows(dest,'submissions').map(r=>r.submission_id)),
    submissions:new Set(rows(dest,'submissions').map(r=>[r.review_link_code,r.reviewer_key,r.review_date].join('\0'))),
    drafts:new Set(rows(dest,'drafts').map(r=>[r.review_link_code,r.reviewer_key,r.draft_date].join('\0'))),
    progress:new Set(rows(dest,'review_progress').map(r=>[r.review_link_code,r.reviewer_key,r.review_date].join('\0'))),
    settings:new Set(rows(dest,'app_settings').map(r=>r.key)),
    history:new Set(rows(dest,'score_history').map(r=>[r.score_id,r.action,r.snapshot_json,r.changed_at].join('\0'))),
    scoreEvents:new Set(rows(dest,'scores').filter(r=>r.deleted_at===null).map(r=>[r.review_link_code,r.reviewer,r.review_date,r.style_id].join('\0')))
  };
  const take=(table,row,accept,omit=[])=>{if(!accept){totals[table].skipped++;return false;}insertRow(dest,table,row,omit);totals[table].added++;return true;};
  for(const r of rows(source,'styles')){
    const activeCode=(!r.deleted_at&&present.codes.has(keyOf(r)));
    if(take('styles',r,!present.styles.has(r.id)&&!activeCode)){present.styles.add(r.id);if(!r.deleted_at)present.codes.add(keyOf(r));}
  }
  for(const r of rows(source,'review_links')){
    const obj=parseJson(r.json);
    const ids=obj?.style_ids;
    const valid=Array.isArray(ids)&&ids.every(id=>present.styles.has(String(id)));
    if(take('review_links',r,!present.links.has(r.code)&&valid)){present.links.add(r.code);}
  }
  for(const r of rows(source,'scores')){
    const event=[r.review_link_code,r.reviewer,r.review_date,r.style_id].join('\0');
    const accept=!present.scores.has(r.id)&&present.links.has(r.review_link_code)&&present.styles.has(r.style_id)&&
      (r.deleted_at!==null || !present.scoreEvents.has(event));
    if(take('scores',r,accept)){present.scores.add(r.id);if(r.deleted_at===null)present.scoreEvents.add(event);}
  }
  for(const r of rows(source,'score_history')){
    const signature=[r.score_id,r.action,r.snapshot_json,r.changed_at].join('\0');
    if(take('score_history',r,present.scores.has(r.score_id)&&!present.history.has(signature),['id']))present.history.add(signature);
  }
  for(const r of rows(source,'app_settings')){if(take('app_settings',r,!present.settings.has(r.key)))present.settings.add(r.key);}
  for(const r of rows(source,'submissions')){
    const key=[r.review_link_code,r.reviewer_key,r.review_date].join('\0');
    if(take('submissions',r,present.links.has(r.review_link_code)&&!present.submissions.has(key)&&!present.submissionIds.has(r.submission_id))){present.submissions.add(key);present.submissionIds.add(r.submission_id);}
  }
  for(const r of rows(source,'drafts')){
    const key=[r.review_link_code,r.reviewer_key,r.draft_date].join('\0');
    if(take('drafts',r,present.links.has(r.review_link_code)&&!present.drafts.has(key)))present.drafts.add(key);
  }
  for(const r of rows(source,'review_progress')){
    const key=[r.review_link_code,r.reviewer_key,r.review_date].join('\0');
    if(take('review_progress',r,present.links.has(r.review_link_code)&&!present.progress.has(key)))present.progress.add(key);
  }
  return totals;
}
let restoring = false;
export function isBackupRestoreRunning(){return restoring;}
export async function restoreBusinessBackup(env,zip,password,mode) {
  if(!['replace','merge'].includes(mode))throw err('恢复方式不正确');
  if(restoring)throw err('已有恢复任务正在执行，请稍后重试',409);
  restoring=true;
  try{
    return await withDecodedArchive(zip,password,async (source,manifest,counts)=>{
      const path=pathFromEnv(env);
      const dir=join(dirname(path),'backups');
      await mkdir(dir,{recursive:true,mode:0o700});
      // Automatic pre-restore recovery snapshot; kept on disk, never bundled into user ZIP.
      const recover=join(dir,`pre-restore-${nameTimestamp()}-${randomBytes(4).toString('hex')}.sqlite`);
      await snapshot(path,recover);
      await chmod(recover,0o600);
      const target=new DatabaseSync(path,{timeout:8000});
      try{
        validateSchema(target);
        target.exec('BEGIN IMMEDIATE');
        let totals;
        try{
          totals=mode==='replace'?replaceTables(target,source):mergeTables(target,source);
          target.exec('COMMIT');
        }catch(e){try{target.exec('ROLLBACK');}catch{}throw e;}
        return {mode,backup_created:recover,counts:summary(counts),results:totals,images_unchanged:true};
      }finally{target.close();}
    });
  }finally{restoring=false;}
}
