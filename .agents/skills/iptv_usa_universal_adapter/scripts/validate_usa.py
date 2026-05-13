#!/usr/bin/env python3
"""
validate_usa.py v2.0 vNext — Validacion unificada del motor USA + scoring engine

Uso:
    python validate_usa.py --mode precheck <generador.js>
    python validate_usa.py --mode integration <generador.js>
    python validate_usa.py --mode audit <lista.m3u8>
    python validate_usa.py --mode full <generador.js> [lista.m3u8]

Modos:
    precheck    — Verifica que el generador tiene los anchors necesarios para integracion
    integration — Verifica que las 5 funciones USA criticas existen post-integracion
    audit       — Auditoria de lista M3U8 (delega a audit_m3u8_structure.py)
    full        — Diagnostico completo: generador + lista opcional

Score: 0-100
    < 70  → RECHAZAR
    70-85 → ACEPTAR_CON_RIESGO
    > 85  → PRODUCCION
"""

import sys
import re
import os
import json


def validate_precheck(js_path):
    """Verifica que el generador tiene los anchors para integracion USA."""
    if not os.path.exists(js_path):
        return {"score": 0, "nivel": "RECHAZAR", "error": "FILE_NOT_FOUND"}

    with open(js_path, encoding='utf-8', errors='ignore') as f:
        src = f.read()

    anchors = {
        "buildChannelUrl": "function buildChannelUrl(" in src,
        "preferHttps_return": "return preferHttps(" in src or "buildUniversalUrl" in src,
        "primaryUrl_typeof": "let primaryUrl = (typeof buildChannelUrl" in src or "primaryUrl = buildUniversalUrl" in src,
        "extvlcopt_network_caching": "network-caching=" in src,
        "kodiprop_buffer_live": "buffer_live_delay" in src,
        "generateChannelEntry": "function generateChannelEntry" in src or "generateChannelEntry" in src,
    }

    found = sum(1 for v in anchors.values() if v)
    total = len(anchors)
    score = int((found / total) * 100)

    results = []
    for name, ok in anchors.items():
        results.append({"anchor": name, "found": ok})

    nivel = "PRODUCCION" if score >= 85 else ("ACEPTAR_CON_RIESGO" if score >= 70 else "RECHAZAR")
    return {"mode": "precheck", "score": score, "nivel": nivel, "anchors": results, "found": found, "total": total}


def validate_integration(js_path):
    """Verifica que las 5 funciones USA criticas existen post-integracion."""
    if not os.path.exists(js_path):
        return {"score": 0, "nivel": "RECHAZAR", "error": "FILE_NOT_FOUND"}

    with open(js_path, encoding='utf-8', errors='ignore') as f:
        src = f.read()

    critical = {
        "detectServerFingerprint": "function detectServerFingerprint(" in src,
        "buildUniversalUrl": "function buildUniversalUrl(" in src,
        "getUSADirectiveOverrides": "function getUSADirectiveOverrides(" in src,
        "usaOverrides_extvlcopt": "_usaOverrides.extvlcopt" in src,
        "usaOverrides_kodiprop": "_usaOverrides.kodiprop" in src,
    }

    # Checks adicionales
    extra = {
        "USA_SERVER_TYPE": "USA_SERVER_TYPE" in src,
        "USA_EXT_MAP": "USA_EXT_MAP" in src,
        "applyUSAOverrides": "applyUSAOverrides" in src,
        "buildUniversalUrl_called": bool(re.search(r'primaryUrl\s*=\s*buildUniversalUrl\s*\(', src)),
        "semaphore_frontcdn": "__APE_FRONTCDN_RESOLVING__" in src,
    }

    critical_found = sum(1 for v in critical.values() if v)
    extra_found = sum(1 for v in extra.values() if v)

    # Score: criticas valen 70%, extras 30%
    score = int((critical_found / len(critical)) * 70 + (extra_found / len(extra)) * 30)

    nivel = "PRODUCCION" if score >= 85 else ("ACEPTAR_CON_RIESGO" if score >= 70 else "RECHAZAR")

    return {
        "mode": "integration",
        "score": score,
        "nivel": nivel,
        "critical": {k: v for k, v in critical.items()},
        "critical_found": critical_found,
        "critical_total": len(critical),
        "extra": {k: v for k, v in extra.items()},
        "extra_found": extra_found,
        "extra_total": len(extra),
    }


def validate_full(js_path, m3u8_path=None):
    """Diagnostico completo: generador + lista opcional."""
    results = {"mode": "full", "generador": {}, "lista": None, "score": 0, "nivel": "RECHAZAR"}

    if not os.path.exists(js_path):
        results["error"] = "JS_NOT_FOUND"
        return results

    with open(js_path, encoding='utf-8', errors='ignore') as f:
        src = f.read()

    # -- Analisis del generador --
    gen = {}

    # Versiones
    versions = list(set(re.findall(r"(?:const VERSION|//.*v)\s*=?\s*['\"]([0-9]+\.[0-9]+[^'\"]*)['\"]", src)))
    gen["versions"] = versions
    gen["version_unified"] = len(versions) <= 1

    # Capas
    gen["capas"] = {
        "A_EXTHTTP": "#EXTHTTP" in src,
        "B_Cookie": bool(re.search(r'"Cookie"\s*:', src)),
        "C_JWT_real": bool(re.search(r'generateJWT68Fields.*iss.*iat', src, re.DOTALL)),
        "D_KODIPROP": "inputstream.adaptive.stream_headers" in src,
        "E_OVERFLOW": "APE-OVERFLOW-HEADERS" in src,
        "F_APE_TAGS": "#EXT-X-APE-" in src,
    }
    capas_activas = sum(1 for v in gen["capas"].values() if v)

    # Bugs
    bugs = []
    if re.search(r'primaryUrl\s*\+=.*ape_sid=', src):
        bugs.append({"id": "B5", "sev": "CRITICO", "msg": "ape_sid se agrega a URL"})
    if re.search(r'getTierUrl.*profile=', src) or re.search(r'&profile=.*tgtProfile', src):
        bugs.append({"id": "A7", "sev": "CRITICO", "msg": "Parameter Pollution &profile="})
    frontcdn_calls = len(re.findall(r'preResolveFrontCDNRedirects', src))
    if frontcdn_calls >= 2 and '__APE_FRONTCDN_RESOLVING__' not in src:
        bugs.append({"id": "A10", "sev": "CRITICO", "msg": f"FrontCDN x{frontcdn_calls} sin semaforo"})
    if 'buildUniversalUrl' in src and not re.search(r'primaryUrl\s*=\s*buildUniversalUrl\s*\(', src):
        bugs.append({"id": "D4", "sev": "CRITICO", "msg": "buildUniversalUrl nunca se llama"})
    if not re.search(r'generateJWT68Fields.*iss.*iat', src, re.DOTALL):
        bugs.append({"id": "D2", "sev": "CRITICO", "msg": "JWT stub — no real"})
    if "APE-OVERFLOW-HEADERS" not in src:
        bugs.append({"id": "D3", "sev": "CRITICO", "msg": "OVERFLOW nunca se emite"})

    gen["bugs"] = bugs
    gen["bugs_criticos"] = sum(1 for b in bugs if b["sev"] == "CRITICO")
    results["generador"] = gen

    # -- Scoring del generador --
    scores = {}
    scores["estabilidad"] = max(0, 100 - gen["bugs_criticos"] * 15)
    scores["calidad"] = int((capas_activas / 6) * 100)
    scores["coherencia"] = 100 if gen["version_unified"] else 50
    scores["completitud"] = 100 if "function detectServerFingerprint(" in src else 40

    # Latencia: no medible sin lista
    scores["latencia"] = 70  # default neutral

    gen_score = int(
        scores["estabilidad"] * 0.25 +
        scores["latencia"] * 0.15 +
        scores["calidad"] * 0.20 +
        scores["coherencia"] * 0.20 +
        scores["completitud"] * 0.20
    )

    # -- Lista M3U8 si se proporciona --
    lista_score = 0
    if m3u8_path and os.path.exists(m3u8_path):
        # Importar audit
        script_dir = os.path.dirname(os.path.abspath(__file__))
        audit_path = os.path.join(script_dir, 'audit_m3u8_structure.py')
        if os.path.exists(audit_path):
            import importlib.util
            spec = importlib.util.spec_from_file_location("audit", audit_path)
            audit_mod = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(audit_mod)
            audit_result = audit_mod.audit(m3u8_path, output_json=False)
            lista_score = audit_result.get("score", 0)
            results["lista"] = audit_result
        else:
            # Fallback: analisis basico
            with open(m3u8_path, encoding='utf-8', errors='ignore') as f:
                content = f.read()
            lista_score = 50
            if '#EXTINF' in content:
                lista_score += 10
            if 'APE-OVERFLOW-HEADERS' in content:
                lista_score += 20
            if 'ape_sid=' not in content:
                lista_score += 20
            results["lista"] = {"score": lista_score, "fallback_analysis": True}

    # -- Score final --
    if m3u8_path:
        final_score = int(gen_score * 0.6 + lista_score * 0.4)
    else:
        final_score = gen_score

    results["score"] = final_score
    results["detalles_score"] = scores
    results["nivel"] = "PRODUCCION" if final_score >= 85 else ("ACEPTAR_CON_RIESGO" if final_score >= 70 else "RECHAZAR")

    return results


def main():
    import argparse
    parser = argparse.ArgumentParser(description='Validacion USA vNext')
    parser.add_argument('--mode', required=True, choices=['precheck', 'integration', 'audit', 'full'])
    parser.add_argument('files', nargs='+', help='Archivos a validar')
    parser.add_argument('--json', action='store_true', help='Output JSON')
    args = parser.parse_args()

    if args.mode == 'precheck':
        result = validate_precheck(args.files[0])
    elif args.mode == 'integration':
        result = validate_integration(args.files[0])
    elif args.mode == 'audit':
        script_dir = os.path.dirname(os.path.abspath(__file__))
        audit_path = os.path.join(script_dir, 'audit_m3u8_structure.py')
        if os.path.exists(audit_path):
            import importlib.util
            spec = importlib.util.spec_from_file_location("audit", audit_path)
            audit_mod = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(audit_mod)
            result = audit_mod.audit(args.files[0], output_json=args.json)
        else:
            result = {"error": "audit_m3u8_structure.py not found", "score": 0}
    elif args.mode == 'full':
        m3u8 = args.files[1] if len(args.files) > 1 else None
        result = validate_full(args.files[0], m3u8)

    if args.json or args.mode != 'audit':
        print(json.dumps(result, indent=2, ensure_ascii=False))

    score = result.get("score", 0)
    sys.exit(0 if score >= 70 else 1)


if __name__ == '__main__':
    main()
