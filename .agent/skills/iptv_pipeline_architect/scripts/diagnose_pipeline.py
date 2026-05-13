#!/usr/bin/env python3
"""
diagnose_pipeline.py v2.0 vNext — Diagnostico forense del generador M3U8 APE

Uso:
    python diagnose_pipeline.py <generador.js> [lista.m3u8] [--json]

Salida:
    - Reporte de 13 bugs catalogados (B1-B6, A7-A13, D1-D6)
    - Estado de las 6 capas de transporte
    - Score de diagnostico (0-100)
    - Nivel: RECHAZAR / ACEPTAR_CON_RIESGO / PRODUCCION
"""

import re
import sys
import json
import os


def diagnose_generator(js_path):
    issues = []
    info = {}

    with open(js_path, 'r', encoding='utf-8', errors='ignore') as f:
        src = f.read()

    # --- VERSION ---
    versions = list(set(re.findall(r"(?:const VERSION|//.*v)\s*=?\s*['\"]([0-9]+\.[0-9]+[^'\"]*)['\"]", src)))
    info['versions_found'] = versions
    if len(versions) > 1:
        issues.append({'id': 'D6', 'sev': 'COSMETICO', 'msg': f'VERSION inconsistente: {versions}'})

    # --- Bug B5: parametros APE en URL ---
    if re.search(r'primaryUrl\s*\+=.*ape_sid=', src):
        issues.append({'id': 'B5', 'sev': 'CRITICO', 'msg': 'URL contaminada: ape_sid en primaryUrl'})
    if re.search(r'getTierUrl.*profile=', src) or re.search(r'&profile=.*tgtProfile', src):
        issues.append({'id': 'A7', 'sev': 'CRITICO', 'msg': 'Parameter Pollution: &profile= puede duplicarse'})

    # --- Bug A10: doble ejecucion FrontCDN ---
    frontcdn_calls = len(re.findall(r'preResolveFrontCDNRedirects', src))
    has_semaphore = '__APE_FRONTCDN_RESOLVING__' in src
    if frontcdn_calls >= 2 and not has_semaphore:
        issues.append({'id': 'A10', 'sev': 'CRITICO', 'msg': f'FrontCDN x{frontcdn_calls} sin semaforo'})

    # --- D1: dos pipelines EXTHTTP ---
    has_build_exthttp = 'build_exthttp' in src
    has_l2_exthttp = re.search(r'_httpPayload|_httpFunctional|L2.*EXTHTTP', src)
    if has_build_exthttp and has_l2_exthttp:
        issues.append({'id': 'D1', 'sev': 'CRITICO', 'msg': 'Dos pipelines EXTHTTP — ~440 headers descartados'})
    elif has_build_exthttp:
        issues.append({'id': 'D1', 'sev': 'MEDIO', 'msg': 'Solo build_exthttp() — verificar si L2 lo consume'})

    # --- D3: OVERFLOW nunca emitido ---
    if 'APE-OVERFLOW-HEADERS' not in src:
        issues.append({'id': 'D3', 'sev': 'CRITICO', 'msg': 'OVERFLOW nunca se emite — ~460 headers perdidos'})

    # --- D2: JWT stub ---
    jwt_stub = re.search(r'generateJWT68Fields\s*=.*=>\s*\{[^}]{0,80}\}', src)
    jwt_real = re.search(r'generateJWT68Fields.*iss.*iat.*exp', src, re.DOTALL)
    if jwt_stub and not jwt_real:
        issues.append({'id': 'D2', 'sev': 'CRITICO', 'msg': 'generateJWT68Fields() es stub — JWT falso'})

    # --- D4: buildUniversalUrl nunca se llama ---
    has_buu = 'buildUniversalUrl' in src
    buu_called = re.search(r'primaryUrl\s*=\s*buildUniversalUrl\s*\(', src)
    if has_buu and not buu_called:
        issues.append({'id': 'D4', 'sev': 'CRITICO', 'msg': 'buildUniversalUrl() existe pero nunca se llama'})

    # --- D5: funcion huerfana ---
    if '__getOmegaGodTierDirectives' in src:
        called = re.search(r'__getOmegaGodTierDirectives\s*\(', src.replace('function __getOmegaGodTierDirectives', ''))
        if not called:
            issues.append({'id': 'D5', 'sev': 'COSMETICO', 'msg': '__getOmegaGodTierDirectives() es codigo muerto'})

    # --- B6: extension hardcodeada ---
    if re.search(r"ext\s*=\s*['\"]ts['\"]", src) and not re.search(r'resolveStreamExtension|streamFormat', src):
        issues.append({'id': 'B6', 'sev': 'MEDIO', 'msg': "Extension '.ts' hardcodeada sin deteccion dinamica"})

    # --- Cookie en EXTHTTP ---
    has_cookie = bool(re.search(r'"Cookie"\s*:', src))
    if not has_cookie:
        issues.append({'id': 'CAPA_B', 'sev': 'MEDIO', 'msg': 'Cookie ausente en EXTHTTP — CAPA B no implementada'})

    # --- Capas ---
    capas = {
        'A_EXTHTTP': '#EXTHTTP' in src,
        'B_Cookie': has_cookie,
        'C_JWT_real': bool(jwt_real),
        'D_KODIPROP': 'inputstream.adaptive.stream_headers' in src,
        'E_OVERFLOW': 'APE-OVERFLOW-HEADERS' in src,
        'F_APE_TAGS': '#EXT-X-APE-' in src,
    }
    info['capas'] = capas
    info['capas_activas'] = sum(1 for v in capas.values() if v)
    info['has_ape_cookie'] = '_buildApeCookie' in src

    return issues, info


def diagnose_m3u8(m3u8_path):
    issues = []
    info = {}

    with open(m3u8_path, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()
    lines = content.splitlines()

    # Directivas
    counts = {}
    for line in lines:
        if line.startswith('#'):
            tag = line.split(':')[0].strip()
            counts[tag] = counts.get(tag, 0) + 1

    # Canales
    extinf_pos = [i for i, l in enumerate(lines) if l.startswith('#EXTINF')]
    info['total_channels'] = len(extinf_pos)

    if extinf_pos:
        start = extinf_pos[0]
        end = extinf_pos[1] if len(extinf_pos) > 1 else len(lines)
        block = lines[start:end]
        info['lines_per_channel'] = len(block)

        # B1: STREAM-INF pegado a URL
        for i, line in enumerate(block):
            if line.startswith('#EXT-X-STREAM-INF'):
                nxt = block[i + 1] if i + 1 < len(block) else ''
                if not nxt.startswith('http'):
                    issues.append({'id': 'B1', 'sev': 'CRITICO', 'msg': f'STREAM-INF no pegado a URL (linea {start + i})'})

        # B5: params en URL
        for line in block:
            if line.startswith('http') and ('ape_sid=' in line or 'ape_nonce=' in line):
                issues.append({'id': 'B5', 'sev': 'CRITICO', 'msg': f'URL contaminada: {line[:80]}...'})
                break

        # OVERFLOW
        has_overflow = any('APE-OVERFLOW-HEADERS' in l for l in block)
        info['has_overflow'] = has_overflow
        if not has_overflow:
            issues.append({'id': 'D3', 'sev': 'CRITICO', 'msg': 'OVERFLOW ausente en lista'})

        # EXTHTTP parse
        exthttp_lines = [l for l in block if l.startswith('#EXTHTTP')]
        if exthttp_lines:
            try:
                payload = json.loads(exthttp_lines[0].replace('#EXTHTTP:', '', 1))
                info['exthttp_size'] = len(exthttp_lines[0])
                info['exthttp_has_cookie'] = 'Cookie' in payload
                info['exthttp_has_auth'] = 'Authorization' in payload
                if info['exthttp_size'] > 3072:
                    issues.append({'id': 'EXTHTTP_SIZE', 'sev': 'MEDIO', 'msg': f'EXTHTTP {info["exthttp_size"]} chars > 3KB'})
            except Exception:
                issues.append({'id': 'EXTHTTP_PARSE', 'sev': 'CRITICO', 'msg': 'EXTHTTP no es JSON valido'})

    info['directive_counts'] = dict(sorted(counts.items(), key=lambda x: -x[1])[:15])
    return issues, info


def compute_score(all_issues, js_info):
    """Scoring engine: 0-100 ponderado por 5 dimensiones."""
    scores = {}
    criticos = sum(1 for i in all_issues if i['sev'] == 'CRITICO')
    capas = js_info.get('capas_activas', 0) if js_info else 0
    versions = js_info.get('versions_found', []) if js_info else []

    scores['estabilidad'] = max(0, 100 - criticos * 15)
    scores['latencia'] = 70  # neutral sin lista
    scores['calidad'] = int((capas / 6) * 100) if capas else 0
    scores['coherencia'] = 100 if len(versions) <= 1 else 50
    scores['completitud'] = max(0, 100 - sum(1 for i in all_issues if i['sev'] in ('CRITICO', 'MEDIO')) * 10)

    total = int(
        scores['estabilidad'] * 0.25 +
        scores['latencia'] * 0.15 +
        scores['calidad'] * 0.20 +
        scores['coherencia'] * 0.20 +
        scores['completitud'] * 0.20
    )
    nivel = "PRODUCCION" if total >= 85 else ("ACEPTAR_CON_RIESGO" if total >= 70 else "RECHAZAR")
    return total, nivel, scores


def main():
    args = sys.argv[1:]
    json_mode = '--json' in args
    args = [a for a in args if not a.startswith('--')]

    if not args:
        print("Uso: python diagnose_pipeline.py <generador.js> [lista.m3u8] [--json]")
        sys.exit(1)

    js_path = args[0]
    m3u8_path = args[1] if len(args) > 1 else None

    all_issues = []
    js_info = None
    m3u8_info = None

    if os.path.exists(js_path):
        js_issues, js_info = diagnose_generator(js_path)
        all_issues.extend(js_issues)

    if m3u8_path and os.path.exists(m3u8_path):
        m3u8_issues, m3u8_info = diagnose_m3u8(m3u8_path)
        all_issues.extend(m3u8_issues)

    score, nivel, scores = compute_score(all_issues, js_info)

    if json_mode:
        print(json.dumps({
            "score": score,
            "nivel": nivel,
            "detalles_score": scores,
            "issues": all_issues,
            "generador": js_info,
            "lista": m3u8_info,
        }, indent=2, ensure_ascii=False))
    else:
        print("=" * 70)
        print("  APE PIPELINE ARCHITECT v2.0 — Diagnostico Forense")
        print("=" * 70)

        if js_info:
            print(f"\nGenerador: {os.path.basename(js_path)}")
            print(f"  Versiones: {js_info.get('versions_found', [])}")
            print(f"\n  6 Capas de Transporte:")
            for capa, ok in js_info.get('capas', {}).items():
                print(f"  {'[OK]' if ok else '[FAIL]'} CAPA {capa}")

        if m3u8_info:
            print(f"\nLista: {os.path.basename(m3u8_path)}")
            print(f"  Canales: {m3u8_info.get('total_channels', 0)}")
            print(f"  Lineas/canal: {m3u8_info.get('lines_per_channel', 0)}")
            print(f"  OVERFLOW: {'[OK]' if m3u8_info.get('has_overflow') else '[FAIL]'}")

        print(f"\n{'=' * 70}")
        criticos = [i for i in all_issues if i['sev'] == 'CRITICO']
        medios = [i for i in all_issues if i['sev'] == 'MEDIO']
        cosmeticos = [i for i in all_issues if i['sev'] == 'COSMETICO']
        print(f"  PROBLEMAS: {len(all_issues)} ({len(criticos)} criticos, {len(medios)} medios, {len(cosmeticos)} cosmeticos)")
        print("=" * 70)
        for issue in sorted(all_issues, key=lambda x: {'CRITICO': 0, 'MEDIO': 1, 'COSMETICO': 2}.get(x['sev'], 3)):
            print(f"  [{issue['id']}] {issue['sev']}")
            print(f"       {issue['msg']}")

        print(f"\n{'=' * 70}")
        print(f"  SCORE: {score}/100 — {nivel}")
        for dim, val in scores.items():
            print(f"    {dim}: {val}/100")
        print("=" * 70)

    sys.exit(0 if score >= 70 else 1)


if __name__ == '__main__':
    main()
