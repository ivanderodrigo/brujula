# Aplicar v1.2.1 RICH MINIMAL

1. Actualiza tu repositorio local (`git pull origin main`).
2. Copia el contenido de este ZIP sobre la raíz del repositorio y acepta reemplazar.
3. Comprueba `git status`.
4. Commit y push.
5. Ejecuta en GitHub Actions el workflow de actualización en modo `full` para regenerar BDNS/BOE y demás datos nacionales.

El overlay no contiene `data/generated/` ni `data/localidades/`, por lo que no borra los datos nacionales existentes.
