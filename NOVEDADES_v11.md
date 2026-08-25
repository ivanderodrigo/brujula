# Brújula Municipal v1.1 · Actualización diaria + SEO técnico

## Actualización automática diaria
- BDNS: revisión diaria.
- BOE: revisión diaria.
- Novedades oficiales: MITECO y FEMP mediante RSS oficiales.
- Vigilancia por cambios: Red.es y PAe mediante hash de página.
- El contenido automático siempre queda `pending_review`.
- Si una fuente falla, se conserva la última copia válida.
- Nueva página `/actualizacion/` para auditar cada ejecución.

## SEO técnico
- `robots.txt` y `sitemap.xml` regenerados automáticamente.
- Canonicales en páginas.
- Open Graph y Twitter Cards.
- JSON-LD / Schema.org.
- `site.webmanifest`, favicon y `humans.txt`.
- Imagen social 1200×630.
- 222 fichas estáticas indexables generadas desde datos estructurados:
  - proyectos
  - obligaciones
  - oportunidades
  - casos reales
- 249 URLs iniciales en sitemap en el paquete actual.
- SEO dinámico adicional para fichas interactivas con query string.

## Configuración
El dominio canónico se define en:

`data/config/site.json`

Valor actual:

`https://brujulamunicipal.eu.org/`

Si el dominio final cambia, basta modificar `site_url`; el pipeline regenerará canonicales y sitemap.

## Fuentes de novedades automáticas
Configurables en:

`data/config/novedades_fuentes.json`

La lista puede ampliarse sin cambiar la web.
