@echo off
title UPPSC PYQ — GitHub Deploy
color 0A

echo.
echo ========================================
echo  UPPSC PYQ — GitHub Setup ^& Push
echo ========================================
echo.

cd /d D:\uppsc_pyq

:: Check if git is installed
git --version >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Git is not installed or not in PATH.
  echo Download from: https://git-scm.com
  pause
  exit /b 1
)

:: Always do a clean init (removes any broken .git from previous attempts)
echo [1/4] Initializing git repo...
if exist ".git" rmdir /s /q ".git"
git init
git branch -M main

:: Stage all files
echo [2/4] Staging files...
git add .

:: Commit
echo [3/4] Committing...
git diff --cached --quiet
if errorlevel 1 (
  git commit -m "deploy: UPPSC PYQ study portal"
) else (
  echo     Nothing new to commit.
)

:: Ask for GitHub repo URL
echo.
echo ========================================
echo  STEP: Create a GitHub repo first
echo ========================================
echo.
echo  1. Open https://github.com/new in your browser
echo  2. Name it: uppsc-pyq
echo  3. Set to PUBLIC, do NOT add README
echo  4. Click "Create repository"
echo  5. Copy the HTTPS URL shown (e.g. https://github.com/YourName/uppsc-pyq.git)
echo.
set /p REPO_URL="Paste your GitHub repo URL here and press Enter: "

if "%REPO_URL%"=="" (
  echo [ERROR] No URL entered. Exiting.
  pause
  exit /b 1
)

:: Add remote (remove old if exists)
echo [4/4] Pushing to GitHub...
git remote remove origin 2>nul
git remote add origin %REPO_URL%
git push -u origin main

if errorlevel 1 (
  echo.
  echo [!] Push failed. If a browser window opened, sign in to GitHub and retry.
  echo     Then run this bat file again.
) else (
  echo.
  echo ========================================
  echo  SUCCESS! Code is on GitHub.
  echo ========================================
  echo.
  echo  NEXT: Deploy on Railway
  echo  1. Go to https://railway.app
  echo  2. Sign in with GitHub
  echo  3. New Project → Deploy from GitHub repo
  echo  4. Select "uppsc-pyq"
  echo  5. Click Generate Domain
  echo  6. Your site is LIVE!
  echo.
  echo  Every future update:
  echo    git add . ^&^& git commit -m "update" ^&^& git push
  echo.
  start https://railway.app
)

pause
