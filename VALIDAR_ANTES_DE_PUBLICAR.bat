@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel%==0 (
  py tools\validar_sitio.py
) else (
  python tools\validar_sitio.py
)
pause
