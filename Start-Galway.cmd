@echo off
cd /d "%~dp0"
where python >nul 2>nul
if errorlevel 1 (
  echo Python is niet gevonden. Installeer Python of vraag om hulp.
  pause
  exit /b 1
)
python lokale_testserver.py
echo.
echo De app is gestopt. Sluit dit venster.
pause
