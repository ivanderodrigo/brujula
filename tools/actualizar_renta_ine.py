#!/usr/bin/env python3
"""Actualiza renta municipal desde la tabla 31241 del INE (ADRH)."""
from pathlib import Path
import csv, datetime as dt, io, json, re, urllib.request
ROOT=Path(__file__).resolve().parents[1]; OUT=ROOT/'data'/'generated'/'renta_ine.json'
URL='https://www.ine.es/jaxiT3/files/t/csv_bdsc/31241.csv'

def norm(s):
 import unicodedata
 return ''.join(c for c in unicodedata.normalize('NFD',str(s)) if unicodedata.category(c)!='Mn').lower()
def number(s):
 s=str(s).strip().replace('.','').replace(',','.')
 try:return float(s)
 except:return None

def main():
 req=urllib.request.Request(URL,headers={'User-Agent':'BrujulaMunicipal/0.7'})
 try:
  raw=urllib.request.urlopen(req,timeout=90).read()
  text=raw.decode('utf-8-sig',errors='replace')
  dialect=csv.Sniffer().sniff(text[:10000],delimiters=';,\t'); rows=list(csv.DictReader(io.StringIO(text),dialect=dialect))
  if not rows: raise RuntimeError('CSV vacío')
  headers=list(rows[0]); hnorm={h:norm(h) for h in headers}
  mun=next((h for h in headers if 'municip' in hnorm[h]),headers[0]); ind=next((h for h in headers if 'indic' in hnorm[h]),None); period=next((h for h in headers if 'period' in hnorm[h] or 'ano' in hnorm[h]),None); val=next((h for h in headers if hnorm[h] in ('total','valor') or 'total' in hnorm[h]),headers[-1])
  candidates=[]
  for r in rows:
   if ind and not ('renta neta media por persona' in norm(r.get(ind,''))): continue
   code=re.search(r'(?<!\d)(\d{5})(?!\d)',r.get(mun,'') or '')
   if not code: continue
   v=number(r.get(val,''));
   if v is None: continue
   yr=int(re.search(r'(20\d{2})',r.get(period,'') or '0').group(1)) if period and re.search(r'(20\d{2})',r.get(period,'') or '') else 0
   candidates.append((code.group(1),yr,v,r.get(mun,'')))
  latest=max((x[1] for x in candidates),default=0); items=[]
  for code,yr,v,name in candidates:
   if yr==latest: items.append({'ine_code':code,'income_per_person':v,'reference':str(yr),'name':name,'_evidence':{'source':'INE · ADRH','table':'31241','url':URL}})
  if len(items)<5000: raise RuntimeError(f'Solo {len(items)} municipios con renta; se conserva la copia anterior')
  OUT.write_text(json.dumps({'generated_at':dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds'),'source_status':'ok','reference':str(latest),'items':items},ensure_ascii=False,indent=2),encoding='utf-8')
  print(f'OK renta INE {latest}: {len(items)} municipios'); return 0
 except Exception as e:
  print('AVISO renta INE:',e)
  return 1
if __name__=='__main__': raise SystemExit(main())
