# Aplicar Brújula Municipal v1.4.3

Overlay directo sobre v1.4.2a (también válido sobre v1.4.2).

1. `git pull --rebase origin main` y resolver cualquier conflicto antes de copiar.
2. Copiar el contenido del ZIP en la raíz del repositorio y reemplazar.
3. Ejecutar una vez: `python tools/aplicar_v143.py` (normaliza seguridad/accesibilidad de los HTML históricos).
4. `git add .`
5. `git commit -m "Brújula v1.4.3 - usabilidad accesibilidad seguridad y escalado TIC"`
6. `git push origin main`
7. No es obligatorio ejecutar `MODE=full`: esta revisión no cambia el pipeline nacional. Deja terminar el workflow `Calidad · seguridad · accesibilidad`.
8. Recargar la web con Ctrl+F5.

No se incluyen `data/generated/` ni `data/localidades/`.
