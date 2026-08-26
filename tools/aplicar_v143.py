#!/usr/bin/env python3
from pathlib import Path
import re
ROOT=Path(__file__).resolve().parents[1]
changed=0

def harden_blank_tag(tag:str)->str:
    rel=re.search(r'\srel=["\']([^"\']*)["\']',tag,re.I)
    need={'noopener','noreferrer'}
    if rel:
        vals=rel.group(1).split(); vals=list(dict.fromkeys(vals+[x for x in need if x not in vals]))
        return tag[:rel.start()]+f' rel="{" ".join(vals)}"'+tag[rel.end():]
    return tag[:-1]+' rel="noopener noreferrer">'

for p in ROOT.rglob('*.html'):
    if any(part in {'.git','cache'} for part in p.parts): continue
    s=p.read_text(encoding='utf-8',errors='ignore'); old=s
    # External tabs: cut opener/referrer relationship.
    s=re.sub(r'<a\b[^>]*target=["\']_blank["\'][^>]*>',lambda m:harden_blank_tag(m.group(0)),s,flags=re.I)
    # Cache-bust the two common local assets without altering relative prefix.
    s=re.sub(r'(assets/css/styles\.css)(?:\?v=[^"\']+)?',r'\1?v=143',s)
    s=re.sub(r'(assets/js/app\.js)(?:\?v=[^"\']+)?',r'\1?v=143',s)
    # Add referrer policy meta when absent.
    if '<head' in s.lower() and 'name="referrer"' not in s.lower() and "name='referrer'" not in s.lower():
        s=re.sub(r'(<head\b[^>]*>)',r'\1<meta name="referrer" content="strict-origin-when-cross-origin">',s,count=1,flags=re.I)
    # Add skip link to legacy pages with main content.
    if '<main' in s.lower() and 'skip-link' not in s:
        s=re.sub(r'(<body\b[^>]*>)',r'\1<a class="skip-link" href="#main-content">Saltar al contenido principal</a>',s,count=1,flags=re.I)
        if 'id="main-content"' not in s and "id='main-content'" not in s:
            s=re.sub(r'<main\b', '<main id="main-content"', s, count=1, flags=re.I)
    # Remove global Author links from navigation/footer on every page.
    # Contextual TIC support inside project content remains untouched.
    def _clean_global_author(block):
        return re.sub(r'<a\b([^>]*href=["\'][^"\']*autor/[^"\']*["\'][^>]*)>\s*Autor\s*</a>', '', block.group(0), flags=re.I)
    s=re.sub(r'<(?:nav|footer)\b[^>]*>[\s\S]*?</(?:nav|footer)>', _clean_global_author, s, flags=re.I)
    if s!=old:
        p.write_text(s,encoding='utf-8');changed+=1
print(f'v1.4.3 aplicada: {changed} HTML normalizados.')
