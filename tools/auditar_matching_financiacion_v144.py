#!/usr/bin/env python3
from pathlib import Path
import json
import sys
import unicodedata

ROOT = Path(__file__).resolve().parents[1]

WEAK_TOPICS = {
    "servicios", "accesibilidad", "edificios", "equipamiento",
    "infraestructura", "infraestructuras", "innovacion", "sostenibilidad",
    "municipal", "municipio", "rural", "territorio", "digitalizacion",
    "datos", "administracion", "gobernanza", "smart", "smart-village",
    "tecnologia", "salud", "mayores", "familias",
}

GENERIC_CATEGORIES = {
    "servicios", "digitalizacion", "administracion",
    "datos", "smart-village", "otros",
}

OPPORTUNITY_FILES = [
    "data/catalog/oportunidades.json",
    "data/catalog/oportunidades_directas.json",
    "data/catalog/oportunidades_europeas.json",
    "data/generated/oportunidades_bdns.json",
    "data/generated/oportunidades_eu.json",
]

def norm(value) -> str:
    text = unicodedata.normalize("NFD", str(value or "").lower())
    return "".join(
        char for char in text
        if unicodedata.category(char) != "Mn"
    ).strip()

def load(relative: str, default):
    path = ROOT / relative
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default

def rows(document):
    if isinstance(document, list):
        return document
    if isinstance(document, dict):
        return document.get("items", [])
    return []

def topical_compatibility(project: dict, opportunity: dict):
    category = norm(project.get("category"))
    opportunity_topics = {
        norm(topic)
        for topic in opportunity.get("topics", [])
        if norm(topic)
    }

    explicit = opportunity.get("id") in (project.get("opportunities") or [])
    if explicit:
        return True, "explicit", [opportunity.get("id")]

    if not opportunity_topics:
        return False, "no_topics", []

    if (
        category
        and category not in GENERIC_CATEGORIES
        and category not in WEAK_TOPICS
    ):
        if category in opportunity_topics:
            return True, "exact_category", [category]
        return False, "category_mismatch", []

    anchors = [
        norm(tag)
        for tag in project.get("tags", [])
        if (
            norm(tag)
            and norm(tag) not in WEAK_TOPICS
            and norm(tag) not in GENERIC_CATEGORIES
            and len(norm(tag)) >= 3
        )
    ]
    hits = sorted(set(anchors).intersection(opportunity_topics))

    if hits:
        return True, "specific_tag", hits

    return False, "generic_only", []

def main() -> int:
    projects = load("data/catalog/proyectos.json", [])
    opportunities = []

    for relative in OPPORTUNITY_FILES:
        opportunities.extend(rows(load(relative, [])))

    by_id = {
        opportunity.get("id"): opportunity
        for opportunity in opportunities
        if opportunity.get("id")
    }

    missing_explicit = []
    strong_auto = 0
    rejected_generic = 0
    rejected_category = 0

    for project in projects:
        for opportunity_id in project.get("opportunities") or []:
            if opportunity_id not in by_id:
                missing_explicit.append(
                    (project.get("id"), opportunity_id)
                )

        for opportunity in opportunities:
            compatible, mode, _hits = topical_compatibility(project, opportunity)
            if compatible and mode != "explicit":
                strong_auto += 1
            elif mode == "generic_only":
                rejected_generic += 1
            elif mode == "category_mismatch":
                rejected_category += 1

    print(
        f"MATCHING FINANCIACIÓN v1.4.4 · "
        f"{len(projects)} proyectos · {len(opportunities)} oportunidades"
    )
    print(f"Enlaces automáticos fuertes: {strong_auto}")
    print(f"Coincidencias genéricas rechazadas: {rejected_generic}")
    print(f"Categorías incompatibles rechazadas: {rejected_category}")

    if missing_explicit:
        print("ERROR · vínculos explícitos a oportunidades inexistentes:")
        for project_id, opportunity_id in missing_explicit:
            print(f"  {project_id} -> {opportunity_id}")
        return 1

    app_path = ROOT / "assets" / "js" / "app.js"
    app = app_path.read_text(encoding="utf-8", errors="ignore")

    required = [
        "v1.4.4 · matching estricto general proyecto-financiacion",
        "fundingProjectCompatibility",
        "genericFundingCategories",
        "weakFundingTopics",
    ]

    missing_markers = [marker for marker in required if marker not in app]
    if missing_markers:
        print(
            "ERROR · falta aplicar el hotfix a assets/js/app.js: "
            + ", ".join(missing_markers)
        )
        return 1

    print(
        "OK · el motor exige compatibilidad temática fuerte y no usa "
        "coincidencias genéricas como prueba de financiación."
    )
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
