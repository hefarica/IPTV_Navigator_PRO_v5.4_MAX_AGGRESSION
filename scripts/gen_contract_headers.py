#!/usr/bin/env python3
"""I17 — derive the contract header list from the SSOT and emit a JS constant.
The generated file is the only place the names are materialized for the browser.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTRACT = ROOT / "contracts" / "continuity.contract.json"
OUT = ROOT / "IPTV_v5.4_MAX_AGGRESSION" / "frontend" / "js" / "ape-v9" / "headers-contract.js"


def main() -> int:
    contract = json.loads(CONTRACT.read_text(encoding="utf-8"))
    headers = contract.get("headers") or []
    if not headers or len(headers) != len(set(headers)):
        raise SystemExit("FAIL contract headers empty or duplicated")
    body = json.dumps(headers, separators=(",", ":"), ensure_ascii=False)
    OUT.write_text(
        "/* Generated from contracts/continuity.contract.json by scripts/gen_contract_headers.py. */\n"
        "window.APE_CONTRACT_HEADERS = Object.freeze(" + body + ");\n",
        encoding="utf-8",
    )
    print(f"OK headers={len(headers)} output={OUT}")
    print("HEADERS=" + ",".join(headers))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
