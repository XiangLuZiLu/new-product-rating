/**
 * new-product-rating vps patch: centered toast + local image storage.
 * Run from the repo: node scripts/apply-local-images-toast.mjs
 * Only touches the 'vps' branch. No database/.env files modified.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
const root = resolve(import.meta.dirname, '..');
const marker = 'VPS_LOCAL_IMAGES_TOAST_V1';
const files = new Map();
const get = path => {
  if (files.has(path)) return files.get(path);
  const full = resolve(root, path);
  if (!existsSync(full)) throw Error(`缺少必需文件 ${path}`);
  const val = readFileSync(full, 'utf8').replace(/\r\n?/g, '\n');
  files.set(path,val);
  return val;
};
const put = (p, s) => files.set(p, s);
const replaceOnce = (s, needle, replacement, label) => {
  const at = s.indexOf(needle);
  if (at < 0 || s.indexOf(needle,at+needle.length)>=0) throw Error(`${label}: 无法唯一匹配源码，已停止改造，请不要强行覆盖`);
  return s.replace(needle,replacement);
};
const git = args => execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
if (git(['branch','--show-current']) !== 'vps') throw Error('当前分支不是 vps，停止以防修改 main');
const status = git(['status','--porcelain']);
if (status && status.split('\n').some(l => !l.endsWith('scripts/apply-local-images-toast.mjs') && !l.endsWith('server/local-image.js') && !l.endsWith('scripts/local-images-smoke.mjs'))) {
  throw Error('检测到其他未提交的改动，请先确认 git status 再运行补丁，以免覆盖工作');
}
let s=get('server/platform/_shared/storage.js');
if (!s.includes(marker)) {
  s=replaceOnce(s,"  if (['r2', 'cloudflare-r2'].includes(raw)) return 'r2';",`  // ${marker}\n  if (['local', 'disk', 'file'].includes(raw)) return 'local';\n  if (['r2', 'cloudflare-r2'].includes(raw)) return 'r2';`,'image driver');
  put('server/platform/_shared/storage.js',s);
}
s=get('server/platform/_shared/imageStorage.js');
if (!s.includes(marker)) {
  s=replaceOnce(s,"import { getStorage, imageSettingsFromEnv, normalizeImageSettings } from './storage.js';",`import { getStorage, imageSettingsFromEnv, normalizeImageSettings } from './storage.js';\n// ${marker}\nimport { saveLocalImage, deleteLocalImageUrl } from '../../local-image.js';`,'imageStorage import');
  s=replaceOnce(s,"  const driver = normalizeImageDriver(config);\n  const key = objectKeyFromPublicUrl(imageUrl, config);",`  const driver = normalizeImageDriver(config);\n  if (driver === 'local') return deleteLocalImageUrl(imageUrl, config);\n  const key = objectKeyFromPublicUrl(imageUrl, config);`,'local image delete');
  s=replaceOnce(s,"  if (driver === 'r2') return uploadToR2(env, config, key, bytes, contentType);",`  if (driver === 'local') return saveLocalImage(key, bytes, contentType);\n  if (driver === 'r2') return uploadToR2(env, config, key, bytes, contentType);`,'local image upload');
  put('server/platform/_shared/imageStorage.js',s);
}
s=get('server/index.js');
if (!s.includes(marker)) {
  s=replaceOnce(s,"import { tryDeleteImageByUrl } from './platform/_shared/imageStorage.js';",`import { tryDeleteImageByUrl } from './platform/_shared/imageStorage.js';\n// ${marker}\nimport { getLocalImageFile } from './local-image.js';`,'server local import');
  s=replaceOnce(s,"'.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp'",`'.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.avif':'image/avif'`,'local mimetypes');
  s=replaceOnce(s,"function staticResponse(path, req, res) {",`function staticResponse(path, req, res, cacheControl = 'public, max-age=300') {`,'serve static fn');
  s=replaceOnce(s,"'cache-control':'public, max-age=300'});",`'cache-control':cacheControl});`,'serve static cache');
  s=replaceOnce(s,"    if(req.headers['content-length'] && Number(req.headers['content-length'])>15*1024*1024){res.writeHead(413);res.end('Request Too Large');return;}\n    const path=new URL(req.url||'/','http://localhost').pathname;",`    const path=new URL(req.url||'/','http://localhost').pathname;\n    const limit = path === '/api/upload-image' ? 52*1024*1024 : 15*1024*1024;\n    if(req.headers['content-length'] && Number(req.headers['content-length'])>limit){res.writeHead(413);res.end('Request Too Large');return;}`,'upload request body limits');
  s=replaceOnce(s,"    const file=staticPath(path);",`    if (path.startsWith('/image/')) {\n      const localFile = getLocalImageFile(path);\n      if (!localFile) { res.writeHead(404,{'content-type':'text/plain; charset=utf-8'});res.end('Not Found');return; }\n      if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405,{'allow':'GET, HEAD'});res.end();return; }\n      staticResponse(localFile, req, res, 'no-cache');\n      return;\n    }\n    const file=staticPath(path);`,'local public image route');
  put('server/index.js',s);
}
s=get('server/platform/[[path]].js');
if (!s.includes(marker)) {
  s=replaceOnce(s,`<option value="url">只粘贴图片链接</option>`,`<option value="url">只粘贴图片链接</option>\n                <!-- ${marker} -->\n                <option value="local">本地存储（项目目录 ./image）</option>`,'UI local option');
  s=replaceOnce(s,`            <div class="image-config-row image-config-row-three">`,`            <p class="tip local-storage-notice hidden" role="status">本地图片保存至项目目录 <code>./image/</code>（路径自动跟随实际部署目录）。上传后将生成同站点的 <code>/image/文件名</code> 访问地址；无需配置 CDN、S3 密钥。</p>\n            <div class="image-config-row image-config-row-three">`,'UI local path notice');
  s=replaceOnce(s,`<div class="image-config-row image-config-row-two">\n              <label>图片公开访问域名 / CDN域名`,`<div class="image-config-row image-config-row-two cloud-settings">\n              <label>图片公开访问域名 / CDN域名`,'UI cloud settings');
  s=s.replaceAll('20261017-vps-v1','20261019-vps-local-image-v2');
  put('server/platform/[[path]].js',s);
}
s=get('public/assets/admin.js');
if (!s.includes(marker)) {
  s=replaceOnce(s,"imageStorageForm.elements.driver.value = ['url', 'r2', 's3'].includes(data.driver) ? data.driver : 'url';",`// ${marker}\n  imageStorageForm.elements.driver.value = ['url', 'local', 'r2', 's3'].includes(data.driver) ? data.driver : 'url';`,'admin driver whitelist');
  s=replaceOnce(s,"  const isS3 = driver === 's3';\n  imageStorageForm.querySelectorAll('.s3-dependent, .s3-settings').forEach(el => el.classList.toggle('hidden', !isS3));",`  const isS3 = driver === 's3';\n  imageStorageForm.querySelectorAll('.s3-dependent, .s3-settings').forEach(el => el.classList.toggle('hidden', !isS3));\n  imageStorageForm.querySelectorAll('.local-storage-notice').forEach(el => el.classList.toggle('hidden', driver !== 'local'));\n  imageStorageForm.querySelectorAll('.cloud-settings').forEach(el => el.classList.toggle('hidden', driver === 'local'));`,'admin local form toggle');
  put('public/assets/admin.js',s);
}
s=get('public/assets/style.css');
if (!s.includes(marker)) {
  s+=`\n/* ${marker}: consistent centered success/error messages, on both admin and public pages */\nbody .message {\n  position: fixed;\n  top: 50%;\n  left: 50%;\n  transform: translate(-50%, -50%);\n  z-index: 110000;\n  width: max-content;\n  max-width: min(90vw, 520px);\n  margin: 0;\n  padding: 16px 24px;\n  text-align: center;\n  font-size: 15px;\n  line-height: 1.65;\n  font-weight: 600;\n  white-space: pre-wrap;\n  overflow-wrap: anywhere;\n  box-shadow: 0 16px 45px rgba(15, 23, 42, .20);\n  pointer-events: none;\n  border-radius: 14px;\n}\nbody .message.hidden { display: none !important; }\n.local-storage-notice {\n  margin: 6px 0 12px;\n  padding: 12px 14px;\n  border: 1px solid #bfdbfe;\n  border-radius: 10px;\n  background: #eff6ff;\n  color: #1d4ed8;\n}\n.local-storage-notice code { overflow-wrap: anywhere; }\n`;
  put('public/assets/style.css',s);
}
s=get('deploy/new-product-rating.service');
if (!s.includes(marker)) {
  s=replaceOnce(s,'ReadWritePaths=/opt/new-product-rating/data',`ReadWritePaths=/opt/new-product-rating/data /opt/new-product-rating/image # ${marker}`,'systemd writable directory');
  // systemd treats inline hash as a literal token; put marker on separate comment line instead.
  s=s.replace(`ReadWritePaths=/opt/new-product-rating/data /opt/new-product-rating/image # ${marker}`,`# ${marker}\nReadWritePaths=/opt/new-product-rating/data /opt/new-product-rating/image`);
  put('deploy/new-product-rating.service',s);
}
s=get('.gitignore');
if (!s.includes('/image/')) put('.gitignore',s.replace(/\s*$/,'\n')+'/image/\n');
s=get('scripts/verify-build.mjs');
if (!s.includes(marker)) {
  s += `\n// ${marker}\nfor (const f of ['server/local-image.js','scripts/local-images-smoke.mjs']) { if (!existsSync(f)) throw new Error('本地图片文件缺失：'+f); }\nif (!readFileSync('server/index.js','utf8').includes("getLocalImageFile")) throw new Error('本地图片公开路由未接入');\nif (!readFileSync('server/platform/_shared/imageStorage.js','utf8').includes("saveLocalImage")) throw new Error('本地图片上传未接入');\nif (!readFileSync('server/platform/[[path]].js','utf8').includes('value="local"')) throw new Error('本地图片选项未接入');\nif (!existsSync('scripts/render-rating-service.mjs')) throw new Error('缺少动态 systemd 配置生成脚本');
if (!readFileSync('server/local-image.js','utf8').includes('fileURLToPath(import.meta.url)')) throw new Error('本地图片路径未使用项目目录动态计算');\nconsole.log('✓ 本地图片上传、展示、提示居中和服务权限配置检查通过');\n`;
  put('scripts/verify-build.mjs',s);
}
s=get('README.md');
if (!s.includes(marker)) {
  s+=`\n## VPS 本地图片与居中提示（${marker}）\n\n后台设置 → 图片存储配置 → 选择“本地存储（项目目录 ./image）”→ 保存。\n图片保存在项目相对目录 .\/image\/ 下（具体绝对路径随部署位置自动变化），通过同一域名 \/image/文件名 公开访问。\n本地图片仅支持 JPG、PNG、GIF、WebP、AVIF（不支持 SVG，以防同源脚本风险）。\n同一款式编码 + 文件前缀 + 扩展名会覆盖先前文件。图片目录被 .gitignore 忽略。\n首次上线须执行：\n\n\`\`\`bash\ninstall -d -o ratingapp -g ratingapp -m 750 "$(pwd)/image"\nsystemctl daemon-reload\nsystemctl restart new-product-rating\n\`\`\`\n\n原七牛云等 S3 配置保留；默认仍保持“只粘贴图片链接”，切换本地需要管理员手动保存。\n`;
  put('README.md',s);
}
for (const [p,value] of files) {
  const original=readFileSync(resolve(root,p),'utf8').replace(/\r\n?/g,'\n');
  if(value!==original){writeFileSync(resolve(root,p),value,'utf8');console.log('已改造:',p)}
}
console.log('✓ VPS 本地图片与居中提示补丁已应用。下一步执行 node scripts/verify-build.mjs 和 node scripts/local-images-smoke.mjs');
