@echo off
cd /d "%~dp0"
echo ===================================================
echo Starting Lyftr AI Backend API on port 8000...
echo ===================================================
call .\backend_venv\Scripts\activate.bat
cd backend
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
pause
