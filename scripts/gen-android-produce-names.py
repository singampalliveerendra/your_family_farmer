#!/usr/bin/env python3
"""Generate the Android Telugu produce dictionary from the web one.

WHY THIS EXISTS: src/lib/produceNamesTe.ts is the single source of truth for
English -> Telugu crop names. The Android catalogue needs the same map, and
hand-copying ~200 pairs of Telugu script is both error-prone and guaranteed to
drift the first time someone adds a crop on the web side.

Run it after editing produceNamesTe.ts:

    scripts/gen-android-produce-names.py

It rewrites android/.../catalogue/ProduceNamesTe.kt in place. The generated
file IS committed -- the build must not depend on Python.
"""
import re
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "src/lib/produceNamesTe.ts"
OUT = ROOT / "android/app/src/main/java/com/gogrameen/app/catalogue/ProduceNamesTe.kt"

body = SRC.read_text(encoding="utf-8")
body = body[body.index("PRODUCE_NAME_TE"):]
body = body[body.index("{") + 1: body.index("\n}")]

pairs = []
for line in body.splitlines():
    line = line.strip()
    if not line or line.startswith("//"):
        continue
    m = re.match(r"^'((?:[^'\\]|\\.)*)'\s*:\s*'((?:[^'\\]|\\.)*)'\s*,?$", line)
    if not m:
        raise SystemExit(f"unparsed line in {SRC.name}: {line!r}")
    pairs.append((m.group(1), m.group(2)))

if not pairs:
    raise SystemExit("no entries parsed -- has the map format changed?")

seen = {}
for en, te in pairs:
    key = en.strip().lower()
    # The TS object literal would silently keep the LAST duplicate; match that.
    seen[key] = te

lines = [
    "package com.gogrameen.app.catalogue",
    "",
    "/* GENERATED FILE -- DO NOT EDIT BY HAND.",
    " *",
    " * Regenerate with scripts/gen-android-produce-names.py, which reads",
    " * src/lib/produceNamesTe.ts. Edit the crop names there, never here, so the",
    " * web and the app cannot disagree about what a crop is called.",
    " *",
    f" * {len(seen)} entries. */",
    "",
    "internal val PRODUCE_NAME_TE: Map<String, String> = mapOf(",
]
for key in sorted(seen):
    k = key.replace("\\", "\\\\").replace('"', '\\"')
    v = seen[key].replace("\\", "\\\\").replace('"', '\\"')
    lines.append(f'    "{k}" to "{v}",')
lines.append(")")
lines.append("")

OUT.write_text("\n".join(lines), encoding="utf-8")
print(f"{OUT.relative_to(ROOT)}: {len(seen)} entries")
