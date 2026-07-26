@echo off
chcp 65001 >nul
title 死亡战壕 - 启动开发版 Electron

echo ==================================================
echo   死亡战壕 2D - 开发版 Electron
echo ==================================================
echo.

:: 切换到项目根目录（scripts 的上一级）
pushd "%~dp0.."

:: 启动开发版 Electron
echo [INFO] 正在启动开发版 Electron...
npx electron 开发\main-dev.js

:: 返回原目录
popd

pause
