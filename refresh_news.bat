@echo off
title UPPSC PYQ — Push + Refresh News
color 0A

cd /d D:\uppsc_pyq

echo.
echo ========================================
echo  Step 1: Pushing latest code to Railway
echo ========================================
del /f ".git\index.lock" 2>nul
git add -A
git commit -m "fix: news scraper - 3 sources only, filter questions, use pubDate"
git push origin main
if errorlevel 1 (
  echo [ERROR] Git push failed. Check your internet or git setup.
  pause
  exit /b 1
)

echo.
echo ========================================
echo  Step 2: Waiting 90s for Railway redeploy
echo ========================================
echo  (Railway needs ~90 seconds to rebuild and restart)
timeout /t 90 /nobreak

echo.
echo ========================================
echo  Step 3: Clearing old news from database
echo ========================================
curl -s -X POST "https://uppsc-pyq-production.up.railway.app/api/clearAllNews" ^
  -H "Content-Type: application/json" ^
  -d "{\"secret\":\"clear-news-2026\"}"
echo.

echo.
echo ========================================
echo  Step 4: Triggering fresh news scrape
echo ========================================
curl -s -X POST "https://uppsc-pyq-production.up.railway.app/api/triggerScrape"
echo.

echo.
echo ========================================
echo  DONE! News is being refreshed.
echo  Open your portal and check Current Affairs tab.
echo ========================================
pause
