@echo off
title Border Surveillance System Launcher
echo ====================================================
echo Starting Border Surveillance System (BorderLens)
echo ====================================================

echo [1/3] Launching MediaMTX Relay...
start "MediaMTX Relay" cmd /k "cd /d %~dp0backend && .localdata\bin\mediamtx.exe config\mediamtx.yml"

echo [2/3] Launching Django Backend API...
start "Django Backend" cmd /k "cd /d %~dp0backend && call venv\Scripts\activate.bat && python manage.py runserver 127.0.0.1:8000"

echo [3/3] Launching Next.js Frontend (BorderLens)...
start "Next.js Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo ====================================================
echo All services launched in separate windows!
echo - BorderLens Command Console: http://localhost:3000
echo - Live Camera Feed:           http://localhost:3000/live-feed
echo ====================================================
pause
