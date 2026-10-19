import http from 'node:http';
import { Readable } from 'node:stream';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import pagesApp from './platform/index.js';
import { onRequest as adminMiddleware } from './platform/api/_middleware.js';
import { createSqliteStorage } from './sqlite-storage.js';
import { tryDeleteImageByUrl } from './platform/_shared/imageStorage.js';
// VPS_LOCAL_IMAGES_TOAST_V1
import { getLocalImageFile } from './local-image.js';
import { exportBusinessBackup, inspectBusinessBackup, restoreBusinessBackup } from './backup-service.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = resolve(root, 'public');
const env = {...process.env, STORAGE_DRIVER:'sqlite'};
if (!env.ADMIN_PASSWORD || env.ADMIN_PASSWORD==='CHANGE_ME_STRONG_PASSWORD' || !env.SESSION_SECRET || env.SESSION_SECRET==='CHANGE_ME_RANDOM_64_HEX') {
  console.error('请先在 .env 中配置 ADMIN_PASSWORD 和 SESSION_SECRET');process.exit(1);
}
const host = env.HOST || '127.0.0.1';
const port = Number(env.PORT || 18080);
if (!Number.isInteger(port) || port<1 || port>65535) throw new Error('PORT 无效');
const storage = createSqliteStorage(env);
const mime={'.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.html':'text/html; charset=utf-8',
  '.ico':'image/x-icon','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.avif':'image/avif','.svg':'image/svg+xml',
  '.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','.json':'application/json; charset=utf-8'};
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});}
function errorResponse(e){return json({ok:false,code:e?.code||undefined,message:e?.message||'请求失败'},e?.status||500);}
function staticPath(pathname) {
  if (!(pathname.startsWith('/assets/') || pathname==='/favicon.ico')) return null;
  let decoded;
  try{ decoded=decodeURIComponent(pathname); }catch{return null;}
  const path=resolve(publicDir, '.'+decoded);
  if(!path.startsWith(publicDir+sep)||!existsSync(path)||!statSync(path).isFile())return null;
  return path;
}
function staticResponse(path, req, res, cacheControl = 'public, max-age=300') {
  const info=statSync(path);
  res.writeHead(200,{'content-type':mime[extname(path)]||'application/octet-stream','content-length':info.size,
    'x-content-type-options':'nosniff','cache-control':cacheControl});
  if(req.method==='HEAD'){res.end();return;}
  createReadStream(path).pipe(res);
}
async function protectedRoute(request,handler){return adminMiddleware({request,env,next:async()=>{try{return await handler();}catch(e){return errorResponse(e);}}});}
async function dispatch(request) {
  const url=new URL(request.url), path=url.pathname, method=request.method;
  if(path==='/healthz') return json({ok:true});
  if(path==='/api/public/progress' && method==='POST') {
    try {
      const body=await request.json();
      const linkCode=body?.review_link_code||body?.reviewLinkCode;
      const row=await storage.markReviewStarted(linkCode,body?.reviewer);
      return json({ok:true,progress:row});
    }catch(e){return errorResponse(e);}
  }
  const progressMatch=path.match(/^\/api\/review-links\/([a-zA-Z0-9_-]{1,32})\/progress$/);
  if(progressMatch && method==='GET') {
    return protectedRoute(request,async()=>json({ok:true,items:await storage.listReviewProgress(progressMatch[1])}));
  }
  if(path==='/api/styles/import' && method==='POST') {
    return protectedRoute(request,async()=>{
      const body=await request.json();
      const normalize=(raw)=>({style_code:String(raw?.style_code ?? raw?.['款式编码'] ?? raw?.code ?? '').trim(),
        season:String(raw?.season ?? raw?.['季节'] ?? '').trim(),base_price:(String(raw?.base_price ?? raw?.['基本售价'] ?? '').replace(/[￥¥,，\s]/g,'').match(/-?\d+(?:\.\d+)?/) || [''])[0],existing_id:String(raw?.existing_id||'').trim()});
      if(body.mode==='scan') {
        const offset=Math.max(0,Number.parseInt(body.offset,10)||0),size=Math.min(100,Math.max(1,Number(body.limit)||6));
        const list=await storage.listStyles({});
        return json({ok:true,mode:'scan',total:list.length,offset,next_offset:Math.min(list.length,offset+size),rows:list.slice(offset,offset+size)});
      }
      if(body.mode==='commit') return json({ok:true,mode:'commit',committed_count:body.ids?.length||0,total_index_count:(await storage.listStyles({})).length});
      const rows=body.mode==='write'?body.rows:body.styles;
      if(!Array.isArray(rows)||!rows.length||rows.length>2000) return json({ok:false,message:'每批导入 1～2000 条款式'},400);
      const results=await storage.upsertImportedStyles(rows.map(normalize));
      return json({ok:true,mode:body.mode||'bulk',rows:results,
        created_count:results.filter(x=>x.action==='created').length,
        updated_count:results.filter(x=>x.action==='updated').length,skipped_count:0},200);
    });
  }
  // VPS_BACKUP_FEATURE_V1 — encrypted business-only backup, no local image files.
  if(path.startsWith('/api/backup/') && method==='POST') {
    return protectedRoute(request,async()=>{
      if(path==='/api/backup/export') {
        const body=await request.json();
        const exported=await exportBusinessBackup(env,body?.password);
        return new Response(exported.bytes,{headers:{
          'content-type':'application/zip',
          'content-disposition':`attachment; filename="${exported.filename}"`,
          'x-backup-filename':exported.filename,
          'cache-control':'private, no-store',
          'x-content-type-options':'nosniff'
        }});
      }
      if(path!=='/api/backup/inspect' && path!=='/api/backup/restore') return json({ok:false,message:'接口不存在'},404);
      const form=await request.formData(),file=form.get('file');
      if(!file || typeof file.arrayBuffer!=='function')return json({ok:false,message:'请选择本系统导出的 ZIP 文件'},400);
      if(file.size>120*1024*1024)return json({ok:false,message:'备份文件超过 120 MB'},413);
      const bytes=await file.arrayBuffer(),password=String(form.get('password')||'');
      if(path==='/api/backup/inspect')return json({ok:true,...await inspectBusinessBackup(bytes,password)});
      const mode=String(form.get('mode')||'replace');
      const data=await restoreBusinessBackup(env,bytes,password,mode);
      return json({ok:true,...data});
    });
  }
  if(path==='/api/data/clear-all' && method==='DELETE'){
    return protectedRoute(request,async()=>{
      const images=[...new Set((await storage.listStyles({})).map(x=>x.product_image).filter(Boolean))];
      const result=await storage.clearAllData();
      const outcomes=await Promise.allSettled(images.map(u=>tryDeleteImageByUrl(env,u)));
      return json({ok:true,...result,image_deleted_count:outcomes.filter(x=>x.status==='fulfilled'&&x.value?.deleted).length,image_failed_count:outcomes.filter(x=>x.status==='rejected'||(x.status==='fulfilled'&&x.value?.error)).length});
    });
  }
  return pagesApp.fetch(request,{waitUntil(p){p.catch(e=>console.error('后台任务失败:',e));}},env);
}
const server=http.createServer(async(req,res)=>{
  try{
    const path=new URL(req.url||'/','http://localhost').pathname;
    const limit = path === '/api/upload-image' ? 52*1024*1024 : path.startsWith('/api/backup/') ? 125*1024*1024 : 15*1024*1024;
    if(req.headers['content-length'] && Number(req.headers['content-length'])>limit){res.writeHead(413);res.end('Request Too Large');return;}
    if (path.startsWith('/image/')) {
      const localFile = getLocalImageFile(path);
      if (!localFile) { res.writeHead(404,{'content-type':'text/plain; charset=utf-8'});res.end('Not Found');return; }
      if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405,{'allow':'GET, HEAD'});res.end();return; }
      staticResponse(localFile, req, res, 'no-cache');
      return;
    }
    const file=staticPath(path);
    if(file&&(req.method==='GET'||req.method==='HEAD')){staticResponse(file,req,res);return;}
    const originProtocol=req.headers['x-forwarded-proto']==='https'?'https':'http';
    const url=`${originProtocol}://${req.headers.host||'localhost'}${req.url||'/'}`;
    const method=req.method||'GET';
    const request=new Request(url,{method,headers:req.headers,
      ...(method==='GET'||method==='HEAD'?{}:{body:req,duplex:'half'})});
    const response=await dispatch(request);
    const headers=Object.fromEntries(response.headers.entries());
    // Node.js fetch Headers 合并 Set-Cookie 时通常只有一个；本项目仅设置一个 session cookie。
    res.writeHead(response.status,headers);
    if(method==='HEAD'||!response.body){res.end();return;}
    Readable.fromWeb(response.body).pipe(res);
  }catch(e){console.error(e?.stack||e);if(!res.headersSent){res.writeHead(500,{'content-type':'application/json; charset=utf-8'});res.end(JSON.stringify({ok:false,message:'服务器内部错误'}));}else res.destroy();}
});
server.requestTimeout=300000; // allow authenticated ZIP uploads on slower connections
server.listen(port,host,()=>console.log(`new-product-rating VPS 已启动：http://${host}:${port} / DB=${env.DB_PATH||'(default)'}`));
