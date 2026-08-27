from pathlib import Path
import re

files = list(Path("fichas").rglob("*.html"))

anchor_re = re.compile(
    r"""<a\b[^>]*\btarget\s*=\s*(['"])_blank\1[^>]*>""",
    re.I
)

rel_re = re.compile(
    r"""\brel\s*=\s*(['"])(.*?)\1""",
    re.I
)

changed_files = 0
changed_links = 0

def fix_tag(match):
    global changed_links

    tag = match.group(0)
    rel = rel_re.search(tag)

    if rel:
        values = rel.group(2).split()
        existing = {v.lower() for v in values}

        if "noopener" not in existing:
            values.append("noopener")

        if "noreferrer" not in existing:
            values.append("noreferrer")

        replacement = 'rel="' + " ".join(values) + '"'

        new_tag = (
            tag[:rel.start()]
            + replacement
            + tag[rel.end():]
        )

    else:
        new_tag = tag[:-1] + ' rel="noopener noreferrer">'

    if new_tag != tag:
        changed_links += 1

    return new_tag


for path in files:
    original = path.read_text(encoding="utf-8", errors="ignore")
    fixed = anchor_re.sub(fix_tag, original)

    if fixed != original:
        path.write_text(fixed, encoding="utf-8")
        changed_files += 1

print(f"HTML corregidos: {changed_files}")
print(f"Enlaces corregidos: {changed_links}")
