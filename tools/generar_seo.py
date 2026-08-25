#!/usr/bin/env python3
from __future__ import annotations
from pathlib import Path
import datetime as dt, html, json, os, re, shutil, sys
from urllib.parse import urljoin

ROOT=Path(__file__).resolve().parents[1]
CFG=json.loads((ROOT/'data/config/site.json').read_text(encoding='utf-8'))
SITE=CFG['site_url'].rstrip('/')+'/'
OG=urljoin(SITE,CFG['og_image'])
START='<!-- SEO:BRUJULA:START -->'; END='<!-- SEO:BRUJULA:END -->'

def esc(s): return html.escape(str(s or ''),quote=True)
def page_url(path:Path):
    rel=path.relative_to(ROOT).as_posix()
    if rel=='index.html': return SITE
    if rel.endswith('/index.html'): return urljoin(SITE,rel[:-10])
    return urljoin(SITE,rel)

def extract(pattern,text,default=''):
    m=re.search(pattern,text,re.I|re.S); return html.unescape(m.group(1).strip()) if m else default

def block(title,desc,url,page_type='WebPage',extra=None,index=True):
    data={"@context":"https://schema.org","@type":page_type,"name":title,"description":desc,"url":url,"isPartOf":{"@type":"WebSite","name":CFG['site_name'],"url":SITE},"inLanguage":"es"}
    if extra:data.update(extra)
    robots='index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1' if index else 'noindex,follow'
    return f'''{START}
<meta name="robots" content="{robots}">
<link rel="canonical" href="{esc(url)}">
<meta name="author" content="{esc(CFG['author_name'])}">
<meta name="theme-color" content="{esc(CFG['theme_color'])}">
<meta property="og:locale" content="es_ES">
<meta property="og:type" content="website">
<meta property="og:site_name" content="{esc(CFG['site_name'])}">
<meta property="og:title" content="{esc(title)}">
<meta property="og:description" content="{esc(desc)}">
<meta property="og:url" content="{esc(url)}">
<meta property="og:image" content="{esc(OG)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{esc(title)}">
<meta name="twitter:description" content="{esc(desc)}">
<meta name="twitter:image" content="{esc(OG)}">
<script type="application/ld+json">{json.dumps(data,ensure_ascii=False,separators=(',',':'))}</script>
{END}'''

def inject(path:Path):
    text=path.read_text(encoding='utf-8')
    title=extract(r'<title>(.*?)</title>',text,CFG['site_name'])
    desc=extract(r'<meta\s+name=["\']description["\']\s+content=["\'](.*?)["\']',text,CFG['description'])
    url=page_url(path)
    ptype='ProfilePage' if path.relative_to(ROOT).as_posix()=='autor/index.html' else 'WebPage'
    extra=None
    if ptype=='ProfilePage': extra={"mainEntity":{"@type":"Person","name":CFG['author_name'],"url":url,"sameAs":[CFG['author_linkedin']]}}
    b=block(title,desc,url,ptype,extra)
    if START in text:
        text=re.sub(re.escape(START)+r'.*?'+re.escape(END),b,text,flags=re.S)
    else:
        text=text.replace('</head>',b+'</head>',1)
    path.write_text(text,encoding='utf-8')

def load(name): return json.loads((ROOT/'data/catalog'/name).read_text(encoding='utf-8'))
def slugify(s):
    import unicodedata
    s=''.join(c for c in unicodedata.normalize('NFD',str(s)) if unicodedata.category(c)!='Mn').lower()
    return re.sub(r'[^a-z0-9]+','-',s).strip('-')

def write_card(kind,item,interactive,summary_field='summary'):
    iid=str(item['id']); title=item.get('title') or item.get('project') or item.get('municipality') or iid
    desc=(item.get(summary_field) or item.get('why') or item.get('problem') or '').strip()
    if not desc: desc=f'Ficha práctica de {title} en Brújula Municipal.'
    folder=ROOT/'fichas'/kind/iid; folder.mkdir(parents=True,exist_ok=True)
    url=urljoin(SITE,f'fichas/{kind}/{iid}/')
    source=item.get('source') or item.get('official_source')
    facts=[]
    for key,label in [('organization','Organismo'),('category','Ámbito'),('complexity','Complejidad'),('status_label','Estado'),('deadline','Plazo'),('population','Población'),('cost','Coste'),('actual_cost','Coste real')]:
        if item.get(key) not in (None,''):facts.append(f'<div><strong>{esc(item.get(key))}</strong><span>{label}</span></div>')
    body=f'''<!doctype html><html lang="es" data-base="../../../"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{esc(title)} · Brújula Municipal</title><meta name="description" content="{esc(desc[:300])}"><link rel="stylesheet" href="../../../assets/css/styles.css"></head><body><header class="topbar"><div class="shell nav"><a class="brand" href="../../../">Brújula <span>Municipal</span></a><div class="nav-actions"><a class="btn" href="../../../{interactive}">Abrir ficha interactiva</a></div></div></header><main><section class="detail-hero"><div class="shell"><div class="kicker">Ficha indexable · {esc(kind)}</div><h1>{esc(title)}</h1><p class="lede">{esc(desc)}</p><div class="facts">{''.join(facts)}</div></div></section><section class="section"><div class="shell two-col-detail"><div><article class="card"><div class="kicker">Qué debes saber</div><h2>Resumen práctico</h2><p>{esc(desc)}</p>{f'<p><a class="btn" href="{esc(source)}" target="_blank" rel="noopener">Fuente oficial ↗</a></p>' if source else ''}</article></div><aside class="card sticky-side"><div class="kicker">Brújula Municipal</div><h3>Continúa en la herramienta</h3><p>Abre la ficha interactiva para relacionar esta información con tu localidad, proyectos, financiación y obligaciones.</p><a class="btn btn-teal" href="../../../{interactive}">Abrir ficha interactiva</a></aside></div></section></main><footer class="footer"><div class="shell"><p class="small">Brújula Municipal · Inteligencia práctica para pequeños ayuntamientos.</p></div></footer><script src="../../../assets/js/app.js"></script></body></html>'''
    path=folder/'index.html'; path.write_text(body,encoding='utf-8'); inject(path); return url

def main():
    # eliminar fichas generadas anteriores y regenerar
    shutil.rmtree(ROOT/'fichas',ignore_errors=True)
    urls=[]
    projects=load('proyectos.json'); obligations=load('obligaciones.json'); opps=load('oportunidades.json'); cases=load('casos.json')
    for x in projects: urls.append(write_card('proyectos',x,f'proyectos/detalle.html?id={x["id"]}'))
    for x in obligations: urls.append(write_card('obligaciones',x,f'obligaciones/detalle.html?id={x["id"]}'))
    for x in opps: urls.append(write_card('oportunidades',x,f'oportunidades/detalle.html?id={x["id"]}'))
    for x in cases: urls.append(write_card('casos',x,f'casos/detalle.html?id={x["id"]}',summary_field='result'))
    # metadatos para páginas existentes
    for p in ROOT.rglob('*.html'):
        if '/fichas/' in p.as_posix(): continue
        inject(p)
    # manifest / robots / humans
    manifest={"name":CFG['site_name'],"short_name":"Brújula","start_url":"./","display":"standalone","background_color":"#f7f9fa","theme_color":CFG['theme_color'],"icons":[{"src":"assets/img/logo-brujula.svg","sizes":"any","type":"image/svg+xml","purpose":"any"}]}
    (ROOT/'site.webmanifest').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
    (ROOT/'robots.txt').write_text(f'User-agent: *\nAllow: /\n\nSitemap: {urljoin(SITE,"sitemap.xml")}\n',encoding='utf-8')
    (ROOT/'humans.txt').write_text(f'{CFG["site_name"]}\nAutor: {CFG["author_name"]}\nLinkedIn: {CFG["author_linkedin"]}\nWeb: {SITE}\n',encoding='utf-8')
    # manifiesto enlazado desde todas las páginas
    for p in ROOT.rglob('*.html'):
        text=p.read_text(encoding='utf-8')
        if 'rel="manifest"' not in text:
            rel=os.path.relpath(ROOT/'site.webmanifest',p.parent).replace('\\','/')
            text=text.replace('</head>',f'<link rel="manifest" href="{rel}"></head>',1)
            p.write_text(text,encoding='utf-8')
    # sitemap: secciones + fichas; excluye templates detalle genéricos
    static=[]
    for p in ROOT.rglob('index.html'):
        rel=p.relative_to(ROOT).as_posix()
        if rel.startswith('.'):continue
        static.append(page_url(p))
    all_urls=sorted(set(static+urls))
    lm=dt.datetime.now(dt.timezone.utc).date().isoformat()
    xml=['<?xml version="1.0" encoding="UTF-8"?>','<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for u in all_urls: xml.append(f'<url><loc>{esc(u)}</loc><lastmod>{lm}</lastmod></url>')
    xml.append('</urlset>')
    (ROOT/'sitemap.xml').write_text('\n'.join(xml),encoding='utf-8')
    print(f'OK · SEO: {len(all_urls)} URLs sitemap · {len(urls)} fichas indexables')
    return 0
if __name__=='__main__': sys.exit(main())
