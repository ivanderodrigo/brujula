@echo off
setlocal
cd /d "%~dp0"
echo === 1/3 Localidades oficiales IGN/CNIG ===
where py >nul 2>nul
if %errorlevel%==0 (
  py tools\actualizar_localidades_cnig.py
) else (
  python tools\actualizar_localidades_cnig.py
)
echo.
echo === 2/3 Radar BDNS ===
where py >nul 2>nul
if %errorlevel%==0 (
  py tools\actualizar_bdns.py --days 120 --max-details 300
) else (
  python tools\actualizar_bdns.py --days 120 --max-details 300
)
echo.
echo === 3/3 Radar BOE ===
where py >nul 2>nul
if %errorlevel%==0 (
  py tools\actualizar_boe.py
) else (
  python tools\actualizar_boe.py
)
echo.
echo Actualizacion finalizada. Los visitantes solo leen ficheros estaticos locales.
pause
