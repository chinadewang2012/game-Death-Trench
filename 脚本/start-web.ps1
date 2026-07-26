# 死亡战壕 2D - 网页服务器启动脚本 (PowerShell)
# 启动双版本服务器：普通版(8080) + 开发版(3030)

$ErrorActionPreference = "Stop"

# 获取项目根目录（scripts 文件夹的上一级）
$projectRoot = Split-Path -Parent $PSScriptRoot
$serverJs = Join-Path $projectRoot "server.js"

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "  死亡战壕 2D - 网页服务器 (双版本)" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "  普通版 (无编辑器): http://localhost:8080" -ForegroundColor Green
Write-Host "  开发版 (带编辑器): http://localhost:3030" -ForegroundColor Yellow
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host ""

# 检查 server.js 是否存在
if (-not (Test-Path $serverJs)) {
    Write-Host "[ERROR] 未找到 server.js: $serverJs" -ForegroundColor Red
    Read-Host "按回车键退出"
    exit 1
}

# 切换到项目根目录并启动服务器
Set-Location $projectRoot
Write-Host "[INFO] 项目根目录: $projectRoot" -ForegroundColor Gray
Write-Host "[INFO] 正在启动服务器... (按 Ctrl+C 停止)" -ForegroundColor Gray
Write-Host ""

try {
    node $serverJs
} catch {
    Write-Host "[ERROR] 服务器启动失败: $_" -ForegroundColor Red
} finally {
    Read-Host "按回车键退出"
}
