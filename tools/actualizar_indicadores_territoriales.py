#!/usr/bin/env python3
"""Actualiza indicadores territoriales oficiales de MITECO sin dependencias externas.

v1.1.1 PRO
- Descubre los enlaces desde las páginas oficiales antes de descargar.
- Soporta portales de descarga que devuelven una página HTML/formulario en vez del ZIP.
- Mantiene cookies y campos ocultos (incluidos formularios ASP.NET).
- Conserva la última copia válida si la fuente anual falla.
- Nunca inventa valores.
"""
from __future__ import annotations
from pathlib import Path
from html.parser import HTMLParser
from http.cookiejar import CookieJar
from urllib.parse import urljoin, urlparse, parse_qs, urlencode
import datetime as dt, json, re, struct, sys, urllib.request, zipfile

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'data'/'generated'/'indicadores_territoriales.json'
CACHE=ROOT/'tools'/'cache'/'territorial'
CACHE.mkdir(parents=True,exist_ok=True)
UA='Mozilla/5.0 (compatible; BrujulaMunicipal/1.1.1; +https://brujulamunicipal.eu.org/)'
LANDING_PAGES=[
 'https://www.miteco.gob.es/es/cartografia-y-sig/ide/descargas/reto-demografico/datos-demograficos.html',
 'https://www.miteco.gob.es/es/cartografia-y-sig/ide/descargas/reto-demografico/datos-servicios.html',
]

SOURCES=[
 ('population','cifras_poblacion_2023.zip',['pob','poblacion','total']),
 ('population_change','Variacion_Pob_2014_2023.zip',['vari','var','2014','2023']),
 ('density','Densidad_Poblacion_2023.zip',['dens','density']),
 ('mean_age','Edad_Media_2023.zip',['edad','media']),
 ('over65','Poblacion-65A_2022.zip',['65','mayor','porc']),
 ('broadband100','Porcentaje_Pob_Cob100.zip',['cob','100','internet','banda']),
 ('pharmacies','Farmacias_2023.zip',['farm']),
 ('primary_schools','Centros_EdPrimaria_2022.zip',['prim','centro','educ']),
 ('highway_minutes','Tiempo-Autop-Autov_2022.zip',['tiempo','autop','autov','min']),
 ('hospital_minutes','Tiempo-Hospital_2022.zip',['tiempo','hospital','min']),
]

def norm(s):
    import unicodedata
    return ''.join(c for c in unicodedata.normalize('NFD',str(s)) if unicodedata.category(c)!='Mn').lower()

class LinkParser(HTMLParser):
    def __init__(self): super().__init__(); self.links=[]
    def handle_starttag(self,tag,attrs):
        if tag.lower()!='a': return
        d=dict(attrs); href=d.get('href')
        if href:self.links.append(href)

class FormParser(HTMLParser):
    def __init__(self):
        super().__init__(); self.forms=[]; self.current=None
    def handle_starttag(self,tag,attrs):
        tag=tag.lower(); d=dict(attrs)
        if tag=='form':
            self.current={'action':d.get('action',''),'method':d.get('method','get').lower(),'fields':{},'submit':None}
        elif self.current is not None and tag=='input':
            name=d.get('name'); typ=d.get('type','text').lower(); val=d.get('value','')
            if name:
                if typ in ('submit','button','image'):
                    self.current['submit']=self.current['submit'] or (name,val)
                elif typ not in ('file','reset'):
                    self.current['fields'][name]=val
        elif self.current is not None and tag=='button':
            name=d.get('name'); val=d.get('value','')
            if name:self.current['submit']=self.current['submit'] or (name,val)
    def handle_endtag(self,tag):
        if tag.lower()=='form' and self.current is not None:
            self.forms.append(self.current); self.current=None

def opener():
    return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(CookieJar()))

def request(op,url,data=None,referer=None,timeout=120):
    headers={'User-Agent':UA,'Accept':'*/*','Accept-Language':'es-ES,es;q=0.9,en;q=0.6'}
    if referer:headers['Referer']=referer
    if data is not None:headers['Content-Type']='application/x-www-form-urlencoded'
    req=urllib.request.Request(url,data=data,headers=headers)
    with op.open(req,timeout=timeout) as r:
        return r.read(), r.geturl(), r.headers.get('Content-Type','')

def is_zip(data):
    return len(data)>4 and data[:4]==b'PK\x03\x04'

def discover_links(filename):
    out=[]
    op=opener()
    for page in LANDING_PAGES:
        try:
            raw,final,_=request(op,page,timeout=45)
            html=raw.decode('utf-8','ignore')
            p=LinkParser();p.feed(html)
            for href in p.links:
                absolute=urljoin(final,href)
                q=parse_qs(urlparse(absolute).query)
                f=(q.get('f') or [''])[0]
                if filename.casefold() in absolute.casefold() or filename.casefold()==f.casefold():
                    if absolute not in out: out.append(absolute)
        except Exception:
            continue
    return out

def follow_download_page(url,filename):
    """Devuelve bytes ZIP aunque el primer GET sea una página con botón de descarga."""
    op=opener()
    raw,final,ctype=request(op,url,timeout=120)
    if is_zip(raw):return raw,final,'direct'
    text=raw.decode('utf-8','ignore')
    if 'html' not in ctype.lower() and '<form' not in text.lower():
        raise RuntimeError(f'respuesta no ZIP ({len(raw)} bytes; {ctype or "sin content-type"})')
    fp=FormParser();fp.feed(text)
    if not fp.forms:
        raise RuntimeError(f'página de descarga sin formulario interpretable ({len(raw)} bytes)')
    original_query=parse_qs(urlparse(final).query)
    errors=[]
    for form in fp.forms:
        fields=dict(form['fields'])
        # Algunos portales conservan el fichero solo en query-string, no en hidden input.
        if 'f' not in fields and original_query.get('f'): fields['f']=original_query['f'][0]
        if form.get('submit'):
            k,v=form['submit']; fields[k]=v
        action=urljoin(final,form.get('action') or final)
        try:
            if form.get('method')=='post':
                body=urlencode(fields,doseq=True).encode('utf-8')
                data,final2,ctype2=request(op,action,data=body,referer=final,timeout=180)
            else:
                sep='&' if '?' in action else '?'; target=action+sep+urlencode(fields,doseq=True)
                data,final2,ctype2=request(op,target,referer=final,timeout=180)
            if is_zip(data): return data,final2,'form-submit'
            errors.append(f'{final2}: no ZIP ({len(data)} bytes; {ctype2})')
        except Exception as e:
            errors.append(str(e))
    raise RuntimeError('; '.join(errors[-3:]) or 'formulario sin descarga ZIP')

def candidates(filename):
    discovered=discover_links(filename)
    static=[
      # Endpoint histórico aún citado por documentación técnica y publicaciones recientes.
      f'https://www.mapama.gob.es/app/descargas/descargafichero.aspx?f={filename}',
      # Endpoint enlazado actualmente desde las páginas oficiales de MITECO.
      f'https://gis.miteco.gob.es/descargas/app/DescargaFichero?f={filename}',
    ]
    out=[]
    for u in discovered+static:
        if u not in out:out.append(u)
    return out

def fetch_zip(filename):
    cached=CACHE/filename
    cache_valid=False
    if cached.exists() and cached.stat().st_size>1000:
        try:
            with zipfile.ZipFile(cached): cache_valid=True
        except Exception: cache_valid=False
    last=[]
    for url in candidates(filename):
        try:
            data,final,mode=follow_download_page(url,filename)
            cached.write_bytes(data)
            return cached,final,mode
        except Exception as e:
            last.append(f'{url}: {e}')
    if cache_valid:return cached,'cache-fallback','cache'
    raise RuntimeError(' | '.join(last[-4:]) or f'No se pudo descargar {filename}')

def dbf_records(data:bytes):
    if len(data)<32:return [],[]
    n=struct.unpack('<I',data[4:8])[0];header_len=struct.unpack('<H',data[8:10])[0];rec_len=struct.unpack('<H',data[10:12])[0]
    fields=[];pos=32
    while pos+32<=header_len and data[pos]!=0x0D:
        d=data[pos:pos+32];name=d[:11].split(b'\0',1)[0].decode('latin1','ignore').strip();typ=chr(d[11]);ln=d[16];dec=d[17]
        fields.append((name,typ,ln,dec));pos+=32
    rows=[];off=header_len
    for i in range(n):
        rec=data[off+i*rec_len:off+(i+1)*rec_len]
        if len(rec)<rec_len or rec[:1]==b'*':continue
        cur=1;row={}
        for name,typ,ln,dec in fields:
            raw=rec[cur:cur+ln];cur+=ln;txt=raw.decode('latin1','ignore').strip()
            if typ in 'NF' and txt:
                try:
                    val=float(txt.replace(',','.'));val=int(val) if dec==0 and val.is_integer() else val
                except Exception:val=txt
            elif typ=='L':val=txt.upper() in ('Y','T','S')
            else:val=txt
            row[name]=val
        rows.append(row)
    return fields,rows

def find_code(row):
    preferred=[];other=[]
    for k,v in row.items():
        s=re.sub(r'\D','',str(v))
        if len(s)==5:
            (preferred if any(x in norm(k) for x in ('ine','codmun','codigo','cod_mun','codine')) else other).append(s)
    return (preferred or other or [None])[0]

def find_name(row):
    for k,v in row.items():
        nk=norm(k)
        if any(x in nk for x in ('municip','nombre','nom_mun','name')) and isinstance(v,str) and len(v.strip())>1 and not v.strip().isdigit():return v.strip()
    return None

def pick_value(row,keywords):
    scored=[]
    for k,v in row.items():
        if not isinstance(v,(int,float)):continue
        nk=norm(k);score=sum(2 for kw in keywords if norm(kw) in nk)
        if any(x in nk for x in ('cod','ine','id','shape','object','area','perimet')):score-=6
        scored.append((score,k,v))
    scored.sort(reverse=True,key=lambda x:x[0])
    if scored and scored[0][0]>0:return scored[0][2],scored[0][1]
    numeric=[x for x in scored if x[0]>-6]
    if len(numeric)==1:return numeric[0][2],numeric[0][1]
    return None,None

def load_old():
    try:return json.loads(OUT.read_text(encoding='utf-8'))
    except Exception:return {'items':[]}

def main():
    old=load_old();by={x.get('ine_code'):x for x in old.get('items',[]) if x.get('ine_code')};source_status={};success=0
    for metric,filename,keywords in SOURCES:
        try:
            zp,via,download_mode=fetch_zip(filename)
            with zipfile.ZipFile(zp) as z:
                dbfs=[n for n in z.namelist() if n.lower().endswith('.dbf')]
                if not dbfs:raise RuntimeError('ZIP sin DBF')
                dbf=max(dbfs,key=lambda n:z.getinfo(n).file_size);fields,rows=dbf_records(z.read(dbf))
            count=0;value_field=None
            for row in rows:
                code=find_code(row)
                if not code:continue
                val,field=pick_value(row,keywords)
                if val is None:continue
                rec=by.setdefault(code,{'ine_code':code})
                if not rec.get('name'):rec['name']=find_name(row)
                rec[metric]=val;rec.setdefault('_evidence',{})[metric]={'source':'MITECO · Reto Demográfico','dataset':filename,'field':field,'url':via}
                value_field=value_field or field;count+=1
            if count<7000:raise RuntimeError(f'Solo {count} municipios interpretados; no se acepta como dataset nacional')
            source_status[metric]={'ok':True,'records':count,'dataset':filename,'via':via,'download_mode':download_mode,'value_field':value_field};success+=1
            print(f'OK {metric}: {count} registros · campo {value_field} · {download_mode}')
        except Exception as e:
            source_status[metric]={'ok':False,'dataset':filename,'error':str(e)}
            print(f'AVISO {metric}: {e}',file=sys.stderr)
    items=sorted(by.values(),key=lambda x:x.get('ine_code',''))
    OUT.parent.mkdir(parents=True,exist_ok=True)
    OUT.write_text(json.dumps({'generated_at':dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds'),'source_status':source_status,'successful_sources':success,'items':items,'note':'Solo se publican valores extraídos de fuentes oficiales. Una fuente fallida conserva, si existe, la última copia válida.'},ensure_ascii=False,indent=2),encoding='utf-8')
    print(f'Indicadores territoriales: {len(items)} municipios · {success}/{len(SOURCES)} fuentes actualizadas')
    return 0 if (success>0 or items) else 1

if __name__=='__main__':raise SystemExit(main())
