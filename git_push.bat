@echo off
cd /d D:\uppsc_pyq
del /f ".git\index.lock" 2>nul
git add -A
git commit -m "fix: amber MCQ color in CA + PYQ subject sidebar + mock modal redesign + undefined relevance fix"
git push
pause
