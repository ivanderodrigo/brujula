#!/usr/bin/env python3
"""Actualiza el catálogo municipal de Brújula Municipal desde fuentes oficiales del INE.

Sin dependencias externas: solo biblioteca estándar de Python.
- Municipios/códigos: API JSON del INE, variable Municipios (Id 19), clasificación 2026.
- Población: tablas provinciales oficiales de población municipal (último dato disponible).

La web no consulta estas fuentes durante la navegación: este script genera JSON estático local.
"""
from __future__ import annotations

from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urljoin
import csv
import datetime as dt
import io
import json
import re
import sys
import unicodedata
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "catalog" / "municipios.json"
STATUS = ROOT / "data" / "generated" / "status.json"

MUNICIPALITY_API = "https://servicios.ine.es/wstempus/js/ES/VALORES_VARIABLE/19?clasif=121&det=2&page={page}"
POP_INDEX = "https://www.ine.es/dynt3/inebase/index.htm?padre=525"
POP_CSV = "https://www.ine.es/jaxiT3/files/t/csv_bd/{table_id}.csv"

PROVINCES = {
"01":["Araba/Álava","País Vasco"],"02":["Albacete","Castilla-La Mancha"],"03":["Alicante/Alacant","Comunitat Valenciana"],"04":["Almería","Andalucía"],"05":["Ávila","Castilla y León"],"06":["Badajoz","Extremadura"],"07":["Illes Balears","Illes Balears"],"08":["Barcelona","Cataluña"],"09":["Burgos","Castilla y León"],"10":["Cáceres","Extremadura"],"11":["Cádiz","Andalucía"],"12":["Castellón/Castelló","Comunitat Valenciana"],"13":["Ciudad Real","Castilla-La Mancha"],"14":["Córdoba","Andalucía"],"15":["A Coruña","Galicia"],"16":["Cuenca","Castilla-La Mancha"],"17":["Girona","Cataluña"],"18":["Granada","Andalucía"],"19":["Guadalajara","Castilla-La Mancha"],"20":["Gipuzkoa","País Vasco"],"21":["Huelva","Andalucía"],"22":["Huesca","Aragón"],"23":["Jaén","Andalucía"],"24":["León","Castilla y León"],"25":["Lleida","Cataluña"],"26":["La Rioja","La Rioja"],"27":["Lugo","Galicia"],"28":["Madrid","Comunidad de Madrid"],"29":["Málaga","Andalucía"],"30":["Murcia","Región de Murcia"],"31":["Navarra","Comunidad Foral de Navarra"],"32":["Ourense","Galicia"],"33":["Asturias","Principado de Asturias"],"34":["Palencia","Castilla y León"],"35":["Las Palmas","Canarias"],"36":["Pontevedra","Galicia"],"37":["Salamanca","Castilla y León"],"38":["Santa Cruz de Tenerife","Canarias"],"39":["Cantabria","Cantabria"],"40":["Segovia","Castilla y León"],"41":["Sevilla","Andalucía"],"42":["Soria","Castilla y León"],"43":["Tarragona","Cataluña"],"44":["Teruel","Aragón"],"45":["Toledo","Castilla-La Mancha"],"46":["Valencia/València","Comunitat Valenciana"],"47":["Valladolid","Castilla y León"],"48":["Bizkaia","País Vasco"],"49":["Zamora","Castilla y León"],"50":["Zaragoza","Aragón"],"51":["Ceuta","Ceuta"],"52":["Melilla","Melilla"]}

UA = "BrujulaMunicipal-static-updater/0.5 (+static site)"

def fetch_bytes(url: str, timeout: int = 60) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()

def fetch_json(url: str):
    return json.loads(fetch_bytes(url).decode("utf-8-sig"))

def norm(s: str) -> str:
    s = unicodedata.normalize("NFD", s or "")
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = s.casefold().replace("/", " ")
    s = re.sub(r"\b(el|la|los|las|o|a|as|os)\b", " ", s)
    return re.sub(r"[^a-z0-9]+", " ", s).strip()

def first(obj, keys):
    if not isinstance(obj, dict): return None
    low = {str(k).casefold(): v for k, v in obj.items()}
    for k in keys:
        if k.casefold() in low and low[k.casefold()] not in (None, ""):
            return low[k.casefold()]
    return None

def parse_official_code(x: dict) -> str | None:
    code = first(x, ["Codigo", "Código", "codigoOficial", "CODIGO", "Code"])
    if code is None: return None
    digits = re.sub(r"\D", "", str(code))
    if len(digits) >= 5:
        return digits[:5]
    return digits.zfill(5) if digits else None

class TableLinkParser(HTMLParser):
    def __init__(self):
        super().__init__(); self.cur = None; self.links = []
    def handle_starttag(self, tag, attrs):
        if tag.lower() == "a":
            href = dict(attrs).get("href", "")
            m = re.search(r"Tabla\.htm\?t=(\d+)", href, re.I)
            self.cur = [m.group(1), ""] if m else None
    def handle_data(self, data):
        if self.cur: self.cur[1] += data
    def handle_endtag(self, tag):
        if tag.lower() == "a" and self.cur:
            self.links.append(tuple(self.cur)); self.cur = None

def load_municipalities():
    out, seen = [], set()
    print("1/2 · Descargando municipios oficiales del INE (clasificación 2026)…")
    for page in range(1, 40):
        data = fetch_json(MUNICIPALITY_API.format(page=page))
        if not data: break
        if isinstance(data, dict):
            data = data.get("Data") or data.get("data") or data.get("items") or []
        added = 0
        for x in data:
            if not isinstance(x, dict): continue
            code = parse_official_code(x)
            name = first(x, ["Nombre", "nombre", "Name"])
            if not code or not name or code in seen: continue
            pc = code[:2]
            province, ccaa = PROVINCES.get(pc, [f"Provincia {pc}", "Por determinar"])
            out.append({
                "id": code,
                "ine_code": code,
                "name": str(name).strip(),
                "entity_type": "municipality",
                "province_code": pc,
                "province": province,
                "autonomous_region": ccaa,
                "population": None,
                "population_year": None,
                "population_official": False,
                "source": "INE API JSON · VALORES_VARIABLE/19 · clasificación 121 (2026)",
                "source_url": MUNICIPALITY_API.format(page=page),
                "special_profile": False,
            })
            seen.add(code); added += 1
        if added == 0 and page > 1: break
    if len(out) < 8000:
        raise RuntimeError(f"El INE devolvió solo {len(out)} municipios; no se sustituye el catálogo actual.")
    return out

def discover_population_tables(html: str):
    p = TableLinkParser(); p.feed(html)
    found = []
    for tid, text in p.links:
        clean = " ".join(text.split())
        if "Población por municipios y sexo" in clean or "Poblacion por municipios y sexo" in clean:
            province = clean.split(":", 1)[0].strip()
            found.append((province, tid))
    # de-duplicate ids while preserving order
    seen=set(); unique=[]
    for pnm,tid in found:
        if tid not in seen: seen.add(tid); unique.append((pnm,tid))
    return unique

def decode_csv(raw: bytes) -> str:
    for enc in ("utf-8-sig", "utf-8", "cp1252", "latin-1"):
        try: return raw.decode(enc)
        except UnicodeDecodeError: pass
    return raw.decode("latin-1", errors="replace")

def parse_population_csv(raw: bytes):
    text = decode_csv(raw)
    sample = text[:10000]
    try: dialect = csv.Sniffer().sniff(sample, delimiters=";\t,")
    except csv.Error: dialect = csv.excel_tab
    rows = list(csv.reader(io.StringIO(text), dialect))
    if not rows: return [], None
    header = [h.strip().strip('"') for h in rows[0]]
    # latest year-like column
    year_cols = []
    for i,h in enumerate(header):
        ys = re.findall(r"(?:19|20)\d{2}", h)
        if ys: year_cols.append((int(ys[-1]), i))
    if not year_cols: return [], None
    year, yi = max(year_cols)
    out=[]
    for row in rows[1:]:
        if len(row) <= yi: continue
        # first columns are municipality and sex; identify Total if present
        lead = [c.strip().strip('"') for c in row[:min(4,len(row))]]
        lead_norm = [norm(c) for c in lead]
        if any(v in ("hombres","mujeres","hombre","mujer") for v in lead_norm):
            continue
        # If explicit sex field exists, require total.
        if any(v == "total" for v in lead_norm):
            candidates = [c for c in lead if norm(c) != "total" and c]
        else:
            candidates = [c for c in lead if c]
        if not candidates: continue
        name = candidates[0]
        val = row[yi].strip().replace(".", "").replace(" ", "")
        val = val.replace(",0", "") if val.endswith(",0") else val
        try: pop = int(float(val.replace(",", ".")))
        except ValueError: continue
        out.append((name, pop))
    return out, year

def enrich_population(items):
    print("2/2 · Añadiendo población municipal oficial del INE…")
    html = fetch_bytes(POP_INDEX).decode("utf-8", errors="replace")
    tables = discover_population_tables(html)
    if len(tables) < 40:
        print(f"AVISO: solo se descubrieron {len(tables)} tablas provinciales; se mantiene el catálogo sin completar donde falte.")
    by_province = {}
    for x in items:
        by_province.setdefault(norm(x["province"]), []).append(x)
    matched = 0; latest_year = None
    for province_label, table_id in tables:
        raw = fetch_bytes(POP_CSV.format(table_id=table_id))
        rows, year = parse_population_csv(raw)
        latest_year = max(latest_year or 0, year or 0) or latest_year
        # province label aliases
        pkey = norm(province_label)
        candidates = by_province.get(pkey)
        if candidates is None:
            # fuzzy province name
            for k,v in by_province.items():
                if k in pkey or pkey in k:
                    candidates = v; break
        if not candidates: continue
        lookup = {norm(x["name"]): x for x in candidates}
        for name,pop in rows:
            n = norm(name)
            x = lookup.get(n)
            if not x:
                # Some INE labels contain code prefixes or reordered articles.
                x = next((z for k,z in lookup.items() if k == n or (len(n)>4 and (k.endswith(n) or n.endswith(k)))), None)
            if x:
                x["population"] = pop
                x["population_year"] = year
                x["population_official"] = True
                x["population_source"] = "INE · Cifras oficiales de población de los municipios españoles"
                x["population_source_url"] = f"https://www.ine.es/jaxiT3/Tabla.htm?t={table_id}"
                matched += 1
    return matched, latest_year

def update_status(**kwargs):
    STATUS.parent.mkdir(parents=True, exist_ok=True)
    try: st=json.loads(STATUS.read_text(encoding="utf-8"))
    except Exception: st={}
    st.update(kwargs)
    st["updated_at"] = dt.datetime.now().isoformat(timespec="seconds")
    STATUS.write_text(json.dumps(st, ensure_ascii=False, indent=2), encoding="utf-8")


def main():
    try:
        items = load_municipalities()
        matched, year = enrich_population(items)
    except Exception as e:
        print("ERROR:", e)
        print("No se ha sustituido el catálogo existente.")
        sys.exit(1)

    # Entidad piloto inferior al municipio. Su población no se etiqueta como cifra municipal oficial INE.
    items.append({
        "id":"el-hoyo","name":"El Hoyo","entity_type":"eatim","parent_municipality":"Mestanza",
        "parent_ine_code":"13055","province_code":"13","province":"Ciudad Real","autonomous_region":"Castilla-La Mancha",
        "population":191,"population_year":2023,"population_official":False,
        "population_source":"Referencia local del piloto; pendiente de actualización específica con Nomenclátor INE",
        "special_profile":True,
    })
    items.sort(key=lambda x:(norm(x["name"]), x["province"]))
    payload={
        "complete": True,
        "source_year": 2026,
        "population_reference_year": year,
        "generated_at": dt.datetime.now().isoformat(timespec="seconds"),
        "source_runtime": "copia estática generada localmente",
        "source_dataset": "INE API JSON + tablas provinciales oficiales de población",
        "source_note": "La web publicada usa esta copia local y no consulta el INE durante la navegación.",
        "items": items,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",",":")), encoding="utf-8")
    update_status(municipalities={"count":len(items),"official_population_matches":matched,"population_year":year,"ok":True})
    print(f"OK · {len(items)} entidades guardadas; población oficial emparejada en {matched} municipios (referencia {year}).")
    print("Archivo:", OUT)

if __name__ == "__main__": main()
