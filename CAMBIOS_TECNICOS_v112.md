# Cambios técnicos · v1.1.2 PRO

## INE: fuente municipal directa

La renta deja de depender como primera opción de la tabla JAXI que mezcla niveles territoriales. La fuente primaria es la capa oficial ArcGIS **Nivel: municipios** del Atlas de Distribución de Renta de los Hogares.

Se pagina el servicio hasta completar el territorio y se extraen por `CUMUN`:
- renta neta media por persona (`DATO1`);
- renta neta media por hogar (`DATO2`);
- porcentaje de menores de 18 años (`DATO7`);
- porcentaje de población de 65 y más años (`DATO8`);
- índice de Gini (`DATO9`).

El CSV 31241 queda como fallback y solo acepta filas en nivel municipal: distrito y sección deben estar vacíos.

## MITECO: paquetes de descarga más robustos

El importador ya no presupone un único ZIP con DBF en primer nivel. Ahora:
- descubre enlaces desde las páginas oficiales;
- mantiene cookies y formulario de descarga;
- valida que la respuesta sea un contenedor ZIP;
- busca DBF de forma recursiva;
- admite ZIP anidado, GeoPackage, CSV/TXT;
- detecta un OOXML erróneo aunque empiece por `PK`;
- registra el contenido del paquete si no encuentra datos interpretables.

## Base territorial aunque falle MITECO

`indicadores_territoriales.json` se inicializa con el catálogo IGN/CNIG ya generado. Cuando esos campos están disponibles conserva:
- población;
- provincia y comunidad autónoma;
- coordenadas;
- superficie;
- densidad derivada de población/superficie, identificada expresamente como cálculo.

MITECO pasa a ser enriquecimiento de edad, evolución, conectividad, farmacias, centros educativos y tiempos de acceso; un fallo suyo no deja a Brújula sin contexto municipal básico.

## Benchmark degradable

El benchmark es una unión externa de catálogo nacional + MITECO + INE. Si faltan edad/densidad/evolución, compara al menos por tramo de población y refina cuando existen más métricas. Así los comparables no desaparecen por el fallo de una fuente auxiliar.

## Git / cache

`tools/cache`, `data/generated/raw_bdns` y `data/generated/boe_raw` se excluyen del versionado. El workflow usa `actions/checkout@v6` y `actions/setup-python@v6`.

## Reintento de fuentes degradadas

Una fuente anual/semestral que falle ya no queda bloqueada hasta la siguiente cadencia larga. `actualizar_todo.py` la reintenta al día siguiente mientras conserve `last_error`. El pipeline puede seguir siendo publicable porque mantiene la última información válida y/o la base territorial oficial.
