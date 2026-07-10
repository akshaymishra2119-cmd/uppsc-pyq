@echo off
cd /d D:\uppsc_pyq
echo Restoring Index.html from backup...
copy /Y "Index.html.bak_sidebar" "Index.html"
if %errorlevel%==0 (
    echo Done! Index.html restored to pre-sidebar version.
) else (
    echo ERROR: Backup file not found at Index.html.bak_sidebar
)
pause
