# Automatización de producción · v0.7

La actualización se ejecuta en GitHub Actions y genera archivos estáticos. El visitante nunca consulta MITECO, INE, BDNS o BOE en tiempo real.

## Cadencias

| Fuente | Cadencia por defecto | Motivo |
|---|---:|---|
| BDNS | 1 día | Convocatorias y cambios frecuentes |
| BOE | 1 día | Novedades normativas |
| Localidades IGN/CNIG | 30 días | Catálogo estable |
| Indicadores territoriales MITECO | 180 días | Publicación esencialmente anual |
| Renta INE | 180 días | Publicación anual |

`Run workflow → full` fuerza todo.

## Pipeline

Fuente → descarga offline → extracción → JSON → benchmark → validación → commit → hosting estático.

Los indicadores MITECO se obtienen de shapefiles. El script v0.7 lee el DBF con Python estándar, sin instalar geopandas ni servidores GIS.

## Fallos

Los radares críticos BDNS/BOE mantienen el comportamiento de bloqueo ante error según el pipeline. Los enriquecimientos territoriales conservan la última copia válida cuando una fuente anual no está disponible.

Nunca se genera un valor ficticio para completar una ficha.
