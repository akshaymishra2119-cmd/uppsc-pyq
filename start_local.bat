@echo off
cd /d D:\uppsc_pyq
echo Installing dotenv (one-time)...
call npm install dotenv --save 2>nul
echo.
echo Starting local server at http://localhost:3000
echo Press Ctrl+C to stop.
echo.
node server.js
pause
