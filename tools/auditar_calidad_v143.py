#!/usr/bin/env python3
from pathlib import Path
import re, sys
ROOT=Path(__file__).resolve().parents[1]
errors=[]; warnings=[]
core=[ROOT/x for x in ['index.html','obligaciones/index.html','oportunidades/index.html','proyectos/index.html','plan/index.html','proyectos/detalle.html']]

def add(bucket,path,msg): bucket.append(f'{path.relative_to(ROOT)}: {msg}')

for p in ROOT.rglob('*.html'):
    # Ignore build/cache directories if any
    if any(part in {'.git','tools','cache'} for part in p.parts): continue
    s=p.read_text(encoding='utf-8',errors='ignore')
    if re.search(r'href\s*=\s*["\']\s*(?:javascript|vbscript|data):',s,re.I): add(errors,p,'protocolo peligroso en href')
    for m in re.finditer(r'<a\b[^>]*target=["\']_blank["\'][^>]*>',s,re.I):
        tag=m.group(0)
        rel=re.search(r'rel=["\']([^"\']+)',tag,re.I)
        vals=(rel.group(1).lower().split() if rel else [])
        if not {'noopener','noreferrer'}.issubset(set(vals)): add(warnings,p,'target=_blank sin noopener+noreferrer en HTML fuente')
    if re.search(r'<script\b[^>]*src=["\']https?://',s,re.I): add(warnings,p,'script externo: revisar necesidad/SRI/CSP')

for p in core:
    if not p.exists(): add(errors,p,'falta página principal'); continue
    s=p.read_text(encoding='utf-8',errors='ignore')
    if 'name="viewport"' not in s and "name='viewport'" not in s: add(errors,p,'falta meta viewport')
    if 'skip-link' not in s: add(errors,p,'falta salto al contenido')
    if 'id="main-content"' not in s and "id='main-content'" not in s: add(errors,p,'falta main-content')
    blocks='\n'.join(re.findall(r'<(?:nav|footer)\b[^>]*>[\s\S]*?</(?:nav|footer)>',s,re.I))
    if re.search(r'href=["\'][^"\']*/autor/',blocks,re.I): add(errors,p,'enlace global al autor en navegación/pie')

app=ROOT/'assets/js/app.js'
if app.exists():
    s=app.read_text(encoding='utf-8',errors='ignore')
    for pat,label in [(r'\beval\s*\(','eval()'),(r'new\s+Function\s*\(','new Function()')]:
        if re.search(pat,s): add(errors,app,f'uso de {label}')
    if 'scope' not in (ROOT/'data/catalog/logica_simple.json').read_text(encoding='utf-8'): add(errors,app,'falta regla de alcance TIC del autor')

css=ROOT/'assets/css/styles.css'
if css.exists():
    s=css.read_text(encoding='utf-8',errors='ignore')
    # Font sizes should be relative after v143 migration.
    if re.search(r'font-size\s*:[^;}]*\b\d+(?:\.\d+)?px\b',s,re.I) or re.search(r'font\s*:[^;}]*\b\d+(?:\.\d+)?px\b',s,re.I): add(warnings,css,'queda algún tamaño tipográfico en px')
    for token in ['focus-visible','prefers-reduced-motion','text-size-tools','simple-footer .brand-name']:
        if token not in s: add(errors,css,f'falta regla de accesibilidad: {token}')

# Basic accidental secret scan, only likely source/config types.
secret_patterns=[
    (re.compile(r'AKIA[0-9A-Z]{16}'),'posible AWS key'),
    (re.compile(r'ghp_[A-Za-z0-9]{30,}'),'posible GitHub token'),
    (re.compile(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----'),'clave privada'),
]
for ext in ('*.js','*.json','*.yml','*.yaml','*.py','*.html'):
    for p in ROOT.rglob(ext):
        if any(part in {'.git','cache'} for part in p.parts): continue
        s=p.read_text(encoding='utf-8',errors='ignore')
        for rx,label in secret_patterns:
            if rx.search(s): add(errors,p,label)

print('AUDITORÍA BRÚJULA v1.4.3')
print(f'Errores: {len(errors)} · Avisos: {len(warnings)}')
for x in errors: print('ERROR ·',x)
for x in warnings[:60]: print('AVISO ·',x)
if len(warnings)>60: print(f'AVISO · ... {len(warnings)-60} avisos adicionales')
sys.exit(1 if errors else 0)
