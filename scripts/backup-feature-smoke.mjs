/** Standalone regression suite for encrypted business backup / merge / replace. */
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { exportBusinessBackup,inspectBusinessBackup,restoreBusinessBackup } from '../server/backup-service.js';

const testRoot=mkdtempSync(join(tmpdir(),'rating-backup-test-'));
const a=join(testRoot,'a','data','rating.sqlite'),b=join(testRoot,'b','data','rating.sqlite');
function assert(v,why){if(!v)throw new Error(why);}
function init(path){mkdirSync(join(path,'..'),{recursive:true});const db=new DatabaseSync(path);db.exec(`
CREATE TABLE styles (id TEXT PRIMARY KEY,style_code TEXT NOT NULL,season TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL,deleted_at TEXT,json TEXT NOT NULL);
CREATE UNIQUE INDEX ux_styles_code ON styles(style_code COLLATE NOCASE) WHERE deleted_at IS NULL;
CREATE TABLE review_links (code TEXT PRIMARY KEY,created_at TEXT NOT NULL,deleted_at TEXT,json TEXT NOT NULL);
CREATE TABLE scores (id TEXT PRIMARY KEY,review_link_code TEXT NOT NULL,reviewer TEXT NOT NULL,review_date TEXT NOT NULL,style_id TEXT NOT NULL,created_at TEXT NOT NULL,deleted_at TEXT,json TEXT NOT NULL);
CREATE TABLE score_history (id INTEGER PRIMARY KEY AUTOINCREMENT,score_id TEXT NOT NULL,action TEXT NOT NULL,snapshot_json TEXT NOT NULL,changed_at TEXT NOT NULL);
CREATE TABLE app_settings (key TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE TABLE submissions (review_link_code TEXT NOT NULL,reviewer_key TEXT NOT NULL,review_date TEXT NOT NULL,submission_id TEXT NOT NULL UNIQUE,submitted_at TEXT NOT NULL,PRIMARY KEY(review_link_code,reviewer_key,review_date));
CREATE TABLE drafts (review_link_code TEXT NOT NULL,reviewer_key TEXT NOT NULL,draft_date TEXT NOT NULL,json TEXT NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(review_link_code,reviewer_key,draft_date));
CREATE TABLE review_progress (review_link_code TEXT NOT NULL,reviewer_key TEXT NOT NULL,review_date TEXT NOT NULL,reviewer TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN('in_progress','completed')),started_at TEXT NOT NULL,updated_at TEXT NOT NULL,submitted_at TEXT,PRIMARY KEY(review_link_code,reviewer_key,review_date));
PRAGMA journal_mode=WAL;
`);return db;}
const get=(db,t)=>db.prepare(`SELECT count(*) AS n FROM ${t}`).get().n;
const populate=(db,tag)=>{
 const style={id:`style-${tag}`,style_code:`CODE-${tag}`,product_image:'/image/preserved.webp'};
 db.prepare('INSERT INTO styles(id,style_code,season,created_at,json) VALUES(?,?,?,?,?)').run(style.id,style.style_code,'秋','2026-01-01',JSON.stringify(style));
 db.prepare('INSERT INTO review_links(code,created_at,json) VALUES(?,?,?)').run(`link-${tag}`,'2026-01-01',JSON.stringify({code:`link-${tag}`,style_ids:[style.id]}));
 db.prepare('INSERT INTO scores(id,review_link_code,reviewer,review_date,style_id,created_at,json) VALUES(?,?,?,?,?,?,?)').run(`score-${tag}`,`link-${tag}`,'张三','2026-01-02',style.id,'2026-01-02','{}');
 db.prepare('INSERT INTO score_history(score_id,action,snapshot_json,changed_at) VALUES(?,?,?,?)').run(`score-${tag}`,'created','{}','2026-01-02');
 db.prepare('INSERT INTO app_settings(key,value) VALUES(?,?)').run(`key-${tag}`,JSON.stringify(tag));
 db.prepare('INSERT INTO submissions(review_link_code,reviewer_key,review_date,submission_id,submitted_at) VALUES(?,?,?,?,?)').run(`link-${tag}`,'person','2026-01-02',`submission-${tag}`,'2026-01-02');
 db.prepare('INSERT INTO drafts(review_link_code,reviewer_key,draft_date,json,updated_at) VALUES(?,?,?,?,?)').run(`link-${tag}`,'person','2026-01-02','{}','2026-01-02');
 db.prepare('INSERT INTO review_progress(review_link_code,reviewer_key,review_date,reviewer,status,started_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(`link-${tag}`,'person','2026-01-02','张三','in_progress','2026-01-02','2026-01-02');
};
try{
const source=init(a),dest=init(b);populate(source,'A');populate(dest,'B'); // Keep long-lived SQLite connections open, like the production server.
const pass='VerySafeBackupPassword@2026';
const exported=await exportBusinessBackup({DB_PATH:a},pass);
assert(exported.bytes.subarray(0,2).toString('ascii')==='PK','导出的文件不是 ZIP');
assert(!exported.bytes.includes(Buffer.from('CODE-A')),'ZIP 明文泄露业务数据');
assert(!exported.bytes.includes(Buffer.from('/image/preserved.webp')),'ZIP 明文泄露图片链接');
console.log('✓ 导出完整业务数据，加密 ZIP 不含图片文件');
const details=await inspectBusinessBackup(exported.bytes,pass);
assert(details.counts.styles===1&&details.counts.scores===1&&!details.includes_images,'备份范围错误');
try{await inspectBusinessBackup(exported.bytes,'wrong-password-123');throw Error('密码错误应被拒绝');}
catch(e){assert(/密码错误/.test(e.message),'未拒绝错误密码: '+e.message);}
console.log('✓ 正确密码通过，错误密码拒绝');
const dest1=await restoreBusinessBackup({DB_PATH:b},exported.bytes,pass,'merge');
assert(dest1.results.styles.added===1&&dest1.results.scores.added===1,'合并计数错误');
let verify=new DatabaseSync(b);assert(get(verify,'styles')===2&&get(verify,'scores')===2&&get(verify,'score_history')===2,'合并未保留旧数据');verify.close();
const dest2=await restoreBusinessBackup({DB_PATH:b},exported.bytes,pass,'merge');
assert(dest2.results.styles.added===0&&dest2.results.scores.added===0&&dest2.results.score_history.added===0,'重复合并出现重复记录');
console.log('✓ 合并导入：保留现有数据、跳过重复记录');
const dest3=await restoreBusinessBackup({DB_PATH:b},exported.bytes,pass,'replace');
verify=new DatabaseSync(b);assert(get(verify,'styles')===1&&get(verify,'scores')===1,'覆盖恢复没有替换现有业务数据');assert(verify.prepare('SELECT style_code FROM styles').get().style_code==='CODE-A','覆盖不是备份快照');verify.close();
assert(existsSync(dest3.backup_created),'恢复前数据库快照缺失');
console.log('✓ 完整覆盖恢复成功，自动创建恢复前快照');
const broken=Buffer.from(exported.bytes);broken[Math.floor(broken.length/2)]^=1;
try{await restoreBusinessBackup({DB_PATH:b},broken,pass,'replace');throw Error('损坏备份应拒绝');}
catch(e){assert(e.message!=='损坏备份应拒绝','损坏备份未被拒绝');}
verify=new DatabaseSync(b);assert(get(verify,'styles')===1,'损坏备份影响正式数据');verify.close();
console.log('✓ 损坏备份拒绝，原有数据不受影响');
console.log('✓ 所有备份功能离线冒烟测试通过');
source.close();dest.close();
}finally{rmSync(testRoot,{recursive:true,force:true});}
