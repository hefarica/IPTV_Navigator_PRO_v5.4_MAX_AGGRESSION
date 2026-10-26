#!/usr/bin/env python3
"""
extract_lab_ssot.py — ZIP/XML forensic extraction of the APE LAB .xlsm SSOT.

READ-ONLY GUARANTEE
-------------------
* Never opens Excel, never uses COM, never runs macros.
* The source .xlsm is only READ to compute its SHA-256 and to copy it byte-for-byte
  into a private temp directory; every parse happens against that temp COPY
  (per t4 mandate: "preferir copia a temp + lectura").
* Writes go ONLY to the caller-provided output directory and the temp dir.
* The temp copy is deleted at the end (keep with --keep-temp for debugging).

WHAT IT PRODUCES
----------------
inventory.json          file identity (sha256, size, mtime), sheet graph
                        (name, sheetId, visibility, target part, dimension,
                        real used range, cells, literals, formulas, merged
                        ranges, sheetProtection), VBA presence, docProps.
sheets/<n>_<name>.tsv   full literal dump: address, kind, value  (kind: S=shared
                        string, INLINE=inlineStr, N=number, B=bool, E=error,
                        STR=formula cache string) — one row per non-empty cell.
formulas/<n>_<name>.tsv address, formula text (only sheets that have formulas).
directives.json         per-sheet exact counts of M3U8/APE directive tokens.
sharedstrings.json      total count + per-string usage histogram summary.

USAGE
-----
  python extract_lab_ssot.py <source.xlsm> <out_dir> [--keep-temp]
"""

import argparse
import hashlib
import json
import os
import re
import shutil
import sys
import tempfile
import zipfile
import xml.etree.ElementTree as ET
from collections import Counter

NS_MAIN = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
NS_REL = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
NS_PKG_REL = "{http://schemas.openxmlformats.org/package/2006/relationships}"

# Tokens that carry the LAB->JSON->lista contract. Counted literally (case-sensitive)
# plus a few case-insensitive ones where the file is known to vary.
DIRECTIVE_TOKENS = [
    "#EXTM3U",
    "#EXTINF",
    "#EXTHTTP",
    "#EXTVLCOPT",
    "#KODIPROP",
    "#EXT-X-SESSION-DATA",
    "#EXT-X-STREAM-INF",
    "#EXT-X-MEDIA",
    "#EXT-X-VERSION",
    "#EXT-X-TARGETDURATION",
    "#EXTATTRFROMURL",
    "#EXT-X-VNOVA-LCEVC",
    "#EXT-X-APE-",
    "#EXT-X-PHANTOM-HYDRA",
    "X-APE-",
    "LCEVC",
    "CMCD",
    "dvh1",
    "hvc1",
    "hev1",
    "av01",
    "avc1",
    "VIDEO-RANGE",
    "SUPPLEMENTAL-CODECS",
    "HDCP-LEVEL",
]


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest().upper()


def col_to_num(col):
    n = 0
    for ch in col:
        n = n * 26 + (ord(ch) - 64)
    return n


def split_ref(ref):
    m = re.match(r"([A-Z]+)(\d+)$", ref)
    if not m:
        return None, None
    return m.group(1), int(m.group(2))


def safe_name(idx, name):
    s = re.sub(r"[^A-Za-z0-9._-]+", "_", name).strip("_")
    return f"{idx:02d}_{s}"


def load_shared_strings(z):
    """Return list of shared strings, each with all <t> runs concatenated."""
    out = []
    if "xl/sharedStrings.xml" not in z.namelist():
        return out
    with z.open("xl/sharedStrings.xml") as fh:
        for _, el in ET.iterparse(fh, events=("end",)):
            if el.tag == NS_MAIN + "si":
                parts = []
                for t in el.iter(NS_MAIN + "t"):
                    parts.append(t.text or "")
                out.append("".join(parts))
                el.clear()
                # iterparse root keeps children; safe enough for this size
    return out


def parse_sheet(z, part, shared, want_formulas=True):
    """Parse one worksheet part. Returns (cells, formulas, meta)."""
    cells = []       # (ref, kind, value)
    formulas = []    # (ref, formula_text)
    meta = {
        "dimension": None,
        "sheetProtection": None,
        "mergeCells": [],
        "autoFilter": None,
        "rowCount": 0,
        "colWidths": 0,
    }
    with z.open(part) as fh:
        for event, el in ET.iterparse(fh, events=("start", "end")):
            if event == "start":
                if el.tag == NS_MAIN + "dimension":
                    meta["dimension"] = el.get("ref")
                elif el.tag == NS_MAIN + "sheetProtection":
                    meta["sheetProtection"] = dict(el.attrib)
                continue

            tag = el.tag
            if tag == NS_MAIN + "c":
                ref = el.get("r")
                typ = el.get("t") or "n"
                f_el = el.find(NS_MAIN + "f")
                if f_el is not None and want_formulas:
                    formulas.append((ref, (f_el.text or "")))
                v_el = el.find(NS_MAIN + "v")
                is_el = el.find(NS_MAIN + "is")
                if is_el is not None:
                    val = "".join(t.text or "" for t in is_el.iter(NS_MAIN + "t"))
                    cells.append((ref, "INLINE", val))
                elif v_el is not None and v_el.text is not None:
                    raw = v_el.text
                    if typ == "s":
                        try:
                            cells.append((ref, "S", shared[int(raw)]))
                        except (ValueError, IndexError):
                            cells.append((ref, "S?", raw))
                    elif typ == "b":
                        cells.append((ref, "B", raw))
                    elif typ == "e":
                        cells.append((ref, "E", raw))
                    elif typ == "str":
                        cells.append((ref, "STR", raw))
                    else:
                        cells.append((ref, "N", raw))
                el.clear()
            elif tag == NS_MAIN + "mergeCell":
                ref = el.get("ref")
                if ref:
                    meta["mergeCells"].append(ref)
            elif tag == NS_MAIN + "autoFilter":
                meta["autoFilter"] = el.get("ref")
            elif tag == NS_MAIN + "row":
                meta["rowCount"] += 1
                el.clear()
    return cells, formulas, meta


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("source")
    ap.add_argument("outdir")
    ap.add_argument("--keep-temp", action="store_true")
    args = ap.parse_args()

    src = os.path.abspath(args.source)
    outdir = os.path.abspath(args.outdir)
    os.makedirs(outdir, exist_ok=True)
    os.makedirs(os.path.join(outdir, "sheets"), exist_ok=True)
    os.makedirs(os.path.join(outdir, "formulas"), exist_ok=True)

    src_sha = sha256_file(src)
    src_size = os.path.getsize(src)

    tmpdir = tempfile.mkdtemp(prefix="lab_ssot_ro_")
    copy_path = os.path.join(tmpdir, os.path.basename(src))
    shutil.copy2(src, copy_path)
    copy_sha = sha256_file(copy_path)

    try:
        z = zipfile.ZipFile(copy_path)
        names = z.namelist()

        # ---- workbook sheet graph -------------------------------------------
        wb_xml = z.read("xl/workbook.xml").decode("utf-8", "replace")
        rels_xml = z.read("xl/_rels/workbook.xml.rels").decode("utf-8", "replace")

        rel_map = {}
        for m in re.finditer(r'<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"', rels_xml):
            rel_map[m.group(1)] = m.group(2)

        sheets = []
        for m in re.finditer(r"<sheet\b([^>]*)/>", wb_xml):
            attrs = m.group(1)
            name = re.search(r'name="([^"]*)"', attrs)
            sid = re.search(r'sheetId="(\d+)"', attrs)
            rid = re.search(r'r:id="([^"]+)"', attrs)
            state = re.search(r'state="([^"]+)"', attrs)
            target = rel_map.get(rid.group(1)) if rid else None
            sheets.append(
                {
                    "name": name.group(1) if name else None,
                    "sheetId": int(sid.group(1)) if sid else None,
                    "rid": rid.group(1) if rid else None,
                    "state": state.group(1) if state else "visible",
                    "part": ("xl/" + target) if target else None,
                }
            )

        wb_protection = re.search(r"<workbookProtection\b([^>]*)/>", wb_xml)
        calc_pr = re.search(r"<calcPr\b([^>]*)/>", wb_xml)

        shared = load_shared_strings(z)
        sst_declared = None
        m = re.search(r'<sst[^>]*uniqueCount="(\d+)"', z.read("xl/sharedStrings.xml").decode("utf-8", "replace")) if "xl/sharedStrings.xml" in names else None
        if m:
            sst_declared = int(m.group(1))

        # ---- per-sheet extraction -------------------------------------------
        inventory_sheets = []
        directive_index = {}
        for i, sh in enumerate(sheets, start=1):
            entry = {
                "index": i,
                "name": sh["name"],
                "sheetId": sh["sheetId"],
                "state": sh["state"],
                "part": sh["part"],
                "bytes": None,
                "dimension": None,
                "usedRange": None,
                "rows": 0,
                "cols": 0,
                "cells": 0,
                "literals": 0,
                "formulas": 0,
                "mergedRanges": 0,
                "sheetProtection": None,
                "autoFilter": None,
                "dump": None,
                "formulaDump": None,
            }
            part = sh["part"]
            if part and part in names:
                try:
                    entry["bytes"] = z.getinfo(part).file_size
                    cells, formulas, meta = parse_sheet(z, part, shared)
                except Exception as exc:  # noqa: BLE001 — keep going, record why
                    entry["error"] = f"{type(exc).__name__}: {exc}"
                    inventory_sheets.append(entry)
                    continue

                max_col = 0
                max_row = 0
                for ref, _kind, _val in cells:
                    col, row = split_ref(ref or "")
                    if col:
                        max_col = max(max_col, col_to_num(col))
                        max_row = max(max_row, row)

                entry["dimension"] = meta["dimension"]
                entry["usedRange"] = (
                    f"R1C1:R{max_row}C{max_col}" if max_row or max_col else None
                )
                entry["rows"] = max_row
                entry["cols"] = max_col
                entry["cells"] = len(cells)
                entry["literals"] = sum(1 for _r, k, _v in cells if k in ("S", "INLINE", "N", "B", "STR"))
                entry["formulas"] = len(formulas)
                entry["mergedRanges"] = len(meta["mergeCells"])
                entry["sheetProtection"] = meta["sheetProtection"]
                entry["autoFilter"] = meta["autoFilter"]
                entry["rowElements"] = meta["rowCount"]

                base = safe_name(i, sh["name"] or "unnamed")
                dump_rel = os.path.join("sheets", base + ".tsv")
                with open(os.path.join(outdir, dump_rel), "w", encoding="utf-8", newline="") as fh:
                    fh.write("address\tkind\tvalue\n")
                    for ref, kind, val in cells:
                        fh.write(f"{ref}\t{kind}\t{val.replace(chr(9), ' ')}\n")
                entry["dump"] = dump_rel

                if formulas:
                    f_rel = os.path.join("formulas", base + ".tsv")
                    with open(os.path.join(outdir, f_rel), "w", encoding="utf-8", newline="") as fh:
                        fh.write("address\tformula\n")
                        for ref, f in formulas:
                            fh.write(f"{ref}\t{f.replace(chr(9), ' ')}\n")
                    entry["formulaDump"] = f_rel

                # ---- directive counts (per sheet) ---------------------------
                counts = Counter()
                occurrences = Counter()
                samples = {}
                for ref, _kind, val in cells:
                    if not isinstance(val, str):
                        continue
                    for tok in DIRECTIVE_TOKENS:
                        if tok in val:
                            counts[tok] += 1
                            occurrences[tok] += val.count(tok)
                            if tok not in samples:
                                samples[tok] = {"cell": ref, "value": val[:400]}
                directive_index[sh["name"]] = {
                    "cellsWithToken": dict(counts),
                    "tokenOccurrences": dict(occurrences),
                    "firstSample": samples,
                }
            inventory_sheets.append(entry)

        # ---- vba / package facts --------------------------------------------
        vba_parts = [n for n in names if re.search(r"vbaProject\.bin$", n)]
        vba_sig = [n for n in names if re.search(r"vbaProjectSignature\.bin$", n)]
        doc_props = {}
        for p in ("docProps/core.xml", "docProps/app.xml"):
            if p in names:
                doc_props[p] = z.read(p).decode("utf-8", "replace")

        inventory = {
            "source": {
                "path": src,
                "sha256": src_sha,
                "sizeBytes": src_size,
                "mtimeUtc": __import__("datetime").datetime.utcfromtimestamp(
                    os.path.getmtime(src)
                ).isoformat() + "Z",
            },
            "readCopy": {
                "path": copy_path,
                "sha256": copy_sha,
                "matchesSource": copy_sha == src_sha,
                "note": "parsed against this temp copy; source only read for hashing/copying",
            },
            "package": {
                "entries": len(names),
                "worksheetParts": len([n for n in names if re.match(r"xl/worksheets/sheet\d+\.xml$", n)]),
                "hasVba": bool(vba_parts),
                "vbaParts": vba_parts,
                "vbaSignatureParts": vba_sig,
                "hasCalcChain": "xl/calcChain.xml" in names,
                "hasComments": [n for n in names if n.startswith("xl/comments")],
                "hasDrawings": len([n for n in names if n.startswith("xl/drawings/")]),
            },
            "workbook": {
                "workbookProtection": wb_protection.group(1).strip() if wb_protection else None,
                "calcPr": calc_pr.group(1).strip() if calc_pr else None,
                "sharedStringsDeclaredUnique": sst_declared,
                "sharedStringsParsed": len(shared),
                "sheetCount": len(sheets),
                "hiddenSheets": [s["name"] for s in sheets if s["state"] != "visible"],
            },
            "sheets": inventory_sheets,
            "docProps": doc_props,
        }

        with open(os.path.join(outdir, "inventory.json"), "w", encoding="utf-8") as fh:
            json.dump(inventory, fh, ensure_ascii=False, indent=2)

        with open(os.path.join(outdir, "directives.json"), "w", encoding="utf-8") as fh:
            json.dump(directive_index, fh, ensure_ascii=False, indent=2)

        print(json.dumps({
            "ok": True,
            "sha256": src_sha,
            "size": src_size,
            "sheets": len(sheets),
            "vba": bool(vba_parts),
            "outdir": outdir,
        }, indent=2))
    finally:
        if args.keep_temp:
            print(f"[temp kept] {tmpdir}", file=sys.stderr)
        else:
            shutil.rmtree(tmpdir, ignore_errors=True)


if __name__ == "__main__":
    main()
