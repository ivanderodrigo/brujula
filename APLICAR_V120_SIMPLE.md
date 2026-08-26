# Aplicar Brújula Municipal v1.2.0 SIMPLE

Este ZIP es un **overlay seguro** sobre la v1.1.4 / repositorio actual.

## Qué NO contiene

No incluye ni reemplaza:

- `data/generated/`
- `data/localidades/`
- cachés de fuentes oficiales
- workflows de actualización

Por tanto, al copiarlo sobre el repositorio no borra el catálogo nacional ni los datos generados por GitHub Actions.

## Aplicación

1. Actualiza tu repositorio local.
2. Descomprime el ZIP.
3. Copia su contenido sobre la raíz del repositorio aceptando reemplazar los archivos coincidentes.
4. Comprueba localmente si quieres.
5. Commit y push.

```powershell
cd C:\Users\ivand\Downloads\brujula
git pull origin main
# copiar aquí el contenido del overlay
git add .
git status
git commit -m "Brújula v1.2.0 SIMPLE - obligaciones ayudas y plan"
git push origin main
```

No es necesario volver a rellenar ningún dato manualmente. La selección del municipio es el único paso imprescindible para el usuario.

## Después del push

Puedes ejecutar el workflow `full` para refrescar las fuentes nacionales. La nueva UX no depende de que todos los indicadores territoriales estén disponibles: si una métrica auxiliar falta, simplemente no se muestra.
