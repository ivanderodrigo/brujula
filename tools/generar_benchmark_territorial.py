#!/usr/bin/env python3
"""Genera benchmark territorial incluso con fuentes parcialmente degradadas.

v1.1.2 PRO
- Unión externa de catálogo municipal + MITECO + renta INE.
- Población del catálogo nacional como fallback oficial.
- Densidad derivada solo cuando existen población y superficie oficiales.
- Comparables por población aunque falten densidad/edad/evolución.
"""
from pathlib import Path
import datetime as dt, json, math, statistics
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'data'/'generated'/'benchmark_territorial.json'
STATUS=ROOT/'data'/'generated'/'status.json'

def load(p,default):
    try:return json.loads((ROOT/p).read_text(encoding='utf-8'))
    except Exception:return default

def band(pop):
    if pop is None:return 'unknown'
    if pop<=500:return 'le500'
    if pop<=1000:return '501_1000'
    if pop<=5000:return '1001_5000'
    if pop<=20000:return '5001_20000'
    if pop<=50000:return '20001_50000'
    return 'gt50000'

def median(vals):
    vals=[float(x) for x in vals if isinstance(x,(int,float)) and math.isfinite(float(x))]
    return statistics.median(vals) if vals else None

def municipalities():
    out={}
    d=ROOT/'data'/'localidades'/'provinces'
    for p in d.glob('*.json'):
        block=load(p.relative_to(ROOT),{'items':[]})
        for x in block.get('items',[]):
            if x.get('entity_type')!='municipality':continue
            code=x.get('ine_code') or (x.get('id') if str(x.get('id','')).isdigit() and len(str(x.get('id')))==5 else None)
            if not code:continue
            out[code]={
              'ine_code':code,'name':x.get('name'),'province':x.get('province'),'autonomous_region':x.get('autonomous_region'),
              'population':x.get('population'),'surface_ha':x.get('surface_ha'),
              'latitude':x.get('latitude'),'longitude':x.get('longitude')
            }
    return out

def main():
    base=municipalities()
    terr={x.get('ine_code'):x for x in load('data/generated/indicadores_territoriales.json',{'items':[]}).get('items',[]) if x.get('ine_code')}
    income={x.get('ine_code'):x for x in load('data/generated/renta_ine.json',{'items':[]}).get('items',[]) if x.get('ine_code')}
    codes=set(base)|set(terr)|set(income);rows=[]
    for code in sorted(codes):
        r={'ine_code':code};r.update(base.get(code,{}));r.update({k:v for k,v in terr.get(code,{}).items() if k not in ('_evidence',)})
        inc=income.get(code,{})
        for k in ('income_per_person','income_per_household','under18_pct','gini','reference'):
            if inc.get(k) is not None:r[k]=inc.get(k)
        # ADRH aporta también porcentaje de mayores de 65. Se usa solo como fallback si MITECO no lo ha aportado.
        if r.get('over65') is None and inc.get('over65') is not None:
            r['over65']=inc.get('over65');r.setdefault('_derived',{})['over65_source']='INE ADRH DATO8 (fallback oficial)'
        # Densidad derivada únicamente de dos campos oficiales; se marca explícitamente.
        if not isinstance(r.get('density'),(int,float)) and isinstance(r.get('population'),(int,float)) and isinstance(r.get('surface_ha'),(int,float)) and r['surface_ha']>0:
            r['density']=r['population']/(r['surface_ha']/100.0);r.setdefault('_derived',{})['density']='population / (surface_ha / 100)'
        rows.append(r)
    metrics=['population','population_change','density','mean_age','over65','under18_pct','broadband100','pharmacies','primary_schools','highway_minutes','hospital_minutes','income_per_person','income_per_household','gini']
    groups={}
    for key in ['national','le500','501_1000','1001_5000','5001_20000','20001_50000','gt50000']:
        rr=rows if key=='national' else [r for r in rows if band(r.get('population'))==key]
        groups[key]={'n':len(rr),'median':{m:median([r.get(m) for r in rr]) for m in metrics},'coverage':{m:sum(1 for r in rr if isinstance(r.get(m),(int,float))) for m in metrics}}
    # Comparables explicables. Si faltan dimensiones, nunca dejamos todo el benchmark a cero:
    # población es la dimensión mínima; densidad/edad/evolución refinan el grupo cuando existen.
    buckets={}
    for r in rows:
        pop=band(r.get('population'));den=r.get('density');age=r.get('mean_age');var=r.get('population_change')
        db='dx' if not isinstance(den,(int,float)) else 'd1' if den<8 else 'd2' if den<12.5 else 'd3' if den<50 else 'd4'
        ab='ax' if not isinstance(age,(int,float)) else 'a1' if age<42 else 'a2' if age<48 else 'a3' if age<52 else 'a4'
        vb='vx' if not isinstance(var,(int,float)) else 'v1' if var<-10 else 'v2' if var<-5 else 'v3' if var<5 else 'v4'
        key='|'.join((pop,db,ab,vb));buckets.setdefault(key,[]).append({'ine_code':r.get('ine_code'),'name':r.get('name'),'province':r.get('province')})
    peers={}
    for key,arr in buckets.items():
        if len(arr)<2:continue
        for item in arr:peers[item['ine_code']]=[x for x in arr if x['ine_code']!=item['ine_code']][:12]
    # Fallback: si un municipio quedó en un bucket demasiado específico/solitario, compara por tramo de población.
    pop_groups={}
    for r in rows:pop_groups.setdefault(band(r.get('population')),[]).append({'ine_code':r.get('ine_code'),'name':r.get('name'),'province':r.get('province')})
    for r in rows:
        code=r.get('ine_code')
        if code in peers:continue
        arr=pop_groups.get(band(r.get('population')),[])
        if len(arr)>1:peers[code]=[x for x in arr if x['ine_code']!=code][:12]
    out={
      'generated_at':dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds'),'groups':groups,'peers':peers,
      'records':len(rows),'peer_records':len(peers),
      'method':'Comparables por tramo de población; cuando existen, densidad, edad media y evolución demográfica refinan el grupo. La ausencia de una fuente no elimina el benchmark completo.',
      'degraded':not any(isinstance(r.get('mean_age'),(int,float)) for r in rows)
    }
    OUT.parent.mkdir(parents=True,exist_ok=True);OUT.write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf-8')
    st=load('data/generated/status.json',{});st['benchmark']={'ok':bool(rows),'records':len(rows),'peer_records':len(peers),'degraded':out['degraded']};STATUS.write_text(json.dumps(st,ensure_ascii=False,indent=2),encoding='utf-8')
    print('Benchmark:',len(rows),'municipios,',len(peers),'con comparables', '· parcial' if out['degraded'] else '· completo')
if __name__=='__main__':main()
