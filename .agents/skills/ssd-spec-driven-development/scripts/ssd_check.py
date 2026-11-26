#!/usr/bin/env python3
"""Validador mínimo de un bundle SSD.

No implementa el flujo: comprueba que existen spec, plan y tareas, que los RF están
numerados en formato RF-n, que hay patrones EARS, que el plan referencia RF y que cada
tarea tiene RF + "Hecho cuando". Solo biblioteca estándar.

Uso:
  python ssd_check.py --feature specs/001-x
  python ssd_check.py --feature fixtures/valid --json
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

REQUIRED_FILES = ("spec.md", "plan.md", "tasks.md")
REQUIRED_SPEC_SECTIONS = (
    "contexto y objetivo",
    "usuarios / actores",
    "historias de usuario",
    "requisitos funcionales",
    "fuera de alcance",
    "criterios de finalización",
    "dudas abiertas",
)
REQUIRED_PLAN_SECTIONS = (
    "módulos",
    "decisiones",
    "estrategia de tests",
    "mapa rf",
)
EARS = re.compile(r"\b(CUANDO|MIENTRAS|SI\b|DONDE|EL SISTEMA)\b", re.IGNORECASE)
RF = re.compile(r"\bRF-\d+\b")
TASK = re.compile(r"^- \[[ xX]\]\s+(T\d+)\b", re.MULTILINE)
CHECKBOX = re.compile(r"^- \[[ xX]\]\s+(.+)$", re.MULTILINE)
TODO = re.compile(r"\b(TODO|TBD|FIXME)\b", re.IGNORECASE)


def heading_map(text: str) -> dict[str, str]:
    """Devuelve secciones ## por título normalizado y su cuerpo."""
    sections: dict[str, list[str]] = {}
    current: str | None = None
    for line in text.splitlines():
        if line.startswith("## "):
            current = line[3:].strip().lower()
            sections.setdefault(current, [])
        elif current is not None:
            sections[current].append(line)
    return {k: "\n".join(v).strip() for k, v in sections.items()}


def find_section(sections: dict[str, str], name: str) -> str | None:
    """Busca una sección por prefijo (acepta '## Requisitos funcionales (EARS)')."""
    for key, body in sections.items():
        if key == name or key.startswith(name + " ") or key.startswith(name + "("):
            return body
    return None


def check_feature(feature: Path) -> dict:
    errors: list[str] = []
    warnings: list[str] = []
    if not feature.is_dir():
        return {"ok": False, "feature": str(feature), "errors": ["feature_no_existe"], "warnings": []}

    for name in REQUIRED_FILES:
        if not (feature / name).is_file():
            errors.append(f"falta {name}")
    if errors:
        return {"ok": False, "feature": str(feature), "errors": errors, "warnings": warnings}

    spec = (feature / "spec.md").read_text(encoding="utf-8", errors="replace")
    plan = (feature / "plan.md").read_text(encoding="utf-8", errors="replace")
    tasks = (feature / "tasks.md").read_text(encoding="utf-8", errors="replace")

    if not spec.lstrip().startswith("# Spec"):
        errors.append("spec.md debe empezar por '# Spec'")
    spec_sections = heading_map(spec)
    for name in REQUIRED_SPEC_SECTIONS:
        if find_section(spec_sections, name) is None:
            errors.append(f"spec.md: falta sección '## {name}'")
    rf_found = sorted(set(RF.findall(spec)))
    if not rf_found:
        errors.append("spec.md: no hay RF-n")
    if not EARS.search(spec):
        errors.append("spec.md: no hay patrón EARS (CUANDO/MIENTRAS/SI/DONDE/EL SISTEMA)")
    if not (find_section(spec_sections, "requisitos funcionales") or "").strip():
        errors.append("spec.md: criterios funcionales vacíos")
    if not (find_section(spec_sections, "fuera de alcance") or "").strip():
        errors.append("spec.md: 'Fuera de alcance' vacío")
    if TODO.search(spec):
        warnings.append("spec.md contiene TODO/TBD/FIXME; debe ser una duda abierta explícita")

    plan_sections = heading_map(plan)
    for name in REQUIRED_PLAN_SECTIONS:
        if find_section(plan_sections, name) is None:
            errors.append(f"plan.md: falta sección '## {name}'")
    plan_rf = set(RF.findall(plan))
    missing_in_plan = sorted(set(rf_found) - plan_rf)
    if missing_in_plan:
        errors.append("plan.md no referencia: " + ", ".join(missing_in_plan))
    if not (find_section(plan_sections, "estrategia de tests") or "").strip():
        errors.append("plan.md: estrategia de tests vacía")

    task_matches = list(CHECKBOX.finditer(tasks))
    if not task_matches:
        errors.append("tasks.md: no hay tareas con checkbox")
    for i, match in enumerate(task_matches):
        start = match.start()
        end = task_matches[i + 1].start() if i + 1 < len(task_matches) else len(tasks)
        block = tasks[start:end]
        label = match.group(1)
        if not re.search(r"^- \[[ xX]\]\s+T\d+\b", block, re.MULTILINE):
            warnings.append(f"tasks.md: checkbox sin Tn: {label[:60]}")
        if not RF.search(block):
            errors.append(f"tasks.md: {label[:40]} no cita RF-n")
        if "hecho cuando:" not in block.lower():
            errors.append(f"tasks.md: {label[:40]} no tiene 'Hecho cuando:'")
    task_ids = TASK.findall(tasks)
    if not task_ids:
        errors.append("tasks.md: no hay tareas T1..Tn")

    return {
        "ok": not errors,
        "feature": str(feature),
        "rf": rf_found,
        "tasks": task_ids,
        "errors": errors,
        "warnings": warnings,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Valida un bundle SSD.")
    parser.add_argument("--feature", required=True, help="Directorio con spec.md, plan.md y tasks.md")
    parser.add_argument("--json", action="store_true", help="Salida JSON")
    args = parser.parse_args()
    result = check_feature(Path(args.feature))
    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        if result["ok"]:
            print(f"PASS ssd-check: {result['feature']} | rf={len(result['rf'])} | tareas={len(result['tasks'])}")
        else:
            print(f"FAIL ssd-check: {result['feature']}")
        for err in result["errors"]:
            print(f"  ERROR: {err}")
        for warn in result["warnings"]:
            print(f"  WARN: {warn}")
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
