/** HTTP smoke test for VPS-only local image upload/serve/delete, using temp SQLite. */
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { LOCAL_IMAGE_DIR, deleteLocalImageUrl } from '../server/local-image.js';
const root=resolve(import.meta.dirname,'..');
const temp=mkdtempSync(join(tmpdir(),'new-rating-local-images-'));
const random=()=>randomBytes(5).toString('hex');
const password=`test-${random()}`;
const secret=randomBytes(32).toString('hex');
const prefix=`localtest-${random()}`;
const probe=createServer();
const port=await new Promise((ok,fail)=>probe.once('error',fail).listen(0,'127.0.0.1',()=>{
  const num=probe.address().port;
  probe.close(()=>ok(num));
}));
const base=`http://127.0.0.1:${port}`;
const child=spawn(process.execPath,['server/index.js'],{cwd:root,env:{...process.env,NODE_ENV:'test',
  HOST:'127.0.0.1',PORT:String(port),DB_PATH:join(temp,'rating.sqlite'),
  ADMIN_USERNAME:'admin',ADMIN_PASSWORD:password,SESSION_SECRET:secret,STORAGE_DRIVER:'sqlite'},stdio:['ignore','pipe','pipe']});
let logs='';
for(const stream of [child.stdout,child.stderr])stream.on('data',d=>logs+=String(d));
const assert=(yes,why)=>{if(!yes)throw Error(why)};
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLZAAAAAElFTkSuQmCC','base64');
let savedUrl='';
try{
  let ready=false;
  for(let i=0;i<75;i++){
    if(child.exitCode!==null)throw Error('Node 后端意外退出');
    try{const r=await fetch(base+'/healthz',{signal:AbortSignal.timeout(500)});if(r.ok){ready=true;break;}}catch{}
    await sleep(120);
  }
  assert(ready,'测试后端启动超时');
  const login=await fetch(base+'/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'admin',password})});
  assert(login.ok,'后台登录失败');
  const cookie=login.headers.get('set-cookie')?.split(';')[0]||'';
  assert(cookie.startsWith('session='),'未取得 session cookie');
  const setting=await fetch(base+'/api/settings',{method:'PUT',headers:{'content-type':'application/json',cookie},body:JSON.stringify({image_settings:{driver:'local',image_key_prefix:prefix,image_max_size_mb:1}})});
  const data=await setting.json();
  assert(setting.ok&&data.settings?.image_settings?.driver==='local','后台不能持久化本地存储配置');
  console.log('✓ 本地图片配置可保存至临时 SQLite');
  const form=new FormData();
  form.append('file',new Blob([png],{type:'image/png'}),'pixel.png');
  form.append('style_code','TEST-STYLE');
  const upload=await fetch(base+'/api/upload-image',{method:'POST',headers:{cookie},body:form});
  const up=await upload.json();
  assert(upload.ok&&up.ok&&up.image?.storage==='local',`本地上传失败: ${JSON.stringify(up)}`);
  savedUrl=up.url;
  assert(savedUrl.startsWith('/image/'+prefix+'-TEST-STYLE.'),'图片访问路径不正确');
  const imagePath=join(LOCAL_IMAGE_DIR,decodeURIComponent(savedUrl.split('/').at(-1)));
  assert(existsSync(imagePath),'图片没有写入项目 image 目录');
  console.log('✓ 上传图片写入 ./image/');
  const preview=await fetch(base+savedUrl);
  assert(preview.status===200&&preview.headers.get('content-type')?.includes('image/png'),'公开图片访问失败');
  assert(Buffer.from(await preview.arrayBuffer()).equals(png),'公开访问返回内容与上传内容不一致');
  const head=await fetch(base+savedUrl,{method:'HEAD'});
  assert(head.ok,'图片 HEAD 访问失败');
  const invalid=await fetch(base+'/image/.env');
  assert(invalid.status===404,'不应公开读取非图片文件');
  console.log('✓ 图片公开 GET/HEAD，其他文件拒绝');
  // IMAGE_MAGIC_AUTO_V1: 真实 WebP 被错误命名为 123.PNG，并按 image/png 发送。
  const webp=Buffer.from('UklGRjgAAABXRUJQVlA4ICwAAADQAQCdASoCAAIAAUAmJaACdLoB+AADsACb/87BsS7Xjn/9g7+cB+cB/RQAAA==','base64');
  const wrongName=new FormData();
  wrongName.append('file',new Blob([webp],{type:'image/png'}),'123.PNG');
  wrongName.append('style_code','MISMATCH-STYLE');
  const guessed=await fetch(base+'/api/upload-image',{method:'POST',headers:{cookie},body:wrongName});
  const guessedBody=await guessed.json();
  assert(guessed.ok && guessedBody.ok && guessedBody.image?.content_type==='image/webp',
    `伪装扩展名 WebP 上传失败：${JSON.stringify(guessedBody)}`);
  assert(guessedBody.url === `/image/${prefix}-MISMATCH-STYLE.webp`, '真实格式没有自动更正为 .webp');
  const webpPreview=await fetch(base+guessedBody.url);
  assert(webpPreview.ok && webpPreview.headers.get('content-type')?.includes('image/webp'), 'WebP 预览 MIME 错误');
  assert(Buffer.from(await webpPreview.arrayBuffer()).equals(webp), 'WebP 预览内容不一致');
  const webpDeleted=await deleteLocalImageUrl(guessedBody.url,{image_key_prefix:prefix});
  assert(webpDeleted.deleted,'WebP 测试图片未成功清理');
  console.log('✓ 123.PNG 实际 WebP：自动纠正为 .webp，HTTP 可预览');
  const evil=new FormData();
  evil.append('file',new Blob(['<svg><script>alert(1)</script></svg>'],{type:'image/svg+xml'}),'evil.svg');
  evil.append('style_code','BAD-STYLE');
  const rejected=await fetch(base+'/api/upload-image',{method:'POST',headers:{cookie},body:evil});
  assert(rejected.status===400,'危险 SVG 不应允许上传');
  console.log('✓ 不支持的图片格式被拒绝');
  const del=await deleteLocalImageUrl(savedUrl,{image_key_prefix:prefix});
  assert(del.deleted===true&&!existsSync(imagePath),'图片删除操作失败');
  savedUrl='';
  console.log('✓ 本地图片安全删除');
  console.log('✓ 所有本地图片 HTTP 冒烟测试通过');
}catch(e){
  console.error('本地图片冒烟测试失败:',e?.stack||e);
  console.error('服务端日志（末尾）:\n'+logs.slice(-6500));
  process.exitCode=1;
}finally{
  if(savedUrl) await deleteLocalImageUrl(savedUrl,{image_key_prefix:prefix}).catch(()=>{});
  if(child.exitCode===null){child.kill();await Promise.race([new Promise(done=>child.once('exit',done)),sleep(3000)]);}
  rmSync(temp,{recursive:true,force:true});
}
