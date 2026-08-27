#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
import datetime as dt
import hashlib
import json
import ssl
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "data" / "catalog" / "funding_sources.json"
OUT = ROOT / "data" / "generated" / "funding_sources_status.json"

TIMEOUT = 18
MAX_BYTES = 512 * 1024
WORKERS = 6

def now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")

def load(path: Path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default

def probe(source: dict, previous: dict | None) -> dict:
    source_id = source.get("id") or source.get("name") or source.get("url")
    url = source.get("url")
    base = {
        "id": source_id,
        "name": source.get("name"),
        "url": url,
        "level": source.get("level"),
        "kind": source.get("kind"),
        "topics": source.get("topics") or [],
        "checked_at": now(),
    }

    if not url:
        return {**base, "ok": False, "error": "Fuente sin URL"}

    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (compatible; BrujulaMunicipalSourceWatch/1.0)",
            "Accept": "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
            "Accept-Language": "es,en;q=0.7",
        },
    )

    try:
        with urllib.request.urlopen(
            request,
            timeout=TIMEOUT,
            context=ssl.create_default_context(),
        ) as response:
            body = response.read(MAX_BYTES)
            status = int(getattr(response, "status", 200))
            fingerprint = hashlib.sha256(body).hexdigest()

            old_fingerprint = (previous or {}).get("fingerprint")
            return {
                **base,
                "ok": 200 <= status < 400,
                "http_status": status,
                "final_url": response.geturl(),
                "content_type": response.headers.get("Content-Type"),
                "etag": response.headers.get("ETag"),
                "last_modified": response.headers.get("Last-Modified"),
                "fingerprint": fingerprint,
                "changed": bool(old_fingerprint and old_fingerprint != fingerprint),
                "bytes_sampled": len(body),
            }
    except urllib.error.HTTPError as exc:
        return {
            **base,
            "ok": False,
            "http_status": int(exc.code),
            "error": f"HTTP {exc.code}",
        }
    except Exception as exc:
        return {
            **base,
            "ok": False,
            "error": f"{type(exc).__name__}: {exc}",
        }

def main() -> int:
    catalog = load(SRC, {})
    sources = catalog.get("sources", []) if isinstance(catalog, dict) else catalog
    sources = sources or []

    previous_doc = load(OUT, {})
    previous = {
        row.get("id"): row
        for row in previous_doc.get("sources", [])
        if row.get("id")
    }

    results = []
    with ThreadPoolExecutor(max_workers=WORKERS) as executor:
        jobs = {
            executor.submit(probe, source, previous.get(source.get("id"))): source
            for source in sources
        }
        for job in as_completed(jobs):
            result = job.result()
            results.append(result)
            state = "OK" if result.get("ok") else "AVISO"
            changed = " · CAMBIO" if result.get("changed") else ""
            print(
                f"{state} · {result.get('id')} · "
                f"{result.get('http_status', '-')}{changed}"
            )

    results.sort(key=lambda row: str(row.get("id") or ""))
    ok_count = sum(bool(row.get("ok")) for row in results)
    changed_count = sum(bool(row.get("changed")) for row in results)

    output = {
        "version": 2,
        "checked_at": now(),
        "summary": {
            "total": len(results),
            "ok": ok_count,
            "failed": len(results) - ok_count,
            "changed": changed_count,
        },
        "note": (
            "Estado técnico de las fuentes. No implica que exista una "
            "convocatoria abierta, que el municipio sea beneficiario ni "
            "que una fuente financie un proyecto concreto."
        ),
        "sources": results,
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps(output, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print(
        f"FINANCIACIÓN · {ok_count}/{len(results)} fuentes accesibles · "
        f"{changed_count} con cambio detectado"
    )

    # Un bloqueo temporal o robots anti-bot no debe romper todo el pipeline.
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
