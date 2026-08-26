# Seguridad, accesibilidad y usabilidad · v1.4.3

## Principio
La interfaz no crece. Se mantienen cinco áreas: Inicio, Obligaciones, Ayudas, Proyectos y Mi plan. La complejidad adicional queda en datos, filtros y controles internos.

## Accesibilidad
- Control A− / A / A+ persistente en navegador, con escala hasta 200 %.
- Tipografía principal expresada en unidades relativas.
- Foco de teclado reforzado.
- Objetivos interactivos con tamaño mínimo práctico.
- `prefers-reduced-motion`.
- Contraste del logotipo y texto del pie reforzado.
- Selector de localidad tratado como diálogo accesible.
- Migrador para normalizar páginas históricas.

## Seguridad
- `noopener noreferrer` en pestañas externas.
- Bloqueo de protocolos de enlace peligrosos en la capa de interfaz.
- Política de referrer conservadora.
- Sin scripts externos nuevos.
- Auditoría automática de patrones de secretos, `eval`, `new Function`, enlaces peligrosos y regresiones básicas.
- Los datos de perfil, plan y tamaño de texto siguen siendo locales al navegador; no se añade backend.

## Escalado del autor
Solo se permite cuando el proyecto tiene núcleo TIC/informático real: ciberseguridad/ENS, software/web, sistemas, redes y conectividad, administración electrónica, datos/IA, integración/interoperabilidad, IoT/sensores, GIS, automatización o infraestructura tecnológica equivalente.

Palabras genéricas como estrategia, innovación, modernización, consultoría o contratación no bastan.
