/**
 * Render a systemd unit for *this checkout*, regardless of where it is installed.
 * Run as root, from anywhere: node /path/to/repo/scripts/render-rating-service.mjs > /etc/systemd/system/new-product-rating.service
 * Rendering does NOT modify systemd or application settings.
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const node = process.execPath;
if (/[\r\n]/.test(root) || /[\r\n]/.test(node) || /[\s%]/.test(root) || /[\s%]/.test(node)) {
  throw Error('systemd 模板生成暂不支持含空格或 % 的安装目录／Node 路径');
}
if (process.platform !== 'linux') throw Error('只能在 Linux 服务器上生成 systemd 单元文件');
if (root === '/root' || root.startsWith('/root/')) {
  process.stderr.write('注意：/root 默认不允许 ratingapp 访问。建议部署到 /opt 或 /srv；如果部署在 /root，须自行安全地处理目录穿越权限。\n');
}
process.stdout.write(`[Unit]
Description=New Product Rating VPS (SQLite)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=ratingapp
Group=ratingapp
WorkingDirectory=${root}
ExecStart=${node} --env-file=${root}/.env ${root}/server/index.js
Restart=on-failure
RestartSec=3
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=${root}/data ${root}/image
PrivateTmp=true
UMask=0077
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
`);
