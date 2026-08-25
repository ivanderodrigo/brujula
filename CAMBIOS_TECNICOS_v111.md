# Cambios técnicos v1.1.1 PRO

## Problemas del último `full`

El último workflow publicado confirmaba una base funcional, pero dejaba cuatro deudas:

- 0/10 datasets territoriales MITECO por HTTP 400;
- renta INE con cobertura insuficiente;
- muchos candidatos BOE con ruido técnico;
- `tools/cache/ENTIDADES.2025.csv` entrando en el commit.

## Soluciones incluidas

### MITECO
Importador consciente de páginas/formularios de descarga, con descubrimiento desde la ficha oficial, cookies, fallback y validación del ZIP.

### INE
Parser flexible y estrategia `latest-per-municipality`, conservando la referencia anual por registro.

### BOE
Saneado semántico en el generador y raw trasladado a `tools/cache/boe_raw`.

### BDNS
Raw trasladado a `tools/cache/raw_bdns`.

### Git
`.gitignore` excluye cachés y el workflow ejecuta `git rm --cached` sobre los directorios heredados.

### Validación
`validar_sitio.py` y `generar_seo.py` no consideran `tools/cache` parte del sitio público.

### Accesibilidad
Las fichas SEO generadas incluyen `skip-link` y `main#main-content`. También se proporciona `tools/aplicar_v111_pro.py` para reforzar páginas existentes al aplicar el overlay.

## Pruebas realizadas antes de empaquetar

- compilación de los Python modificados: OK;
- `node --check assets/js/app.js`: OK;
- prueba sintética de INE con años distintos por municipio: OK;
- prueba de saneado de título BOE: OK;
- prueba de formulario MITECO con hidden + submit: OK;
- prueba de validador con un HTML deliberadamente inválido dentro de `tools/cache`: **PUBLICABLE**;
- `python tools/actualizar_todo.py --mode validate-only`: **PUBLICABLE**.

La conectividad externa de MITECO e INE debe confirmarse con el siguiente workflow `full` real de GitHub Actions.
