# Aplicar Brújula Municipal v1.1.2 PRO sobre el repositorio actual

Esta entrega es un **overlay**: está pensada para copiarse encima de `ivanderodrigo/brujula` sin sustituir `data/generated/` ni el catálogo nacional ya construido.

## Desde VS Code / PowerShell

1. Abre tu copia local del repositorio y trae primero el último commit del bot:

```powershell
cd C:\Users\ivand\Downloads\brujula
git pull origin main
```

2. Descomprime el ZIP v1.1.2 PRO y copia **el contenido de la carpeta del overlay** sobre la raíz de `brujula`, aceptando reemplazos.

3. Ejecuta el refuerzo estructural:

```powershell
python tools/aplicar_v112_pro.py
```

4. Elimina del índice cualquier caché heredado que Git ya estuviera siguiendo:

```powershell
git rm -r --cached --ignore-unmatch tools/cache data/generated/raw_bdns data/generated/boe_raw
```

5. Comprueba y publica:

```powershell
git add .
git status
git commit -m "Brújula v1.1.2 PRO - datos nacionales y UX territorial"
git push origin main
```

6. En GitHub ejecuta:

**Actions → Actualizar datos de Brújula Municipal → Run workflow → full**

## Qué mirar en el próximo log

- `OK renta INE: ... municipios` con cobertura nacional desde la capa oficial de municipios.
- `Base IGN/CNIG: ... municipios cargados` incluso antes de MITECO.
- Para MITECO: `OK <métrica>` o, si el portal cambia otra vez, un diagnóstico del contenido real del paquete en vez de un genérico “ZIP sin DBF”.
- `Benchmark: ... municipios, ... con comparables` ya no debe depender de que funcionen las diez fuentes MITECO.
- `tools/cache` no debe reaparecer en el commit.

## Seguridad de aplicación

El overlay no contiene tus snapshots generados de BDNS/BOE/localidades, por lo que no los reemplaza. La actualización `full` regenerará únicamente los derivados que corresponda.
