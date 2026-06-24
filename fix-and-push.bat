@echo off
del /f /q "D:\uppsc_pyq\.git\index.lock" 2>nul
cd /d D:\uppsc_pyq
git add Index.html > D:\uppsc_pyq\push_log.txt 2>&1
git commit -m "fix: CA cards undefined - support title/summary formats" >> D:\uppsc_pyq\push_log.txt 2>&1
git push origin main --force >> D:\uppsc_pyq\push_log.txt 2>&1
echo EXIT_CODE=%ERRORLEVEL% >> D:\uppsc_pyq\push_log.txt
git log --oneline -3 >> D:\uppsc_pyq\push_log.txt 2>&1
