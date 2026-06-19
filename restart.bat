@echo off
taskkill /f /im node.exe >nul 2>&1
timeout /t 1 >nul
cd /d D:\uppsc_pyq
start cmd /k "node server.js"
