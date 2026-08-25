@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel%==0 (
  py tools\actualizar_bdns.py --days 120 --max-details 300
) else (
  python tools\actualizar_bdns.py --days 120 --max-details 300
)
pause
