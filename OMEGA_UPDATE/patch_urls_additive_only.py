#!/usr/bin/env python3
"""
═══════════════════════════════════════════════════════════════════════════
PATCH URLS — ADDITIVE-ONLY (OMEGA-NO-DELETE COMPLIANT)
═══════════════════════════════════════════════════════════════════════════

REGLA OMEGA-NO-DELETE: Este script NUNCA elimina líneas.
El número de líneas de salida DEBE ser IGUAL al de entrada.
Si es menor, el script aborta con error antes de escribir nada.

OPERACIÓN:
  - Reemplaza SOLO las líneas que son URLs de stream (^http...)
    que apuntan a rq_polymorphic_resolver.php
  - Actualiza la URL a resolve_quality_unified.php con los parámetros
    correctos (mode=200ok, url=[ORIGEN], ext=.m3u8)
  - TODAS las demás líneas pasan intactas, sin modificación alguna.

ENTRADA:  APE_TYPED_ARRAYS_ULTIMATE_20260331(1).m3u8 — 3,090,725 líneas
SALIDA:   APE_OMEGA_PRODUCTION_v5.2_FULL.m3u8        — 3,090,725 líneas
═══════════════════════════════════════════════════════════════════════════
"""

import re
import sys
import json
from pathlib import Path
from urllib.parse import urlencode, urlparse, parse_qs

# ── Configuración ──────────────────────────────────────────────────────────
INPUT_FILE   = Path("C:/Users/HFRC/Desktop/IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION/OMEGA_UPDATE/APE_TYPED_ARRAYS_ULTIMATE.m3u8")
OUTPUT_FILE  = Path("C:/Users/HFRC/Desktop/IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION/OMEGA_UPDATE/APE_OMEGA_PRODUCTION_v5.2_FULL.m3u8")
ORIGIN_TABLE = Path("C:/Users/HFRC/Desktop/IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION/IPTV_v5.4_MAX_AGGRESSION/backend/channels_map.json")
SSOT_BASE    = "https://iptv-ape.duckdns.org/resolve_quality_unified.php"

# ── Cargar origin_table ────────────────────────────────────────────────────
print("📂 Cargando origin_table.json...")
with open(ORIGIN_TABLE, 'r', encoding='utf-8') as f:
    origin_map = json.load(f)
print(f"   {len(origin_map):,} canales en origin_table")

# ── Leer lista de entrada ──────────────────────────────────────────────────
print(f"📂 Leyendo: {INPUT_FILE}")
with open(INPUT_FILE, 'r', encoding='utf-8', errors='replace') as f:
    lines = f.readlines()

total_input = len(lines)
print(f"   {total_input:,} líneas de entrada")

# ── Procesar: SOLO reemplazar URLs de stream ───────────────────────────────
output_lines = []
current_ch_id = None
urls_patched = 0
urls_skipped = 0
extattrfromurl_patched = 0

# Patrones
RE_EXTINF_CH = re.compile(r'tvg-id="([^"]*)"')
RE_OLD_URL   = re.compile(
    r'^https?://iptv-ape\.duckdns\.org/resolve_quality\.php',
    re.IGNORECASE
)
RE_OLD_EXTATTRFROMURL = re.compile(
    r'^#EXTATTRFROMURL:.*resolve_quality\.php',
    re.IGNORECASE
)

print("🔄 Procesando líneas (ADDITIVE-ONLY — ninguna línea será eliminada)...")

current_ch_name = "Unknown_Channel"

for i, line in enumerate(lines):
    stripped = line.rstrip('\n').rstrip('\r')

    # Capturar ch_id y nombre del EXTINF
    if stripped.startswith('#EXTINF:'):
        m = RE_EXTINF_CH.search(stripped)
        if m and m.group(1).strip():
            current_ch_id = m.group(1).strip()
        # Parsear nombre del canal (todo después de la última coma)
        name_parts = stripped.split(',')
        if len(name_parts) > 1:
            raw_name = name_parts[-1].strip()
            # Limpiar nombre para URL segura
            current_ch_name = re.sub(r'[^a-zA-Z0-9_\-]', '_', raw_name)
        output_lines.append(line)
        continue

    # Parchear URL de stream principal (línea que empieza con http)
    if stripped.startswith('http') and RE_OLD_URL.match(stripped):
        if current_ch_id and current_ch_id in origin_map:
            origin_url = f"http://line.tivi-ott.net/live/user/pass/{current_ch_id}.m3u8"
            params = {
                'ch'      : current_ch_id,
                'mode'    : '200ok',
                'url'     : origin_url,
            }
            # CAMBIO COSMETICO: Inyectar el nombre del canal como PathInfo seguido del query string
            new_url = f"{SSOT_BASE}/{current_ch_name}.m3u8?{urlencode(params)}"
            output_lines.append(new_url + '\n')
            urls_patched += 1
        else:
            # No hay origen conocido: mantener la línea original intacta
            output_lines.append(line)
            urls_skipped += 1
        continue

    # Parchear EXTATTRFROMURL con URL obsoleta
    if RE_OLD_EXTATTRFROMURL.match(stripped):
        if current_ch_id and current_ch_id in origin_map:
            origin_url = f"http://line.tivi-ott.net/live/user/pass/{current_ch_id}.m3u8"
            params = {
                'ch'      : current_ch_id,
                'mode'    : '200ok',
                'url'     : origin_url,
                'ext'     : '.m3u8',
                'profile' : 'DEFAULT',
            }
            new_url = f"{SSOT_BASE}?{urlencode(params)}"
            output_lines.append(f'#EXTATTRFROMURL:{new_url}\n')
            extattrfromurl_patched += 1
        else:
            output_lines.append(line)
        continue

    # TODAS LAS DEMÁS LÍNEAS: pasan intactas sin modificación
    output_lines.append(line)

    # Progreso cada 500,000 líneas
    if (i + 1) % 500000 == 0:
        pct = (i + 1) / total_input * 100
        print(f"   Procesadas {i+1:,}/{total_input:,} líneas ({pct:.1f}%)")

total_output = len(output_lines)

# ── VERIFICACIÓN OMEGA-NO-DELETE ──────────────────────────────────────────
print(f"\n🔍 VERIFICACIÓN OMEGA-NO-DELETE:")
print(f"   Líneas entrada : {total_input:,}")
print(f"   Líneas salida  : {total_output:,}")

if total_output < total_input:
    raise RuntimeError(
        f"\n❌ OMEGA-NO-DELETE VIOLATION:\n"
        f"   Salida ({total_output:,} líneas) < Entrada ({total_input:,} líneas).\n"
        f"   ABORTANDO. Ningún archivo fue escrito.\n"
        f"   Ninguna línea puede ser eliminada sin orden explícita del usuario."
    )

if total_output == total_input:
    print(f"   ✅ PASS — Número de líneas idéntico. Ninguna línea eliminada.")
else:
    print(f"   ✅ PASS — Líneas de salida mayores (se agregaron líneas).")

# ── Escribir salida ────────────────────────────────────────────────────────
print(f"\n💾 Escribiendo: {OUTPUT_FILE}")
with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
    f.writelines(output_lines)

output_size_mb = OUTPUT_FILE.stat().st_size / 1024 / 1024

print(f"\n✅ COMPLETADO:")
print(f"   Archivo      : {OUTPUT_FILE}")
print(f"   Tamaño       : {output_size_mb:.1f} MB")
print(f"   Líneas totales: {total_output:,}")
print(f"   URLs parchadas: {urls_patched:,}")
print(f"   EXTATTRFROMURL parchadas: {extattrfromurl_patched:,}")
print(f"   URLs sin origen (intactas): {urls_skipped:,}")
print(f"   Líneas intactas: {total_output - urls_patched - extattrfromurl_patched:,}")
