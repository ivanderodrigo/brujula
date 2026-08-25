@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
title Brújula Municipal - Actualización completa
cls
echo =============================================================
echo  BRUJULA MUNICIPAL - ACTUALIZACION COMPLETA Y VALIDACION
echo =============================================================
echo.
echo Este comando usa exactamente el mismo pipeline que la automatizacion.
echo.
where py >nul 2>nul
if %errorlevel%==0 (
  py tools\actualizar_todo.py --mode full
) else (
  python tools\actualizar_todo.py --mode full
)
if errorlevel 1 (
  echo.
  echo ERROR: la version nueva NO ha superado las validaciones.
  echo La ultima version publicada debe conservarse.
  pause
  exit /b 1
)
echo.
echo OK: datos actualizados y validados.
pause
