@echo off
echo Installing auth packages...
cd /d D:\uppsc_pyq
npm install bcryptjs jsonwebtoken cookie-parser
echo.
echo Done! Now run: node server.js
pause
