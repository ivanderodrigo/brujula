#!/usr/bin/env python3
"""Genera un índice estático fragmentado de localidades para búsqueda bajo demanda.

Entrada: data/catalog/municipios.json (catálogo maestro generado offline)
Salida:
  data/localidades/manifest.json
  data/localidades/featured.json
  data/localidades/id-map.json
  data/localidades/shards/<prefijo>.json
  data/localidades/provinces/<codigo>.json

El navegador nunca necesita descargar el catálogo maestro completo. Al buscar, carga solo
el shard de dos caracteres correspondiente; al abrir una ficha por ID, carga solo la provincia.
"""
from __future__ import annotations
from pathlib import Path
from collections import defaultdict, Counter
import datetime as dt
import json, re, shutil, unicodedata

ROOT = Path(__file__).resolve().parents[1]
MASTER = ROOT / 'data' / 'catalog' / 'municipios.json'
OUT = ROOT / 'data' / 'localidades'
SHARDS = OUT / 'shards'
PROVINCES = OUT / 'provinces'
STOP = {'el','la','los','las','de','del','da','do','das','dos','a','o','en','y','i','l'}

def norm(s=''):
    s=''.join(c for c in unicodedata.normalize('NFD',str(s)) if unicodedata.category(c)!='Mn')
    return re.sub(r'[^a-z0-9]+',' ',s.casefold()).strip()

def tokens(s=''):
    return [t for t in norm(s).split() if len(t)>=2 and t not in STOP]

def compact(x):
    keep = ('id','ine_code','ine_entity_code','name','entity_type','entity_subtype','parent_municipality_id','parent_municipality','applicant_entity_type','applicant_id','municipal_population','province_code','province','autonomous_region','population','population_year','population_official','latitude','longitude','altitude','special_profile','source','source_url')
    return {k:x.get(k) for k in keep if x.get(k) is not None}

def lite(x):
    keep=('id','name','entity_type','entity_subtype','parent_municipality','province_code','province','autonomous_region','population','population_year','population_official')
    y={k:x.get(k) for k in keep if x.get(k) is not None};y['_lite']=True;return y

def province_codes(items):
    by_name={}
    for x in items:
        if x.get('province_code') and x.get('province'):
            by_name[norm(x['province'])]=str(x['province_code']).zfill(2)
    return by_name

def main():
    if not MASTER.exists():
        raise SystemExit('No existe data/catalog/municipios.json. Ejecuta antes el actualizador de municipios.')
    data=json.loads(MASTER.read_text(encoding='utf-8'))
    items=data.get('items',data if isinstance(data,list) else [])
    if not items: raise SystemExit('El catálogo maestro está vacío.')
    pmap=province_codes(items)
    normalized=[]
    for raw in items:
        x=dict(raw)
        if not x.get('province_code') and x.get('province'):
            x['province_code']=pmap.get(norm(x['province']))
        normalized.append(compact(x))
    items=normalized

    if SHARDS.exists(): shutil.rmtree(SHARDS)
    if PROVINCES.exists(): shutil.rmtree(PROVINCES)
    SHARDS.mkdir(parents=True,exist_ok=True); PROVINCES.mkdir(parents=True,exist_ok=True)

    shard_ids=defaultdict(set); by_id={x['id']:x for x in items if x.get('id')}
    prov=defaultdict(list); idmap={}; type_counts=Counter()
    for x in items:
        xid=x.get('id');
        if not xid: continue
        type_counts[x.get('entity_type','unknown')]+=1
        pc=str(x.get('province_code') or 'xx').zfill(2) if str(x.get('province_code') or '').isdigit() else 'xx'
        prov[pc].append(x); idmap[xid]=pc
        # Index name first, plus parent/province aliases. Every entity may live in a few tiny shards.
        fields=[x.get('name',''),x.get('parent_municipality',''),x.get('province','')]
        keys=set()
        for f in fields:
            for t in tokens(f): keys.add(t[:2])
        # Fallback for unusual one-character/non-latin cases.
        if not keys:
            n=norm(x.get('name','')); keys.add((n[:2] or '__'))
        for k in keys: shard_ids[k].add(xid)

    shard_meta={}
    for key,ids in sorted(shard_ids.items()):
        arr=[lite(by_id[i]) for i in ids]
        arr.sort(key=lambda x:(norm(x.get('name','')),norm(x.get('province',''))))
        path=SHARDS/f'{key}.json'
        path.write_text(json.dumps({'key':key,'count':len(arr),'items':arr},ensure_ascii=False,separators=(',',':')),encoding='utf-8')
        shard_meta[key]=len(arr)
    for pc,arr in sorted(prov.items()):
        arr.sort(key=lambda x:(norm(x.get('name','')),norm(x.get('parent_municipality',''))))
        (PROVINCES/f'{pc}.json').write_text(json.dumps({'province_code':pc,'count':len(arr),'items':arr},ensure_ascii=False,separators=(',',':')),encoding='utf-8')

    featured=[]; seen=set()
    for x in sorted(items,key=lambda z:(not z.get('special_profile',False),norm(z.get('name','')))):
        if x['id'] in seen: continue
        if x.get('special_profile') or len(featured)<14:
            featured.append(lite(x));seen.add(x['id'])
        if len(featured)>=18: break
    (OUT/'featured.json').write_text(json.dumps({'items':featured},ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    (OUT/'id-map.json').write_text(json.dumps(idmap,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    manifest={
      'version':1,'generated_at':dt.datetime.now().isoformat(timespec='seconds'),
      'total_entities':len(items),'entity_types':dict(type_counts),'min_query_chars':2,
      'shard_prefix_length':2,'shards':shard_meta,'provinces':{k:len(v) for k,v in sorted(prov.items())},
      'source_note':'Índice estático generado offline. El navegador descarga solo fragmentos conforme se buscan localidades.'
    }
    (OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    print(f"OK · índice dinámico: {len(items)} entidades, {len(shard_meta)} shards, {len(prov)} bloques provinciales.")

if __name__=='__main__': main()
