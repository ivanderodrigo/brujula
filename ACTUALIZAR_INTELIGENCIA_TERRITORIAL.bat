@echo off
cd /d "%~dp0"
echo =============================================================
echo  BRUJULA MUNICIPAL - INTELIGENCIA TERRITORIAL
 echo =============================================================
python tools\actualizar_indicadores_territoriales.py
python tools\actualizar_renta_ine.py
python tools\generar_benchmark_territorial.py
python tools\validar_sitio.py
pause
