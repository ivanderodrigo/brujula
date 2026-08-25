# Brújula Municipal v1.0

## Hito
La v1.0 convierte Brújula Municipal en un producto de decisión municipal completo: territorio → prioridades → proyecto → financiación → obligaciones → precedentes → presentación → ejecución.

## Nuevo: motor de prioridades
Ruta: `/decisiones/`

- ranking explicable de proyectos
- señales territoriales
- prioridades declaradas
- capacidad técnica/económica
- complejidad
- financiación relacionada
- razones visibles detrás del orden

La puntuación es únicamente un mecanismo interno de ordenación, nunca una declaración jurídica o de elegibilidad.

## Nuevo: casos replicables
Ruta: `/replicar/`

- casos reales
- coste cuando está documentado
- financiación
- resultado
- lección replicable
- afinidad con la localidad seleccionada
- fuente

Se incorporan nuevas referencias oficiales como Alpujarra Conectada, Campus Rural, RedCIT y la cartera de proyectos locales MITECO 2025.

## Nuevo: matching proyecto → financiación
Las fichas de proyecto pueden buscar oportunidades relacionadas dinámicamente usando temática + matching territorial/beneficiario.

## Nuevo: modo presentación
Ruta: `/presentacion/`

Genera una presentación institucional en siete bloques:
1. contexto
2. radiografía
3. prioridades
4. financiación y obligaciones
5. precedentes
6. hoja de ruta
7. cierre

Puede imprimirse o guardarse como PDF directamente desde el navegador.

## Nuevo: paquete institucional
Brújula genera un documento Markdown que reúne:
- resumen ejecutivo
- top de prioridades
- financiación
- obligaciones
- casos reales
- cartera 1/3/5 años
- plan de 90 días

## Actualidad incorporada
Se añade como **anunciada, no abierta** la autorización de hasta 80 M€ para proyectos locales contra la despoblación (MITECO, 25/08/2026). La plataforma mantiene la cautela de esperar la convocatoria oficial antes de declarar plazos, elegibilidad o cuantías por proyecto.

## Autor
LinkedIn real incorporado:
https://www.linkedin.com/in/ivanrodrigo/

## Arquitectura
Sin cambios en el principio económico:
- 100 % estática
- sin backend obligatorio
- sin base de datos cloud
- sin pago por petición
- portable entre hostings estáticos
