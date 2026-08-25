@echo off
setlocal
cd /d "%~dp0"
echo Este actualizador carga ahora el catalogo nacional completo de localidades NGMEP.
where py >nul 2>nul
if %errorlevel%==0 (
  py tools\actualizar_localidades_cnig.py
) else (
  python tools\actualizar_localidades_cnig.py
)
pause
