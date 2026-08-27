#!/usr/bin/env python3
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
WF = ROOT / ".github" / "workflows"
RX = re.compile(r'(?<![\w.-])(?:python|python3|node)\s+([A-Za-z0-9_./\\-]+\.(?:py|js))')

errors = []
refs = []

for path in sorted(list(WF.glob("*.yml")) + list(WF.glob("*.yaml"))):
    text = path.read_text(encoding="utf-8", errors="ignore")
    for match in RX.finditer(text):
        rel = match.group(1).replace("\\", "/")
        refs.append((path.relative_to(ROOT), rel))
        if not (ROOT / rel).exists():
            errors.append(f"{path.relative_to(ROOT)} -> falta {rel}")

print(f"WORKFLOW INTEGRITY · {len(refs)} referencias locales comprobadas")
for workflow, rel in refs:
    state = "OK" if (ROOT / rel).exists() else "ERROR"
    print(f"{state} · {workflow} -> {rel}")

if errors:
    print("\nREFERENCIAS ROTAS:")
    for err in errors:
        print("ERROR ·", err)
    sys.exit(1)

print("OK · todos los scripts locales invocados por workflows existen")
