# Aplicar v1.4.2 sobre v1.4 / v1.4.1

1. Haz `git pull origin main` y comprueba con `git status` que el repositorio esté limpio.
2. Copia todo el contenido del overlay sobre la raíz del repositorio y acepta reemplazar.
3. Comprueba que no haya borrados masivos en `data/generated/` ni `data/localidades/`.
4. `git add .`
5. `git commit -m "Brújula v1.4.2 - deep decision"`
6. `git push origin main`
7. Ejecuta el workflow habitual de actualización en modo `full`.
8. El nuevo workflow `Vigilar fuentes de financiación` puede ejecutarse manualmente y después queda programado a diario.

El overlay no incluye `data/generated/`, `data/localidades/` ni `tools/cache/`; por tanto no borra los datos nacionales existentes.
