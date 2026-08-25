@echo off
setlocal
cd /d "%~dp0"
title Brújula Municipal - Actualizar localidades
cls
echo =============================================================
echo  BRUJULA MUNICIPAL - CARGAR CATALOGO NACIONAL DE LOCALIDADES
echo =============================================================
echo.
echo Se intentara primero la fuente oficial IGN/CNIG.
echo Si el Centro de Descargas no permite la descarga directa,
echo se usara automaticamente una copia publica del fichero NGMEP

echo mantenida por OSM Espana. La web seguira siendo 100%% estatica.
echo.
where py >nul 2>nul
if %errorlevel%==0 (
  py tools\actualizar_localidades_cnig.py
) else (
  python tools\actualizar_localidades_cnig.py
)
if errorlevel 1 (
  echo.
  echo =============================================================
  echo  NO SE HA CARGADO EL CATALOGO NACIONAL
  echo =============================================================
  echo La web conserva el catalogo de demostracion.
  echo Lee el mensaje anterior para la alternativa manual.
  echo.
  pause
  exit /b 1
)
echo.
echo =============================================================
echo  ACTUALIZACION CORRECTA

echo  Cierra y vuelve a abrir Brújula si ya la tenias en el navegador.
echo =============================================================
echo.
pause
