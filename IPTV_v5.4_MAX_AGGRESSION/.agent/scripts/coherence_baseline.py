#!/usr/bin/env python3
"""
coherence_baseline.py — Compara dos scorecards (pre y post fix) y reporta delta.

Stage 1 del plan 2026-04-30-iptv-lista-coherence-fix. Pareja de
audit_lista_emitted.py: ejecutar ambos scripts sobre 2 listas (pre y post)
y luego pasar los JSONs aquí para ver mejoras + regresiones.

Usage:
    python coherence_baseline.py <pre.json> <post.json>

Exit codes:
    0  todas las regresiones <= 0 (no peor que baseline)
    2  hubo al menos 1 regression (peor que baseline en >= 1 check)
    1  args invalidos
"""
import json
import sys
from pathlib import Path


def main(argv):
    if len(argv) < 3:
        print("Usage: coherence_baseline.py <pre.json> <post.json>")
        sys.exit(1)

    try:
        pre = json.loads(Path(argv[1]).read_text(encoding="utf-8"))
        post = json.loads(Path(argv[2]).read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError) as e:
        print(f"Error reading scorecards: {e}")
        sys.exit(1)

    keys = sorted(set(pre.keys()) | set(post.keys()))
    print(f"{'':<2}{'Check':<42}{'PRE':>14}{'POST':>14}{'DELTA':>14}")
    print("-" * 86)

    regressions = 0
    improvements = 0
    unchanged = 0

    for k in keys:
        if k.startswith("TOTAL_"):
            continue
        a = int(pre.get(k, 0))
        b = int(post.get(k, 0))
        delta = b - a
        if delta < 0:
            improvements += 1
            marker = "OK"
        elif delta > 0:
            regressions += 1
            marker = "!!"
        else:
            unchanged += 1
            marker = ".."
        print(f"{marker} {k:<42}{a:>14}{b:>14}{delta:>+14}")

    print("-" * 86)
    pre_total = pre.get("TOTAL_CHANNELS", 0)
    post_total = post.get("TOTAL_CHANNELS", 0)
    print(f"   TOTAL_CHANNELS{'':<29}{pre_total:>14}{post_total:>14}{post_total - pre_total:>+14}")
    print()
    print(f"Improvements: {improvements} | Unchanged: {unchanged} | Regressions: {regressions}")

    sys.exit(0 if regressions == 0 else 2)


if __name__ == "__main__":
    main(sys.argv)
