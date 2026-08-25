#!/usr/bin/env python3
"""Añade EATIM de Castilla-La Mancha al catálogo local a partir del portal oficial de datos abiertos.

El script descubre el recurso CSV desde la página del dataset para no depender de una URL de fichero fija.
No elimina municipios INE. Si falla, conserva el catálogo actual.
"""
from pathlib import Path
from html.parser import HTMLParser
import csv, io, json, re, sys, unicodedata, urllib.request, urllib.parse, datetime as dt
ROOT=Path(__file__).resolve().parents[1];CAT=ROOT/'data'/'catalog'/'municipios.json';STATUS=ROOT/'data'/'generated'/'status.json'
DATASET='https://datosabiertos.castillalamancha.es/dataset/relaci%C3%B3n-de-entidades-de-%C3%A1mbito-territorial-inferior-al-municipio-eatim-constituidas-en-el'
UA='BrujulaMunicipal-static-updater/0.5 (+static site)'
def norm(s=''):
 s=''.join(c for c in unicodedata.normalize('NFD',str(s)) if unicodedata.category(c)!='Mn');return re.sub(r'[^a-z0-9]+',' ',s.casefold()).strip()
def fetch(url):
 req=urllib.request.Request(url,headers={'User-Agent':UA,'Accept':'*/*'});return urllib.request.urlopen(req,timeout=75).read()
class P(HTMLParser):
 def __init__(self):super().__init__();self.a=None;self.links=[]
 def handle_starttag(self,t,a):
  if t=='a':self.a=[dict(a).get('href',''),'']
 def handle_data(self,d):
  if self.a:self.a[1]+=d
 def handle_endtag(self,t):
  if t=='a' and self.a:self.links.append(tuple(self.a));self.a=None
def discover():
 html=fetch(DATASET).decode('utf-8',errors='replace');p=P();p.feed(html);cand=[]
 for h,t in p.links:
  nh,nt=norm(h),norm(t)
  if h and ('csv' in nh or ('eatim' in nt and 'csv' in nt)):cand.append(urllib.parse.urljoin(DATASET,h))
 if not cand:raise RuntimeError('No se encontró el recurso CSV EATIM en la página oficial.')
 return cand[0]
def decode(b):
 for e in ('utf-8-sig','utf-8','cp1252','latin-1'):
  try:return b.decode(e)
  except:pass
 return b.decode('latin-1',errors='replace')
def pick(row,*terms):
 for k,v in row.items():
  nk=norm(k)
  if any(norm(t) in nk for t in terms) and str(v).strip():return str(v).strip()
 return None
def main():
 if not CAT.exists():raise RuntimeError('Ejecuta antes ACTUALIZAR_MUNICIPIOS.bat')
 url=discover();raw=decode(fetch(url));dial=csv.Sniffer().sniff(raw[:10000],delimiters=';,\t,');rows=list(csv.DictReader(io.StringIO(raw),dialect=dial));data=json.loads(CAT.read_text(encoding='utf-8'));items=[x for x in data['items'] if not (x.get('entity_type')=='eatim' and x.get('autonomous_region')=='Castilla-La Mancha')];added=[]
 for i,r in enumerate(rows,1):
  name=pick(r,'denominacion','denominación','eatim','entidad');parent=pick(r,'municipio');province=pick(r,'provincia') or 'Por determinar'
  if not name or norm(name) in ('denominacion','eatim'):continue
  eid='eatim-clm-'+slug(name)+'-'+str(i)
  added.append({'id':eid,'name':name,'entity_type':'eatim','parent_municipality':parent,'province':province,'autonomous_region':'Castilla-La Mancha','population':None,'population_year':None,'population_official':False,'special_profile':norm(name)=='el hoyo','source':'Datos Abiertos Castilla-La Mancha · relación EATIM','source_url':url})
 # Preserve richer hand-curated El Hoyo profile if official import does not carry population.
 old_el=next((x for x in data['items'] if x.get('id')=='el-hoyo'),None)
 if old_el and not any(norm(x['name'])=='el hoyo' for x in added):added.insert(0,old_el)
 items.extend(added);data['items']=items;data['eatim_clm_source']=url;CAT.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
 try:s=json.loads(STATUS.read_text(encoding='utf-8'))
 except:s={}
 s['eatim_clm']={'ok':True,'count':len(added),'source':url};s['updated_at']=dt.datetime.now().isoformat(timespec='seconds');STATUS.write_text(json.dumps(s,ensure_ascii=False,indent=2),encoding='utf-8');print(f'OK · {len(added)} EATIM CLM añadidas.')
def slug(s):return re.sub(r'[^a-z0-9]+','-',norm(s)).strip('-')
if __name__=='__main__':
 try:main()
 except Exception as e:print('AVISO EATIM CLM:',e);sys.exit(1)
