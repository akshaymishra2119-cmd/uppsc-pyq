@echo off
cd /d D:\uppsc_pyq
git remote remove origin 2>nul
git remote add origin https://github.com/akshaymishra2119-cmd/uppsc-pyq.git
git add .
git commit -m "feat: latest updates" 2>nul
git push -u origin main --force
echo.
echo Done! Railway will auto-redeploy in ~1 minute.
pause
