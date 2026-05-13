#!/usr/bin/env python3
"""
audit_m3u8_structure.py v2.0 vNext — Auditoria estructural de listas M3U8 APE

Uso:
    python audit_m3u8_structure.py <archivo.m3u8> [--json] [--fix-report]

Salida:
    - Lineas por canal (objetivo: 883)
    - Conteo de cada tipo de directiva
    - Verificacion RFC 8216 (STREAM-INF pegado a URL)
    - Parametros APE en URL (objetivo: 0)
    - EXTHTTP size (objetivo: < 3072 chars)
    - OVERFLOW presente (objetivo: 1 por canal)
    - Score de auditoria (0-100)
    - Nivel: RECHAZAR / ACEPTAR_CON_RIESGO / PRODUCCION
"""

import sys
import re
import json
import os
from collections import Counter

try:
    from urllib.parse import urlparse
except ImportError:
    from urlparse import urlparse


def audit(path, output_json=False):
    if not os.path.exists(path):
        result = {"score": 0, "nivel": "RECHAZAR", "error": "FILE_NOT_FOUND", "archivo": path}
        if output_json:
            print(json.dumps(result, indent=2))
        else:
            print(f"ERROR: Archivo no encontrado: {path}")
        return result

    with open(path, encoding='utf-8', errors='replace') as f:
        lines = [l.rstrip('\n') for l in f.readlines()]

    result = {
        "archivo": path,
        "total_lineas": len(lines),
        "canales": 0,
        "lineas_por_canal": {"min": 0, "max": 0, "avg": 0},
        "bugs_rfc8216": [],
        "params_ape_en_url": 0,
        "servidores": {},
        "protocolos": {},
        "abr_distribucion": {},
        "exthttp_size_max": 0,
        "overflow_count": 0,
        "score": 0,
        "nivel": "RECHAZAR",
        "detalles_score": {},
    }

    if not lines or not any(l.startswith('#EXTINF') for l in lines):
        result["error"] = "NO_EXTINF"
        if output_json:
            print(json.dumps(result, indent=2))
        else:
            print("ERROR: Archivo no contiene #EXTINF")
        return result

    # -- Detectar bloques de canal --
    channels = []
    current = []
    for line in lines:
        if line.startswith('#EXTINF') and current:
            channels.append(current)
            current = [line]
        elif line.startswith('#EXTINF'):
            current = [line]
        elif current:
            current.append(line)
    if current:
        channels.append(current)

    result["canales"] = len(channels)
    if not channels:
        result["error"] = "NO_CHANNELS"
        if output_json:
            print(json.dumps(result, indent=2))
        else:
            print("ERROR: No se detectaron canales")
        return result

    # -- Metricas por canal --
    lpc = [len(c) for c in channels]
    result["lineas_por_canal"] = {"min": min(lpc), "max": max(lpc), "avg": sum(lpc) // len(lpc)}

    # -- Conteo de directivas en primer canal --
    first = channels[0]
    directive_counts = Counter()
    for line in first:
        if line.startswith('#'):
            tag = line.split(':')[0].split('=')[0]
            directive_counts[tag] += 1
        elif line.startswith('http'):
            directive_counts['URL'] += 1
    result["directivas_primer_canal"] = dict(directive_counts.most_common(20))

    # -- RFC 8216: STREAM-INF pegado a URL --
    bugs = []
    for i, ch in enumerate(channels[:50]):
        for j, line in enumerate(ch):
            if line.startswith('#EXT-X-STREAM-INF'):
                next_line = ch[j + 1] if j + 1 < len(ch) else ''
                if not next_line.startswith('http'):
                    bugs.append({"canal": i + 1, "linea": j + 1, "siguiente": next_line[:80]})
    result["bugs_rfc8216"] = bugs

    # -- Parametros APE en URL --
    ape_in_url = 0
    for ch in channels:
        for line in ch:
            if line.startswith('http') and ('ape_sid=' in line or 'ape_nonce=' in line or '&profile=' in line):
                ape_in_url += 1
                break
    result["params_ape_en_url"] = ape_in_url

    # -- Servidores unicos --
    servers = Counter()
    protocols = Counter()
    for ch in channels:
        for line in ch:
            if line.startswith('http'):
                try:
                    p = urlparse(line)
                    servers[p.netloc] += 1
                    protocols[p.scheme] += 1
                except Exception:
                    pass
                break
    result["servidores"] = dict(servers.most_common(15))
    result["protocolos"] = dict(protocols)

    # -- ABR variantes --
    abr_counts = Counter()
    for ch in channels:
        n = sum(1 for l in ch if l.startswith('#EXT-X-STREAM-INF'))
        abr_counts[n] += 1
    result["abr_distribucion"] = {str(k): v for k, v in sorted(abr_counts.items())}

    # -- EXTHTTP size --
    max_exthttp = 0
    for ch in channels[:10]:
        for line in ch:
            if line.startswith('#EXTHTTP'):
                max_exthttp = max(max_exthttp, len(line))
    result["exthttp_size_max"] = max_exthttp

    # -- OVERFLOW count --
    overflow_count = sum(1 for l in lines if 'APE-OVERFLOW-HEADERS' in l)
    result["overflow_count"] = overflow_count

    # ============ SCORING ============
    scores = {}

    # Estabilidad (25%): 0 bugs RFC 8216
    scores["estabilidad"] = max(0, 100 - len(bugs) * 20)

    # Latencia (15%): EXTHTTP < 3KB + ABR = 3
    exthttp_s = 100 if max_exthttp < 3072 else (50 if max_exthttp < 8192 else 0)
    abr_s = 100 if abr_counts.get(3, 0) == len(channels) else (60 if abr_counts.get(3, 0) > 0 else 30)
    scores["latencia"] = (exthttp_s + abr_s) // 2

    # Calidad (20%): 883 lineas/canal
    avg = sum(lpc) // len(lpc)
    scores["calidad"] = 100 if avg >= 850 else (60 if avg >= 500 else (30 if avg >= 100 else 10))

    # Coherencia (20%): URL limpia
    scores["coherencia"] = 100 if ape_in_url == 0 else max(0, 100 - ape_in_url * 10)

    # Completitud (20%): OVERFLOW emitido
    if len(channels) > 0:
        scores["completitud"] = min(100, int((overflow_count / len(channels)) * 100))
    else:
        scores["completitud"] = 0

    total = int(
        scores["estabilidad"] * 0.25 +
        scores["latencia"] * 0.15 +
        scores["calidad"] * 0.20 +
        scores["coherencia"] * 0.20 +
        scores["completitud"] * 0.20
    )
    result["score"] = total
    result["detalles_score"] = scores
    result["nivel"] = "PRODUCCION" if total >= 85 else ("ACEPTAR_CON_RIESGO" if total >= 70 else "RECHAZAR")

    # -- Output --
    if output_json:
        print(json.dumps(result, indent=2, ensure_ascii=False))
    else:
        print(f"Archivo: {path}")
        print(f"Total lineas: {len(lines)}")
        print(f"Canales detectados: {len(channels)}")
        print(f"Lineas por canal: min={min(lpc)}, max={max(lpc)}, avg={avg}")
        print()
        print("Directivas en el primer canal:")
        for tag, count in sorted(directive_counts.items(), key=lambda x: -x[1])[:15]:
            print(f"  {tag}: {count}")
        print()
        if bugs:
            print(f"BUGS RFC 8216 ({len(bugs)}):")
            for b in bugs[:5]:
                print(f"  Canal {b['canal']}, linea {b['linea']}: STREAM-INF no seguido de URL")
        else:
            print("RFC 8216: CORRECTO")
        print()
        print(f"Params APE en URL: {ape_in_url} {'(LIMPIO)' if ape_in_url == 0 else '(CONTAMINADO)'}")
        print(f"EXTHTTP size max: {max_exthttp} chars {'(OK)' if max_exthttp < 3072 else '(EXCEDE 3KB)'}")
        print(f"OVERFLOW: {overflow_count}/{len(channels)} canales")
        print()
        print(f"Servidores unicos: {len(servers)}")
        for srv, count in servers.most_common(10):
            print(f"  {srv}: {count} canales")
        print(f"Protocolos: {dict(protocols)}")
        print()
        print("ABR por canal:")
        for n, count in sorted(abr_counts.items()):
            st = "OK" if n == 3 else ("WARN" if n == 1 else "ERR")
            print(f"  [{st}] {n} variante(s): {count} canales")
        print()
        print("=" * 60)
        print(f"SCORE: {total}/100 — {result['nivel']}")
        for dim, val in scores.items():
            print(f"  {dim}: {val}/100")
        print("=" * 60)

    return result


if __name__ == '__main__':
    args = sys.argv[1:]
    json_mode = '--json' in args
    args = [a for a in args if not a.startswith('--')]
    if not args:
        print("Uso: python audit_m3u8_structure.py <archivo.m3u8> [--json]")
        sys.exit(1)
    r = audit(args[0], output_json=json_mode)
    sys.exit(0 if r.get("score", 0) >= 70 else 1)
