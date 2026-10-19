/** Apply to clean VPS branch after copying files from this patch into the checkout. */
import { readFileSync,writeFileSync,existsSync } from 'node:fs';
import { dirname,resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const branch=execFileSync('git',['branch','--show-current'],{cwd:root,encoding:'utf8'}).trim();
if(branch!=='vps')throw Error(`拒绝更改 ${branch||'(detached)'} 分支，请先切换到 vps。`);
const required=['server/backup-service.js','public/assets/backup-ui.js','public/assets/backup-ui.css','scripts/backup-feature-smoke.mjs'];
for(const f of required)if(!existsSync(resolve(root,f)))throw Error('先将 ZIP 内容合并到仓库，再执行本脚本。缺少：'+f);
function patch(path,marker,needle,replacement){
 const file=resolve(root,path),source=readFileSync(file,'utf8');
 if(source.includes(marker)){console.log(`✓ 已更新，无需重复处理：${path}`);return;}
 const count=source.split(needle).length-1;
 if(count!==1)throw Error(`${path} 中未找到唯一替换锚点（找到 ${count} 处），请勿强行覆盖，先反馈当前代码。`);
 writeFileSync(file,source.replace(needle,replacement),'utf8');
 console.log('✓ 更新 '+path);
}
const backendRoute=`  // VPS_BACKUP_FEATURE_V1 — encrypted business-only backup, no local image files.
  if(path.startsWith('/api/backup/') && method==='POST') {
    return protectedRoute(request,async()=>{
      if(path==='/api/backup/export') {
        const body=await request.json();
        const exported=await exportBusinessBackup(env,body?.password);
        return new Response(exported.bytes,{headers:{
          'content-type':'application/zip',
          'content-disposition':\`attachment; filename="\${exported.filename}"\`,
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
`;
{
  const path=resolve(root,'server/index.js');let s=readFileSync(path,'utf8');
  if(!s.includes("from './backup-service.js'")){
    const anchor="import { getLocalImageFile } from './local-image.js';";
    if(s.split(anchor).length!==2)throw Error('无法定位图片模块 import');
    s=s.replace(anchor,anchor+"\nimport { exportBusinessBackup, inspectBusinessBackup, restoreBusinessBackup } from './backup-service.js';");
    writeFileSync(path,s,'utf8');
  }
}
{
 const path=resolve(root,'server/index.js'),source=readFileSync(path,'utf8');
 if(!source.includes('VPS_BACKUP_FEATURE_V1')) {
   const anchor="  if(path==='/api/data/clear-all' && method==='DELETE'){";
   const count=source.split(anchor).length-1;
   if(count!==1)throw Error('server/index.js 路由插入位置无法定位');
   writeFileSync(path,source.replace(anchor,backendRoute+anchor),'utf8');
 }
}
{
 const path=resolve(root,'server/index.js'),source=readFileSync(path,'utf8');
 const from="const limit = path === '/api/upload-image' ? 52*1024*1024 : 15*1024*1024;";
 const to="const limit = path === '/api/upload-image' ? 52*1024*1024 : path.startsWith('/api/backup/') ? 125*1024*1024 : 15*1024*1024;";
 if(source.includes(to)){} else if(source.includes(from))writeFileSync(path,source.replace(from,to),'utf8');
 else throw Error('server/index.js 上传限制位置无法定位');
}
const btn='          <button id="printBtn" class="ghost" type="button">打印评分结果</button>';
patch('server/platform/[[path]].js','id="backupManageBtn"',btn,
  '          <button id="backupManageBtn" class="ghost no-print" type="button">数据备份与恢复</button>\n'+btn);
{
 const path=resolve(root,'server/platform/[[path]].js');let s=readFileSync(path,'utf8');
 const old='  <script src="/assets/admin.js?v=20261019-vps-magic-image-v3" defer></script>';
 if(!s.includes('backup-ui.js')){
   if(!s.includes(old))throw Error('未定位后台 JS 缓存链接，需手工确认新版本');
   s=s.replace(old,old+'\n  <script src="/assets/backup-ui.js?v=20261019-backup-v1" defer></script>');
 }
 if(!s.includes('/assets/backup-ui.css')){
   const idx=s.indexOf('<link rel="stylesheet" href="/assets/style.css?');
   if(idx<0)throw Error('未定位后台 CSS 链接');
   const end=s.indexOf('\n',idx);
   s=s.slice(0,end+1)+'  <link rel="stylesheet" href="/assets/backup-ui.css?v=20261019-backup-v1" />\n'+s.slice(end+1);
 }
 writeFileSync(path,s,'utf8');
}
{
 const path=resolve(root,'server/index.js'),source=readFileSync(path,'utf8');
 const from='server.requestTimeout=30000;';
 const to='server.requestTimeout=300000; // allow authenticated ZIP uploads on slower connections';
 if(!source.includes(to)){
   if(!source.includes(from))throw Error('server/index.js requestTimeout 位置无法定位');
   writeFileSync(path,source.replace(from,to),'utf8');
 }
}
console.log('\n✓ 备份按钮和后端接口已接入。下一步运行 node scripts/backup-feature-smoke.mjs 和 node scripts/verify-build.mjs。');
