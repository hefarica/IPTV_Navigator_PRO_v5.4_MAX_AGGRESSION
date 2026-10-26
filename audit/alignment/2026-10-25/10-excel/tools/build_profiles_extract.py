#!/usr/bin/env python3
"""
build_profiles_extract.py — turns the read-only dumps into EXCEL_PROFILES_EXTRACT.json.

Every value carries its literal Excel value, the cell it came from, and the cell kind
(S = shared string, INLINE = inline string, N = number, B = boolean, STR = cached
formula string). Missing cells are emitted as null WITH the expected address, so a
consumer can tell "absent in Excel" from "not inspected".

NO reinterpretation: values are copied verbatim from the dump produced by
extract_lab_ssot.py (which parsed the OOXML directly, never Excel).
"""
import argparse
import csv
import json
import os
import re
from collections import defaultdict

SHEET = "6_NIVEL_2_PROFILES"
COLS = ["B", "C", "D", "E", "F", "G"]
PROFILES = ["P0", "P1", "P2", "P3", "P4", "P5"]

SECTIONS = [
    (6, 23, "meta"),
    (25, 65, "settings"),
    (67, 113, "vlcopt"),
    (117, 124, "kodiprop"),
    (126, 534, "headerOverrides"),
    (536, 550, "prefetch_config"),
    (552, 592, "hlsjs"),
    (594, 607, "bounds"),
    (610, 619, "opt"),
    (622, 625, "prisma"),
    (627, 663, "flatAliases"),
]

# keys surfaced at the top of each profile (the four the task names explicitly)
HIGHLIGHT = {
    "resolution": "settings.resolution",
    "fps": "settings.fps",
    "codec_full": "settings.codec_full",
}

BITRATE_KEYS = [
    "settings.bitrate",
    "settings.maxBitrateKbps",
    "settings.avgBitrateKbps",
    "settings.bandwidth_floor",
    "settings.bandwidth_target",
    "settings.bandwidth_max",
    "headerOverrides.X-APE-BITRATE",
    "headerOverrides.X-APE-TARGET-BITRATE",
    "headerOverrides.X-Stream-Bitrate",
    "vlcopt.adaptive-maxbitrate",
    "vlcopt.adaptive-initial-bandwidth",
    "kodiprop.inputstream.adaptive.max_bitrate",
    "kodiprop.inputstream.adaptive.min_bandwidth",
]


def load_tsv(path):
    rows = list(csv.reader(open(path, encoding="utf-8"), delimiter="\t"))[1:]
    return [(r[0], r[1], r[2]) for r in rows if len(r) >= 3]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("rawdir")
    ap.add_argument("--out", required=True)
    args = ap.parse_args()
    raw = os.path.abspath(args.rawdir)

    inv = json.load(open(os.path.join(raw, "inventory.json"), encoding="utf-8"))

    def cells_of(prefix):
        p = os.path.join(raw, "sheets", prefix)
        return load_tsv(p)

    prof_cells = cells_of("06_6_NIVEL_2_PROFILES.tsv")
    rowmap = defaultdict(dict)
    for ref, kind, val in prof_cells:
        m = re.match(r"([A-Z]+)(\d+)$", ref)
        rowmap[int(m.group(2))][m.group(1)] = (kind, val)

    def section_of(row):
        for lo, hi, name in SECTIONS:
            if lo <= row <= hi:
                return name
        return None

    # collect key rows
    key_rows = []  # (row, key, section)
    for r in sorted(rowmap):
        a = rowmap[r].get("A")
        if not a:
            continue
        key = a[1].strip()
        if not key or key.startswith("--"):
            continue
        sec = section_of(r)
        if sec is None:
            continue
        key_rows.append((r, key, sec))

    profiles = {p: {"id": {"value": p, "cell": f"{SHEET}!{COLS[i]}7"}} for i, p in enumerate(PROFILES)}
    # id/name/level come from the META block rows 7..12
    for i, p in enumerate(PROFILES):
        c = COLS[i]
        for r, field in ((7, "id"), (8, "name"), (9, "level"), (10, "quality"), (12, "color")):
            cell = rowmap.get(r, {}).get(c)
            profiles[p][field] = {
                "value": cell[1] if cell else None,
                "cell": f"{SHEET}!{c}{r}",
                "kind": cell[0] if cell else None,
            }

    for r, key, sec in key_rows:
        for i, p in enumerate(PROFILES):
            c = COLS[i]
            cell = rowmap[r].get(c)
            entry = {
                "value": cell[1] if cell else None,
                "cell": f"{SHEET}!{c}{r}",
                "kind": cell[0] if cell else None,
            }
            profiles[p].setdefault(sec, {})[key] = entry

    # highlighted aliases + bitrate bundle (same cells, no reinterpretation)
    for p in PROFILES:
        for alias, key in HIGHLIGHT.items():
            ent = profiles[p].get("settings", {}).get(key)
            profiles[p][alias] = dict(ent) if ent else {"value": None, "cell": None, "kind": None}
        profiles[p]["bitrate"] = {
            k: dict(profiles[p]["settings"].get(k) or profiles[p]["headerOverrides"].get(k)
                    or profiles[p]["vlcopt"].get(k) or profiles[p]["kodiprop"].get(k)
                    or profiles[p]["flatAliases"].get(k)
                    or {"value": None, "cell": None, "kind": None})
            for k in BITRATE_KEYS
        }

    # ---- 8_CODEC_LADDER ----
    ladder_cells = cells_of("54_8_CODEC_LADDER.tsv")
    ladder_rows = defaultdict(dict)
    for ref, kind, val in ladder_cells:
        m = re.match(r"([A-Z]+)(\d+)$", ref)
        ladder_rows[int(m.group(2))][m.group(1)] = (kind, val)
    header = {c: v[1] for c, v in ladder_rows.get(1, {}).items()}
    ladder = {}
    for r in sorted(ladder_rows):
        if r == 1:
            continue
        pid = ladder_rows[r].get("A", ("", f"row{r}"))[1]
        ladder[pid] = {header.get(c, c): {"value": v[1], "cell": f"8_CODEC_LADDER!{c}{r}", "kind": v[0]}
                       for c, v in ladder_rows[r].items() if c != "A"}

    # ---- 5_NIVEL_1_HEADER ----
    n1 = defaultdict(dict)
    for ref, kind, val in cells_of("07_5_NIVEL_1_HEADER.tsv"):
        m = re.match(r"([A-Z]+)(\d+)$", ref)
        n1[int(m.group(2))][m.group(1)] = (kind, val)
    nivel1 = []
    for r in sorted(n1):
        d = n1[r].get("B")
        if not (d and d[1].startswith("#")):
            continue
        vcell = n1[r].get("C")
        nivel1.append({
            "directive": d[1],
            "value": vcell[1] if vcell else None,
            "kind": vcell[0] if vcell else None,
            "included": (n1[r].get("A", ("", ""))[1] or "").strip().upper() == "X",
            "cellDirective": f"5_NIVEL_1_HEADER!B{r}",
            "cellValue": f"5_NIVEL_1_HEADER!C{r}",
            "cellInclude": f"5_NIVEL_1_HEADER!A{r}",
        })

    # ---- 7_NIVEL_3_CHANNEL ----
    n3 = defaultdict(dict)
    for ref, kind, val in cells_of("08_7_NIVEL_3_CHANNEL.tsv"):
        m = re.match(r"([A-Z]+)(\d+)$", ref)
        n3[int(m.group(2))][m.group(1)] = (kind, val)
    nivel3 = []
    for r in sorted(n3):
        capa = n3[r].get("B")
        tag = n3[r].get("C")
        if not capa or capa[1].startswith("--"):
            continue
        v = n3[r].get("D")
        nivel3.append({
            "layer": capa[1],
            "key": tag[1] if tag else None,
            "value": v[1] if v else None,
            "kind": v[0] if v else None,
            "included": (n3[r].get("A", ("", ""))[1] or "").strip().upper() == "X",
            "notes": (n3[r].get("F") or ("", None))[1],
            "cellLayer": f"7_NIVEL_3_CHANNEL!B{r}",
            "cellValue": f"7_NIVEL_3_CHANNEL!D{r}",
        })

    out = {
        "schema": "excel-profiles-extract/1.0",
        "generatedBy": "audit/alignment/2026-10-25/10-excel/tools/build_profiles_extract.py",
        "provenance": {
            "file": inv["source"],
            "sha256": inv["source"]["sha256"],
            "sizeBytes": inv["source"]["sizeBytes"],
            "mtimeUtc": inv["source"]["mtimeUtc"],
            "readCopySha256": inv["readCopy"]["sha256"],
            "readCopyMatchesSource": inv["readCopy"]["matchesSource"],
            "method": "OOXML read via zipfile+ElementTree over a byte-identical temp copy; Excel never opened, no COM, no macros run",
        },
        "sheet": SHEET,
        "sheetDimension": next(s["dimension"] for s in inv["sheets"] if s["name"] == SHEET),
        "layout": {
            "transposed": True,
            "columnA": "attribute key (prefix namespaces settings./vlcopt./kodiprop./headerOverrides./prefetch_config./hlsjs./bounds./opt./prisma_*)",
            "columnsBtoG": PROFILES,
            "sections": [{"rows": [lo, hi], "name": name} for lo, hi, name in SECTIONS],
        },
        "valueSemantics": {
            "value": "literal cell text as stored (shared string, inline string, number text or boolean 0/1)",
            "null": "cell absent in the sheet",
            "kind": "S=sharedString INLINE=inlineStr N=numeric B=boolean STR=cached formula string",
        },
        "profiles": profiles,
        "codecLadder": {"sheet": "8_CODEC_LADDER", "header": header, "rows": ladder},
        "nivel1Header": {"sheet": "5_NIVEL_1_HEADER", "count": len(nivel1), "directives": nivel1},
        "nivel3Channel": {"sheet": "7_NIVEL_3_CHANNEL", "count": len(nivel3), "rows": nivel3},
        "hooks": {
            "note": "who reads what, measured from the VBA pulled out of the same file",
            "codecLadderNamedRanges": {
                "names": [f"PRISMA_CODEC_LADDER_P{i}" for i in range(6)],
                "refersTo": "8_CODEC_LADDER!$B$n:$F$n (n=2..7)",
                "consumer": "mod_PRISMA_CodecLadder_Read.bas -> GetCodecLadder/ValidateCodecLadder/DoctrineCheck_P5_NoAdvanced",
            },
            "profilesConsumer": {
                "module": "mod_PRISMA_Export.bas",
                "constant": 'SHEET_PROFILES = "6_NIVEL_2_PROFILES"',
                "exports": [
                    "profile_boost_multipliers.json (filas prisma_* x cols B-G)",
                    "floor_lock (15_FLOOR_LOCK_CONFIG)",
                    "sentinel providers (16_SENTINEL_PROVIDERS)",
                    "telescope thresholds (17_TELESCOPE_THRESHOLDS)",
                    "channels DNA (33_CHANNELS_FROM_FRONTEND)",
                ],
            },
        },
    }

    with open(args.out, "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, indent=2)

    sizes = {p: sum(len(v) for k, v in profiles[p].items() if isinstance(v, dict)) for p in PROFILES}
    print(json.dumps({
        "out": args.out,
        "profiles": PROFILES,
        "directKeysPerProfile": sizes,
        "ladderProfiles": list(ladder),
        "nivel1": len(nivel1),
        "nivel3": len(nivel3),
    }, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
