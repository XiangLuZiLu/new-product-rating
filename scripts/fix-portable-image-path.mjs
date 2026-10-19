/**
 * Compatibility adjustment for prior versions of the local-images patch.
 * Idempotent; doesn't touch .env, SQLite data or image data.
 * Run after apply-local-images-toast.mjs on vps.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const branch = execFileSync('git',['branch','--show-current'],{cwd:root,encoding:'utf8'}).trim();
if (branch !== 'vps') throw Error('仅允许在 vps 分支运行');
function update(file,edit) {
  const full=resolve(root,file);
  if(!existsSync(full)) throw Error('找不到 '+file);
  const before=readFileSync(full,'utf8');
  const after=edit(before);
  if(before!==after){writeFileSync(full,after,'utf8'); console.log('已调整:',file)}
  else console.log('已符合要求:',file);
}
update('server/platform/[[path]].js', s => s
  .replace('（部署后为 <code>/opt/new-product-rating/image/</code>）','（路径自动跟随实际部署目录）')
  .replace('（部署后为 &lt;code&gt;/opt/new-product-rating/image/&lt;/code&gt;）','（路径自动跟随实际部署目录）'));
update('scripts/verify-build.mjs',s=>s
  .replace("if (!readFileSync('deploy/new-product-rating.service','utf8').includes('/opt/new-product-rating/image')) throw new Error('systemd 未允许本地图片写入');",
    "if (!existsSync('scripts/render-rating-service.mjs')) throw new Error('缺少根据部署路径生成 systemd 单元的脚本');\nif (!readFileSync('server/local-image.js','utf8').includes('fileURLToPath(import.meta.url)')) throw new Error('本地图片目录未动态计算');"));
update('README.md',s=>s
  .replace('上传文件存到 /opt/new-product-rating/image/，通过同一域名 /image/文件名 公开访问。',
    '图片保存于实际项目根目录的 ./image/：部署在 /opt/new-product-rating → /opt/new-product-rating/image；部署在 /root/new-product-rating → /root/new-product-rating/image。图片通过同站点 /image/文件名 公开访问。')
  .replace('install -d -o ratingapp -g ratingapp -m 750 /opt/new-product-rating/image',
    'install -d -o ratingapp -g ratingapp -m 750 "$(pwd)/image"'));
const marker='PORTABLE_IMAGE_ROOT_V2';
const docLines = [
  '',
  '## 部署位置自动识别（'+marker+'）',
  '',
  '图片目录恒为 **安装项目的根目录/image/**，使用 server/local-image.js 自身文件位置（import.meta.url）计算，不依赖当前工作目录。',
  '例如：/opt/new-product-rating/image/ 或 /root/new-product-rating/image/。前端设置直接显示 ./image/ 即可。',
  '',
  '如果将项目搬到其他目录，需要重新生成 systemd 单元文件，使 WorkingDirectory、ExecStart 和 ReadWritePaths 与实际路径一致：',
  '',
  '```bash',
  'cd /实际安装目录/new-product-rating',
  'install -d -o ratingapp -g ratingapp -m 750 ./image',
  'node scripts/render-rating-service.mjs > /etc/systemd/system/new-product-rating.service',
  'systemctl daemon-reload',
  'systemctl restart new-product-rating',
  '```',
  '',
  '注意：SQLite 的 DB_PATH 是独立设置，如迁移目录请检查 .env 是否仍指向旧位置。/root 默认无法被 ratingapp 用户访问，不建议部署在 /root 或放宽 /root 权限。',
  ''
].join('\n');
update('README.md', s => s.includes(marker) ? s : s + docLines);
console.log('✓ 本地图片目录已确认使用项目相对路径 ./image（项目部署位置自动识别）');
