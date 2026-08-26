#!/usr/bin/env python3
"""Ajustes estáticos seguros al aplicar Brújula Municipal v1.1.2 PRO.

No toca catálogos ni datos generados. Solo refuerza accesibilidad estructural de HTML
existentes para que el overlay pueda aplicarse sobre un repositorio v1.1 ya actualizado.
"""
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]

def public_html(path:Path)->bool:
    rel=path.relative_to(ROOT)
    parts=rel.parts
    if len(parts)>=2 and parts[0]=='tools' and parts[1]=='cache': return False
    if parts and parts[0].startswith('.'): return False
    return True

def main():
    touched=0
    for p in ROOT.rglob('*.html'):
        if not public_html(p): continue
        text=p.read_text(encoding='utf-8',errors='ignore')
        original=text
        if '<body' in text and 'class="skip-link"' not in text:
            pos=text.find('>',text.find('<body'))
            if pos!=-1:
                text=text[:pos+1]+'<a class="skip-link" href="#main-content">Saltar al contenido principal</a>'+text[pos+1:]
        if '<main' in text and 'id="main-content"' not in text:
            text=text.replace('<main>','<main id="main-content">',1)
            if 'id="main-content"' not in text:
                text=text.replace('<main ','<main id="main-content" ',1)
        if text!=original:
            p.write_text(text,encoding='utf-8'); touched+=1
    print(f'OK · accesibilidad estructural reforzada en {touched} páginas.')

if __name__=='__main__': main()
