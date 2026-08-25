#!/usr/bin/env python3
"""Actualiza el parte diario de novedades oficiales relevantes para Brújula Municipal.

- Consume RSS/Atom oficiales configurados.
- Filtra por relevancia municipal mediante vocabulario explícito.
- Vigila páginas oficiales por hash para detectar cambios aunque no exista RSS.
- Todo lo automático queda marcado pending_review.
"""
from __future__ import annotations
from pathlib import Path
import argparse, datetime as dt, hashlib, html, json, re, ssl, sys, urllib.request, xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime
from urllib.parse import urljoin

ROOT=Path(__file__).resolve().parents[1]
CFG=ROOT/'data'/'config'/'novedades_fuentes.json'
OUT=ROOT/'data'/'generated'/'novedades_diarias.json'
STATE=ROOT/'data'/'system'/'watch-state.json'
UA='BrujulaMunicipal/1.1 (+https://brujulamunicipal.eu.org/)'


def now(): return dt.datetime.now(dt.timezone.utc)
def read_json(p,default):
    try:return json.loads(p.read_text(encoding='utf-8'))
    except Exception:return default

def fetch(url,timeout=30):
    req=urllib.request.Request(url,headers={'User-Agent':UA,'Accept':'application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.9, */*;q=0.5'})
    ctx=ssl.create_default_context()
    with urllib.request.urlopen(req,timeout=timeout,context=ctx) as r:
        return r.read(), r.headers.get_content_type(), r.geturl()

def clean(text=''):
    text=re.sub(r'<[^>]+>',' ',text or '')
    text=html.unescape(text)
    return re.sub(r'\s+',' ',text).strip()

def norm(s=''):
    import unicodedata
    return ''.join(c for c in unicodedata.normalize('NFD',str(s).lower()) if unicodedata.category(c)!='Mn')

def parse_date(s):
    if not s:return None
    try:return parsedate_to_datetime(s).astimezone(dt.timezone.utc).date().isoformat()
    except Exception: pass
    for fmt in ('%Y-%m-%dT%H:%M:%S%z','%Y-%m-%d','%d/%m/%Y'):
        try:return dt.datetime.strptime(s[:25],fmt).date().isoformat()
        except Exception:pass
    return None

def feed_items(raw,source):
    root=ET.fromstring(raw)
    items=[]
    # RSS
    for node in root.findall('.//item'):
        title=clean(node.findtext('title') or '')
        link=clean(node.findtext('link') or '')
        desc=clean(node.findtext('description') or '')
        date=parse_date(node.findtext('pubDate') or node.findtext('date') or '')
        items.append((title,link,desc,date))
    # Atom fallback
    if not items:
        ns='{http://www.w3.org/2005/Atom}'
        for node in root.findall(f'.//{ns}entry'):
            title=clean(node.findtext(f'{ns}title') or '')
            link=''
            ln=node.find(f'{ns}link')
            if ln is not None: link=ln.attrib.get('href','')
            desc=clean(node.findtext(f'{ns}summary') or node.findtext(f'{ns}content') or '')
            date=parse_date(node.findtext(f'{ns}published') or node.findtext(f'{ns}updated') or '')
            items.append((title,link,desc,date))
    return items

def relevant(title,desc,keywords):
    h=norm(title+' '+desc)
    hits=[k for k in keywords if norm(k) in h]
    return hits

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--days',type=int,default=45); ap.add_argument('--max-items',type=int,default=120); a=ap.parse_args()
    cfg=read_json(CFG,{})
    keywords=cfg.get('keywords',[])
    state=read_json(STATE,{'pages':{}})
    threshold=(now().date()-dt.timedelta(days=a.days)).isoformat()
    found=[]; errors=[]; watched=[]
    for src in cfg.get('feeds',[]):
        try:
            raw,ctype,final=fetch(src['url'])
            for title,link,desc,date in feed_items(raw,src):
                date=date or now().date().isoformat()
                if date<threshold: continue
                hits=relevant(title,desc,keywords)
                if not hits: continue
                sid=hashlib.sha1((src['id']+'|'+link+'|'+title).encode()).hexdigest()[:14]
                found.append({
                    'id':'auto-news-'+sid,'date':date,'title':title,'organization':src.get('organization') or src.get('name'),
                    'category':'actualidad','why':'Novedad detectada automáticamente en una fuente oficial con términos de posible interés municipal.',
                    'action':'Revisar la fuente antes de convertir esta detección en recomendación, obligación, proyecto u oportunidad.',
                    'source':link or final,'source_feed':src['url'],'source_name':src.get('name'),
                    'matched_keywords':hits[:8],'review_status':'pending','origin':'automatic','detected_at':now().isoformat(timespec='seconds')
                })
        except Exception as e: errors.append({'source':src.get('name'),'url':src.get('url'),'error':str(e)})
    # Hash watch: registra que una página oficial cambió, sin inventar qué significa el cambio.
    for src in cfg.get('watch_pages',[]):
        try:
            raw,ctype,final=fetch(src['url'])
            # compacta para evitar cambios por espacios triviales
            txt=clean(raw.decode('utf-8','ignore'))
            digest=hashlib.sha256(txt.encode()).hexdigest()
            old=state.setdefault('pages',{}).get(src['id'],{})
            changed=bool(old.get('hash') and old.get('hash')!=digest)
            state['pages'][src['id']]={'hash':digest,'checked_at':now().isoformat(timespec='seconds'),'url':final}
            watched.append({'id':src['id'],'name':src['name'],'url':final,'changed':changed,'checked_at':now().isoformat(timespec='seconds')})
            if changed:
                sid=hashlib.sha1((src['id']+'|'+digest).encode()).hexdigest()[:14]
                found.append({'id':'auto-watch-'+sid,'date':now().date().isoformat(),'title':f"Cambio detectado en {src['name']}",'organization':src.get('organization'),'category':'vigilancia','why':'La página oficial vigilada ha cambiado desde la última comprobación.','action':'Revisar manualmente el cambio antes de publicarlo como novedad material.','source':final,'review_status':'pending','origin':'automatic','detected_at':now().isoformat(timespec='seconds')})
        except Exception as e: errors.append({'source':src.get('name'),'url':src.get('url'),'error':str(e)})
    # dedupe newest first
    uniq={}
    for x in found:
        key=(norm(x.get('title')),x.get('source'))
        if key not in uniq or x.get('date','')>uniq[key].get('date',''):uniq[key]=x
    items=sorted(uniq.values(),key=lambda x:(x.get('date',''),x.get('title','')),reverse=True)[:a.max_items]
    OUT.parent.mkdir(parents=True,exist_ok=True)
    OUT.write_text(json.dumps({'generated_at':now().isoformat(timespec='seconds'),'review_policy':'Todas las novedades automáticas requieren revisión editorial.','items':items,'watched_pages':watched,'errors':errors},ensure_ascii=False,indent=2),encoding='utf-8')
    STATE.parent.mkdir(parents=True,exist_ok=True); STATE.write_text(json.dumps(state,ensure_ascii=False,indent=2),encoding='utf-8')
    print(f'OK · novedades oficiales: {len(items)} · páginas vigiladas: {len(watched)} · errores: {len(errors)}')
    return 0
if __name__=='__main__': sys.exit(main())
