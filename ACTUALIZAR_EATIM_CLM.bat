@echo off
setlocal
cd /d "%~dp0"
echo La v0.4 ya obtiene EATIM de toda Espana desde el NGMEP oficial del IGN/CNIG.
echo Se ejecutara el actualizador nacional de localidades para evitar duplicados.
where py >nul 2>nul
if %errorlevel%==0 (
  py tools\actualizar_localidades_cnig.py
) else (
  python tools\actualizar_localidades_cnig.py
)
echo.
pause
