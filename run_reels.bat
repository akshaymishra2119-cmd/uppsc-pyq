@echo off
title UPPSC Reel Generator
cd /d D:\uppsc_pyq

echo ============================================
echo  UPPSC Instagram Reel Video Generator
echo ============================================
echo.
echo Installing required packages...
pip install Pillow numpy imageio imageio-ffmpeg -q

echo.
echo Deleting old silent videos...
del /q reels\reel_01_*.mp4 2>nul
del /q reels\reel_02_*.mp4 2>nul
del /q reels\reel_03_*.mp4 2>nul
del /q reels\reel_audio_*.mp4 2>nul

echo.
echo Generating 3 videos with Windows voice narration...
echo (No extra install needed - uses built-in Windows Speech)
echo.
python make_reels.py 3 quiz

echo.
echo ============================================
echo  Done! Videos saved to: D:\uppsc_pyq\reels\
echo ============================================
pause
