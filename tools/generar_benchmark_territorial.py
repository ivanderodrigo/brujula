#!/usr/bin/env python3
from pathlib import Path
import datetime as dt, json, math, statistics
ROOT=Path(__file__).resolve().parents[1]

def load(p,default):
 try:return json.loads((ROOT/p).read_text(encoding='utf-8'))
 except:return default

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

def main():
 terr=load('data/generated/indicadores_territoriales.json',{'items':[]})['items']; income={x['ine_code']:x for x in load('data/generated/renta_ine.json',{'items':[]})['items'] if x.get('ine_code')}
 metrics=['population','population_change','density','mean_age','over65','broadband100','pharmacies','primary_schools','highway_minutes','hospital_minutes','income_per_person']
 rows=[]
 for x in terr:
  r=dict(x); r.update({k:v for k,v in income.get(x.get('ine_code'),{}).items() if k=='income_per_person'}); rows.append(r)
 groups={}
 for key in ['national','le500','501_1000','1001_5000','5001_20000','20001_50000','gt50000']:
  rr=rows if key=='national' else [r for r in rows if band(r.get('population'))==key]
  groups[key]={'n':len(rr),'median':{m:median([r.get(m) for r in rr]) for m in metrics}}
 # Similaridad explicable por cubos, no una distancia opaca.
 buckets={}
 for r in rows:
  pop=band(r.get('population')); den=r.get('density'); age=r.get('mean_age'); var=r.get('population_change')
  db='d0' if not isinstance(den,(int,float)) else 'd1' if den<8 else 'd2' if den<12.5 else 'd3' if den<50 else 'd4'
  ab='a0' if not isinstance(age,(int,float)) else 'a1' if age<42 else 'a2' if age<48 else 'a3' if age<52 else 'a4'
  vb='v0' if not isinstance(var,(int,float)) else 'v1' if var<-10 else 'v2' if var<-5 else 'v3' if var<5 else 'v4'
  buckets.setdefault('|'.join((pop,db,ab,vb)),[]).append({'ine_code':r.get('ine_code'),'name':r.get('name')})
 peers={}
 for key,arr in buckets.items():
  if len(arr)<2:continue
  for item in arr: peers[item['ine_code']]=[x for x in arr if x['ine_code']!=item['ine_code']][:12]
 out={'generated_at':dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds'),'groups':groups,'peers':peers,'method':'Comparables por tramo de población + densidad + edad media + evolución demográfica. No es un ranking ni una equivalencia jurídica.'}
 (ROOT/'data'/'generated'/'benchmark_territorial.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf-8')
 print('Benchmark:',len(rows),'municipios,',len(peers),'con comparables')
if __name__=='__main__':main()
