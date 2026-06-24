@echo off
title UPPSC Reel Generator - Today's 20 Reels
cd /d D:\uppsc_pyq

echo ============================================
echo  UPPSC Instagram Reel Generator
echo  Today: 10 News Reels + 10 Geography Reels
echo ============================================
echo.

echo Installing required packages...
pip install Pillow numpy imageio imageio-ffmpeg -q
echo.

echo [1/2] Generating 10 NEWS reels...
echo       (From today's current affairs questions)
python make_reels.py news 10
echo.

echo [2/2] Generating 10 GEOGRAPHY reels...
echo       (GEO_001 to GEO_010 - unique, tracked)
python make_reels.py geo 10
echo.

echo ============================================
echo  All done! 20 reels saved to:
echo  D:\uppsc_pyq\reels\
echo ============================================
pause
