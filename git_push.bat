@echo off
cd /d D:\uppsc_pyq
del /f ".git\index.lock" 2>nul
git add -A
git commit -m "feat: mobile-responsive CA tab + 31-day progress timeline + auth flow + daily quiz tracking"
git push
pause
