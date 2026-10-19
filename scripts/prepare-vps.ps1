# 使用方式：在 E:\Project\new-product-rating-git 的 PowerShell 中运行：
# powershell -ExecutionPolicy Bypass -File .\scripts\prepare-vps.ps1
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $root
function Invoke-Checked([string]$Description, [scriptblock]$Action) {
  Write-Host "`n== $Description ==" -ForegroundColor Cyan
  & $Action
  if ($LASTEXITCODE -ne 0) { throw "$Description 失败，退出码 $LASTEXITCODE" }
}

$branch = (& git branch --show-current).Trim()
if ($LASTEXITCODE -ne 0 -or $branch -ne 'vps') { throw "安全检查：当前分支是 '$branch'，只能在 vps 分支执行。" }
$origin = (& git remote get-url origin).Trim()
if ($LASTEXITCODE -ne 0 -or $origin -notmatch '^(https://github\.com/XiangLuZiLu/new-product-rating(\.git)?|git@github\.com:XiangLuZiLu/new-product-rating\.git)$') {
  throw "安全检查：origin 不是指定的 GitHub 仓库：$origin"
}
if (-not (Test-Path (Join-Path $root 'server/index.js'))) { throw '缺少 server/index.js。请先将 ZIP 内容解压到项目根目录。' }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Windows 未安装 Node.js，请安装 Node 22 再继续。' }
$nodeVersion = (& node -p 'process.versions.node').Trim()
if ($LASTEXITCODE -ne 0 -or [int]($nodeVersion.Split('.')[0]) -lt 22) { throw "Node.js 版本太低：$nodeVersion，需要 >=22。" }

$hasPlatform = Test-Path (Join-Path $root 'server/platform/index.js')
$hasEsa = Test-Path (Join-Path $root 'esa-functions/index.js')
if ($hasPlatform -and $hasEsa) { throw '检测到 server/platform 和 esa-functions 同时存在；为避免覆盖已修改的代码，停止处理。' }
if (-not $hasPlatform) {
  # Local HEAD was created from main when the vps branch was created.
  # Restore from it so users with blocked GitHub DNS can prepare offline.
  Invoke-Checked '从本地提交恢复原版 public/ 和 esa-functions/' { git restore --source=HEAD --staged --worktree -- public esa-functions }
}
Invoke-Checked '应用或续接 VPS + SQLite 改造' { node scripts/patch-existing.mjs }

$required = @('server/index.js','server/sqlite-storage.js','server/platform/index.js','server/platform/_shared/storage.js', 'public/assets/admin.js', 'public/assets/rating.js', 'public/assets/style.css','deploy/new-product-rating.service','.env.example','.gitignore')
foreach ($relative in $required) {
  if (-not (Test-Path (Join-Path $root $relative))) { throw "缺少必需文件：$relative" }
}
foreach ($relative in @('server/index.js','server/sqlite-storage.js','server/platform/index.js','public/assets/admin.js','public/assets/rating.js')) {
  Invoke-Checked "JavaScript 语法检查 $relative" { node --check $relative }
}
Invoke-Checked 'SQLite 逻辑测试' { node --test server/sqlite-storage.test.js }
Invoke-Checked '构建完整性检查' { node scripts/verify-build.mjs }
Write-Host "`n准备完成。下一步请运行 git add -A / git status / git commit / git push origin vps" -ForegroundColor Green
