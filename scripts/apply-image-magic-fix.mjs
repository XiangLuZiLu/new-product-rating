/**
 * New Product Rating / VPS vps branch only
 * 修复图片扩展名与实际内容不一致的上传，并让新增款式的预览支持点击放大。
 * 在项目根目录中运行：node scripts/apply-image-magic-fix.mjs
 * 不读取或修改 .env、data/、image/，不修改 main 分支。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const marker = 'IMAGE_MAGIC_AUTO_V1';
const git = (...args) => execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
if (git('branch','--show-current') !== 'vps') throw Error('当前不是 vps 分支，拒绝修改，以免影响 main');
const sourceFiles = [
  'server/local-image.js',
  'server/platform/_shared/imageStorage.js',
  'public/assets/admin.js',
  'server/platform/[[path]].js',
  'scripts/local-images-smoke.mjs'
];
const modifiedPaths = git('diff','--name-only').split('\n').filter(Boolean);
if (modifiedPaths.some(p=>sourceFiles.includes(p))) {
  throw Error('目标文件存在未提交修改，请先处理 git diff，以防覆盖你的工作');
}
const original=new Map(), next=new Map();
for(const path of sourceFiles) {
  const src=readFileSync(resolve(root,path),'utf8');
  original.set(path,src);
  next.set(path,src);
}
function once(input,find,replacement,file){
  const first=input.indexOf(find);
  if(first < 0 || input.indexOf(find,first+find.length)>=0) {
    throw Error(`${file}: 预期源码未找到或不唯一；全部修改已停止，请勿强制替换`);
  }
  return input.replace(find,replacement);
}
function patch(path,func){
  const input=next.get(path);
  next.set(path,func(input));
}
patch('server/local-image.js', s=>{
  if(s.includes(marker))return s;
  const before=`export async function saveLocalImage(key, arrayBuffer, contentType) {
  if (!goodKey(key)) throw badInput('本地存储仅支持 JPG、PNG、GIF、WebP 和 AVIF 图片');
  const type = extensions.get(extname(key).toLowerCase());
  if (String(contentType).toLowerCase() !== type) throw badInput('图片格式与文件扩展名不一致');
  const bytes = new Uint8Array(arrayBuffer);
  if (!imageSignatureMatches(bytes, type)) throw badInput('图片文件内容无效或格式不匹配');
  await mkdir(LOCAL_IMAGE_DIR, { recursive: true, mode: 0o750 });
  const file = join(LOCAL_IMAGE_DIR, key);
  const temp = join(LOCAL_IMAGE_DIR, \`.\${randomUUID()}.tmp\`);
  try {
    await writeFile(temp, bytes, { flag:'wx', mode: 0o640 });
    await rename(temp, file);
  } catch (error) {
    await unlink(temp).catch(() => {});
    throw error;
  }
  return { key, url: \`/image/\${encodeURIComponent(key)}\`, raw_url: \`/image/\${encodeURIComponent(key)}\`, storage:'local' };
}`;
  const after=`// ${marker}: 判断实际文件内容，不信任用户上传的扩展名或浏览器 MIME 类型。
// 依然严格禁止无法识别的文件，包括 SVG、HTML 等可执行内容。
function realImageFormat(bytes) {
  const formats = [
    ['image/jpeg', 'jpg'], ['image/png', 'png'], ['image/gif', 'gif'],
    ['image/webp', 'webp'], ['image/avif', 'avif']
  ];
  const detected = formats.find(([mime]) => imageSignatureMatches(bytes, mime));
  return detected ? { mime: detected[0], ext: detected[1] } : null;
}

export async function saveLocalImage(key, arrayBuffer, _declaredContentType = '') {
  // 文件名已由后端 buildObjectKey 生成，不能允许任意路径或目录穿越。
  const name = /^([A-Za-z0-9_-]{1,170})\\.[A-Za-z0-9]{1,8}$/.exec(String(key || ''));
  if (!name) throw badInput('图片文件名不符合安全规则');
  const bytes = new Uint8Array(arrayBuffer);
  const actual = realImageFormat(bytes);
  if (!actual) throw badInput('无法识别图片真实格式，仅支持 JPG、PNG、GIF、WebP、AVIF');
  const realKey = \`\${name[1]}.\${actual.ext}\`;
  if (!goodKey(realKey)) throw badInput('图片文件名不符合安全规则');
  await mkdir(LOCAL_IMAGE_DIR, { recursive: true, mode: 0o750 });
  const file = join(LOCAL_IMAGE_DIR, realKey);
  const temp = join(LOCAL_IMAGE_DIR, \`.\${randomUUID()}.tmp\`);
  try {
    await writeFile(temp, bytes, { flag:'wx', mode: 0o640 });
    await rename(temp, file);
  } catch (error) {
    await unlink(temp).catch(() => {});
    throw error;
  }
  const url = \`/image/\${encodeURIComponent(realKey)}\`;
  return { key: realKey, url, raw_url: url, storage: 'local', content_type: actual.mime };
}`;
  s=once(s,before,after,'server/local-image.js');
  // No longer need the filename-to-MIME table for storage; the HTTP file server already maps MIME by final extension.
  s=once(s,`import { dirname, extname, join, resolve } from 'node:path';`,`import { dirname, join, resolve } from 'node:path';`,'server/local-image.js');
  s=once(s,`const extensions = new Map([
  ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'], ['.png', 'image/png'],
  ['.webp', 'image/webp'], ['.gif', 'image/gif'], ['.avif', 'image/avif']
]);
`,'','server/local-image.js');
  return s;
});
patch('server/platform/_shared/imageStorage.js',s=>{
  if(s.includes(marker))return s;
  s=once(s,
    `  if (!String(file.type || '').startsWith('image/')) throw jsonError('只能上传图片文件', 400);`,
    `  // ${marker}: 本地存储以真实二进制文件头为准，兼容扩展名/MIME 误标。
  if (driver !== 'local' && !String(file.type || '').startsWith('image/')) throw jsonError('只能上传图片文件', 400);`,
    'server/platform/_shared/imageStorage.js');
  return s;
});
patch('public/assets/admin.js',s=>{
  if(s.includes(marker))return s;
  s=once(s,
    `<img class="image-preview" src="\${escapeHtml(src)}" alt="产品图预览" loading="lazy" referrerpolicy="no-referrer" />`,
    `<img class="image-preview" src="\${escapeHtml(src)}" data-preview-image="\${escapeHtml(src)}" alt="产品图预览（点击可放大）" loading="lazy" referrerpolicy="no-referrer" />`,
    'public/assets/admin.js');
  s=once(s,
    `renderStylePreviewImage(stylePreviewLocalObjectUrl, '本地预览：点击保存款式后才会上传，取消/换图前不会写入七牛云');`,
    `// ${marker}\n  renderStylePreviewImage(stylePreviewLocalObjectUrl, '本地预览：可点击图片放大；保存款式后才上传到当前配置的图片存储');`,
    'public/assets/admin.js');
  return s;
});
patch('server/platform/[[path]].js',s=>{
  if(s.includes('20261019-vps-magic-image-v3'))return s;
  if(!s.includes('20261019-vps-local-image-v2'))throw Error('后台页面资源版本与补丁不符');
  return s.replaceAll('20261019-vps-local-image-v2','20261019-vps-magic-image-v3');
});
patch('scripts/local-images-smoke.mjs',s=>{
  if(s.includes(marker))return s;
  const find=`  console.log('✓ 图片公开 GET/HEAD，其他文件拒绝');`;
  const insert=`  console.log('✓ 图片公开 GET/HEAD，其他文件拒绝');
  // ${marker}: 真实 WebP 被错误命名为 123.PNG，并按 image/png 发送。
  const webp=Buffer.from('UklGRjgAAABXRUJQVlA4ICwAAADQAQCdASoCAAIAAUAmJaACdLoB+AADsACb/87BsS7Xjn/9g7+cB+cB/RQAAA==','base64');
  const wrongName=new FormData();
  wrongName.append('file',new Blob([webp],{type:'image/png'}),'123.PNG');
  wrongName.append('style_code','MISMATCH-STYLE');
  const guessed=await fetch(base+'/api/upload-image',{method:'POST',headers:{cookie},body:wrongName});
  const guessedBody=await guessed.json();
  assert(guessed.ok && guessedBody.ok && guessedBody.image?.content_type==='image/webp',
    \`伪装扩展名 WebP 上传失败：\${JSON.stringify(guessedBody)}\`);
  assert(guessedBody.url === \`/image/\${prefix}-MISMATCH-STYLE.webp\`, '真实格式没有自动更正为 .webp');
  const webpPreview=await fetch(base+guessedBody.url);
  assert(webpPreview.ok && webpPreview.headers.get('content-type')?.includes('image/webp'), 'WebP 预览 MIME 错误');
  assert(Buffer.from(await webpPreview.arrayBuffer()).equals(webp), 'WebP 预览内容不一致');
  const webpDeleted=await deleteLocalImageUrl(guessedBody.url,{image_key_prefix:prefix});
  assert(webpDeleted.deleted,'WebP 测试图片未成功清理');
  console.log('✓ 123.PNG 实际 WebP：自动纠正为 .webp，HTTP 可预览');`;
  return once(s,find,insert,'scripts/local-images-smoke.mjs');
});
for(const [path,s] of next) {
  if(s !== original.get(path)) {
    writeFileSync(resolve(root,path),s,'utf8');
    console.log('已修改:',path);
  } else console.log('已包含优化:',path);
}
console.log('完成：真实格式识别、图片预览点击放大。请运行 node scripts/verify-build.mjs && node scripts/local-images-smoke.mjs');
