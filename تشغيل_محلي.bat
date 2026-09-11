@echo off
title Ultra Gym - Local Development Server
cd /d "%~dp0"

echo ===================================================
echo     ULTRA GYM - LOCAL DEVELOPMENT SERVER
echo ===================================================
echo.

if exist "node_modules" goto RUN_SERVER

echo [1/2] Installing dependencies, please wait.
call npm install
if errorlevel 1 (
    echo.
    echo [ERROR] Dependency installation failed.
    pause
    exit /b 1
)

:RUN_SERVER
echo [1/2] Dependencies verified.
echo.
echo [2/2] Starting local development server.
echo Server URL: http://localhost:3000
echo Note: If port 3000 is busy, Next.js will automatically switch to the next open port.
echo Press CTRL+C to stop the server anytime.
echo.

call npm run dev

pause
