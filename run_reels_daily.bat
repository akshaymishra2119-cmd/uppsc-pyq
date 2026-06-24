@echo off
cd /d D:\uppsc_pyq
echo [%date% %time%] Starting reel generation... >> D:\uppsc_pyq\reel_log.txt
python make_reels.py >> D:\uppsc_pyq\reel_log.txt 2>&1
echo [%date% %time%] Done. >> D:\uppsc_pyq\reel_log.txt
