# Brújula Municipal v0.7
## Expediente de Inteligencia Territorial 360

Brújula Municipal es una web estática para pequeños ayuntamientos y territorios rurales. Une localidad, necesidades, proyectos, financiación, obligaciones, servicios ya existentes y ahora también **indicadores territoriales oficiales**.

## Qué incorpora la v0.7

- búsqueda nacional fragmentada de localidades;
- radar BDNS y BOE;
- 175 proyectos;
- 27 obligaciones prácticas;
- 13 servicios/recursos comunes;
- 15 playbooks;
- 20 entradas «Quiero…»;
- plan de 90 días;
- espacio local y comparadores;
- **expediente territorial 360**;
- **comparables municipales**;
- **cartera estratégica 1, 3 y 5 años**;
- diccionario de indicadores y trazabilidad.

## Fuentes territoriales incorporadas al pipeline

### MITECO · Secretaría General para el Reto Demográfico
Datos municipales de población, variación 2014–2023, densidad, edad media, mayores de 65 años, cobertura de Internet ≥100 Mbps, farmacias, centros de primaria y tiempos de acceso a autovía/hospital.

- https://www.miteco.gob.es/es/cartografia-y-sig/ide/descargas/reto-demografico/datos-demograficos.html
- https://www.miteco.gob.es/es/cartografia-y-sig/ide/descargas/reto-demografico/datos-servicios.html

### INE · Atlas de Distribución de Renta de los Hogares
Tabla 31241, indicadores de renta media y mediana a escala municipal.

- https://www.ine.es/jaxiT3/Tabla.htm?t=31241

## Sin puntuación municipal única

Brújula no calcula un «72/100» del territorio. Cada dimensión conserva su significado. Una densidad baja, una edad elevada o un acceso hospitalario largo generan **señales independientes y explicadas**. Esto evita falsa precisión.

## Automatización

`tools/actualizar_todo.py` mantiene:

- BDNS: cada día;
- BOE: cada día;
- localidades: cada 30 días;
- indicadores territoriales MITECO: cada 180 días;
- renta INE: cada 180 días;
- benchmark/comparables: se regenera al cambiar indicadores.

La ejecución `full` fuerza todas las fuentes.

Si una fuente territorial anual está temporalmente caída, se conserva la última copia válida sin tumbar el portal. La publicación principal sigue pasando por `tools/validar_sitio.py`.

## Prueba local

Windows:

1. `ACTUALIZAR_TODO.bat` para reconstrucción completa.
2. `INICIAR_BRUJULA.bat` para abrir la web.

Solo inteligencia territorial:

- `ACTUALIZAR_INTELIGENCIA_TERRITORIAL.bat`

## Producción

La web continúa siendo HTML + CSS + JS + JSON. No necesita servidor, SQL, funciones serverless, API de IA ni tarjeta bancaria.

El workflow de GitHub puede actualizar el repositorio y cualquier hosting estático puede servirlo.


## v0.9
- Cockpit estratégico
- Página de autor y contacto
- Configuración del LinkedIn del autor en `data/catalog/author.json`


## Brújula Municipal v1.0
- Motor de prioridades explicable (`/decisiones/`)
- Casos reales replicables (`/replicar/`)
- Matching dinámico proyecto → financiación
- Modo presentación institucional (`/presentacion/`)
- Paquete institucional descargable
- LinkedIn del autor: https://www.linkedin.com/in/ivanrodrigo/

## v1.1 · actualización diaria + SEO
- Radar BDNS y BOE diario.
- Novedades oficiales automáticas MITECO/FEMP y vigilancia Red.es/PAe.
- Página `/actualizacion/` de auditoría diaria.
- Sitemap, robots, canonicales, Open Graph, Twitter Cards y JSON-LD generados automáticamente.
- Más de 200 fichas estáticas indexables para mejorar descubrimiento orgánico.
