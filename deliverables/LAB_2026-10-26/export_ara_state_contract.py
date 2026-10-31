#!/usr/bin/env python3
"""I16 — export ARA state/cursor rows with columns derived from the contract.

Never edits the certified .xlsm. Writes a separate .xlsx with:
  ara_state_fields + cursor.<fields> (prefixed cursor_)
Input: JSON list of row objects; missing required columns fail closed.
"""
import argparse
import json
import sys
from pathlib import Path

try:
    from openpyxl import Workbook
except ImportError:
    print("FAIL openpyxl_missing", file=sys.stderr)
    sys.exit(2)

ROOT = Path(__file__).resolve().parents[2]
CONTRACT = ROOT / "contracts" / "continuity.contract.json"


def header_from_contract(contract: dict) -> list[str]:
    state = list(contract.get("ara_state_fields") or [])
    cursor = list((contract.get("cursor") or {}).get("fields") or [])
    if not state or not cursor:
        raise ValueError("contract_missing_ara_state_fields_or_cursor_fields")
    return state + ["cursor_" + f for f in cursor]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True, help="JSON list of rows")
    ap.add_argument("--output", required=True, help="output .xlsx")
    args = ap.parse_args()

    contract = json.loads(CONTRACT.read_text(encoding="utf-8"))
    headers = header_from_contract(contract)
    rows = json.loads(Path(args.input).read_text(encoding="utf-8"))
    if not isinstance(rows, list) or not rows:
        print("FAIL rows_empty", file=sys.stderr)
        return 2

    wb = Workbook()
    ws = wb.active
    ws.title = "ARA_STATE"
    ws.append(headers)
    for i, row in enumerate(rows, start=2):
        if not isinstance(row, dict):
            print(f"FAIL row_{i}_not_object", file=sys.stderr)
            return 2
        missing = [h for h in headers if h not in row]
        if missing:
            print(f"FAIL row_{i}_missing={missing}", file=sys.stderr)
            return 2
        ws.append([row[h] for h in headers])

    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    wb.save(out)
    print(f"OK rows={len(rows)} cols={len(headers)} output={out}")
    print("HEADERS=" + ",".join(headers))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
