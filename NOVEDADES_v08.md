# Brújula Municipal v0.8

## Correcciones
- Saneado visual del radar normativo BOE: si una entrada automática trae ruido técnico (por ejemplo `200 OK`, cabeceras HTTP o sellos de tiempo), la interfaz la sustituye por un título y resumen legibles de revisión editorial.
- Limpieza de residuos antiguos del paquete.

## Salto gráfico
- Nuevo logotipo de Brújula Municipal con marca de brújula.
- Navegación con iconos SVG.
- Estética más premium: topbar glass, tarjetas con relieve, mejor jerarquía, fondos con degradados y sombras más refinadas.
- Favicon propio.

## Nuevo salto funcional
- Nueva página **Ejecutivo 360** (`/ejecutivo/`).
- Dossier ejecutivo descargable en Markdown por localidad.
- Resumen ejecutivo imprimible / PDF.
- KPIs rápidos, señales territoriales, financiación prioritaria, obligaciones, cartera 1·3·5 y plan de 90 días en una sola vista.
- Integración del Ejecutivo 360 en la ficha **Mi localidad**.

## Principio mantenido
Todo sigue siendo estático: HTML + CSS + JS + JSON, sin backend ni pago por petición.
