#!/usr/bin/env python3
"""
analyze_lab.py — read-only structural analysis over the dumps produced by
extract_lab_ssot.py. Emits metrics.json (all numbers used in the audit docs,
each number traceable to sheet + cell).

No writes outside the requested --json path.
"""
import argparse
import csv
import json
import os
import re
from collections import Counter, defaultdict

PROFILE_COLS = ["B", "C", "D", "E", "F", "G"]
PROFILE_NAMES = ["P0", "P1", "P2", "P3", "P4", "P5"]


def load_tsv(path):
    rows = list(csv.reader(open(path, encoding="utf-8"), delimiter="\t"))[1:]
    out = []
    for r in rows:
        if len(r) < 3:
            continue
        out.append({"ref": r[0], "kind": r[1], "value": r[2]})
    return out


def by_row(cells):
    d = defaultdict(dict)
    for c in cells:
        m = re.match(r"([A-Z]+)(\d+)$", c["ref"])
        if m:
            d[int(m.group(2))][m.group(1)] = c
    return d


def norm_key(k):
    return re.sub(r"^(settings|vlcopt|kodiprop|headerOverrides|prefetch_config|hlsjs|bounds|opt)\.", "", k)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("rawdir")
    ap.add_argument("--json", required=True)
    args = ap.parse_args()
    raw = os.path.abspath(args.rawdir)
    sh = os.path.join(raw, "sheets")
    inv = json.load(open(os.path.join(raw, "inventory.json"), encoding="utf-8"))
    dirc = json.load(open(os.path.join(raw, "directives.json"), encoding="utf-8"))

    out = {}

    # ---------------- 6_NIVEL_2_PROFILES ----------------
    prof_cells = load_tsv(os.path.join(sh, "06_6_NIVEL_2_PROFILES.tsv"))
    prof = by_row(prof_cells)

    sections = []
    for r in sorted(prof):
        a = prof[r].get("A")
        if a and a["value"].startswith("--"):
            sections.append({"row": r, "title": a["value"], "cell": a["ref"]})

    # kind stats for profile columns
    kind_stats = Counter()
    for r, cells in prof.items():
        for c in PROFILE_COLS:
            cell = cells.get(c)
            if cell:
                kind_stats[cell["kind"]] += 1

    # duplicate normalized keys with divergent values
    keymap = defaultdict(list)
    for r in sorted(prof):
        a = prof[r].get("A")
        if not a:
            continue
        key = a["value"].strip()
        if not key or key.startswith("--"):
            continue
        vals = tuple((prof[r].get(c, {}).get("value") if prof[r].get(c) else None) for c in PROFILE_COLS)
        keymap[norm_key(key)].append({"row": r, "key": key, "values": vals})

    dup_groups = []
    for nk, items in keymap.items():
        if len(items) > 1:
            distinct = {i["values"] for i in items}
            dup_groups.append({
                "normalizedKey": nk,
                "occurrences": [{"row": i["row"], "key": i["key"]} for i in items],
                "distinctValueTuples": len(distinct),
                "divergent": len(distinct) > 1,
            })

    # literal-vs-number corruption: numeric-looking strings that lost the decimal separator
    # heuristic: |value| is an integer >= 10 whose only plausible reading is 0.x (documented
    # per row in findings, not auto-classified as broken here).
    rows_index = {}
    for r in sorted(prof):
        a = prof[r].get("A")
        if a and a["value"].strip() and not a["value"].startswith("--"):
            rows_index[a["value"].strip()] = r

    # ---------------- 7_NIVEL_3_CHANNEL ----------------
    n3_cells = load_tsv(os.path.join(sh, "08_7_NIVEL_3_CHANNEL.tsv"))
    n3 = by_row(n3_cells)
    capa_counter = Counter()
    capa_included = Counter()
    n3_detail = []
    for r in sorted(n3):
        cells = n3[r]
        capa = cells.get("B", {}).get("value")
        tag = cells.get("C", {}).get("value")
        inc = (cells.get("A", {}).get("value") or "").strip()
        if not capa or capa.startswith("--"):
            continue
        capa_counter[capa] += 1
        if inc.upper() == "X":
            capa_included[capa] += 1
        n3_detail.append({"row": r, "capa": capa, "tag": tag, "included": inc.upper() == "X",
                          "value": cells.get("D", {}).get("value"),
                          "cellTag": cells.get("B", {}).get("ref"),
                          "cellValue": cells.get("D", {}).get("ref")})

    # ---------------- 5_NIVEL_1_HEADER ----------------
    n1_cells = load_tsv(os.path.join(sh, "07_5_NIVEL_1_HEADER.tsv"))
    n1 = by_row(n1_cells)
    n1_directives = []
    for r in sorted(n1):
        cells = n1[r]
        d = cells.get("B", {}).get("value")
        if d and d.startswith("#"):
            n1_directives.append({
                "row": r,
                "directive": d,
                "value": cells.get("C", {}).get("value"),
                "kind": cells.get("C", {}).get("kind"),
                "included": (cells.get("A", {}).get("value") or "").upper() == "X",
                "cellDirective": cells.get("B", {}).get("ref"),
                "cellValue": cells.get("C", {}).get("ref"),
            })

    # ---------------- per-sheet directive summary ----------------
    directive_summary = {}
    for sheet, info in dirc.items():
        cw = info["cellsWithToken"]
        to = info["tokenOccurrences"]
        directive_summary[sheet] = {
            "cellsWithToken": cw,
            "tokenOccurrences": to,
            "firstSample": info["firstSample"],
        }

    # ---------------- sheet-level facts ----------------
    sheet_facts = {s["name"]: {k: s[k] for k in
                  ("index", "state", "dimension", "cells", "formulas", "mergedRanges",
                   "sheetProtection", "autoFilter", "bytes")}
                  for s in inv["sheets"]}

    # catalog columns
    cat_cells = load_tsv(os.path.join(sh, "03_2_CATALOGO_MASTER.tsv"))
    cat = by_row(cat_cells)
    header = cat.get(1, {})
    cat_header = {c: header[c]["value"] for c in sorted(header, key=lambda x: (len(x), x))}
    cat_rows = max(cat) if cat else 0

    out = {
        "source": inv["source"],
        "readCopy": inv["readCopy"],
        "workbook": inv["workbook"],
        "package": inv["package"],
        "sheetFacts": sheet_facts,
        "profiles": {
            "sheet": "6_NIVEL_2_PROFILES",
            "dimension": sheet_facts["6_NIVEL_2_PROFILES"]["dimension"],
            "sections": sections,
            "cellKindStats": dict(kind_stats),
            "keyRows": len(rows_index),
            "duplicateKeyGroups": sorted(dup_groups, key=lambda g: g["normalizedKey"]),
            "rowsIndex": rows_index,
        },
        "nivel3": {
            "sheet": "7_NIVEL_3_CHANNEL",
            "capaCounts": dict(capa_counter),
            "capaIncluded": dict(capa_included),
            "detail": n3_detail,
        },
        "nivel1": {
            "sheet": "5_NIVEL_1_HEADER",
            "directiveCount": len(n1_directives),
            "directives": n1_directives,
        },
        "directives": directive_summary,
        "catalog": {"sheet": "2_CATALOGO_MASTER", "header": cat_header, "maxRow": cat_rows},
    }

    with open(args.json, "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, indent=2)
    print(json.dumps({k: (len(v) if isinstance(v, list) else v) for k, v in out.items() if k in (
        "profiles",)}, default=str)[:500])
    print("wrote", args.json)


if __name__ == "__main__":
    main()
