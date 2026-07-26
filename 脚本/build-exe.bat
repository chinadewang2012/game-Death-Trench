@echo off
chcp 65001 >nul
title 死亡战壕 - 构建 EXE

echo ==================================================
echo   死亡战壕 2D - 构建 EXE 文件
echo ==================================================
echo.

:: 切换到项目根目录（scripts 的上一级）
pushd "%~dp0.."

:: 运行构建脚本
echo [INFO] 正在构建 EXE 文件...
node 开发\build.js

if %ERRORLEVEL% EQU 0 (
    echo.
    echo [SUCCESS] 构建完成！
    echo [INFO] 输出目录: exe\
) else (
    echo.
    echo [ERROR] 构建失败！
)

:: 返回原目录
popd

echo.
pause
