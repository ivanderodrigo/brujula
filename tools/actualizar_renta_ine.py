#!/usr/bin/env python3
"""Actualiza renta municipal desde la tabla oficial INE 31241 (ADRH).

v1.1.1 PRO
- Prueba ambos CSV oficiales (separado por ; y por tabuladores).
- Detecta columnas por nombre en vez de depender de una estructura rígida.
- Excluye distritos/secciones censales.
- Conserva para cada municipio el dato MÁS RECIENTE disponible, evitando que una
  publicación parcial del último año deje fuera miles de municipios.
- Si la cobertura sigue siendo insuficiente, no sobrescribe la copia anterior.
"""
from pathlib import Path
import csv, datetime as dt, io, json, re, sys, unicodedata, urllib.request

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'data'/'generated'/'renta_ine.json'
URLS=[
 'https://www.ine.es/jaxiT3/files/t/csv_bdsc/31241.csv',
 'https://www.ine.es/jaxiT3/files/t/csv_bd/31241.csv',
]
TABLE_URL='https://www.ine.es/jaxiT3/Tabla.htm?t=31241'
UA='Mozilla/5.0 (compatible; BrujulaMunicipal/1.1.1; +https://brujulamunicipal.eu.org/)'
MIN_COVERAGE=5000

def norm(s):
    return ''.join(c for c in unicodedata.normalize('NFD',str(s)) if unicodedata.category(c)!='Mn').casefold()

def number(s):
    s=str(s).strip().replace('\xa0','').replace(' ','')
    if not s or s in ('..','...','-','—','nan','NaN'):return None
    # INE español: punto miles y coma decimal.
    if ',' in s:s=s.replace('.','').replace(',','.')
    else:
        # Si hay un único punto y tres dígitos detrás suele ser separador de miles.
        if re.fullmatch(r'-?\d{1,3}(?:\.\d{3})+',s):s=s.replace('.','')
    try:return float(s)
    except Exception:return None

def fetch(url):
    req=urllib.request.Request(url,headers={'User-Agent':UA,'Accept':'text/csv,*/*;q=0.8'})
    with urllib.request.urlopen(req,timeout=120) as r:return r.read()

def decode(raw):
    for enc in ('utf-8-sig','utf-8','latin1'):
        try:return raw.decode(enc)
        except UnicodeDecodeError:pass
    return raw.decode('utf-8','replace')

def parse_csv(text):
    sample=text[:20000]
    try:dialect=csv.Sniffer().sniff(sample,delimiters=';\t,')
    except Exception:
        dialect=csv.excel;dialect.delimiter=';'
    return list(csv.DictReader(io.StringIO(text),dialect=dialect))

def find_header(headers,*tokens):
    for h in headers:
        nh=norm(h)
        if all(t in nh for t in tokens):return h
    return None

def extract_code(label,row):
    # El nivel municipal del ADRH suele comenzar por código INE de 5 dígitos.
    s=str(label or '').strip()
    if re.search(r'\b(distrito|seccion|sección)\b',norm(s)):return None
    m=re.match(r'^\s*(\d{5})(?:\D|$)',s)
    if m:return m.group(1)
    # Fallback: buscar una columna explícita de código municipal.
    for k,v in row.items():
        nk=norm(k);sv=str(v or '').strip()
        if any(t in nk for t in ('codigo municipio','cod municipio','codmun','ine')):
            m=re.search(r'(?<!\d)(\d{5})(?!\d)',sv)
            if m:return m.group(1)
    return None

def clean_name(label,code):
    s=str(label or '').strip()
    s=re.sub(r'^\s*'+re.escape(code)+r'\s*','',s).strip(' -·')
    return s or code

def iter_candidates(rows,url):
    if not rows:return []
    headers=list(rows[0].keys())
    geo=(find_header(headers,'unidad','territorial') or find_header(headers,'municip') or headers[0])
    ind=(find_header(headers,'indicador') or find_header(headers,'renta','media'))
    period=(find_header(headers,'period') or find_header(headers,'ano') or find_header(headers,'año'))
    value=(find_header(headers,'total') or find_header(headers,'valor'))
    if not value:
        # El valor suele ser la última columna en los CSV de JaxiT3.
        value=headers[-1]
    out=[]
    for r in rows:
        indicator=norm(r.get(ind,'')) if ind else ''
        if ind and not any(x in indicator for x in ('renta neta media por persona','renta neta media por habitante')):continue
        label=r.get(geo,'')
        code=extract_code(label,r)
        if not code:continue
        v=number(r.get(value,''))
        if v is None:continue
        ptxt=str(r.get(period,'') if period else '')
        m=re.search(r'(20\d{2})',ptxt)
        year=int(m.group(1)) if m else 0
        out.append({'ine_code':code,'year':year,'value':v,'name':clean_name(label,code),'url':url})
    return out

def load_old():
    try:return json.loads(OUT.read_text(encoding='utf-8'))
    except Exception:return {'items':[]}

def main():
    all_candidates=[];attempts=[]
    for url in URLS:
        try:
            raw=fetch(url);rows=parse_csv(decode(raw));c=iter_candidates(rows,url)
            attempts.append({'url':url,'rows':len(rows),'municipal_values':len(c)})
            print(f'INE {url.rsplit("/",1)[-2]}: {len(rows)} filas · {len(c)} valores municipales útiles')
            all_candidates.extend(c)
            # Si un formato ya ofrece cobertura suficiente no hace falta duplicar millones de filas.
            if len({x['ine_code'] for x in c})>=MIN_COVERAGE:break
        except Exception as e:
            attempts.append({'url':url,'error':str(e)})
            print(f'AVISO renta INE · {url}: {e}',file=sys.stderr)
    if not all_candidates:
        print('AVISO renta INE: ninguna distribución oficial produjo datos municipales')
        return 1

    by_year={}
    for x in all_candidates:
        by_year.setdefault(x['year'],set()).add(x['ine_code'])
    if by_year:
        print('Cobertura por año:', ', '.join(f'{y}: {len(c)}' for y,c in sorted(by_year.items()) if y))

    # Clave de robustez: el dato más reciente disponible PARA CADA MUNICIPIO.
    latest_by_code={}
    for x in all_candidates:
        prev=latest_by_code.get(x['ine_code'])
        if prev is None or x['year']>prev['year']:
            latest_by_code[x['ine_code']]=x
    items=[]
    for code,x in sorted(latest_by_code.items()):
        items.append({
            'ine_code':code,'income_per_person':x['value'],'reference':str(x['year']) if x['year'] else None,'name':x['name'],
            '_evidence':{'source':'INE · Atlas de Distribución de Renta de los Hogares','table':'31241','url':x['url']}
        })
    if len(items)<MIN_COVERAGE:
        old=load_old();old_items=old.get('items',[]) if isinstance(old,dict) else []
        if len(old_items)>=MIN_COVERAGE:
            print(f'AVISO renta INE: solo {len(items)} municipios nuevos; se conserva snapshot anterior de {len(old_items)}')
            return 1
        raise RuntimeError(f'Solo {len(items)} municipios con renta tras combinar años y formatos; no se acepta como cobertura nacional')

    refs=sorted({x.get('reference') for x in items if x.get('reference')})
    global_latest=max((int(r) for r in refs),default=0)
    count_latest=sum(1 for x in items if x.get('reference')==str(global_latest))
    payload={
        'generated_at':dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds'),
        'source_status':'ok','reference_latest':str(global_latest) if global_latest else None,
        'latest_year_coverage':count_latest,'mixed_references':len(refs)>1,
        'references':refs,'items':items,'attempts':attempts,
        'note':'Se conserva para cada municipio el dato oficial más reciente disponible en la tabla 31241; la referencia anual se muestra por registro.'
    }
    OUT.parent.mkdir(parents=True,exist_ok=True)
    OUT.write_text(json.dumps(payload,ensure_ascii=False,indent=2),encoding='utf-8')
    print(f'OK renta INE: {len(items)} municipios · último año {global_latest}: {count_latest} · referencias {refs[0] if refs else "—"}–{refs[-1] if refs else "—"}')
    return 0

if __name__=='__main__':
    try:raise SystemExit(main())
    except Exception as e:
        print('AVISO renta INE:',e,file=sys.stderr);raise SystemExit(1)
