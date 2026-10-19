# new-product-rating — VPS + SQLite 版完整安装包

适用环境：Ubuntu 24.04、Node.js 22.13+（服务器已确认 v22.23.3）、2 核 1.6 GiB；无需 Docker、SQLite 命令行工具或 npm 安装依赖。

**重要说明**：压缩包收录全部 VPS 新增后端、SQLite 代码、自动改造程序、测试及部署配置。原版的 `public/` 前端、必要的 ESA 路由/业务模块保留原样作为兼容基础，由 `scripts/prepare-vps.ps1` **从你自己的 GitHub 仓库 `main` 分支恢复到本地 `vps` 工作树，再转换为 `server/platform/`**。因此压缩包解压本身还不是最终完整网站；执行“Windows 组装步骤”后，`vps` 分支就是完整项目。无需另行手工编写代码。

`main` 分支不会被修改。当前 GitHub 连接只能读不能推送；上传由你自己的 Git 账号完成。

## 设计

- `127.0.0.1:18080`：后端内部端口。现有 `127.0.0.1:9527` 的 linqilu-server 保持不变。
- `/opt/new-product-rating/data/rating.sqlite`：SQLite 新数据库，默认空库。采用 WAL、事务提交、同评分链接+评分人+北京时间自然日去重。
- `https://rating.xianglupiju.com`：正式域名只是**示例目标**；需检查现有 Caddy/DNS/ESA 配置后才能切换。Caddy 对外使用标准 443，访问时不需输入 18080。
- 后台 `/admin`，原有静态前端和主要 API 不变。
- 评分链接管理点击“链接名称”弹出评分人、评分状态、评分时间。记录按**评分链接+评分人+评分日期**分组：“评分中”显示最近一次开始/保存草稿时间，“已完成”显示正式提交时间。仅打开链接未输入姓名的不显示。
- 保留原七牛云 S3 兼容图片上传、导入及导出业务模块。图片存储需要在后台配置实际七牛云参数；系统不会自动恢复 ESA 上的设置。
- 不配置数据库自动备份，不导入原有 ESA 数据。Git 忽略 `.env` 和 `data/`。

## 1. Windows：将新代码组装到 vps 并上传 GitHub

你之前已经在 `E:\Project\new-product-rating-git` 的 `vps` 分支执行过 `git rm -r -- .`，这不要紧。**不要再执行一次 `git rm`，也不要删除 `.git` 目录。**

下载本 ZIP 后，将 **ZIP 内部文件** 解压到 `E:\Project\new-product-rating-git`。下载文件假定保存在 Downloads：

```powershell
Set-Location 'E:\Project\new-product-rating-git'
git branch --show-current
# 必须是 vps；如果不是，停止

$zip = "$env:USERPROFILE\Downloads\new-product-rating-vps-release.zip"
Expand-Archive -LiteralPath $zip -DestinationPath 'E:\Project\new-product-rating-git' -Force

# 脚本会核对分支和 remote、恢复 main 的必要文件、转换为 VPS 结构、检测 JavaScript、运行 SQLite 单元测试
powershell -ExecutionPolicy Bypass -File .\scripts\prepare-vps.ps1

# 完整 HTTP 接口验收：在临时数据库和临时端口运行，不会写真实业务数据
node scripts/integration-smoke.mjs
```

只在所有检查通过后推送：

```powershell
Set-Location 'E:\Project\new-product-rating-git'
git add -A
git status --short
# 确认无 .env、密钥、data、*.sqlite；.env.example 是模板，可提交
git diff --cached --check
git commit -m 'VPS SQLite app with reviewer progress dialog'
git push -u origin vps
```

完成后访问 https://github.com/XiangLuZiLu/new-product-rating/tree/vps ，应包含 `public/`、`server/platform/`、`server/index.js`、`server/sqlite-storage.js`、`deploy/`、`scripts/`。

> 注意：首次执行后 `esa-functions/` 会移动到 `server/platform/`，这是预期行为；`main` 不受影响。不要在已完成改造的目录里重新恢复 `esa-functions/` 或重复覆盖 ZIP。遇到错误暂停并提供完整输出，不要通过 `git reset --hard` 处理。

## 2. Ubuntu：取得 vps 代码

SSH 登录你提供过检测结果的阿里云 ECS 服务器（不是另一台 Dify 服务器），使用 root 或有 sudo 权限的用户：

```bash
hostname
node -v
ss -lntp | grep -E ':(9527|18080)[[:space:]]' || true
# 确认 18080 当前空闲；现有 9527 不要动

if [ -e /opt/new-product-rating ]; then
  echo '目录已存在：先检查内容、分支和工作区，不执行覆盖式 clone'
  ls -ld /opt/new-product-rating
  git -C /opt/new-product-rating status --short --branch 2>/dev/null || true
else
  git clone --branch vps --single-branch \
    https://github.com/XiangLuZiLu/new-product-rating.git \
    /opt/new-product-rating
fi
```

**只有**首次克隆成功、且确认是 `vps` 才执行下面步骤：

```bash
cd /opt/new-product-rating
printf '当前分支: '; git branch --show-current
ls -l server/index.js server/platform/index.js public/assets/admin.js
node scripts/verify-build.mjs
node --test server/sqlite-storage.test.js
node scripts/integration-smoke.mjs
```

最后两项是分别独立的 SQLite 单元测试、在随机临时数据库上的完整 HTTP 冒烟测试，不会更改你的实际空数据库。

## 3. 配置真实业务运行环境

```bash
cd /opt/new-product-rating
# 仅在 .env 尚不存在时复制，避免覆盖已有密码
if [ ! -f .env ]; then cp .env.example .env; chmod 600 .env; fi
# 生成随机 64 位十六进制密钥，用于 SESSION_SECRET
openssl rand -hex 32
nano .env
```

`nano` 中至少填写下面四项，其他可保持默认：

```ini
HOST=127.0.0.1
PORT=18080
ADMIN_PATH=admin
ADMIN_USERNAME=admin
ADMIN_PASSWORD=这里改成你自己的高强度密码
SESSION_SECRET=这里填入刚才openssl生成的64位十六进制随机串
STORAGE_DRIVER=sqlite
DB_PATH=/opt/new-product-rating/data/rating.sqlite
DRAFT_TIMEZONE=Asia/Shanghai
```

不要将真实密码发送给他人或提交到 GitHub。保存按 `Ctrl+O`、回车、`Ctrl+X`。

首次快速启动，注意这一步是在**前台**运行：

```bash
cd /opt/new-product-rating
node --env-file=.env server/index.js
```

另外开一个 SSH 窗口执行：

```bash
curl -i http://127.0.0.1:18080/healthz
curl -I http://127.0.0.1:18080/admin
ss -lntp | grep ':18080'
```

预期 `/healthz` 返回 `200` 和 `{ "ok": true }`，`/admin` 返回 HTML。完成后回到前台按 `Ctrl+C`，再进入 systemd 步骤。

## 4. 设置 systemd 开机自启

确保前台 Node 已退出，避免重复占用 18080。执行：

```bash
# 只在用户不存在时创建专用用户
id ratingapp >/dev/null 2>&1 || useradd --system --user-group --home /opt/new-product-rating --shell /usr/sbin/nologin ratingapp

cd /opt/new-product-rating
install -d -m 750 -o ratingapp -g ratingapp /opt/new-product-rating/data
chown ratingapp:ratingapp /opt/new-product-rating/.env
chmod 600 /opt/new-product-rating/.env

# 与本机 Node.js 的实际位置核对：你此前 Node 路径是 /usr/bin/node
command -v node

cp deploy/new-product-rating.service /etc/systemd/system/new-product-rating.service
systemctl daemon-reload
systemctl enable --now new-product-rating
systemctl status new-product-rating --no-pager -l
curl -i http://127.0.0.1:18080/healthz
ss -lntp | grep -E ':(9527|18080)[[:space:]]'
```

**预期两个端口都存在且分别对应各自的 Node 进程。** 如果服务失败，用：

```bash
journalctl -u new-product-rating -n 100 --no-pager
```

不得使用 `systemctl stop` 停止原来 9527 服务。

## 5. Caddy 反代与域名（须先检查）

你这台机器已有 Caddy，并且已有其他网站。**绝对不要覆盖 `/etc/caddy/Caddyfile`**。

```bash
cat /etc/caddy/Caddyfile
grep -R -n 'rating.xianglupiju.com' /etc/caddy || true
```

若已有同名站点/反代，**不要新增第二个同名块**；先确认该规则的来源和 DNS/ESA 代理状态。若确认没有该域名且你确实准备把这个域名切到 VPS，可向 `/etc/caddy/Caddyfile` 末尾追加以下站点块：

```bash
cat >> /etc/caddy/Caddyfile <<'EOF'

rating.xianglupiju.com {
    encode zstd gzip
    reverse_proxy 127.0.0.1:18080
}
EOF
caddy validate --config /etc/caddy/Caddyfile
# 仅在 validate 成功时运行
systemctl reload caddy
```

**域名仍由 ESA 代理时，公网访问得到的 403 可能来自 ESA，而不是 VPS。** 完成 DNS/ESA 切换前先验收本地 HTTP，勿直接修改云端 DNS 导致原评分系统下线。Caddy 申请 HTTPS 证书需要相应的 DNS 与公网网络满足条件。

正式访问：`https://rating.xianglupiju.com/admin`；新评分链接：`https://rating.xianglupiju.com/<系统生成的code>`。管理员先设置图片存储参数及评分项，再创建款式和链接。

## 6. 业务验收清单

1. 登录后台，验证登录失败/退出/会话有效期。
2. 新建、编辑款式，导入 Excel 多条款式，并刷新确认数据立即可见。
3. 配置七牛云图片存储并真实上传图片，确认新页面能显示图片、删除行为符合预期。
4. 生成评分链接，复制短链，打开公众评分页。
5. 输入测试评分人姓名并进入评分；后台点击链接名称，弹框应出现“评分中”，时间为北京时间。
6. 修改部分评分并刷新，验证草稿恢复及日志的最后活动时间。
7. 完整评分并提交；日志应改为“已完成”，填写正式提交时间，评分结果立即可见。
8. 同一评分人、同一链接、同一个自然日尝试重复提交，应拒绝，之前结果不能重复写入。
9. 测试已过期/已停用链接、导出、批量删除及保存设置。

## 7. 日常管理、更新和删除

查看运行状态：

```bash
systemctl status new-product-rating --no-pager
journalctl -u new-product-rating -n 100 --no-pager
```

未来从 GitHub 更新已部署的 `vps` 分支：

```bash
cd /opt/new-product-rating
git status --short
# 如显示本地修改，先处理修改，不要强拉
# git pull 仅更新受 Git 管理的代码；.env 和 data/ 被忽略
git pull --ff-only origin vps
node scripts/verify-build.mjs
node --test server/sqlite-storage.test.js
systemctl restart new-product-rating
systemctl status new-product-rating --no-pager
```

将来需要彻底停用时，先移除专用 Caddy 站点块并通过 `caddy validate`/`systemctl reload caddy`，然后：

```bash
systemctl disable --now new-product-rating
rm -f /etc/systemd/system/new-product-rating.service
systemctl daemon-reload
# 确认该目录没有其他应用的数据且你确实不再需要后，才执行：
# rm -rf -- /opt/new-product-rating
```

删除 `/opt/new-product-rating` 会连同 SQLite 数据、WAL 文件、运行设置一起永久删除。你明确要求不自动备份，因此**无法依靠本部署方案恢复已删除的评分记录**。

## 故障排查

- `EADDRINUSE :::18080`：18080 已被占用。先 `ss -lntp | grep ':18080'` 查进程，不要去停原 9527 服务。
- `no such table` 或 `SQLITE_CANTOPEN`：检查 `data/` 的 owner 和权限、`.env` 内 `DB_PATH`。
- `401`：检查管理员登录、Cookie、`ADMIN_PASSWORD`，不要将密码发到聊天里。
- Git `Permission denied (publickey)` 或登录失败：修复 Windows 上 GitHub 的登录权限后再推送，不要提交 access token。
- Git `main` 被改动：停下；当前项目中的自动准备脚本会检查必须在 `vps`，正常情况下不会触碰 `main`。
- 公网 `403 Server: ESA`：先确认 ESA 的站点加速/WAF/DNS，VPS 的 `/healthz` 正常不意味着公网路由已切换。
- `SQLite is an experimental feature`：Node 22 的提示，不等于错误。
