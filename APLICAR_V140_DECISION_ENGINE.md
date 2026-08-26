# Aplicar Brújula Municipal v1.4.0

Overlay seguro para el repositorio actual.

## 1. Actualizar repositorio

```powershell
cd C:\Users\ivand\Downloads\brujula
git pull origin main
git status
```

Conviene que `git status` esté limpio antes de copiar.

## 2. Copiar el overlay

Descomprimir el ZIP y copiar **su contenido** sobre la raíz del repositorio, aceptando reemplazar archivos coincidentes.

El overlay **no contiene** `data/generated/` ni `data/localidades/`.

## 3. Publicar

```powershell
git add .
git status
git commit -m "Brújula v1.4.0 - motor de decisión contextual"
git push origin main
```

## 4. Regenerar datos

GitHub → Actions → **Actualizar datos de Brújula Municipal** → **Run workflow** → `full`.

Este `full` es importante: la nueva extracción BDNS enriquecerá las fichas automáticas con beneficiarios, regiones, fechas, bases y evidencia estructurada.

## 5. Comprobación rápida

- seleccionar un municipio <1.000 habitantes;
- comprobar que canal interno ofrece vía compartida;
- abrir Proyectos y comprobar recomendaciones diversas;
- abrir Ayudas y comprobar separación entre recomendadas, posibles y descartadas;
- seleccionar una EATIM y comprobar que distingue entidad y municipio matriz.
