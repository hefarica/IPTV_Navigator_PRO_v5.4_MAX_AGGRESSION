#!/usr/bin/env python3
"""
validate_pipeline.py v2.0 vNext — Validacion unificada del pipeline APE + scoring

Uso:
    python validate_pipeline.py <generador.js> [lista.m3u8] [--json]

Ejecuta diagnostico completo y retorna score 0-100.
Exit code: 0 si score >= 70, 1 si < 70.
"""

import sys
import os
import json

# Importar diagnose_pipeline del mismo directorio
script_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, script_dir)

from diagnose_pipeline import diagnose_generator, diagnose_m3u8, compute_score


def validate(js_path, m3u8_path=None, json_mode=False):
    all_issues = []
    js_info = None
    m3u8_info = None

    if not os.path.exists(js_path):
        result = {"score": 0, "nivel": "RECHAZAR", "error": "JS_NOT_FOUND"}
        if json_mode:
            print(json.dumps(result, indent=2))
        else:
            print(f"ERROR: {js_path} no encontrado")
        return result

    # Diagnosticar generador
    js_issues, js_info = diagnose_generator(js_path)
    all_issues.extend(js_issues)

    # Diagnosticar lista si se proporciona
    if m3u8_path and os.path.exists(m3u8_path):
        m3u8_issues, m3u8_info = diagnose_m3u8(m3u8_path)
        all_issues.extend(m3u8_issues)

    # Score
    score, nivel, scores = compute_score(all_issues, js_info)

    # Verificaciones adicionales de validacion
    validations = {
        "structural": True,
        "logical": True,
        "execution": True,
    }

    # Validacion estructural: generateChannelEntry existe
    with open(js_path, 'r', encoding='utf-8', errors='ignore') as f:
        src = f.read()
    if 'generateChannelEntry' not in src:
        validations["structural"] = False
        score = max(0, score - 30)

    # Validacion logica: no hay TARGETDURATION en Master Playlist
    if '#EXT-X-TARGETDURATION' in src and '#EXT-X-STREAM-INF' in src:
        # Podria ser un error RFC 8216
        has_media_seq = '#EXT-X-MEDIA-SEQUENCE' in src
        if has_media_seq:
            validations["logical"] = False
            score = max(0, score - 20)

    # Validacion de ejecucion: syntax check basico
    import subprocess
    try:
        result_check = subprocess.run(
            ['node', '-c', js_path],
            capture_output=True, text=True, timeout=10
        )
        validations["execution"] = result_check.returncode == 0
        if not validations["execution"]:
            score = max(0, score - 40)
    except (FileNotFoundError, subprocess.TimeoutExpired):
        validations["execution"] = None  # node no disponible

    nivel = "PRODUCCION" if score >= 85 else ("ACEPTAR_CON_RIESGO" if score >= 70 else "RECHAZAR")

    result = {
        "score": score,
        "nivel": nivel,
        "detalles_score": scores,
        "validations": validations,
        "issues_count": len(all_issues),
        "criticos": sum(1 for i in all_issues if i['sev'] == 'CRITICO'),
        "medios": sum(1 for i in all_issues if i['sev'] == 'MEDIO'),
        "cosmeticos": sum(1 for i in all_issues if i['sev'] == 'COSMETICO'),
        "capas": js_info.get('capas', {}) if js_info else {},
        "issues": all_issues,
    }

    if json_mode:
        print(json.dumps(result, indent=2, ensure_ascii=False))
    else:
        print("=" * 70)
        print("  PIPELINE VALIDATION v2.0 vNext")
        print("=" * 70)
        print(f"\n  Generador: {os.path.basename(js_path)}")
        if m3u8_path:
            print(f"  Lista: {os.path.basename(m3u8_path)}")
        print(f"\n  Problemas: {result['criticos']} criticos, {result['medios']} medios, {result['cosmeticos']} cosmeticos")
        print(f"\n  Validaciones:")
        for k, v in validations.items():
            st = "[OK]" if v else ("[FAIL]" if v is not None else "[N/A]")
            print(f"    {st} {k}")
        print(f"\n  Capas:")
        for k, v in result['capas'].items():
            print(f"    {'[OK]' if v else '[FAIL]'} {k}")
        print(f"\n{'=' * 70}")
        print(f"  SCORE: {score}/100 — {nivel}")
        for dim, val in scores.items():
            print(f"    {dim}: {val}/100")
        print("=" * 70)

    return result


if __name__ == '__main__':
    args = sys.argv[1:]
    json_mode = '--json' in args
    args = [a for a in args if not a.startswith('--')]
    if not args:
        print("Uso: python validate_pipeline.py <generador.js> [lista.m3u8] [--json]")
        sys.exit(1)
    m3u8 = args[1] if len(args) > 1 else None
    r = validate(args[0], m3u8, json_mode)
    sys.exit(0 if r.get("score", 0) >= 70 else 1)
