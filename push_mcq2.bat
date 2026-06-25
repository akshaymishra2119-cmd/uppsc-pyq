@echo off
cd /d D:\uppsc_pyq
del /f /q ".git\HEAD.lock" 2>nul
del /f /q ".git\index.lock" 2>nul
git add db.json
git commit -m "fix: add mcq one-liners to 25 Jun 2026 uppscNews"
git push origin main
echo.
echo Done!
pause
