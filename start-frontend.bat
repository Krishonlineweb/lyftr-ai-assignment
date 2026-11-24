@echo off
cd /d "%~dp0"
echo ===================================================
echo Starting Lyftr AI Frontend on port 3000...
echo ===================================================
cd frontend
call npm run dev
pause
