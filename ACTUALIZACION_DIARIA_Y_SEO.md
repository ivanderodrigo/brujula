# Actualización diaria y SEO

## Producción
El workflow `.github/workflows/actualizar-datos.yml` se ejecuta diariamente a las 03:17 UTC.

El orquestador realiza:
1. catálogo territorial cuando vence su cadencia;
2. BDNS diario;
3. BOE diario;
4. novedades oficiales diario;
5. indicadores territoriales según cadencia;
6. renta INE según cadencia;
7. generación SEO;
8. validación completa;
9. commit/push únicamente si el pipeline termina correctamente.

## Política de seguridad editorial
- automático = detección, no afirmación;
- toda novedad RSS queda `pending_review`;
- un cambio de página vigilada solo genera aviso de revisión;
- una noticia nunca se convierte automáticamente en subvención abierta, obligación o recomendación.

## SEO
`tools/generar_seo.py` reconstruye:
- canonicales;
- Open Graph;
- Twitter Cards;
- JSON-LD;
- sitemap;
- robots;
- manifest;
- fichas estáticas indexables.

El dominio público se configura en `data/config/site.json`.
