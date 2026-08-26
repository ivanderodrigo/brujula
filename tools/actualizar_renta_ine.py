#!/usr/bin/env python3
"""Actualiza renta municipal oficial desde INE ADRH.

v1.1.2 PRO
- Fuente primaria: capa ArcGIS oficial INE "Nivel: municipios" del ADRH.
- Descubre el año disponible probando servicios recientes y pagina hasta completar España.
- Fuente secundaria: CSV JAXI 31241, filtrando de verdad nivel municipio
  (Distritos y Secciones deben estar vacíos).
- Nunca sustituye una copia nacional válida por una descarga parcial.
"""
from __future__ import annotations
from pathlib import Path
from urllib.parse import urlencode
import csv, datetime as dt, io, json, re, sys, unicodedata, urllib.request

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'data'/'generated'/'renta_ine.json'
STATUS=ROOT/'data'/'generated'/'status.json'
TABLE_URL='https://www.ine.es/jaxiT3/Tabla.htm?t=31241'
CSV_URLS=[
 'https://www.ine.es/jaxiT3/files/t/csv_bdsc/31241.csv',
 'https://www.ine.es/jaxiT3/files/t/csv_bd/31241.csv',
]
UA='Mozilla/5.0 (compatible; BrujulaMunicipal/1.1.2; +https://brujulamunicipal.eu.org/)'
MIN_COVERAGE=7000
PAGE_SIZE=2000

def norm(s):
    return ''.join(c for c in unicodedata.normalize('NFD',str(s)) if unicodedata.category(c)!='Mn').casefold()

def fetch(url,accept='application/json,text/plain,*/*',timeout=120):
    req=urllib.request.Request(url,headers={'User-Agent':UA,'Accept':accept,'Accept-Language':'es-ES,es;q=0.9'})
    with urllib.request.urlopen(req,timeout=timeout) as r:return r.read(),r.geturl(),r.headers.get('Content-Type','')

def load_json(path,default):
    try:return json.loads(path.read_text(encoding='utf-8'))
    except Exception:return default

def update_status(payload):
    st=load_json(STATUS,{})
    st['income_ine']=payload
    STATUS.parent.mkdir(parents=True,exist_ok=True)
    STATUS.write_text(json.dumps(st,ensure_ascii=False,indent=2),encoding='utf-8')

def service_url(year:int):
    return f'https://www.ine.es/servergis/rest/services/adrh_{year}_renta_media_por_persona/FeatureServer/1'

def discover_arcgis_year():
    current=dt.datetime.now().year
    # El ADRH se publica con retraso. Probamos desde el año anterior y retrocedemos.
    attempts=[]
    for year in range(current-1,2019,-1):
        url=service_url(year)
        try:
            raw,final,_=fetch(url+'?f=pjson',timeout=30)
            data=json.loads(raw.decode('utf-8','replace'))
            fields={str(x.get('name','')).lower() for x in data.get('fields',[])}
            if {'cumun','nmun','dato1'} <= fields:
                return year,url,attempts
            attempts.append({'year':year,'url':url,'error':'capa sin campos esperados'})
        except Exception as e:
            attempts.append({'year':year,'url':url,'error':str(e)})
    raise RuntimeError('No se encontró una capa municipal ADRH compatible')

def arcgis_items():
    year,layer,attempts=discover_arcgis_year()
    items=[];offset=0
    while True:
        params={
          'where':'1=1','outFields':'cumun,nmun,npro,nca,dato1,dato2,dato7,dato8,dato9,anyo',
          'returnGeometry':'false','f':'json','resultOffset':str(offset),
          'resultRecordCount':str(PAGE_SIZE),'orderByFields':'objectid_1'
        }
        url=layer+'/query?'+urlencode(params)
        raw,_,_=fetch(url,timeout=120)
        payload=json.loads(raw.decode('utf-8','replace'))
        if payload.get('error'):raise RuntimeError(str(payload['error']))
        features=payload.get('features') or []
        for feat in features:
            a=feat.get('attributes') or {}
            code=str(a.get('cumun') or a.get('CUMUN') or '').strip().zfill(5)
            if not re.fullmatch(r'\d{5}',code):continue
            val=a.get('dato1') if a.get('dato1') is not None else a.get('DATO1')
            try:val=float(val)
            except Exception:continue
            ref=str(a.get('anyo') or a.get('ANYO') or year).strip()
            m=re.search(r'20\d{2}',ref);ref=m.group(0) if m else str(year)
            def num_field(name):
                vv=a.get(name) if a.get(name) is not None else a.get(name.upper())
                try:return float(vv) if vv is not None else None
                except Exception:return None
            row={
              'ine_code':code,'income_per_person':val,'reference':ref,
              'name':a.get('nmun') or a.get('NMUN') or code,
              'province':a.get('npro') or a.get('NPRO'),
              'autonomous_region':a.get('nca') or a.get('NCA'),
              'income_per_household':num_field('dato2'),
              'under18_pct':num_field('dato7'),
              'over65':num_field('dato8'),
              'gini':num_field('dato9'),
              '_evidence':{
                'income_per_person':{'source':'INE · Atlas de Distribución de Renta de los Hogares','dataset':f'ADRH {year} · Nivel municipios','url':layer,'field':'DATO1'},
                'income_per_household':{'source':'INE · Atlas de Distribución de Renta de los Hogares','dataset':f'ADRH {year} · Nivel municipios','url':layer,'field':'DATO2'},
                'under18_pct':{'source':'INE · Atlas de Distribución de Renta de los Hogares','dataset':f'ADRH {year} · Nivel municipios','url':layer,'field':'DATO7'},
                'over65':{'source':'INE · Atlas de Distribución de Renta de los Hogares','dataset':f'ADRH {year} · Nivel municipios','url':layer,'field':'DATO8'},
                'gini':{'source':'INE · Atlas de Distribución de Renta de los Hogares','dataset':f'ADRH {year} · Nivel municipios','url':layer,'field':'DATO9'}
              }
            }
            items.append({k:v for k,v in row.items() if v is not None})
        print(f'INE ArcGIS {year}: página {offset//PAGE_SIZE+1} · {len(features)} registros')
        offset+=len(features)
        if len(features)<PAGE_SIZE:break
        if not features:break
    # dedupe defensivo
    by={}
    for x in items:by[x['ine_code']]=x
    items=sorted(by.values(),key=lambda x:x['ine_code'])
    return items,year,layer,attempts

def decode(raw):
    for enc in ('utf-8-sig','utf-8','latin1'):
        try:return raw.decode(enc)
        except UnicodeDecodeError:pass
    return raw.decode('utf-8','replace')

def number(s):
    s=str(s).strip().replace('\xa0','').replace(' ','')
    if not s or s in ('..','...','-','—','nan','NaN'):return None
    if ',' in s:s=s.replace('.','').replace(',','.')
    elif re.fullmatch(r'-?\d{1,3}(?:\.\d{3})+',s):s=s.replace('.','')
    try:return float(s)
    except Exception:return None

def parse_csv(text):
    try:dialect=csv.Sniffer().sniff(text[:20000],delimiters=';\t,')
    except Exception:
        dialect=csv.excel;dialect.delimiter=';'
    return list(csv.DictReader(io.StringIO(text),dialect=dialect))

def header(headers,*tokens):
    for h in headers:
        nh=norm(h)
        if all(t in nh for t in tokens):return h
    return None

def csv_items():
    all_rows=[];attempts=[]
    for url in CSV_URLS:
        try:
            raw,_,_=fetch(url,'text/csv,*/*;q=0.8');rows=parse_csv(decode(raw));attempts.append({'url':url,'rows':len(rows)})
            all_rows.extend((url,r) for r in rows)
            if rows:break
        except Exception as e:attempts.append({'url':url,'error':str(e)})
    if not all_rows:return [],attempts
    sample=all_rows[0][1];headers=list(sample.keys())
    mun=header(headers,'municip');district=header(headers,'distr');section=header(headers,'seccion') or header(headers,'sección')
    ind=header(headers,'indicador');period=header(headers,'period');value=header(headers,'total') or headers[-1]
    out=[]
    for url,r in all_rows:
        # CRÍTICO: una fila es municipal solo cuando las dimensiones inferiores están vacías.
        if district and str(r.get(district,'')).strip():continue
        if section and str(r.get(section,'')).strip():continue
        indicator=norm(r.get(ind,'')) if ind else ''
        if ind and 'renta neta media por persona' not in indicator:continue
        label=str(r.get(mun,'') if mun else '').strip();m=re.match(r'^\s*(\d{5})(?:\D|$)',label)
        if not m:continue
        val=number(r.get(value,''));
        if val is None:continue
        ym=re.search(r'20\d{2}',str(r.get(period,'')));year=ym.group(0) if ym else None
        out.append({'ine_code':m.group(1),'income_per_person':val,'reference':year,'name':re.sub(r'^\s*'+m.group(1)+r'\s*','',label).strip(' -·'),'_evidence':{'source':'INE · ADRH','table':'31241','url':url}})
    latest={}
    for x in out:
        prev=latest.get(x['ine_code']);y=int(x['reference'] or 0)
        if prev is None or y>int(prev.get('reference') or 0):latest[x['ine_code']]=x
    return sorted(latest.values(),key=lambda x:x['ine_code']),attempts

def main():
    attempts=[]
    try:
        items,year,layer,probe=arcgis_items();attempts.extend(probe)
        if len(items)<MIN_COVERAGE:raise RuntimeError(f'ArcGIS solo devolvió {len(items)} municipios')
        source='arcgis'
    except Exception as e:
        print('AVISO INE ArcGIS:',e,file=sys.stderr);attempts.append({'source':'arcgis','error':str(e)})
        items,csv_attempts=csv_items();attempts.extend(csv_attempts);year=max((int(x['reference']) for x in items if x.get('reference')),default=0);layer=TABLE_URL;source='csv-fallback'
    if len(items)<MIN_COVERAGE:
        old=load_json(OUT,{});old_items=old.get('items',[]) if isinstance(old,dict) else []
        update_status({'ok':False,'records_new':len(items),'records_kept':len(old_items),'source':source,'error':'cobertura nacional insuficiente'})
        if len(old_items)>=MIN_COVERAGE:
            print(f'AVISO renta INE: {len(items)} municipios nuevos; se conserva snapshot anterior de {len(old_items)}')
            return 1
        raise RuntimeError(f'Solo {len(items)} municipios con renta; no se acepta como cobertura nacional')
    payload={
      'generated_at':dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds'),
      'source_status':'ok','source_mode':source,'reference_latest':str(year),
      'items':items,'attempts':attempts,
      'note':'Fuente primaria: capa municipal oficial del Atlas de Distribución de Renta de los Hogares del INE. Incluye renta por persona y hogar, menores de 18, mayores de 65 e índice de Gini cuando están disponibles. No se mezclan distritos ni secciones.'
    }
    OUT.parent.mkdir(parents=True,exist_ok=True);OUT.write_text(json.dumps(payload,ensure_ascii=False,indent=2),encoding='utf-8')
    update_status({'ok':True,'records':len(items),'reference':str(year),'source':source,'url':layer})
    print(f'OK renta INE: {len(items)} municipios · referencia {year} · fuente {source}')
    return 0

if __name__=='__main__':
    try:raise SystemExit(main())
    except Exception as e:
        print('AVISO renta INE:',e,file=sys.stderr);raise SystemExit(1)
