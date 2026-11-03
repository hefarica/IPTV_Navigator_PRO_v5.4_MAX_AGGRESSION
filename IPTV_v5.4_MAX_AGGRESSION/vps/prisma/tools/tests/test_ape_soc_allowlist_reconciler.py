#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Tests del reconciliador de allowlist SoC (7 casos del contrato + 1 extra).

Todo ocurre en directorios temporales: **no se toca /etc, ni /var/lib, ni el
VPS**. Cada caso ejecuta el script real como subproceso para capturar su exit
code verdadero.

Uso:  python test_ape_soc_allowlist_reconciler.py
Exit: 0 si ningún caso FALLA (los SKIP se declaran), 1 si alguno falla.
"""

from __future__ import annotations

import importlib.util
import json
import os
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
TOOL = os.path.abspath(os.path.join(HERE, "..", "ape_soc_allowlist_reconciler.py"))

RESULTS: list[tuple[str, str, str]] = []  # (name, status, detail)


def record(name: str, status: str, detail: str = "") -> None:
    RESULTS.append((name, status, detail))
    print(f"  [{status:4}] {name}" + (f" :: {detail}" if detail else ""))


def run_tool(workdir: str, seen_lines: list[str], extra: list[str] | None = None,
             seen_name: str = "soc_seen.jsonl") -> tuple[int, dict | None, str]:
    """Ejecuta el tool en un workdir aislado. Devuelve (exit, doc, stdout+stderr)."""
    seen = os.path.join(workdir, seen_name)
    with open(seen, "w", encoding="utf-8") as fh:
        for line in seen_lines:
            fh.write(line + "\n")
    out = os.path.join(workdir, "etc", "ape_soc_allowlist.json")
    cur = os.path.join(workdir, "etc", "soc_needs_curation.txt")
    lock = os.path.join(workdir, "etc", ".lock")
    cmd = [sys.executable, TOOL, "--seen", seen, "--out", out,
           "--curation", cur, "--lock", lock, "--quiet"] + (extra or [])
    env = dict(os.environ)
    env["PYTHONIOENCODING"] = "utf-8"
    proc = subprocess.run(cmd, capture_output=True, text=True,
                          encoding="utf-8", errors="replace", env=env)
    doc = None
    if os.path.exists(out):
        try:
            with open(out, "r", encoding="utf-8") as fh:
                doc = json.load(fh)
        except ValueError:
            doc = None
    return proc.returncode, doc, (proc.stdout + proc.stderr).strip()


def new_workdir(tag: str) -> str:
    return tempfile.mkdtemp(prefix=f"ape_soc_{tag}_")


def line(soc: str, dev: str, ts: str) -> str:
    return json.dumps({"soc": soc, "device_id": dev, "ts": ts})


# ───────────────────────────── casos ─────────────────────────────────────────
def case_a_new_soc_quarantine() -> None:
    wd = new_workdir("a")
    try:
        rc, doc, log = run_tool(wd, [line("amlogic-x99-desconocido", "dev-1", "2026-10-28T10:00:00Z")],
                               extra=["--now", "2026-10-28T12:00:00Z"])
        if rc != 0 or not doc:
            return record("a) SoC nuevo → cuarentena", "FAIL", f"exit={rc} log={log[:200]}")
        e = doc["socs"].get("amlogic-x99-desconocido")
        cur = os.path.join(wd, "etc", "soc_needs_curation.txt")
        cur_ok = os.path.exists(cur) and "amlogic-x99-desconocido" in open(cur, encoding="utf-8").read()
        ok = bool(e) and e["sr"] == 0 and e["vpp"] == "unknown" and e["state"] == "quarantine" and cur_ok
        record("a) SoC nuevo → cuarentena", "PASS" if ok else "FAIL",
               f"sr={e and e['sr']} vpp={e and e['vpp']} state={e and e['state']} curation={cur_ok}")
        return
    finally:
        shutil.rmtree(wd, ignore_errors=True)


def case_b_three_devices_promote() -> None:
    wd = new_workdir("b")
    try:
        seen = [line("s905x5", f"dev-{i}", f"2026-10-28T0{i}:00:00Z") for i in (1, 2, 3)]
        rc, doc, log = run_tool(wd, seen, extra=["--now", "2026-10-28T12:00:00Z"])
        if rc != 0 or not doc:
            return record("b) 3 devices familia SR → sr=1", "FAIL", f"exit={rc} log={log[:200]}")
        e = doc["socs"]["s905x5"]
        ok = e["sr"] == 1 and e["state"] == "confirmed" and e["vpp"] == "aisr" and len(e["devices"]) == 3 and e["sr_levels"]
        record("b) 3 devices familia SR → sr=1", "PASS" if ok else "FAIL",
               f"sr={e['sr']} vpp={e['vpp']} devices={len(e['devices'])} levels={e['sr_levels']}")
        return
    finally:
        shutil.rmtree(wd, ignore_errors=True)


def case_c_two_devices_no_promotion() -> None:
    wd = new_workdir("c")
    try:
        seen = [line("s905x5m", f"dev-{i}", "2026-10-28T01:00:00Z") for i in (1, 2)]
        rc, doc, log = run_tool(wd, seen, extra=["--now", "2026-10-28T12:00:00Z"])
        if rc != 0 or not doc:
            return record("c) 2 devices → no promoción", "FAIL", f"exit={rc} log={log[:200]}")
        e = doc["socs"]["s905x5m"]
        ok = e["sr"] == 0 and e["state"] == "quarantine" and len(e["devices"]) == 2
        record("c) 2 devices → no promoción", "PASS" if ok else "FAIL",
               f"sr={e['sr']} state={e['state']} devices={len(e['devices'])}")
        return
    finally:
        shutil.rmtree(wd, ignore_errors=True)


def case_d_pq_without_sr() -> None:
    wd = new_workdir("d")
    try:
        rc, doc, log = run_tool(wd, [line("s905x4", "onn-1", "2026-10-28T02:00:00Z")],
                               extra=["--now", "2026-10-28T12:00:00Z"])
        if rc != 0 or not doc:
            return record("d) PQ sin AI-SR → tradicional", "FAIL", f"exit={rc} log={log[:200]}")
        e = doc["socs"]["s905x4"]
        ok = e["sr"] == 0 and e["state"] == "confirmed" and e["vpp"] == "tradicional"
        record("d) PQ sin AI-SR → tradicional", "PASS" if ok else "FAIL",
               f"sr={e['sr']} state={e['state']} vpp={e['vpp']} note='{e['note'][:40]}'")
        return
    finally:
        shutil.rmtree(wd, ignore_errors=True)


def case_e_corrupt_json_no_overwrite() -> None:
    wd = new_workdir("e")
    try:
        etc = os.path.join(wd, "etc")
        os.makedirs(etc, exist_ok=True)
        out = os.path.join(etc, "ape_soc_allowlist.json")
        garbage = '{"version": 2, "socs": { ESTO NO ES JSON'
        with open(out, "w", encoding="utf-8") as fh:
            fh.write(garbage)
        before = open(out, "rb").read()
        rc, doc, log = run_tool(wd, [line("s905x4", "d1", "2026-10-28T03:00:00Z")],
                               extra=["--now", "2026-10-28T12:00:00Z"])
        after = open(out, "rb").read()
        ok = rc == 10 and before == after
        record("e) JSON corrupto → no pisa y error", "PASS" if ok else "FAIL",
               f"exit={rc} intacto={before == after} log={log[:120]}")
        return
    finally:
        shutil.rmtree(wd, ignore_errors=True)


def case_f_lock_concurrency() -> None:
    wd = new_workdir("f")
    try:
        spec = importlib.util.spec_from_file_location("recon", TOOL)
        mod = importlib.util.module_from_spec(spec)  # type: ignore[arg-type]
        spec.loader.exec_module(mod)  # type: ignore[union-attr]
        lock_path = os.path.join(wd, "etc", ".lock")
        os.makedirs(os.path.dirname(lock_path), exist_ok=True)
        backend = mod._lock_backend(lock_path)
        if backend == "none":
            return record("f) concurrencia/lock", "SKIP", "host sin fcntl/msvcrt: sin lock real")
        with mod._Lock(lock_path):
            rc, _doc, log = run_tool(wd, [line("s905x4", "d1", "2026-10-28T04:00:00Z")],
                                     extra=["--now", "2026-10-28T12:00:00Z"])
        ok = rc == 11
        record("f) concurrencia/lock", "PASS" if ok else "FAIL",
               f"backend={backend} exit_concurrente={rc} (esperado 11)")
        return
    finally:
        shutil.rmtree(wd, ignore_errors=True)


def case_g_idempotency() -> None:
    wd = new_workdir("g")
    try:
        seen = [line("s905x5", f"dev-{i}", "2026-10-28T05:00:00Z") for i in (1, 2, 3)] + \
               [line("s905x4", "onn-1", "2026-10-28T05:10:00Z")] + \
               [line("raro-1", "dev-x", "2026-10-28T05:20:00Z")]
        rc1, doc1, _ = run_tool(wd, seen, extra=["--now", "2026-10-28T12:00:00Z"])
        rc2, doc2, _ = run_tool(wd, seen, extra=["--now", "2026-10-28T12:05:00Z"])
        if rc1 != 0 or rc2 != 0 or not doc1 or not doc2:
            return record("g) idempotencia", "FAIL", f"exits={rc1},{rc2}")
        d1 = dict(doc1); d2 = dict(doc2)
        d1.pop("updated", None); d2.pop("updated", None)
        ok = d1 == d2
        record("g) idempotencia (2 pasadas = mismo archivo salvo updated)", "PASS" if ok else "FAIL",
               f"iguales_sin_updated={ok} socs={len(doc1['socs'])}")
        return
    finally:
        shutil.rmtree(wd, ignore_errors=True)


def case_h_nothing_is_deleted() -> None:
    wd = new_workdir("h")
    try:
        rc1, doc1, _ = run_tool(wd, [line("s905x5", f"dev-{i}", "2026-10-28T06:00:00Z") for i in (1, 2, 3)],
                                extra=["--now", "2026-10-28T12:00:00Z"])
        rc2, doc2, _ = run_tool(wd, [line("otro-soc", "dev-z", "2026-10-28T07:00:00Z")],
                                extra=["--now", "2026-10-28T12:10:00Z"])
        if rc1 != 0 or rc2 != 0 or not doc2:
            return record("h) nada se borra (extra)", "FAIL", f"exits={rc1},{rc2}")
        ok = "s905x5" in doc2["socs"] and doc2["socs"]["s905x5"]["sr"] == 1 and "otro-soc" in doc2["socs"]
        bak = os.path.exists(os.path.join(wd, "etc", "ape_soc_allowlist.json.bak"))
        record("h) nada se borra + .bak (extra)", "PASS" if (ok and bak) else "FAIL",
               f"s905x5_conservado={ok} sr={doc2['socs'].get('s905x5', {}).get('sr')} bak={bak}")
        return
    finally:
        shutil.rmtree(wd, ignore_errors=True)


def main() -> int:
    if not os.path.exists(TOOL):
        print(f"FATAL: no existe el tool en {TOOL}")
        return 1
    try:  # consola cp1252 en Windows: forzar UTF-8 con reemplazo
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[attr-defined]
    except Exception:
        pass
    print(f"TOOL = {TOOL}")
    print(f"PY   = {sys.version.split()[0]}")
    print(f"OS   = {sys.platform}")
    print("-" * 78)
    for fn in (case_a_new_soc_quarantine, case_b_three_devices_promote,
               case_c_two_devices_no_promotion, case_d_pq_without_sr,
               case_e_corrupt_json_no_overwrite, case_f_lock_concurrency,
               case_g_idempotency, case_h_nothing_is_deleted):
        fn()
    print("-" * 78)
    passed = sum(1 for _, s, _ in RESULTS if s == "PASS")
    failed = sum(1 for _, s, _ in RESULTS if s == "FAIL")
    skipped = sum(1 for _, s, _ in RESULTS if s == "SKIP")
    print(f"TOTAL={len(RESULTS)} PASS={passed} FAIL={failed} SKIP={skipped}")
    print("RESULT=" + ("FAIL" if failed else "OK"))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
