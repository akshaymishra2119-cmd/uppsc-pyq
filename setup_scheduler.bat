@echo off
echo Setting up Ghatna Chakra daily reel scheduler...

schtasks /create /tn "GhatnaChakra_DailyReels" ^
  /tr "D:\uppsc_pyq\run_reels_daily.bat" ^
  /sc DAILY ^
  /st 06:00 ^
  /ru "%USERNAME%" ^
  /rl HIGHEST ^
  /f

if %ERRORLEVEL% == 0 (
    echo.
    echo SUCCESS! Task created.
    echo Reels will generate every day at 6:00 AM.
    echo Output folder: D:\uppsc_pyq\reels\YYYY-MM-DD\
    echo Log file:      D:\uppsc_pyq\reel_log.txt
) else (
    echo.
    echo ERROR creating task. Try running this file as Administrator.
)
pause
