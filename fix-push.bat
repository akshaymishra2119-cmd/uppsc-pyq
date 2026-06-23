@echo off
cd /d D:\uppsc_pyq
if exist .git\index.lock del /f .git\index.lock
git config user.email "data.work.official2026@gmail.com"
git config user.name "Akshay"
git remote remove origin 2>nul
git remote add origin https://github.com/akshaymishra2119-cmd/uppsc-pyq.git
git add .
git commit -m "feat: premium light-theme home banner + white nav"
git push -u origin main --force
echo.
echo Done! Railway will auto-redeploy in ~1 minute.
pause
