#!/usr/bin/env python3
"""Radar municipal BDNS/SNPSAP para Brújula Municipal.

v1.4: prioriza campos estructurados oficiales (beneficiarios, regiones, fechas,
bases, presupuesto e instrumentos) y usa texto/anuncios solo como evidencia
complementaria. Nunca convierte un candidato automático en elegibilidad.
"""
from __future__ import annotations
from pathlib import Path
from urllib.parse import urlencode
from html import unescape
import argparse, datetime as dt, json, re, sys, time, unicodedata, urllib.request

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'data'/'generated'/'oportunidades_bdns.json'
RAW_DIR=ROOT/'tools'/'cache'/'raw_bdns'
STATUS=ROOT/'data'/'generated'/'status.json'
BASE='https://www.infosubvenciones.es/bdnstrans/api'
VPD='GE'
UA='BrujulaMunicipal-static-updater/1.4 (+https://brujulamunicipal.eu.org/)'

MUNICIPAL_TERMS=['municipio','municipios','ayuntamiento','ayuntamientos','corporacion local','corporaciones locales','entidad local','entidades locales','eell','diputacion','diputación','cabildo','consejo insular','mancomunidad','entidad de ambito territorial inferior','entidad de ámbito territorial inferior','eatim','pedania','pedanía']
TOPICS={
 'agua':['agua','abastecimiento','saneamiento','depuracion','depuración','fugas','ciclo urbano','telelectura'],
 'energia':['energia','energía','eficiencia energetica','eficiencia energética','alumbrado','autoconsumo','fotovolta'],
 'digitalizacion':['digitalizacion','digitalización','administracion electronica','administración electrónica','datos abiertos','smart','territorios inteligentes','ciudades inteligentes'],
 'ciberseguridad':['ciberseguridad','seguridad digital','ens','esquema nacional de seguridad'],
 'conectividad':['conectividad','banda ancha','wifi','wi-fi','fibra','5g','telecomunic'],
 'turismo':['turismo','destino turistico','destino turístico','rutas'],
 'patrimonio':['patrimonio','cultural','museo','archivo historico','archivo histórico'],
 'vivienda':['vivienda','rehabilitacion','rehabilitación','alquiler'],
 'movilidad':['movilidad','transporte','vehiculo electrico','vehículo eléctrico'],
 'despoblacion':['reto demografico','reto demográfico','despoblacion','despoblación','rural','pequeños municipios'],
 'servicios':['servicios sociales','mayores','dependencia','juventud','infancia','conciliacion','conciliación'],
 'empleo':['empleo','emprendimiento','comercio local','autonomos','autónomos'],
 'medioambiente':['residuos','medio ambiente','biodiversidad','renaturalizacion','renaturalización','incendios'],
}

def norm(s=''):
    s=unicodedata.normalize('NFD',str(s)); return ''.join(c for c in s if unicodedata.category(c)!='Mn').casefold()

def clean_text(s=''):
    s=unescape(str(s or ''));s=re.sub(r'<[^>]+>',' ',s);return re.sub(r'\s+',' ',s).strip()

def fetch_json(url,timeout=75,retries=2):
    for attempt in range(retries+1):
        try:
            req=urllib.request.Request(url,headers={'User-Agent':UA,'Accept':'application/json'})
            with urllib.request.urlopen(req,timeout=timeout) as r:return json.loads(r.read().decode('utf-8-sig'))
        except Exception:
            if attempt>=retries:raise
            time.sleep(1.5*(attempt+1))

def get_any(d,*keys):
    if not isinstance(d,dict):return None
    lower={str(k).casefold():v for k,v in d.items()}
    for k in keys:
        v=lower.get(k.casefold())
        if v not in (None,''):return v
    return None

def deep_text(obj,key_hint=None):
    vals=[]
    def walk(x,k=''):
        if isinstance(x,dict):
            for kk,v in x.items():walk(v,str(kk))
        elif isinstance(x,list):
            for v in x:walk(v,k)
        elif isinstance(x,(str,int,float,bool)) and (key_hint is None or key_hint in norm(k)):vals.append(str(x))
    walk(obj);return ' '.join(vals)

def code_of(x):
    c=get_any(x,'codigoBDNS','numeroConvocatoria','numConv','convocatoria','codigo')
    if isinstance(c,dict):c=get_any(c,'codigoBDNS','numero','codigo')
    if c is None:return None
    m=re.search(r'\d{5,9}',str(c));return m.group(0) if m else str(c).strip()

def title_of(x):return clean_text(get_any(x,'titulo','descripcion','title','nombre') or 'Convocatoria BDNS')
def topics_for(text):
    n=norm(text);return [topic for topic,terms in TOPICS.items() if any(norm(t) in n for t in terms)]

def candidate_score(x):
    text=norm(deep_text(x));score=sum(5 for t in MUNICIPAL_TERMS if norm(t) in text)
    score+=sum(1 for terms in TOPICS.values() if any(norm(t) in text for t in terms))
    if any(t in text for t in ('nominativa','nominativo','premio individual')):score-=5
    return score

def parse_date_value(v):
    if not v:return None
    s=str(v).strip().replace('Z','')
    for fmt in ('%Y-%m-%d','%d/%m/%Y','%Y-%m-%dT%H:%M:%S','%d-%m-%Y','%Y-%m-%d %H:%M:%S'):
        try:return dt.datetime.strptime(s[:19],fmt).date().isoformat()
        except ValueError:pass
    m=re.search(r'((?:19|20)\d{2})[-/](\d{1,2})[-/](\d{1,2})',s)
    if m:return f'{int(m.group(1)):04d}-{int(m.group(2)):02d}-{int(m.group(3)):02d}'
    m=re.search(r'(\d{1,2})[-/](\d{1,2})[-/]((?:19|20)\d{2})',s)
    if m:return f'{int(m.group(3)):04d}-{int(m.group(2)):02d}-{int(m.group(1)):02d}'
    return None

def list_descriptions(v):
    out=[]
    for x in v or []:
        if isinstance(x,dict):s=get_any(x,'descripcion','description','nombre','titulo','codigo')
        else:s=x
        if s not in (None,''):out.append(clean_text(s))
    return out

def announcements_text(detail):
    parts=[]
    for a in get_any(detail,'anuncios') or []:
        if isinstance(a,dict):parts.extend([clean_text(get_any(a,'titulo') or ''),clean_text(get_any(a,'texto') or '')])
    return ' '.join(x for x in parts if x)

def beneficiary_descriptions(detail):return list_descriptions(get_any(detail,'tiposBeneficiarios','tiposbeneficiarios') or [])

def infer_beneficiary_targets(detail):
    desc=' '.join(beneficiary_descriptions(detail));ann=announcements_text(detail)
    # No inferir beneficiario desde título/finalidad: una ayuda 'para municipios' puede tener como solicitante una empresa, asociación u otra entidad.
    text=norm(' '.join([desc,ann]))
    out=[]
    def hit(*terms):return any(norm(t) in text for t in terms)
    if hit('entidad de ambito territorial inferior','entidad de ámbito territorial inferior','eatim','entidades locales menores','pedanias','pedanías'):out.append('eatim')
    if hit('ayuntamiento','ayuntamientos','municipio','municipios','corporaciones locales'):out.append('municipality')
    if hit('entidad local','entidades locales','eell'):out.append('local_entity')
    if hit('mancomunidad','mancomunidades'):out.append('mancomunidad')
    if hit('diputacion','diputación','cabildo','consejo insular'):out.append('province')
    # Tipologías genéricas BDNS no prueban por sí solas que sea una EELL.
    dn=norm(desc)
    if 'gran empresa' in dn:out.append('company')
    if 'pyme' in dn:out.append('company')
    if 'personas fisicas' in dn:out.append('individual')
    if 'personas juridicas que no desarrollan actividad economica' in dn:out.append('legal_non_economic')
    if hit('asociacion','asociación','fundacion','fundación','ong','entidades sin animo de lucro','entidades sin ánimo de lucro'):out.append('nonprofit')
    return sorted(set(out))

def infer_org(search,detail):
    o=get_any(detail,'organo')
    if isinstance(o,dict):
        vals=[get_any(o,'nivel1'),get_any(o,'nivel2'),get_any(o,'nivel3')];vals=[clean_text(v) for v in vals if v]
        if vals:return ' · '.join(vals)
    if isinstance(o,str) and o.strip():return clean_text(o)
    for obj in (search,detail):
        vals=[get_any(obj,'administracion','administración'),get_any(obj,'departamento'),get_any(obj,'organo','órgano')];vals=[clean_text(v) for v in vals if isinstance(v,(str,int)) and v]
        if vals:return ' · '.join(vals)
    return 'Organismo convocante · consultar BDNS'

def _int_people(raw):
    digits=re.sub(r'[^0-9]','',str(raw or ''))
    try:return int(digits)
    except:return None

def infer_population_rules(detail):
    # Anuncios y finalidad son mejor evidencia que buscar números en todo el JSON.
    txt=' '.join([announcements_text(detail),clean_text(get_any(detail,'descripcionFinalidad') or ''),clean_text(get_any(detail,'descripcionBasesReguladoras') or '')]);n=norm(txt)
    def subject_at(pos):
        c=n[max(0,pos-120):pos+50]
        if any(t in c for t in ('eatim','entidad de ambito territorial inferior','entidades locales menores','pedanias')):return 'eatim'
        if 'entidades locales' in c or 'entidad local' in c:return 'local_entity'
        if 'municipios' in c or 'municipio' in c:return 'municipality'
        return 'unknown'
    hits=[]
    patterns=[
      ('max',r'(?:menos de|inferior(?:es)? a|hasta|no superior(?:es)? a|igual o inferior(?:es)? a|maximo de|maxima de)\s*([0-9][0-9\.\s]{1,10})\s*habitantes'),
      ('max',r'(?:municipios?|entidades locales)[^\.]{0,60}(?:hasta|menos de|inferior(?:es)? a)\s*([0-9][0-9\.\s]{1,10})\s*habitantes'),
      ('min',r'(?:mas de|superior(?:es)? a|al menos|igual o superior(?:es)? a|minimo de|minima de)\s*([0-9][0-9\.\s]{1,10})\s*habitantes')]
    for kind,pat in patterns:
        for m in re.finditer(pat,n):
            v=_int_people(m.group(1))
            if v and 50<=v<=10000000:hits.append((kind,v,subject_at(m.start())))
    if not hits:return []
    maxima=[x for x in hits if x[0]=='max'];minima=[x for x in hits if x[0]=='min'];rule={}
    if maxima:rule['max']=min(x[1] for x in maxima)
    if minima:rule['min']=max(x[1] for x in minima)
    subjects={x[2] for x in hits if x[2]!='unknown'};rule['basis']=subjects.pop() if len(subjects)==1 else 'unknown'
    rule['note']='Umbral detectado automáticamente en texto oficial asociado a habitantes; comprobar bases.'
    return [rule]

def clean_region(s):
    s=clean_text(s);s=re.sub(r'^[A-Z]{2,5}\d*\s*-\s*','',s).strip()
    if norm(s) in ('espana','es'):return 'España'
    return s

def territories_of(detail):return [x for x in (clean_region(s) for s in list_descriptions(get_any(detail,'regiones') or [])) if x]

def explicit_dates(detail):
    return parse_date_value(get_any(detail,'fechaInicioSolicitud')),parse_date_value(get_any(detail,'fechaFinSolicitud'))

def application_status(start,end,open_ended=False,today=None):
    today=today or dt.date.today();sd=dt.date.fromisoformat(start) if start else None;ed=dt.date.fromisoformat(end) if end else None
    if ed and ed<today:return 'closed_detected','Plazo detectado como finalizado · revisar ficha'
    if sd and sd>today:return 'future_detected','Inicio de solicitud futuro detectado · revisar bases'
    if (sd and sd<=today and (not ed or ed>=today)) or (ed and ed>=today) or open_ended:return 'open_detected','Plazo aparentemente abierto · revisar bases'
    return 'unknown','Detectada en BDNS · requiere revisión'

def extraction_confidence(benef_targets,territories,deadline,bases_url,announcement):
    n=sum(bool(x) for x in (benef_targets,territories,deadline,bases_url,announcement))
    return 'high' if n>=4 else 'medium' if n>=2 else 'low'

def normalize_item(search,detail,today=None):
    today=today or dt.date.today();code=code_of(detail) or code_of(search);title=title_of(detail) if title_of(detail)!='Convocatoria BDNS' else title_of(search)
    ann=announcements_text(detail);purpose=clean_text(get_any(detail,'descripcionFinalidad') or '');bases_title=clean_text(get_any(detail,'descripcionBasesReguladoras') or '')
    fulltext=' '.join([title,ann,purpose,bases_title,deep_text(search)])
    topics=topics_for(fulltext);benef_desc=beneficiary_descriptions(detail);targets=infer_beneficiary_targets(detail);territories=territories_of(detail);start,end=explicit_dates(detail)
    open_raw=get_any(detail,'abierto');open_ended=open_raw is True or norm(open_raw) in ('si','s','true','1')
    application_state,status_label=application_status(start,end,open_ended,today);bases_url=clean_text(get_any(detail,'urlBasesReguladoras') or '') or None
    source=f'https://www.infosubvenciones.es/bdnstrans/GE/es/convocatorias/{code}'
    scope='España' if any(norm(x)=='espana' for x in territories) else (territories[0] if len(territories)==1 else (' · '.join(territories[:3]) if territories else 'Por determinar'))
    budget=get_any(detail,'presupuestoTotal');
    try:budget=float(str(budget).replace(',','.')) if budget not in (None,'') else None
    except:budget=None
    instruments=list_descriptions(get_any(detail,'instrumentos') or []);funds=list_descriptions(get_any(detail,'fondos') or []);objectives=list_descriptions(get_any(detail,'objetivos') or [])
    confidence=extraction_confidence(targets,territories,end,bases_url,ann)
    summary=purpose or (ann[:700] if ann else 'Convocatoria detectada automáticamente en la BDNS por posible relevancia municipal.')
    return {
      'id':f'bdns-{code}','bdns':code,'title':title,'type':'bdns_candidate','status':'pending_review','status_label':status_label,'review_status':'pending','application_status':application_state,
      'organization':infer_org(search,detail),'scope':scope,'territories':territories,'topics':topics or ['otros'],
      'beneficiary_types':targets,'beneficiary_targets':targets,'beneficiary_descriptions':benef_desc,'population_rules':infer_population_rules(detail),
      'budget_total':budget,'project_min':None,'project_max':None,'application_start':start,'deadline':end,'open_ended':open_ended,
      'instruments':instruments,'funds':funds,'objectives':objectives,'purpose':purpose or None,'bases_title':bases_title or None,'bases_url':bases_url,
      'electronic_office':clean_text(get_any(detail,'sedeElectronica') or '') or None,
      'summary':summary,'source':source,'verified':None,'extraction_confidence':confidence,
      'warning':'Extracción automática de campos oficiales BDNS. La aplicabilidad y elegibilidad deben confirmarse en las bases y convocatoria oficial.',
      'automatic_detection':True,'announcement_excerpt':ann[:3000] or None
    }

def update_status(**kwargs):
    STATUS.parent.mkdir(parents=True,exist_ok=True)
    try:st=json.loads(STATUS.read_text(encoding='utf-8'))
    except Exception:st={}
    st.update(kwargs);st['updated_at']=dt.datetime.now().isoformat(timespec='seconds');STATUS.write_text(json.dumps(st,ensure_ascii=False,indent=2),encoding='utf-8')

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--days',type=int,default=120);ap.add_argument('--page-size',type=int,default=1000);ap.add_argument('--max-pages',type=int,default=30);ap.add_argument('--max-details',type=int,default=300);args=ap.parse_args()
    today=dt.date.today();start=today-dt.timedelta(days=args.days);all_rows=[]
    print(f'Descargando convocatorias BDNS registradas entre {start:%d/%m/%Y} y {today:%d/%m/%Y}…')
    for page in range(args.max_pages):
        q=urlencode({'fechaDesde':start.strftime('%d/%m/%Y'),'fechaHasta':today.strftime('%d/%m/%Y'),'pageSize':args.page_size,'page':page,'vpd':VPD});data=fetch_json(f'{BASE}/convocatorias/busqueda?{q}')
        rows=data.get('content',[]) if isinstance(data,dict) else (data if isinstance(data,list) else [])
        if not rows:break
        all_rows.extend(rows);print(f'  página {page+1}: {len(rows)} registros')
        if len(rows)<args.page_size:break
    scored=[(candidate_score(x),x) for x in all_rows];scored=[z for z in scored if z[0]>0];scored.sort(key=lambda z:z[0],reverse=True);selected=scored[:args.max_details]
    print(f'{len(all_rows)} registros revisados · {len(scored)} candidatos textuales · {len(selected)} fichas de detalle a consultar.')
    OUT.parent.mkdir(parents=True,exist_ok=True);RAW_DIR.mkdir(parents=True,exist_ok=True);items=[];errors=[]
    for i,(score,row) in enumerate(selected,1):
        code=code_of(row)
        if not code:continue
        try:
            detail=fetch_json(f"{BASE}/convocatorias?{urlencode({'numConv':code,'vpd':VPD})}");(RAW_DIR/f'{code}.json').write_text(json.dumps(detail,ensure_ascii=False,indent=2),encoding='utf-8')
            x=normalize_item(row,detail,today=today);x['detection_score']=score;items.append(x)
            if i%25==0:print(f'  detalle {i}/{len(selected)}')
        except Exception as e:errors.append({'bdns':code,'error':str(e)})
    items=list({x['id']:x for x in items}.values());items.sort(key=lambda x:(x.get('status')=='closed',x.get('deadline') is None,x.get('deadline') or '9999',-x.get('detection_score',0)))
    payload={'generated_at':dt.datetime.now().isoformat(timespec='seconds'),'window_days':args.days,'source':'BDNS/SNPSAP API pública','source_url':f'{BASE}/convocatorias/busqueda','review_policy':'Candidatos automáticos con campos estructurados oficiales. Nunca equivalen a elegibilidad confirmada.','items':items,'errors':errors[:100]}
    OUT.write_text(json.dumps(payload,ensure_ascii=False,separators=(',',':')),encoding='utf-8');update_status(bdns={'downloaded':len(all_rows),'candidates':len(scored),'details':len(items),'errors':len(errors),'ok':True,'window_days':args.days,'structured_extraction':'v1.4'})
    print(f'OK · {len(items)} candidatos BDNS enriquecidos generados en {OUT}');print('IMPORTANTE: el motor ordena candidatos, pero la elegibilidad siempre se confirma en bases.')

if __name__=='__main__':
    try:main()
    except Exception as e:
        print('ERROR BDNS:',e);update_status(bdns={'ok':False,'error':str(e)});sys.exit(1)
