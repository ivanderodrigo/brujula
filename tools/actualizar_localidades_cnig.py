#!/usr/bin/env python3
"""Actualiza el catálogo nacional de localidades para Brújula Municipal.

Orden de fuentes:
1) ZIP oficial NGMEP del IGN/CNIG, si la descarga directa está disponible o existe en cache.
2) Fallback automático: mirror público OSM-es de ENTIDADES.2025.csv, que replica el
   fichero ENTIDADES del NGMEP del IGN/CNIG. Este fallback sirve para que el usuario
   pueda cargar todo el país aunque el Centro de Descargas cambie su URL directa.

La web resultante sigue siendo 100 % estática. Este script se ejecuta en el pipeline
automático o, como respaldo, en el PC del mantenedor; genera JSON fragmentados para búsqueda bajo demanda.
"""
from __future__ import annotations
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.parse import urljoin
from zipfile import ZipFile
from io import BytesIO, StringIO
import csv, datetime as dt, json, re, subprocess, sys, unicodedata

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'data'/'catalog'/'municipios.json'
STATUS=ROOT/'data'/'generated'/'status.json'
PROVINCES_FILE=ROOT/'data'/'catalog'/'provincias.json'
CACHE=ROOT/'tools'/'cache'; CACHE.mkdir(parents=True,exist_ok=True)
CACHE_ZIP=CACHE/'BD_MUNICIPIOS-ENTIDADES.ZIP'
CACHE_MIRROR=CACHE/'ENTIDADES.2025.csv'
SOURCE_PAGE='https://centrodedescargas.cnig.es/CentroDescargas/detalleArchivo?sec=9000004'
OFFICIAL_DETAIL_PAGE=SOURCE_PAGE
MIRROR_URLS=[
 'https://raw.githubusercontent.com/OSM-es/validador-ine/main/ENTIDADES.2025.csv',
 'https://github.com/OSM-es/validador-ine/raw/refs/heads/main/ENTIDADES.2025.csv',
]
MIRROR_PAGE='https://github.com/OSM-es/validador-ine/blob/main/ENTIDADES.2025.csv'
UA='BrujulaMunicipal-static-updater/0.5'


def norm(s=''):
    s=''.join(c for c in unicodedata.normalize('NFD',str(s)) if unicodedata.category(c)!='Mn')
    return re.sub(r'[^a-z0-9]+',' ',s.casefold()).strip()

def header_norm(s=''): return re.sub(r'[^A-Z0-9]+','',str(s).upper())

def decode(b):
    for e in ('utf-8-sig','utf-8','cp1252','latin-1'):
        try:return b.decode(e)
        except UnicodeDecodeError:pass
    return b.decode('latin-1',errors='replace')

def fetch_bytes(url, timeout=120):
    req=Request(url,headers={'User-Agent':UA,'Accept':'*/*'})
    with urlopen(req,timeout=timeout) as r:
        return r.read()

def fetch_official_zip():
    # Un ZIP oficial colocado manualmente en cache siempre tiene prioridad.
    if CACHE_ZIP.exists() and CACHE_ZIP.stat().st_size>100_000:
        print('Usando ZIP NGMEP oficial local:',CACHE_ZIP)
        return CACHE_ZIP.read_bytes()
    # El Centro de Descargas no mantiene una URL directa estable. Intentamos descubrirla
    # desde la ficha oficial sin depender de rutas hardcodeadas que daban 404.
    try:
        print('Consultando ficha oficial CNIG para localizar la descarga…')
        html=fetch_bytes(OFFICIAL_DETAIL_PAGE,timeout=60).decode('utf-8','ignore')
        pattern=r'(?:href|url)=[\"\']([^\"\']+?\.zip(?:\?[^\"\']*)?)[\"\']'
        candidates=re.findall(pattern,html,re.I)
        for candidate in candidates:
            url=urljoin(OFFICIAL_DETAIL_PAGE,candidate)
            try:
                print('Intentando ZIP descubierto en CNIG:',url)
                b=fetch_bytes(url)
                if len(b)>100_000 and b.startswith(b'PK'):
                    CACHE_ZIP.write_bytes(b)
                    print('Descarga oficial correcta:',len(b),'bytes')
                    return b
            except Exception as e:
                print('  Descarga oficial descubierta no disponible:',e)
        if not candidates:
            print('  La ficha oficial no expone una URL ZIP directa estable.')
    except Exception as e:
        print('  No se pudo consultar la ficha oficial:',e)
    return None

def fetch_mirror_csv():
    import time
    stale=None
    if CACHE_MIRROR.exists() and CACHE_MIRROR.stat().st_size>1_000_000:
        stale=CACHE_MIRROR.read_bytes()
        age_days=(time.time()-CACHE_MIRROR.stat().st_mtime)/86400
        if age_days<7:
            print(f'Usando fallback local reciente ENTIDADES.2025.csv ({age_days:.1f} días):',CACHE_MIRROR)
            return stale
    for url in MIRROR_URLS:
        try:
            print('Intentando fallback OSM-es (copia del NGMEP):',url)
            b=fetch_bytes(url)
            if len(b)>1_000_000 and b.count(b';')>1000:
                CACHE_MIRROR.write_bytes(b)
                print('Fallback descargado correctamente:',len(b),'bytes')
                return b
            print('  La respuesta no parece el CSV esperado.')
        except Exception as e:
            print('  No disponible:',e)
    if stale:
        print('No se pudo refrescar el mirror; se conserva la copia local anterior.')
        return stale
    return None

def csv_from_zip(z:ZipFile,stem):
    names=z.namelist(); target=next((n for n in names if Path(n).stem.upper()==stem.upper() and n.lower().endswith('.csv')),None)
    if not target: raise RuntimeError(f'No aparece {stem}.csv dentro del ZIP. Contenido: {names[:30]}')
    text=decode(z.read(target));sample=text[:16000]
    try:dialect=csv.Sniffer().sniff(sample,delimiters=';\t,')
    except csv.Error:dialect=csv.excel;dialect.delimiter=';'
    return list(csv.DictReader(StringIO(text),dialect=dialect))

def val(row,*names):
    m={header_norm(k):v for k,v in row.items()}
    for n in names:
        v=m.get(header_norm(n))
        if v is not None and str(v).strip()!='':return str(v).strip()
    return None

def to_int(v):
    if v is None:return None
    s=re.sub(r'[^0-9-]','',str(v).split(',')[0])
    try:return int(s)
    except:return None

def to_float(v):
    if v is None:return None
    s=str(v).strip().replace(' ','').replace(',','.')
    try:return float(s)
    except:return None

def boolish(v): return norm(v) in ('true','verdadero','si','1','yes')

def code5(v):
    d=re.sub(r'\D','',str(v or ''))
    return d[:5] if len(d)>=5 else d.zfill(5) if d else None

def code11(v):
    d=re.sub(r'\D','',str(v or ''))
    return d.zfill(11) if d else None

def load_province_map():
    try:
        d=json.loads(PROVINCES_FILE.read_text(encoding='utf-8'))
        return {str(k).zfill(2):{'province':v[0],'autonomous_region':v[1]} for k,v in d.items()}
    except Exception:
        return {}

def build_from_official_zip(raw):
    z=ZipFile(BytesIO(raw))
    provinces=csv_from_zip(z,'PROVINCIAS'); municipalities=csv_from_zip(z,'MUNICIPIOS'); entities=csv_from_zip(z,'ENTIDADES'); eatims=csv_from_zip(z,'EATIMS')
    print(f'CSV oficial: {len(municipalities)} municipios · {len(entities)} entidades · {len(eatims)} EATIM')
    provmap={}
    for r in provinces:
        pc=str(val(r,'COD_PROV','CODPROV') or '').zfill(2)
        provmap[pc]={'province':val(r,'PROVINCIA','NOMBREPROV'),'autonomous_region':val(r,'COMUNIDAD AUTÓNOMA','COMUNIDAD AUTONOMA','NOMBREAUTON')}
    items=[];mun_by_id={};mun_name={}
    for r in municipalities:
        mid=code5(val(r,'COD_INE','CODIGOINE'));name=val(r,'NOMBRE_ACTUAL','NOMBRE')
        if not mid or not name:continue
        pc=str(val(r,'COD_PROV','CODPROV') or mid[:2]).zfill(2);p=provmap.get(pc,{})
        pop=to_int(val(r,'POBLACION_MUNI','POBLACION'))
        x={'id':mid,'ine_code':mid,'name':name,'entity_type':'municipality','province_code':pc,'province':val(r,'PROVINCIA') or p.get('province'),'autonomous_region':p.get('autonomous_region'),'population':pop,'population_year':2025,'population_official':pop is not None,'latitude':to_float(val(r,'LATITUD_ETRS89_REGCAN95','LATITUD_ETRS89','LATITUD_REGCAN95','LATITUD')),'longitude':to_float(val(r,'LONGITUD_ETRS89_REGCAN95','LONGITUD_ETRS89','LONGITUD_REGCAN95','LONGITUD')),'altitude':to_float(val(r,'ALTITUD')),'surface_ha':to_float(val(r,'SUPERFICIE_OFICIAL')),'source':'NGMEP 2026 · IGN/CNIG','source_url':SOURCE_PAGE,'special_profile':False}
        items.append(x);mun_by_id[mid]=x;mun_name[mid]=name
    pop_entities=[]
    for r in entities:
        if boolish(val(r,'SUPRIMIDA_INE')):continue
        c11=code11(val(r,'CODIGOINE','COD_INE'));name=val(r,'NOMBRE');parent=code5(val(r,'INEMUNI')) or (c11[:5] if c11 else None);typ=val(r,'TIPO') or 'Entidad de población'
        if not c11 or not name or not parent:continue
        nt=norm(typ)
        if nt=='municipio':continue
        if 'capital de municipio' in nt and norm(name)==norm(mun_name.get(parent,'')):continue
        pm=mun_by_id.get(parent,{});pc=str(val(r,'COD_PROV','CODPROV') or parent[:2]).zfill(2);p=provmap.get(pc,{})
        pop=to_int(val(r,'POBLACION'))
        pop_entities.append({'id':'pob-'+c11,'ine_entity_code':c11,'name':name,'entity_type':'population_entity','entity_subtype':typ,'parent_municipality_id':parent,'parent_municipality':mun_name.get(parent),'applicant_entity_type':'municipality','applicant_id':parent,'municipal_population':pm.get('population'),'province_code':pc,'province':val(r,'PROVINCIA') or pm.get('province') or p.get('province'),'autonomous_region':pm.get('autonomous_region') or p.get('autonomous_region'),'population':pop,'population_year':2025,'population_official':pop is not None,'latitude':to_float(val(r,'LATITUD_ETRS89_REGCAN95','LATITUD_ETRS89','LATITUD_REGCAN95','LATITUD')),'longitude':to_float(val(r,'LONGITUD_ETRS89_REGCAN95','LONGITUD_ETRS89','LONGITUD_REGCAN95','LONGITUD')),'altitude':to_float(val(r,'ALTITUD')),'source':'NGMEP 2026 · IGN/CNIG','source_url':SOURCE_PAGE,'special_profile':False})
    eatim_items=[];eatim_keys=set();entity_by_code={x.get('ine_entity_code'):x for x in pop_entities};entity_by_name_parent={(norm(x['name']),x.get('parent_municipality_id')):x for x in pop_entities}
    for i,r in enumerate(eatims,1):
        name=val(r,'DENOMINACION','NOMBRE');parent=code5(val(r,'INEMUNICIPIO','INEMUNI'));pc=str(val(r,'CODPROV','COD_PROV') or (parent[:2] if parent else '')).zfill(2);c11=code11(val(r,'CODINE','CODIGOINE'));ins=val(r,'CODINSCRIP')
        if not name or not parent:continue
        pm=mun_by_id.get(parent,{});match=entity_by_code.get(c11) or entity_by_name_parent.get((norm(name),parent));pop=match.get('population') if match else None
        special=norm(name)=='el hoyo' and parent=='13055';eid='el-hoyo' if special else 'eatim-'+(re.sub(r'[^a-zA-Z0-9]+','-',str(ins)).strip('-') if ins else f'{parent}-{i}')
        eatim_items.append({'id':eid,'ine_entity_code':c11,'rel_registration':ins,'name':name,'entity_type':'eatim','entity_subtype':'EATIM','parent_municipality_id':parent,'parent_municipality':mun_name.get(parent),'applicant_entity_type':'eatim','province_code':pc,'province':val(r,'NOMBREPROV','PROVINCIA') or pm.get('province'),'autonomous_region':val(r,'NOMBREAUTON','COMUNIDAD AUTÓNOMA') or pm.get('autonomous_region'),'population':pop,'municipal_population':pm.get('population'),'population_year':2025,'population_official':pop is not None,'latitude':to_float(val(r,'LATITUD_ETRS89_REGCAN95','LATITUD_ETRS89','LATITUD_REGCAN95','LATITUD')),'longitude':to_float(val(r,'LONGITUD_ETRS89_REGCAN95','LONGITUD_ETRS89','LONGITUD_REGCAN95','LONGITUD')),'altitude':to_float(val(r,'ALTITUD')),'source':'NGMEP 2026 · IGN/CNIG','source_url':SOURCE_PAGE,'special_profile':special})
        eatim_keys.add((norm(name),parent));
        if c11:eatim_keys.add((c11,parent))
    pop_entities=[x for x in pop_entities if (norm(x['name']),x.get('parent_municipality_id')) not in eatim_keys and (x.get('ine_entity_code'),x.get('parent_municipality_id')) not in eatim_keys]
    items.extend(pop_entities);items.extend(eatim_items)
    return items, {'mode':'official_cnig','municipalities':len(mun_by_id),'population_entities':len(pop_entities),'eatims':len(eatim_items),'source_year':2026,'population_year':2025}

def build_from_mirror(raw):
    """Construye catálogo desde ENTIDADES.2025.csv.

    Esquema conocido del fichero NGMEP ENTIDADES: código INE, nombre, ..., población,
    ..., lon, lat, ..., altitud, ..., flag1, flag2. Se omiten registros marcados y
    se publican municipios + núcleos nominados; diseminados genéricos se excluyen.
    """
    provmap=load_province_map(); text=decode(raw); reader=csv.reader(StringIO(text),delimiter=';')
    rows=list(reader)
    if len(rows)<1000: raise RuntimeError('El mirror no contiene suficientes registros.')
    parsed=[]
    for row in rows[1:]:
        if len(row)<15: continue
        code=re.sub(r'\D','',row[0]).zfill(11)
        if len(code)!=11: continue
        if str(row[13]).strip()=='1' or str(row[14]).strip()=='1': continue
        name=str(row[1]).strip()
        if not name: continue
        parsed.append((code,name,to_int(row[5]),to_float(row[8]),to_float(row[9]),to_float(row[11])))
    municipalities={}
    for code,name,pop,lon,lat,ele in parsed:
        if code.endswith('000000'):
            mid=code[:5];pc=mid[:2];pr=provmap.get(pc,{})
            municipalities[mid]={'id':mid,'ine_code':mid,'name':name,'entity_type':'municipality','province_code':pc,'province':pr.get('province'),'autonomous_region':pr.get('autonomous_region'),'population':pop,'population_year':2025,'population_official':pop is not None,'latitude':lat,'longitude':lon,'altitude':ele,'source':'NGMEP IGN/CNIG · copia pública OSM-es 2025','source_url':SOURCE_PAGE,'mirror_url':MIRROR_PAGE,'special_profile':False}
    items=list(municipalities.values()); entities=[]
    for code,name,pop,lon,lat,ele in parsed:
        if code.endswith('000000') or code.endswith('00') or code.endswith('99'): continue
        parent=code[:5];pm=municipalities.get(parent)
        if not pm: continue
        # Si el núcleo tiene exactamente el mismo nombre que el municipio, el registro municipal basta.
        if norm(name)==norm(pm.get('name','')): continue
        # El Hoyo es una EATIM conocida del municipio de Mestanza; preservamos su personalidad local.
        is_hoyo=(norm(name)=='el hoyo' and parent=='13055')
        x={'id':'el-hoyo' if is_hoyo else 'pob-'+code,'ine_entity_code':code,'name':name,'entity_type':'eatim' if is_hoyo else 'population_entity','entity_subtype':'EATIM' if is_hoyo else 'Núcleo de población','parent_municipality_id':parent,'parent_municipality':pm.get('name'),'applicant_entity_type':'eatim' if is_hoyo else 'municipality','applicant_id':None if is_hoyo else parent,'municipal_population':pm.get('population'),'province_code':pm.get('province_code'),'province':pm.get('province'),'autonomous_region':pm.get('autonomous_region'),'population':pop,'population_year':2025,'population_official':pop is not None,'latitude':lat,'longitude':lon,'altitude':ele,'source':'NGMEP IGN/CNIG · copia pública OSM-es 2025','source_url':SOURCE_PAGE,'mirror_url':MIRROR_PAGE,'special_profile':is_hoyo}
        entities.append(x)
    items.extend(entities)
    return items, {'mode':'mirror_osm_es','municipalities':len(municipalities),'population_entities':len(entities)-(1 if any(x.get('id')=='el-hoyo' for x in entities) else 0),'eatims':1 if any(x.get('id')=='el-hoyo' for x in entities) else 0,'source_year':2025,'population_year':2025,'note':'Fallback de disponibilidad. Los nombres/población proceden del fichero ENTIDADES.2025.csv del NGMEP reflejado por OSM-es; EATIM nacionales completas requieren el ZIP oficial.'}

def main():
    items=None;meta=None
    raw=fetch_official_zip()
    if raw:
        try: items,meta=build_from_official_zip(raw)
        except Exception as e:
            print('El ZIP oficial se descargó pero no pudo procesarse:',e)
    if not items:
        mirror=fetch_mirror_csv()
        if not mirror:
            raise RuntimeError(f'No se pudo obtener ni el ZIP oficial ni el fallback. Descarga manualmente BD_MUNICIPIOS-ENTIDADES.ZIP desde {SOURCE_PAGE} y colócalo en {CACHE_ZIP}.')
        items,meta=build_from_mirror(mirror)
    items.sort(key=lambda x:(norm(x.get('name','')),norm(x.get('province','')),x.get('entity_type','')))
    if len(items)<8000: raise RuntimeError(f'El catálogo generado solo contiene {len(items)} elementos; se rechaza para no sustituir el índice nacional por un catálogo incompleto.')
    payload={'complete':True,'source_year':meta.get('source_year'),'population_reference_year':meta.get('population_year'),'generated_at':dt.datetime.now().isoformat(timespec='seconds'),'source_dataset':'Nomenclátor Geográfico de Municipios y Entidades de Población · IGN/CNIG','source_url':SOURCE_PAGE,'source_mode':meta.get('mode'),'source_note':meta.get('note') or 'Catálogo nacional generado offline y fragmentado para búsqueda dinámica.','items':items}
    OUT.write_text(json.dumps(payload,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    try:s=json.loads(STATUS.read_text(encoding='utf-8'))
    except:s={}
    s['localities_ngmep']={'ok':True,'total':len(items),**meta,'source':SOURCE_PAGE};s['updated_at']=dt.datetime.now().isoformat(timespec='seconds');STATUS.write_text(json.dumps(s,ensure_ascii=False,indent=2),encoding='utf-8')
    subprocess.run([sys.executable,str(ROOT/'tools'/'generar_indice_localidades.py')],check=True)
    print('\n=============================================================')
    print('CATÁLOGO NACIONAL GENERADO CORRECTAMENTE')
    print('Total localidades indexadas:',len(items))
    print('Municipios:',meta.get('municipalities'))
    print('Entidades/núcleos:',meta.get('population_entities'))
    print('EATIM identificadas:',meta.get('eatims'))
    print('Modo de fuente:',meta.get('mode'))
    print('=============================================================\n')

if __name__=='__main__':
    try:main()
    except Exception as e:
        print('\nERROR actualizando localidades:',e)
        print('La web conserva el catálogo anterior y NO lo marcará como nacional.')
        print('Alternativa manual: descarga BD_MUNICIPIOS-ENTIDADES.ZIP desde:')
        print(SOURCE_PAGE)
        print('y guárdalo en:',CACHE_ZIP)
        sys.exit(1)
