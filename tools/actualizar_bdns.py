#!/usr/bin/env python3
"""Construye un radar estático de candidatos municipales desde la API pública de BDNS/SNPSAP.

No publica automáticamente elegibilidad. Los registros importados se muestran como
"Detectada en BDNS · requiere revisión" hasta que una ficha editorial verificada los sustituya.

Sin dependencias externas. Se ejecuta en el PC del mantenedor y genera JSON estático.
"""
from __future__ import annotations
from pathlib import Path
from urllib.parse import urlencode
import argparse, datetime as dt, json, re, sys, time, unicodedata, urllib.request

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/"data"/"generated"/"oportunidades_bdns.json"
RAW_DIR=ROOT/"data"/"generated"/"raw_bdns"
STATUS=ROOT/"data"/"generated"/"status.json"
BASE="https://www.infosubvenciones.es/bdnstrans/api"
VPD="GE"
UA="BrujulaMunicipal-static-updater/0.5 (+static site)"

MUNICIPAL_TERMS=["municipio","municipios","ayuntamiento","ayuntamientos","entidad local","entidades locales","eell","diputacion","diputación","cabildo","consejo insular","mancomunidad","entidad de ambito territorial inferior","entidad de ámbito territorial inferior"]
TOPICS={
"agua":["agua","abastecimiento","saneamiento","depuracion","depuración","fugas","ciclo urbano","telelectura"],
"energia":["energia","energía","eficiencia energetica","eficiencia energética","alumbrado","autoconsumo","fotovolta"],
"digitalizacion":["digitalizacion","digitalización","administracion electronica","administración electrónica","datos abiertos","smart","territorios inteligentes","ciudades inteligentes"],
"ciberseguridad":["ciberseguridad","seguridad digital","ens","esquema nacional de seguridad"],
"conectividad":["conectividad","banda ancha","wifi","wi-fi","fibra","5g","telecomunic"],
"turismo":["turismo","destino turistico","destino turístico","rutas"],
"patrimonio":["patrimonio","cultural","museo","archivo historico","archivo histórico"],
"vivienda":["vivienda","rehabilitacion","rehabilitación","alquiler"],
"movilidad":["movilidad","transporte","vehiculo electrico","vehículo eléctrico"],
"despoblacion":["reto demografico","reto demográfico","despoblacion","despoblación","rural","pequeños municipios"],
"servicios":["servicios sociales","mayores","dependencia","juventud","infancia","conciliacion","conciliación"],
"empleo":["empleo","emprendimiento","comercio local","autonomos","autónomos"],
"medioambiente":["residuos","medio ambiente","biodiversidad","renaturalizacion","renaturalización","incendios"],
}

def norm(s=""):
    s=unicodedata.normalize("NFD",str(s)); s="".join(c for c in s if unicodedata.category(c)!="Mn")
    return s.casefold()

def fetch_json(url, timeout=75, retries=2):
    for attempt in range(retries+1):
        try:
            req=urllib.request.Request(url,headers={"User-Agent":UA,"Accept":"application/json"})
            with urllib.request.urlopen(req,timeout=timeout) as r:
                return json.loads(r.read().decode("utf-8-sig"))
        except Exception:
            if attempt>=retries: raise
            time.sleep(1.5*(attempt+1))

def get_any(d, *keys):
    if not isinstance(d,dict): return None
    lower={str(k).casefold():v for k,v in d.items()}
    for k in keys:
        v=lower.get(k.casefold())
        if v not in (None,""): return v
    return None

def deep_text(obj, key_hint=None):
    vals=[]
    def walk(x,k=""):
        if isinstance(x,dict):
            for kk,v in x.items(): walk(v,str(kk))
        elif isinstance(x,list):
            for v in x: walk(v,k)
        elif isinstance(x,(str,int,float,bool)):
            if key_hint is None or key_hint in norm(k): vals.append(str(x))
    walk(obj)
    return " ".join(vals)

def code_of(x):
    c=get_any(x,"codigoBDNS","numeroConvocatoria","numConv","convocatoria","codigo")
    if isinstance(c,dict): c=get_any(c,"codigoBDNS","numero","codigo")
    if c is None: return None
    m=re.search(r"\d{5,9}",str(c)); return m.group(0) if m else str(c).strip()

def title_of(x):
    return str(get_any(x,"titulo","descripcion","title","nombre") or "Convocatoria BDNS").strip()

def topics_for(text):
    n=norm(text); return [topic for topic,terms in TOPICS.items() if any(norm(t) in n for t in terms)]

def candidate_score(x):
    text=norm(deep_text(x))
    score=sum(5 for t in MUNICIPAL_TERMS if norm(t) in text)
    for terms in TOPICS.values():
        if any(norm(t) in text for t in terms): score+=1
    # National/autonomic/provincial programmes get a mild boost; purely individual/nominative titles a penalty.
    if any(t in text for t in ("nominativa","nominativo","premio individual")): score-=3
    return score

def parse_date_value(v):
    if not v: return None
    s=str(v).strip()
    for fmt in ("%Y-%m-%d","%d/%m/%Y","%Y-%m-%dT%H:%M:%S","%d-%m-%Y"):
        try:return dt.datetime.strptime(s[:19],fmt).date().isoformat()
        except ValueError:pass
    m=re.search(r"((?:19|20)\d{2})[-/](\d{1,2})[-/](\d{1,2})",s)
    if m:return f"{int(m.group(1)):04d}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"
    m=re.search(r"(\d{1,2})[-/](\d{1,2})[-/]((?:19|20)\d{2})",s)
    if m:return f"{int(m.group(3)):04d}-{int(m.group(2)):02d}-{int(m.group(1)):02d}"
    return None

def deep_find_dates(obj):
    found=[]
    def walk(x,path=""):
        if isinstance(x,dict):
            for k,v in x.items(): walk(v,f"{path}.{k}" if path else str(k))
        elif isinstance(x,list):
            for i,v in enumerate(x): walk(v,f"{path}[{i}]")
        else:
            if "fecha" in norm(path) or "plazo" in norm(path):
                d=parse_date_value(x)
                if d: found.append((path,d))
    walk(obj); return found

def infer_beneficiaries(detail):
    txt=norm(deep_text(detail,"benefici")) or norm(deep_text(detail))
    types=[]
    if "entidad local" in txt or "entidades locales" in txt: types.append("local_entity")
    if "ayuntamiento" in txt or "municipio" in txt: types.append("municipality")
    if "entidad de ambito territorial inferior" in txt or "eatim" in txt: types.append("eatim")
    return sorted(set(types))

def infer_org(search,detail):
    for obj in (detail,search):
        # common direct keys
        v=get_any(obj,"organo","órgano","organismo","departamento")
        if isinstance(v,str) and v.strip():return v.strip()
        # common nested admin object
        a=get_any(obj,"administracion","administración")
        if isinstance(a,dict):
            vals=[get_any(a,"organo","órgano"),get_any(a,"subOrgano","departamento"),get_any(a,"ambito","ámbito")]
            vals=[str(v).strip() for v in vals if v]
            if vals:return " · ".join(vals)
    return "Organismo convocante · consultar BDNS"

def explicit_deadline(detail):
    dates=deep_find_dates(detail)
    # Prefer paths that look like end/deadline/application.
    preferred=[(p,d) for p,d in dates if any(t in norm(p) for t in ("fin","hasta","solicitud","plazo"))]
    if preferred:
        return sorted(preferred,key=lambda x:x[1])[-1][1], preferred[-1][0]
    return (None,None)

def normalize_item(search,detail):
    code=code_of(detail) or code_of(search)
    title=title_of(detail) if title_of(detail)!="Convocatoria BDNS" else title_of(search)
    fulltext=deep_text(detail)+" "+deep_text(search)
    topics=topics_for(fulltext)
    beneficiaries=infer_beneficiaries(detail)
    deadline,deadline_field=explicit_deadline(detail)
    item={
        "id":f"bdns-{code}","bdns":code,"title":title,"type":"bdns_candidate",
        "status":"pending_review","status_label":"Detectada en BDNS · requiere revisión",
        "review_status":"pending","organization":infer_org(search,detail),
        "scope":"Por determinar","topics":topics or ["otros"],
        "beneficiary_types":beneficiaries,
        "population_rules":[],"budget_total":None,"project_min":None,"project_max":None,
        "deadline":deadline,
        "summary":"Convocatoria detectada automáticamente en la BDNS por posible relevancia municipal. Debe revisarse la ficha oficial antes de afirmar elegibilidad, plazo o gastos financiables.",
        "source":f"https://www.infosubvenciones.es/bdnstrans/GE/es/convocatorias/{code}",
        "verified":None,
        "warning":"Registro automático pendiente de revisión. Brújula no afirma que esté abierta ni que el municipio sea beneficiario.",
        "automatic_detection":True,
        "deadline_source_field":deadline_field,
    }
    return item

def update_status(**kwargs):
    STATUS.parent.mkdir(parents=True,exist_ok=True)
    try:st=json.loads(STATUS.read_text(encoding="utf-8"))
    except Exception:st={}
    st.update(kwargs); st["updated_at"]=dt.datetime.now().isoformat(timespec="seconds")
    STATUS.write_text(json.dumps(st,ensure_ascii=False,indent=2),encoding="utf-8")

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--days",type=int,default=120,help="Ventana de registro BDNS a revisar")
    ap.add_argument("--page-size",type=int,default=1000)
    ap.add_argument("--max-pages",type=int,default=30)
    ap.add_argument("--max-details",type=int,default=300,help="Máximo de fichas de detalle a consultar")
    args=ap.parse_args()
    today=dt.date.today(); start=today-dt.timedelta(days=args.days)
    all_rows=[]
    print(f"Descargando convocatorias BDNS registradas entre {start:%d/%m/%Y} y {today:%d/%m/%Y}…")
    for page in range(args.max_pages):
        q=urlencode({"fechaDesde":start.strftime("%d/%m/%Y"),"fechaHasta":today.strftime("%d/%m/%Y"),"pageSize":args.page_size,"page":page,"vpd":VPD})
        data=fetch_json(f"{BASE}/convocatorias/busqueda?{q}")
        rows=data.get("content",[]) if isinstance(data,dict) else (data if isinstance(data,list) else [])
        if not rows: break
        all_rows.extend(rows)
        print(f"  página {page+1}: {len(rows)} registros")
        if len(rows)<args.page_size: break
    scored=[(candidate_score(x),x) for x in all_rows]
    scored=[z for z in scored if z[0]>0]
    scored.sort(key=lambda z:z[0],reverse=True)
    selected=scored[:args.max_details]
    print(f"{len(all_rows)} registros revisados · {len(scored)} candidatos textuales · {len(selected)} fichas de detalle a consultar.")
    OUT.parent.mkdir(parents=True,exist_ok=True); RAW_DIR.mkdir(parents=True,exist_ok=True)
    items=[]; errors=[]
    for i,(score,row) in enumerate(selected,1):
        code=code_of(row)
        if not code: continue
        try:
            detail=fetch_json(f"{BASE}/convocatorias?{urlencode({'numConv':code,'vpd':VPD})}")
            (RAW_DIR/f"{code}.json").write_text(json.dumps(detail,ensure_ascii=False,indent=2),encoding="utf-8")
            x=normalize_item(row,detail); x["detection_score"]=score; items.append(x)
            if i%25==0: print(f"  detalle {i}/{len(selected)}")
        except Exception as e:
            errors.append({"bdns":code,"error":str(e)})
    # Deduplicate and sort (deadline known first, then score)
    dedup={x["id"]:x for x in items}; items=list(dedup.values())
    items.sort(key=lambda x:(x.get("deadline") is None, x.get("deadline") or "9999", -x.get("detection_score",0)))
    payload={
        "generated_at":dt.datetime.now().isoformat(timespec="seconds"),
        "window_days":args.days,"source":"BDNS/SNPSAP API pública","source_url":f"{BASE}/convocatorias/busqueda",
        "review_policy":"Los registros de este fichero son candidatos automáticos. No se consideran verificados hasta revisión editorial.",
        "items":items,"errors":errors[:100],
    }
    OUT.write_text(json.dumps(payload,ensure_ascii=False,separators=(",",":")),encoding="utf-8")
    update_status(bdns={"downloaded":len(all_rows),"candidates":len(scored),"details":len(items),"errors":len(errors),"ok":True,"window_days":args.days})
    print(f"OK · {len(items)} candidatos BDNS estáticos generados en {OUT}")
    print("IMPORTANTE: aparecen en la web como 'requiere revisión', nunca como elegibles automáticamente.")

if __name__=="__main__":
    try:main()
    except Exception as e:
        print("ERROR BDNS:",e)
        update_status(bdns={"ok":False,"error":str(e)})
        sys.exit(1)
