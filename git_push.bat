@echo off
cd /d D:\uppsc_pyq
del /f ".git\index.lock" 2>nul
git add -A
for /f "tokens=2 delims==" %%I in ('wmic os get localdatetime /value') do set dt=%%I
set TODAY=%dt:~0,4%-%dt:~4,2%-%dt:~6,2%
git commit -m "feat: portal update %TODAY%"
git push
pause
