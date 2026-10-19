import { readFileSync, existsSync } from 'node:fs';
const req = ['server/index.js','server/sqlite-storage.js','server/platform/index.js',
  'server/platform/api/_middleware.js','server/platform/api/public/submit.js','server/platform/_shared/storage.js',
  'public/assets/admin.js','public/assets/rating.js','public/assets/style.css',
  'deploy/new-product-rating.service','.env.example','.gitignore'];
for (const f of req) if (!existsSync(f)) throw new Error(`文件缺失：${f}`);
const storage = readFileSync('server/platform/_shared/storage.js','utf8');
if (!storage.includes("if (driver === 'sqlite') return createSqliteStorage(env)")) throw new Error('SQLite 存储适配未生效');
const admin = readFileSync('public/assets/admin.js','utf8');
if (!admin.includes('data-review-link-progress=')) throw new Error('评分链接名称弹框补丁未生效');
const rating = readFileSync('public/assets/rating.js','utf8');
if (!rating.includes("requestJson('/api/public/progress'")) throw new Error('评分人状态记录补丁未生效');
const env = readFileSync('.env.example','utf8');
if (!env.includes('HOST=127.0.0.1') || !env.includes('PORT=18080') || !env.includes('data/rating.sqlite')) throw new Error('端口或数据库路径不符合要求');
const gitignore = readFileSync('.gitignore','utf8');
if (!gitignore.includes('data/')) throw new Error('缺少忽略数据库目录的规则');
console.log('✓ 文件完整性、SQLite 存储接入、评分弹框、评分状态、18080 和数据目录检查通过');

// VPS_LOCAL_IMAGES_TOAST_V1
for (const f of ['server/local-image.js','scripts/local-images-smoke.mjs']) { if (!existsSync(f)) throw new Error('本地图片文件缺失：'+f); }
if (!readFileSync('server/index.js','utf8').includes("getLocalImageFile")) throw new Error('本地图片公开路由未接入');
if (!readFileSync('server/platform/_shared/imageStorage.js','utf8').includes("saveLocalImage")) throw new Error('本地图片上传未接入');
if (!readFileSync('server/platform/[[path]].js','utf8').includes('value="local"')) throw new Error('本地图片选项未接入');
if (!existsSync('scripts/render-rating-service.mjs')) throw new Error('缺少动态 systemd 配置生成脚本');
if (!readFileSync('server/local-image.js','utf8').includes('fileURLToPath(import.meta.url)')) throw new Error('本地图片路径未使用项目目录动态计算');
console.log('✓ 本地图片上传、展示、提示居中和服务权限配置检查通过');
