#!/usr/bin/env python3
"""Radar BOE offline de Brújula Municipal.

Consulta la API oficial de legislación consolidada desde el PC del mantenedor.
Genera data/generated/normativa_boe.json con CAMBIOS CANDIDATOS pendientes de revisión.
No publica automáticamente obligaciones jurídicas.
Sin dependencias externas.
"""
from pathlib import Path
import argparse, datetime as dt, json, re, sys, time, unicodedata, urllib.request, urllib.parse
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'data'/'generated'/'normativa_boe.json'; RAW=ROOT/'data'/'generated'/'boe_raw'; STATUS=ROOT/'data'/'generated'/'status.json'
BASE='https://www.boe.es/datosabiertos/api/legislacion-consolidada'
UA='BrujulaMunicipal-static-updater/0.5 (+static site)'
TERMS=['entidad local','entidades locales','ayuntamiento','ayuntamientos','municipio','municipios','administracion local','administración local','diputacion','diputación','cabildo','consejo insular','mancomunidad','sector publico','sector público','administracion electronica','administración electrónica','seguridad','interoperabilidad','accesibilidad','proteccion de datos','protección de datos','contratacion','contratación','agua de consumo','residuos','transparencia','reutilizacion','reutilización']
TOPICS={'administracion':['administracion electronica','procedimiento administrativo','registro','notificacion','sede electronica'],'ciberseguridad':['seguridad','esquema nacional de seguridad','ciberseguridad'],'digitalizacion':['interoperabilidad','documento electronico','firma electronica','digital'],'privacidad':['proteccion de datos','datos personales'],'accesibilidad':['accesibilidad'],'contratacion':['contratacion','contratos del sector publico'],'agua':['agua de consumo','abastecimiento'],'medioambiente':['residuos','medio ambiente'],'transparencia':['transparencia','reutilizacion','informacion publica'],'ia':['inteligencia artificial']}
def norm(s=''):
 s=''.join(c for c in unicodedata.normalize('NFD',str(s)) if unicodedata.category(c)!='Mn');return s.casefold()
def fetch(url):
 req=urllib.request.Request(url,headers={'User-Agent':UA,'Accept':'application/json'});return json.loads(urllib.request.urlopen(req,timeout=75).read().decode('utf-8-sig'))
def deeptext(x):
 vals=[]
 def walk(v):
  if isinstance(v,dict):
   for z in v.values():walk(z)
  elif isinstance(v,list):
   for z in v:walk(z)
  elif isinstance(v,(str,int,float)):vals.append(str(v))
 walk(x);return ' '.join(vals)
def getid(x):
 t=deeptext(x);m=re.search(r'BOE-A-\d{4}-\d+',t);return m.group(0) if m else None
def gettitle(x):
 if isinstance(x,dict):
  for k,v in x.items():
   if norm(k) in ('titulo','titulo norma','nombre') and isinstance(v,str) and len(v)>8:return v
 for s in deeptext(x).split('  '):
  if len(s)>30:return s[:300]
 return 'Norma consolidada actualizada'
def category(txt):
 n=norm(txt)
 for c,ts in TOPICS.items():
  if any(norm(t) in n for t in ts):return c
 return 'otros'
def score(txt):
 n=norm(txt);return sum(3 for t in TERMS if norm(t) in n)+sum(1 for ts in TOPICS.values() for t in ts if norm(t) in n)
def status_update(d):
 try:s=json.loads(STATUS.read_text(encoding='utf-8'))
 except:s={}
 s['boe']=d;s['updated_at']=dt.datetime.now().isoformat(timespec='seconds');STATUS.parent.mkdir(parents=True,exist_ok=True);STATUS.write_text(json.dumps(s,ensure_ascii=False,indent=2),encoding='utf-8')
def main():
 ap=argparse.ArgumentParser();ap.add_argument('--days',type=int,default=60);ap.add_argument('--max-details',type=int,default=180);a=ap.parse_args();today=dt.date.today();start=today-dt.timedelta(days=a.days)
 url=BASE+'?'+urllib.parse.urlencode({'from':start.strftime('%Y%m%d'),'to':today.strftime('%Y%m%d'),'limit':-1})
 print(f'BOE · normas actualizadas {start} → {today}');data=fetch(url);rows=[]
 if isinstance(data,list):rows=data
 elif isinstance(data,dict):
  # locate first plausible list recursively
  stack=[data]
  while stack and not rows:
   x=stack.pop()
   for v in x.values() if isinstance(x,dict) else []:
    if isinstance(v,list) and v and isinstance(v[0],dict):rows=v;break
    if isinstance(v,dict):stack.append(v)
 scored=[]
 for r in rows:
  t=deeptext(r);s=score(t)
  if s>0:scored.append((s,r))
 scored.sort(key=lambda z:z[0],reverse=True);selected=scored[:a.max_details];RAW.mkdir(parents=True,exist_ok=True);items=[];errors=[]
 for i,(sc,r) in enumerate(selected,1):
  bid=getid(r)
  if not bid:continue
  try:
   meta=fetch(f'{BASE}/id/{bid}/metadatos');analysis={}
   try:analysis=fetch(f'{BASE}/id/{bid}/analisis')
   except:pass
   raw={'list':r,'metadatos':meta,'analisis':analysis};(RAW/f'{bid}.json').write_text(json.dumps(raw,ensure_ascii=False,indent=2),encoding='utf-8')
   txt=deeptext(raw);title=gettitle(meta) or gettitle(r);cat=category(txt)
   # date heuristics only for display, not legal effect
   dates=re.findall(r'20\d{2}[-/]?\d{2}[-/]?\d{2}',txt);upd=dates[0] if dates else None
   items.append({'id':'boe-radar-'+bid.lower(),'boe_id':bid,'title':title,'norm':title,'category':cat,'impact':'por_revisar','action':'revisar','summary':'Norma consolidada actualizada recientemente y detectada por posible relación con la administración local. Requiere revisión antes de convertir el cambio en una obligación práctica.','source':f'https://www.boe.es/buscar/act.php?id={bid}','certainty':'automatic-candidate','review_status':'pending','status':'pending_review','updated_at':upd,'detection_score':sc,'detection_reason':'Coincidencia con términos o materias de interés municipal en los metadatos/análisis recuperados.'})
  except Exception as e:errors.append({'boe_id':bid,'error':str(e)})
 payload={'generated_at':dt.datetime.now().isoformat(timespec='seconds'),'window_days':a.days,'source':'AEBOE API Legislación consolidada','source_url':BASE,'review_policy':'Candidatos automáticos. Una actualización de una norma no implica por sí sola una obligación nueva o modificada para entidades locales.','items':items,'errors':errors[:100]};OUT.parent.mkdir(parents=True,exist_ok=True);OUT.write_text(json.dumps(payload,ensure_ascii=False,separators=(',',':')),encoding='utf-8');status_update({'ok':True,'downloaded':len(rows),'candidates':len(items),'errors':len(errors),'window_days':a.days});print(f'OK · {len(items)} cambios BOE candidatos generados.')
if __name__=='__main__':
 try:main()
 except Exception as e:print('ERROR BOE:',e);status_update({'ok':False,'error':str(e)});sys.exit(1)
