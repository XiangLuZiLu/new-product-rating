/**
 * 完整 HTTP 冒烟测试，使用随机临时目录与临时端口。不连接真实站点，不写正式 SQLite。
 * 请在已运行 scripts/prepare-vps.ps1 后执行： node scripts/integration-smoke.mjs
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
const root=resolve(import.meta.dirname,'..');
const temp=mkdtempSync(join(tmpdir(),'new-product-rating-smoke-'));
const password='TEST_ONLY_'+randomBytes(16).toString('hex');
const sessionSecret=randomBytes(32).toString('hex');
const probe=createServer();
const port=await new Promise((ok,fail)=>probe.once('error',fail).listen(0,'127.0.0.1',()=>{
  const num=probe.address().port;
  probe.close(()=>ok(num));
}));
const base=`http://127.0.0.1:${port}`;
const child=spawn(process.execPath,['server/index.js'],{cwd:root,env:{...process.env,NODE_ENV:'test',
  HOST:'127.0.0.1',PORT:String(port),DB_PATH:join(temp,'rating.sqlite'),
  ADMIN_USERNAME:'admin',ADMIN_PASSWORD:password,SESSION_SECRET:sessionSecret,
  ADMIN_PATH:'admin',STORAGE_DRIVER:'sqlite'},stdio:['ignore','pipe','pipe']});
let logs='';
child.stdout.on('data',d=>{logs+=String(d)});
child.stderr.on('data',d=>{logs+=String(d)});
const assert=(condition,msg)=>{if(!condition)throw new Error(msg)};
async function req(path,options={},expected=200){
  const res=await fetch(`${base}${path}`,{redirect:'manual',...options});
  const ct=res.headers.get('content-type')||'';
  const body=ct.includes('application/json')?await res.json():await res.text();
  assert(res.status===expected,`${options.method||'GET'} ${path} 预期 ${expected} 实际 ${res.status}: ${JSON.stringify(body).slice(0,500)}`);
  return {res,body};
}
const method=(method,body,cookie='')=>({method,headers:{'content-type':'application/json; charset=utf-8',...(cookie?{cookie}:{})},body:JSON.stringify(body)});
const bjFuture=()=>new Date(Date.now()+2*86400000+8*3600000).toISOString().replace('T',' ').slice(0,19);
try{
  let ready=false;
  for(let i=0;i<70;i++){
    if(child.exitCode!==null)throw new Error('后端意外退出');
    try{const r=await fetch(base+'/healthz',{signal:AbortSignal.timeout(500)});if(r.ok){ready=true;break;}}catch{}
    await sleep(120);
  }
  assert(ready,'8秒内无法启动本地测试服务器');
  console.log('✓ 后端启动、健康检查');
  const {body:admin}=await req('/admin');
  assert(typeof admin==='string' && admin.includes('loginForm'),'后台首页 HTML 缺少登录表单');
  const {body:ratingJs}=await req('/assets/rating.js');
  assert(typeof ratingJs==='string' && ratingJs.includes('/api/public/progress'),'评分前端缺少状态记录逻辑');
  console.log('✓ 后台与评分静态资源');
  await req('/api/styles',{},401);
  const login=await req('/api/login',method('POST',{username:'admin',password}),200);
  assert(login.body.ok,'后台登录响应未成功');
  const cookie=(login.res.headers.get('set-cookie')||'').split(';')[0];
  assert(cookie.includes('session='),'登录未设置 Cookie');
  console.log('✓ 未授权访问拦截、后台登录');
  const name='SMOKE-'+randomBytes(5).toString('hex');
  const made=await req('/api/styles',method('POST',{style_code:name,season:'测试',base_price:99},cookie),201);
  const style=made.body.style;
  assert(style?.id,'创建款式缺少 ID');
  const created=await req('/api/review-links',method('POST',{
    name:'HTTP冒烟测试',style_ids:[style.id],expires_at:bjFuture()
  },cookie),201);
  const link=created.body.link;
  assert(link?.code,'生成评分链接缺少 code');
  const loaded=await req(`/api/public/review-link/${link.code}`);
  assert(loaded.body.styles?.length===1,'公开链接未包含预期款式');
  await req(`/${link.code}`);
  console.log('✓ 新建款式、链接创建、公开链接可访问');
  const reviewer='自动验收人员';
  const prog=await req('/api/public/progress',method('POST',{reviewer,review_link_code:link.code}));
  assert(prog.body.progress?.status==='in_progress','开始评分未显示评分中');
  const progressOne=await req(`/api/review-links/${link.code}/progress`,{headers:{cookie}});
  assert(progressOne.body.items?.[0]?.status==='in_progress','后台日志未显示评分中');
  await req('/api/public/draft',method('PUT',{
    reviewer,review_link_code:link.code,drafts:[{style_id:style.id,scores:{appearance:3}}]
  }));
  console.log('✓ 评分开始、评分中日志、草稿保存');
  const send={reviewer,review_link_code:link.code,scores:[{
    style_id:style.id,reviewer,review_link_code:link.code,
    scores:{appearance:8,material:8,craftsmanship:8,capacity:8,comfort:8}
  }]};
  const submitted=await req('/api/public/submit',method('POST',send),201);
  assert(submitted.body.scores?.length===1,'未正确返回评分结果');
  const progressTwo=await req(`/api/review-links/${link.code}/progress`,{headers:{cookie}});
  assert(progressTwo.body.items?.[0]?.status==='completed','正式提交后未显示已完成');
  assert(progressTwo.body.items?.[0]?.submitted_at,'缺少正式提交时间');
  const scores=await req(`/api/scores?review_link_code=${link.code}`,{headers:{cookie}});
  assert(scores.body.scores?.length===1,'后台未查询到评分结果');
  await req('/api/public/submit',method('POST',send),409);
  console.log('✓ 原子提交、已完成日志、后台查询、同日重复提交拒绝');
  console.log('全部 HTTP 冒烟测试通过（数据仅保存在临时目录）');
}catch(e){
  console.error('HTTP 冒烟测试失败:',e?.stack||e);
  console.error('服务端日志（末尾）:\n'+logs.slice(-6000));
  process.exitCode=1;
}finally{
  if(child.exitCode===null){child.kill();await Promise.race([new Promise(resolve=>child.once('exit',resolve)),sleep(3000)]);}
  rmSync(temp,{recursive:true,force:true});
}
