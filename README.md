# 新品评审评分系统（VPS / Node.js / SQLite）

> **部署分支：[`vps`](https://github.com/XiangLuZiLu/new-product-rating/tree/vps)**。`main` 是独立分支，不要将本指南中的部署、构建或数据操作误用于 `main`。
>
> 本文针对当前 VPS 版实际代码整理，涵盖 **Git 克隆 → 环境初始化 → SQLite 与图片权限 → 测试 → systemd 开机自启 → Caddy HTTPS → 日常更新、重启和故障排查**。适用于 Ubuntu 24.04、Node.js **22.13.0 或更新的 Node 22 版本**。如果你已经部署成功，直接阅读[更新现有站点](#八更新现有站点不覆盖业务数据)。

## 一、项目概览与重要路径

| 项目 | 当前 VPS 部署示例 | 说明 |
|---|---|---|
| GitHub | `XiangLuZiLu/new-product-rating` 的 `vps` 分支 | 与 `main` 独立 |
| 项目目录 | `/opt/new-product-rating` | 推荐放在 `/opt`，不要放在 `/root` 下 |
| 服务器内部地址 | `http://127.0.0.1:18080` | 不直接向公网开放 18080 |
| 正式域名 | `https://ratings.xianglupiju.com` | 以实际 DNS / Caddy 配置为准 |
| 管理后台 | `https://ratings.xianglupiju.com/admin` | `ADMIN_PATH` 可配置 |
| 服务名称 | `new-product-rating` | 通过 systemd 管理 |
| 运行用户 | `ratingapp` | 最小权限 |
| SQLite | `/opt/new-product-rating/data/rating.sqlite` | 实际以 `.env` 的 `DB_PATH` 为准；运行时可能包含 `-wal`、`-shm` |
| 本地图片 | `/opt/new-product-rating/image/` | 实际随项目目录自动变化，为 `./image/` |
| 恢复前快照 | `data/backups/pre-restore-*.sqlite` | 恢复前自动生成，属本地运维快照，不含图片 |
| Caddy | `/etc/caddy/Caddyfile`、可能的 `/etc/caddy/sites/*.caddy` | 不覆盖其他站点配置 |

技术上使用 Node.js 内置 HTTP 服务及 `node:sqlite`，**不需要 Docker、PostgreSQL、SQLite 命令行工具或额外的 npm 依赖**。SQLite 使用 WAL，因此不要在应用运行期间直接复制单个 `.sqlite` 文件当作一致性备份，应使用后台备份功能或 SQLite 在线备份机制。

**一定要保留的数据：** `.env`、`data/`（含 SQLite、WAL/SHM 和恢复前快照）、`image/`。这三个路径不会通过 GitHub 自动恢复。正常 `git pull` 不会删除它们，但切勿对项目目录使用 `git clean -fdx`、`git reset --hard` 后再误删数据，或直接 `rm -rf /opt/new-product-rating`。

---

## 二、初次部署：准备 Ubuntu 与 Node.js

使用具有 `sudo` 权限的账号；以下示例使用 `root` SSH 终端，普通用户请自行为系统管理命令添加 `sudo`。

### 1. 检查环境和正在运行的服务

```bash
cat /etc/os-release | head -n 6
uname -m
date
command -v git || true
command -v node || true
node -v 2>/dev/null || true
ss -lntp | grep -E ':(18080|9527)[[:space:]]' || true
```

如果 **18080 已被其他应用占用**，先查清原因，不要直接停止进程。现有 `9527` 是独立服务，与本项目无关，**禁止误停**。

### 2. 安装 Git、工具和 Node.js

```bash
apt-get update
apt-get install -y git curl ca-certificates openssl
```

如果 `node -v` 已达到 **22.13.0**（例如 `v22.23.3`），**不需要重新安装 Node**。如果尚未安装或版本过低，可按 NodeSource 的 Node 22 安装方式操作；以下脚本先保存到文件，便于检查：

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x -o /tmp/nodesource-setup-22.sh
# 可先查看安装脚本内容：less /tmp/nodesource-setup-22.sh
bash /tmp/nodesource-setup-22.sh
apt-get install -y nodejs
node -v
```

确认 Node 符合要求（脚本会在版本过低时退出）：

```bash
node -e 'const [a,b]=process.versions.node.split(".").map(Number);if(a!==22||b<13){console.error("需要 Node 22.13+，当前为",process.version);process.exit(1)}console.log("Node.js 版本检查通过:",process.version)'
```

> `node:sqlite` 在 Node 22 中可能输出实验性功能提示，这不是应用启动失败。

---

## 三、从 GitHub 拉取 `vps` 项目

首次部署、且确认 `/opt/new-product-rating` 目录不存在时执行：

```bash
cd /opt
# 如已存在该目录，请停止 clone，跳到“八、更新现有站点”。
if [ -e /opt/new-product-rating ]; then
  echo '项目目录已存在，请不要覆盖克隆，改用第八章的更新步骤'
else
  git clone --branch vps --single-branch \
    https://github.com/XiangLuZiLu/new-product-rating.git \
    /opt/new-product-rating
fi
cd /opt/new-product-rating
git branch --show-current
git status --short
```

应显示 `vps`，且没有未提交的代码改动。核对关键文件：

```bash
ls -l server/index.js server/sqlite-storage.js server/backup-service.js
ls -l public/assets/admin.js public/assets/backup-ui.css public/assets/backup-ui.js
ls -l scripts/render-rating-service.mjs .env.example
```

> 如果当前目录已经存在，不要再次 clone、删除或覆盖。以后只执行第八章的 `git pull --ff-only origin vps`。

### Windows 开发电脑可选：本地克隆

在 PowerShell 中，根据需要调整保存目录：

```powershell
git clone --branch vps --single-branch https://github.com/XiangLuZiLu/new-product-rating.git "E:\Project\new-product-rating-git"
cd "E:\Project\new-product-rating-git"
git branch --show-current
```

如果该目录原本已经有 Git 仓库，则**不要重复 clone**；在正确的 `vps` 分支修改代码、测试，最后 `git add`、`git commit`、`git push origin vps`。

---

## 四、配置 `.env` 和持久化目录

### 1. 创建专用运行用户

```bash
id ratingapp >/dev/null 2>&1 || \
  useradd --system --user-group --home-dir /opt/new-product-rating --shell /usr/sbin/nologin ratingapp
```

### 2. 初始化配置文件（不覆盖旧密码）

```bash
cd /opt/new-product-rating
if [ ! -f .env ]; then
  cp .env.example .env
fi
chmod 600 .env
openssl rand -hex 32
nano .env
```

在 `.env` 中按实际环境设置（下面的密码只写示意值，不要照抄）：

```dotenv
HOST=127.0.0.1
PORT=18080
ADMIN_PATH=admin
ADMIN_USERNAME=admin
ADMIN_PASSWORD=请换成自己的强密码
SESSION_SECRET=粘贴刚才openssl产生的64位随机十六进制串
SESSION_IDLE_MINUTES=120
STORAGE_DRIVER=sqlite
DB_PATH=/opt/new-product-rating/data/rating.sqlite
IMAGE_STORAGE_DRIVER=url
DRAFT_TIMEZONE=Asia/Shanghai
```

在 `nano` 中按 `Ctrl+O`、回车保存，`Ctrl+X` 退出。不要把真实 `.env` 提交到 GitHub、上传聊天或贴进日志。

### 3. 创建数据库、图片目录并赋予权限

```bash
cd /opt/new-product-rating
install -d -m 750 -o ratingapp -g ratingapp ./data ./image
chown ratingapp:ratingapp .env
chmod 600 .env
ls -ld ./data ./image
ls -l .env
```

**已经有正式 SQLite 数据的服务器**：先确认 `data/rating.sqlite*` 属于 `ratingapp` 并可写，必要时仅针对本项目数据文件调整属主；不要运行删除、初始化或覆盖数据库的命令。若 `DB_PATH` 不在 `./data`，需为其实际目录另外设置安全权限并调整 systemd 的 `ReadWritePaths`。

项目图片位置根据 `server/local-image.js` 所在的项目自动计算：无论文件上传时实际扩展名是否正确，后端会根据支持的文件签名识别 JPG / PNG / WebP / GIF / AVIF；原七牛云等 S3 图片存储仍可通过后台配置。`image/` 不会进入 Git 仓库。

---

## 五、上线前测试（使用临时测试数据库）

```bash
cd /opt/new-product-rating
node scripts/verify-build.mjs
node --test server/sqlite-storage.test.js
node scripts/integration-smoke.mjs
runuser -u ratingapp -- node scripts/local-images-smoke.mjs
runuser -u ratingapp -- node scripts/backup-feature-smoke.mjs
```

这些脚本用于检查文件、SQLite、HTTP 接口、图片读写及备份/恢复行为；`local-images-smoke` 会在项目 `image/` 下临时创建并清理测试图片。**任何测试失败时先看错误，不要直接上线**。测试不能替代在真实域名下的浏览器验收。

---

## 六、创建 systemd 服务并设置重启、开机自启

安装/更新前，先检查没有其他非 systemd 的 Node 进程监听 18080。使用项目自带生成器，自动填入当前项目路径和实际 Node 可执行文件路径，**不要手写固定路径服务文件**。

```bash
cd /opt/new-product-rating
node scripts/render-rating-service.mjs > /tmp/new-product-rating.service
cat /tmp/new-product-rating.service
systemd-analyze verify /tmp/new-product-rating.service
```

> `>` 会把生成结果写入文件，因此第一条命令**没有输出是正常的**。检查生成结果至少包含正确的 `WorkingDirectory`、`ExecStart` 和包含 `data`、`image` 的 `ReadWritePaths`。

配置检查通过后：

```bash
install -m 644 /tmp/new-product-rating.service /etc/systemd/system/new-product-rating.service
systemctl daemon-reload
systemctl enable --now new-product-rating
systemctl is-enabled new-product-rating
systemctl is-active new-product-rating
systemctl status new-product-rating --no-pager -l
curl -i http://127.0.0.1:18080/healthz
```

预期：`is-enabled` 返回 `enabled`，`is-active` 返回 `active`，`/healthz` 返回 **HTTP 200**、`{"ok":true}`。如部署前服务已经运行、只是更新服务文件，需再执行一次 `systemctl restart new-product-rating`，让新配置生效。

日常使用：

```bash
# 查看运行状态
systemctl status new-product-rating --no-pager -l
# 重启（更新代码后使用）
systemctl restart new-product-rating
# 停止/启动
systemctl stop new-product-rating
systemctl start new-product-rating
# 确认开机自启
systemctl is-enabled new-product-rating
# 需要时启用开机自启
systemctl enable new-product-rating
# 近 100 行日志
journalctl -u new-product-rating -n 100 --no-pager -l
# 实时日志（Ctrl+C 结束查看，不会停止服务）
journalctl -u new-product-rating -f
```

**不要对旧的 9527 网站或其他业务执行上述 `systemctl stop/restart`。** 本项目的系统服务名称始终是 `new-product-rating`。

---

## 七、配置 Caddy 反向代理与 HTTPS

首先检查现有配置，**不要覆盖 `/etc/caddy/Caddyfile`** 或删除已有站点：

```bash
systemctl is-active caddy
cat /etc/caddy/Caddyfile
grep -R -n 'ratings.xianglupiju.com' /etc/caddy 2>/dev/null || true
ss -lntp | grep -E ':(80|443|18080|9527)[[:space:]]' || true
```

- 如果已经存在 `ratings.xianglupiju.com` 的 Caddy 站点：**只核对**该站点是否代理到 `127.0.0.1:18080`，不再添加第二个同名站点。
- 如果确实没有，并且主 `Caddyfile` 已包含 `import /etc/caddy/sites/*.caddy`，可以新增一个独立配置文件，不能改动其他站点：

```bash
install -d -m 755 /etc/caddy/sites
cat > /etc/caddy/sites/new-product-rating.caddy <<'CADDY'
ratings.xianglupiju.com {
    encode zstd gzip
    reverse_proxy 127.0.0.1:18080
}
CADDY
caddy validate --config /etc/caddy/Caddyfile
# 仅当 validate 成功时执行：
systemctl reload caddy
```

**只有在域名之前没有对应站点时才执行创建步骤**。如果主配置没有 `import`，先确认 Caddy 现有管理方式再修改；不要把上面的规则盲目追加到不明位置。检查 DNS / ESA / EdgeOne 是否指向当前 VPS，HTTPS 的 80/443 和证书签发也需要满足对应网络条件。

验证：

```bash
curl -i http://127.0.0.1:18080/healthz
curl -I https://ratings.xianglupiju.com/admin
```

后台入口：<https://ratings.xianglupiju.com/admin>。如果本机 `/healthz` 正常而公网报错，继续检查 DNS、Caddy 日志或加速平台防护规则，不要先删数据库。

---

## 八、更新现有站点（不覆盖业务数据）

这是以后从 GitHub `vps` 拉取最新功能的**常规步骤**，也适用于这次更新备份弹框的两列布局。

### 1. 在 Windows 上提交代码（如有本地改动）

```powershell
cd "E:\Project\new-product-rating-git"
git branch --show-current   # 必须是 vps
git status --short
node .\scripts\verify-build.mjs
git add README.md public/assets/backup-ui.css
git diff --cached --check
git commit -m "Refine backup restore layout and deployment README"
git push origin vps
```

如果本次通过 GitHub 网页直接修改并提交到 `vps`，则可以跳过 Windows 步骤。**检查 `git status` 是否存在其他未完成的本地改动，不要把无关文件误提交。**

### 2. Ubuntu 拉取并验证

```bash
cd /opt/new-product-rating
git branch --show-current
git status --short
# 确认分支是 vps、没有不明本地修改，再继续：
git fetch origin vps
git diff --stat HEAD..origin/vps
git pull --ff-only origin vps
node scripts/verify-build.mjs
runuser -u ratingapp -- node scripts/backup-feature-smoke.mjs
```

### 3. 重启、检查状态与刷新浏览器

```bash
systemctl restart new-product-rating
systemctl is-active new-product-rating
systemctl is-enabled new-product-rating
curl -i http://127.0.0.1:18080/healthz
journalctl -u new-product-rating -n 40 --no-pager -l
```

访问后台按 **Ctrl+F5 强制刷新**。静态 CSS 可能被浏览器缓存最多几分钟：如果新弹框仍显示旧布局，请先强制刷新，或等待缓存到期，**不要因此清空数据**。

> 此处只更新受 Git 管理的文件。请保留 `.env`、`data/`、`image/`、`data/backups/`，不要在更新时运行 `git clean -fdx`、删除目录或手动重建 SQLite 数据库。

---

## 九、后台「数据备份与恢复」使用说明

在后台顶部点击 **数据备份与恢复**，按钮位于“打印评分结果”左边。

### 备份导出

1. 输入 **8～256 字符**的备份密码。
2. 点击“下载备份 ZIP”，保存文件及其密码。
3. ZIP 仅包含四个功能模块的**业务数据**：款式配置、评分结果、评分链接、设置；也包括评分历史、草稿、评分进度及提交记录等关联数据。
4. **不包含本地 `image/` 里的图片文件**，但数据库会保留图片地址。因此跨服务器恢复后，若没有单独复制对应图片，图片可能显示为缺失。
5. `.env`、登录密码和 `SESSION_SECRET` 不在备份里；**设置中保存的 OSS/S3 密钥可能包含在加密数据库备份中**，因此请务必妥善保管 ZIP 和备份密码。

### 上传与恢复

1. 支持 **点击选择、拖拽或浏览器支持的 Ctrl+V 文件粘贴**，选择本系统导出的 `.zip`。
2. 输入当时的备份密码，点击 **校验备份文件**；校验本身不修改数据库。
3. 选择恢复方式（界面横向并排，默认勾选“完整覆盖”）：
   - **完整覆盖**：用备份记录替换对应业务数据；恢复前会自动保存现有数据库快照到 `data/backups/`。
   - **合并导入**：保留已有记录与设置，尽量添加备份中尚不存在且关联有效的记录；重复或冲突的记录跳过并报告数量。
4. 确认内容后，点击 **确认并恢复**，再次确认才执行写入。建议在低峰时间恢复，避免同时有人评分或修改后台数据。
5. 完成后刷新后台并核对款式、评分、链接和配置；**本地图片文件不会因为此次恢复被删除或覆盖**。

当前实现限制：上传 ZIP 最大约 **120 MB**；导出的数据库快照最大约 **150 MB**。项目使用 AES-256-GCM 加密备份数据库，**忘记密码无法恢复加密文件**。定期下载到独立位置保存，不能把服务器本机 `data/backups/` 当作唯一容灾备份。

---

## 十、迁移到新服务器或更改部署目录

1. 先在旧站点导出加密 ZIP，妥善保存备份密码。
2. 在新服务器 clone `vps`，配置新 `.env`、专用用户、Node 22、systemd 和 Caddy。
3. 通过后台“校验并恢复”导入业务数据库。
4. **如需要旧图片继续显示，必须额外安全复制旧服务器的 `image/` 文件**（业务 ZIP 不包含图片）。如果图片保存在七牛云/OSS，则应单独核对新的存储配置和远程图片访问权限。
5. 如果项目目录不再是 `/opt/new-product-rating`，要修改 `.env` 的绝对 `DB_PATH`，并在新目录执行：

```bash
cd /实际安装路径/new-product-rating
install -d -m 750 -o ratingapp -g ratingapp ./data ./image
node scripts/render-rating-service.mjs > /tmp/new-product-rating.service
cat /tmp/new-product-rating.service
systemd-analyze verify /tmp/new-product-rating.service
install -m 644 /tmp/new-product-rating.service /etc/systemd/system/new-product-rating.service
systemctl daemon-reload
systemctl enable new-product-rating
systemctl restart new-product-rating
systemctl status new-product-rating --no-pager -l
```

> 项目放在 `/root/...` 下时，默认 `ratingapp` 不能穿越 `/root` 目录；建议使用 `/opt` 或 `/srv`，不要为了省事放宽整个 `/root` 目录权限。

---

## 十一、常见问题排查

| 现象 | 优先检查 |
|---|---|
| `node:sqlite` 找不到或 Node 语法错误 | `node -v`，确认 Node 22.13+ |
| `EADDRINUSE` / 18080 已占用 | `ss -lntp | grep :18080`，只处理本项目对应端口 |
| `SQLITE_CANTOPEN`、`attempt to write a readonly database` | `.env` 的 `DB_PATH`、`data/` 属主、权限、systemd 的 `ReadWritePaths` |
| 上传图片返回 400 或无法预览 | 检查管理员保存的本地图片配置、文件大小、是否有款式编码、`image/` 的 `ratingapp` 写权限和图片真实格式 |
| 图片返回 404 | 核对 `./image/` 是否有该文件；业务 ZIP 不包含图片 |
| 备份错误或 413 | ZIP/SQLite 大小上限、备份密码、加速平台请求体限制 |
| 备份能恢复但图片不见 | 业务备份只保存图片路径，不保存图片文件 |
| 公网 403/502、内部 `/healthz` 正常 | DNS、Caddy、ESA/EdgeOne 加速/WAF 或代理目标 |
| `git pull --ff-only` 失败 | 本地分支有偏离或修改；先核对 `git status`，不要强制覆盖 |
| systemd 启动后立刻退出 | `journalctl -u new-product-rating -n 100 --no-pager -l`（分享日志前注意遮盖敏感信息） |
| 更新 CSS 后仍显示上下两行 | 后台按 `Ctrl+F5` 强制刷新，确认 `public/assets/backup-ui.css` 已更新 |

**核心检查命令：**

```bash
cd /opt/new-product-rating
git status --short --branch
node -v
systemctl status new-product-rating --no-pager -l
systemctl is-enabled new-product-rating
curl -i http://127.0.0.1:18080/healthz
journalctl -u new-product-rating -n 50 --no-pager -l
```

**安全提醒：** 不要公开 `.env`、真实管理员密码、`SESSION_SECRET`、七牛云/OSS 密钥、评分业务 ZIP 及其解密密码。正式数据应定期在服务器之外留存可验证的备份。
