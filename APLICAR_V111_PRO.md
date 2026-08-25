# Aplicar v1.1.1 PRO sobre `ivanderodrigo/brujula`

La forma recomendada es usar el **overlay** para no reemplazar los JSON generados por tu último workflow.

## Desde VS Code

1. Abre la carpeta local de tu repositorio `brujula`.
2. Haz primero:

```powershell
git pull origin main
```

3. Descomprime `brujula-municipal-v111-pro-overlay.zip`.
4. Copia **el contenido de la carpeta del overlay** sobre la raíz de tu repositorio. Acepta reemplazar los archivos coincidentes.
5. Ejecuta:

```powershell
python tools/aplicar_v111_pro.py
git status
```

6. Para sacar inmediatamente del índice los cachés/raw que el workflow anterior ya había versionado:

```powershell
git rm -r --cached --ignore-unmatch tools/cache data/generated/raw_bdns data/generated/boe_raw
```

Los archivos locales de caché no son necesarios para la web y, gracias a `.gitignore`, no volverán a entrar.

7. Publica el código:

```powershell
git add .
git commit -m "Brújula v1.1.1 PRO - fuentes y rediseño"
git push origin main
```

8. En GitHub abre **Actions → Actualizar datos de Brújula Municipal → Run workflow → full**.

## Qué comprobar en el nuevo log

Busca estas líneas:

- MITECO: uno o varios `OK <métrica>: ... registros` y cobertura territorial creciente;
- INE: `OK renta INE: ... municipios`;
- BOE: `... títulos saneados` y ausencia de la larga lista de avisos de ruido técnico;
- validación final: `RESULTADO: PUBLICABLE`;
- commit: no debería volver a aparecer `tools/cache/ENTIDADES.2025.csv` como archivo creado/versionado.

Si MITECO o INE siguieran degradados, el pipeline seguirá siendo seguro: no inventará datos ni sobrescribirá una copia válida.
