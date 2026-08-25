# Brújula Municipal v1.1.1 PRO

Esta versión parte de la **v1.1 completa** y no elimina catálogos, fichas SEO, localidades ni módulos.

## Salto visual

- portada reorganizada alrededor de decisiones y necesidades, no de menús administrativos;
- logo de Brújula integrado en navegación;
- mapa visual de España y localidad seleccionada;
- flujo `necesidad → proyecto → financiación → requisitos → ejecución`;
- nueva jerarquía visual: menos tarjetas repetitivas y más composición editorial;
- navegación principal simplificada y mega menú `Explorar`;
- barra de orientación en páginas interiores;
- rediseño global de fichas, filtros, tablas, cockpit, herramientas y páginas de detalle;
- dock móvil con cinco accesos clave;
- `/actualizacion/` convertido en un centro de control de fuentes y calidad del dato;
- copia/recuperación local mucho más visible en `Mi espacio`.

## MITECO territorial

`actualizar_indicadores_territoriales.py` deja de asumir que las URLs de `DescargaFichero` devuelven directamente un ZIP. Ahora:

1. localiza el enlace desde las páginas oficiales;
2. mantiene cookies y `Referer`;
3. detecta formularios de descarga y campos ocultos;
4. envía el formulario cuando procede;
5. valida que la respuesta sea realmente ZIP;
6. conserva el último ZIP válido si la fuente nueva falla;
7. solo acepta una fuente como nacional si interpreta al menos 7.000 municipios.

La corrección debe confirmarse con la siguiente ejecución `full` de GitHub Actions.

## INE renta

El importador de la tabla 31241 ahora:

- prueba las distribuciones CSV oficiales;
- detecta delimitador, codificación y columnas de forma tolerante;
- excluye distritos/secciones;
- conserva para **cada municipio** el dato oficial más reciente disponible;
- no obliga a que todos los municipios tengan el mismo último año;
- no sobrescribe un snapshot válido si la nueva cobertura queda por debajo de 5.000 municipios.

## BOE

El radar BOE sanea el título **antes de escribir el JSON**. Cabeceras HTTP, `content-type`, timestamps técnicos y respuestas de transporte ya no deben llegar a la interfaz.

## Cachés y repositorio

- `tools/cache/` queda ignorado por Git;
- `raw_bdns` y `boe_raw` pasan a caché de trabajo;
- el workflow saca del índice de Git los raw heredados ya versionados;
- SEO y validador ignoran explícitamente `tools/cache`.

## GitHub Actions

- `actions/checkout@v6`
- `actions/setup-python@v6`

Se elimina así el warning de las acciones antiguas basadas en Node 20.
