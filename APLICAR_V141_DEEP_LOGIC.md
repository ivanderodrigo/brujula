# Aplicar v1.4.1 DEEP LOGIC

Es un overlay sobre Brújula. Puede aplicarse directamente sobre v1.4 o sobre v1.5: los archivos principales restauran la experiencia visual/estructural de v1.4.

1. Copiar el contenido del ZIP sobre la raíz del repositorio y reemplazar.
2. `git status` y comprobar que no hay borrado masivo de `data/generated/` o `data/localidades/`.
3. `git add .`
4. `git commit -m "Brújula v1.4.1 - deep logic"`
5. `git push origin main`
6. Ejecutar `Actions → Actualizar datos de Brújula Municipal → Run workflow → full`.

El overlay no contiene `data/generated/` ni `data/localidades/`.
