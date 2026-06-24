@echo off
echo Stopping any running node server...
taskkill /f /im node.exe >nul 2>&1
timeout /t 1 >nul
cd /d D:\uppsc_pyq
echo Starting Ghatna Chakra server...
node server.js
pause
