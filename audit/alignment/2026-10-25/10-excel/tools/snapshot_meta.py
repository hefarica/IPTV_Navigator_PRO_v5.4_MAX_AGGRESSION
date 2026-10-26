#!/usr/bin/env python3
"""
snapshot_meta.py — lightweight, read-only metadata comparison across LAB .xlsm snapshots.

For each path given, reports: SHA-256, size, mtime, sheet count + ordered names,
hidden/veryHidden sheets, per-sheet dimension, VBA part presence/size, sharedStrings
uniqueCount, workbookProtection, and whether the sheet set differs from the FIRST
file given (reference).

Never opens Excel, never writes outside stdout (optionally --json <out>).
"""
import argparse
import hashlib
import json
import os
import re
import zipfile
import xml.etree.ElementTree as ET

NS_MAIN = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for c in iter(lambda: fh.read(1 << 20), b""):
            h.update(c)
    return h.hexdigest().upper()


def meta(path):
    z = zipfile.ZipFile(path)
    names = z.namelist()
    wb = z.read("xl/workbook.xml").decode("utf-8", "replace")
    rels = z.read("xl/_rels/workbook.xml.rels").decode("utf-8", "replace")
    rel_map = dict(re.findall(r'Id="([^"]+)"[^>]*Target="([^"]+)"', rels))

    sheets = []
    for m in re.finditer(r"<sheet\b([^>]*)/>", wb):
        a = m.group(1)
        name = re.search(r'name="([^"]*)"', a)
        rid = re.search(r'r:id="([^"]+)"', a)
        state = re.search(r'state="([^"]+)"', a)
        target = rel_map.get(rid.group(1)) if rid else None
        part = "xl/" + target if target else None
        dim = None
        if part and part in names:
            with z.open(part) as fh:
                for _ev, el in ET.iterparse(fh, events=("start",)):
                    if el.tag == NS_MAIN + "dimension":
                        dim = el.get("ref")
                        break
        sheets.append({
            "name": name.group(1) if name else None,
            "state": state.group(1) if state else "visible",
            "dimension": dim,
        })

    sst = None
    if "xl/sharedStrings.xml" in names:
        m = re.search(r'<sst[^>]*uniqueCount="(\d+)"', z.read("xl/sharedStrings.xml").decode("utf-8", "replace"))
        sst = int(m.group(1)) if m else None

    vba = [n for n in names if n.endswith("vbaProject.bin")]
    prot = re.search(r"<workbookProtection\b([^>]*)/>", wb)
    return {
        "path": os.path.abspath(path),
        "sha256": sha256(path),
        "sizeBytes": os.path.getsize(path),
        "mtime": os.path.getmtime(path),
        "sheetCount": len(sheets),
        "sheets": sheets,
        "hidden": [s["name"] for s in sheets if s["state"] != "visible"],
        "vba": bool(vba),
        "vbaBytes": z.getinfo(vba[0]).file_size if vba else 0,
        "sharedStringsUnique": sst,
        "workbookProtection": prot.group(1).strip() if prot else None,
        "entries": len(names),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("files", nargs="+")
    ap.add_argument("--json")
    args = ap.parse_args()

    out = []
    ref_names = None
    for p in args.files:
        m = meta(p)
        names = [s["name"] for s in m["sheets"]]
        if ref_names is None:
            ref_names = names
            m["sheetSetDiffVsFirst"] = {"missing": [], "added": []}
        else:
            m["sheetSetDiffVsFirst"] = {
                "missing": [n for n in ref_names if n not in names],
                "added": [n for n in names if n not in ref_names],
            }
        out.append(m)

    if args.json:
        with open(args.json, "w", encoding="utf-8") as fh:
            json.dump(out, fh, ensure_ascii=False, indent=2)

    for m in out:
        print("=" * 100)
        print(os.path.basename(m["path"]))
        print(f"  sha256={m['sha256']}  size={m['sizeBytes']}  vba={m['vba']} ({m['vbaBytes']} B)"
              f"  sheets={m['sheetCount']}  sst={m['sharedStringsUnique']}  entries={m['entries']}")
        print(f"  hidden={m['hidden']}")
        if m["sheetSetDiffVsFirst"]["missing"] or m["sheetSetDiffVsFirst"]["added"]:
            print(f"  sheetSetDiff missing={m['sheetSetDiffVsFirst']['missing']} added={m['sheetSetDiffVsFirst']['added']}")


if __name__ == "__main__":
    main()
