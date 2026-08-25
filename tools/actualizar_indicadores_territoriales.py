#!/usr/bin/env python3
"""Actualiza indicadores territoriales oficiales de MITECO sin dependencias externas.

Descarga shapefiles publicados por la Secretaría General para el Reto Demográfico,
lee únicamente el DBF (atributos) y genera un JSON estático por código INE municipal.
Si una fuente cambia o no puede interpretarse, conserva los datos anteriores y deja
constancia del error: nunca inventa un valor.
"""
from __future__ import annotations
from pathlib import Path
import datetime as dt, io, json, re, struct, sys, urllib.request, zipfile

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'data'/'generated'/'indicadores_territoriales.json'
CACHE=ROOT/'tools'/'cache'/'territorial'
CACHE.mkdir(parents=True,exist_ok=True)

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

def candidates(filename):
    low=filename.lower()
    return [
      f'https://www.mapa.gob.es/descargas-gis-miteco/descargafichero?f={low}',
      f'https://www.mapama.gob.es/app/descargas/descargafichero.aspx?f={filename}',
      f'https://gis.miteco.gob.es/descargas/app/DescargaFichero?f={filename}',
    ]

def fetch_zip(filename):
    cached=CACHE/filename
    # En cada ciclo programado intentamos primero refrescar desde la fuente.
    # Si la fuente está temporalmente caída, usamos la última copia local válida.
    cache_valid=False
    if cached.exists() and cached.stat().st_size>1000:
        try:
            with zipfile.ZipFile(cached): cache_valid=True
        except Exception:
            cache_valid=False
    last=None
    for url in candidates(filename):
        try:
            req=urllib.request.Request(url,headers={'User-Agent':'BrujulaMunicipal/0.7 (+datos públicos)'})
            with urllib.request.urlopen(req,timeout=90) as r:
                data=r.read()
            if not data.startswith(b'PK'):
                last=f'{url}: respuesta no ZIP ({len(data)} bytes)'; continue
            cached.write_bytes(data)
            return cached,url
        except Exception as e:
            last=f'{url}: {e}'
    if cache_valid:
        return cached,'cache-fallback'
    raise RuntimeError(last or f'No se pudo descargar {filename}')

def dbf_records(data:bytes):
    if len(data)<32: return [],[]
    n=struct.unpack('<I',data[4:8])[0]; header_len=struct.unpack('<H',data[8:10])[0]; rec_len=struct.unpack('<H',data[10:12])[0]
    fields=[]; pos=32
    while pos+32<=header_len and data[pos]!=0x0D:
        d=data[pos:pos+32]; name=d[:11].split(b'\0',1)[0].decode('latin1','ignore').strip(); typ=chr(d[11]); ln=d[16]; dec=d[17]
        fields.append((name,typ,ln,dec)); pos+=32
    rows=[]; off=header_len
    for i in range(n):
        rec=data[off+i*rec_len:off+(i+1)*rec_len]
        if len(rec)<rec_len or rec[:1]==b'*': continue
        cur=1; row={}
        for name,typ,ln,dec in fields:
            raw=rec[cur:cur+ln]; cur+=ln
            txt=raw.decode('latin1','ignore').strip()
            if typ in 'NF' and txt:
                try: val=float(txt.replace(',','.')); val=int(val) if dec==0 and val.is_integer() else val
                except Exception: val=txt
            elif typ=='L': val=txt.upper() in ('Y','T','S')
            else: val=txt
            row[name]=val
        rows.append(row)
    return fields,rows

def find_code(row):
    preferred=[]; other=[]
    for k,v in row.items():
        s=re.sub(r'\D','',str(v))
        if len(s)==5:
            (preferred if any(x in norm(k) for x in ('ine','codmun','codigo','cod_mun','codine')) else other).append(s)
    return (preferred or other or [None])[0]

def find_name(row):
    for k,v in row.items():
        nk=norm(k)
        if any(x in nk for x in ('municip','nombre','nom_mun','name')) and isinstance(v,str) and len(v.strip())>1 and not v.strip().isdigit(): return v.strip()
    return None

def pick_value(row,keywords):
    scored=[]
    for k,v in row.items():
        if not isinstance(v,(int,float)): continue
        nk=norm(k); score=sum(2 for kw in keywords if norm(kw) in nk)
        if any(x in nk for x in ('cod','ine','id','shape','object','area','perimet')): score-=6
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
    old=load_old(); by={x.get('ine_code'):x for x in old.get('items',[]) if x.get('ine_code')}; source_status={}; success=0
    for metric,filename,keywords in SOURCES:
        try:
            zp,via=fetch_zip(filename)
            with zipfile.ZipFile(zp) as z:
                dbfs=[n for n in z.namelist() if n.lower().endswith('.dbf')]
                if not dbfs: raise RuntimeError('ZIP sin DBF')
                # El DBF principal suele ser el de mayor tamaño.
                dbf=max(dbfs,key=lambda n:z.getinfo(n).file_size); fields,rows=dbf_records(z.read(dbf))
            count=0; value_field=None
            for row in rows:
                code=find_code(row)
                if not code: continue
                val,field=pick_value(row,keywords)
                if val is None: continue
                rec=by.setdefault(code,{'ine_code':code})
                if not rec.get('name'): rec['name']=find_name(row)
                rec[metric]=val; rec.setdefault('_evidence',{})[metric]={'source':'MITECO · Reto Demográfico','dataset':filename,'field':field}
                value_field=value_field or field; count+=1
            if count<7000: raise RuntimeError(f'Solo {count} municipios interpretados; no se acepta como dataset nacional')
            source_status[metric]={'ok':True,'records':count,'dataset':filename,'via':via,'value_field':value_field}; success+=1
            print(f'OK {metric}: {count} registros · campo {value_field}')
        except Exception as e:
            source_status[metric]={'ok':False,'dataset':filename,'error':str(e)}
            print(f'AVISO {metric}: {e}',file=sys.stderr)
    items=sorted(by.values(),key=lambda x:x.get('ine_code',''))
    OUT.parent.mkdir(parents=True,exist_ok=True)
    OUT.write_text(json.dumps({'generated_at':dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds'),'source_status':source_status,'successful_sources':success,'items':items,'note':'Solo se publican valores extraídos de fuentes oficiales. Una fuente fallida conserva, si existe, la última copia válida.'},ensure_ascii=False,indent=2),encoding='utf-8')
    print(f'Indicadores territoriales: {len(items)} municipios · {success}/{len(SOURCES)} fuentes actualizadas')
    # No fallar todo el portal porque una descarga cartográfica anual esté temporalmente caída.
    return 0 if (success>0 or items) else 1

if __name__=='__main__': raise SystemExit(main())
