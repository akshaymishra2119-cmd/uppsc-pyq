@echo off
cd /d D:\uppsc_pyq
git add .
git commit -m "feat: topic drill-down from subject breakdown"
git push
echo.
echo Done! Railway will auto-redeploy in ~1 minute.
pause
