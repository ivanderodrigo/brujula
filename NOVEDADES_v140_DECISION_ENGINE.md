# Brújula Municipal v1.4.0 · Decision Engine

## El producto sigue siendo simple. El motor deja de serlo.

La v1.4 no añade un dashboard. Añade profundidad detrás de las cinco pantallas principales.

### Orden de decisión

1. aplicabilidad legal/administrativa;
2. quién debe actuar y por qué vía;
3. reutilizar/compartir antes de comprar;
4. necesidad territorial y social;
5. proporcionalidad para la escala local;
6. financiación relacionada;
7. urgencia/plazo;
8. confianza y evidencia disponible.

No se muestra una nota municipal única ni un porcentaje de “encaje”. Las puntuaciones internas solo ordenan.

## EATIM: dos escalas, no una

- **Población administrativa** del municipio matriz: umbrales y obligaciones municipales.
- **Población local** de la EATIM: dimensionamiento y proporcionalidad de actuaciones de proximidad.
- Una ayuda puede quedar como directa para EATIM, posible vía municipio matriz o no aplicable según beneficiario, territorio y bases detectadas.
- Si un umbral de habitantes no deja claro si se refiere a EATIM o municipio, Brújula no lo usa como veto automático.

## Obligaciones con ruta de cumplimiento

Las obligaciones dejan de ordenarse solo por impacto. El motor distingue obligación general, actividad, servicio, condición y control operativo.

Ejemplo incorporado: el sistema interno de información de la Ley 2/2023 afecta a todos los municipios, pero los de menos de 10.000 habitantes pueden compartir sistema y recursos. Brújula recomienda esa vía antes de sugerir una compra propia.

## Diputación y servicios comunes

Se diferencia entre:

- servicio provincial concreto **verificado**;
- asistencia/prestación/coordinación **prevista legalmente** que debe comprobarse;
- servicio común estatal reutilizable.

Un proyecto puede quedar arriba como necesidad, pero con la decisión: **“Comprobar servicio existente primero”**.

## Proyectos

Los 175 proyectos se mantienen. El ranking combina:

- señales demográficas y territoriales;
- obligaciones relacionadas;
- complejidad;
- coste orientativo frente a la escala local;
- soluciones públicas/provinciales existentes;
- financiación relacionada;
- diversidad de cartera.

La lista recomendada evita concentrar las primeras posiciones en seis proyectos casi iguales.

## BDNS enriquecida

`tools/actualizar_bdns.py` aprovecha campos estructurados oficiales de la API SNPSAP:

- beneficiarios y descripciones;
- región de impacto;
- inicio/fin de solicitud;
- presupuesto total;
- instrumentos, fondos y objetivos;
- bases reguladoras y sede electrónica;
- anuncios como evidencia complementaria;
- umbrales poblacionales explícitos, con sujeto cuando puede detectarse.

Los registros generados siguen con `review_status=pending`: **una extracción automática nunca equivale a elegibilidad**.

## Fichas explicables

Las fichas de ayuda, obligación y proyecto se han simplificado y ahora explican:

- por qué aparece la recomendación;
- qué condición falta;
- qué vía administrativa usar;
- qué servicio público comprobar antes;
- la fuente oficial relevante.
