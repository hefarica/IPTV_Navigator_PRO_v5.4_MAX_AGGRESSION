#!/usr/bin/env python3
"""
═══════════════════════════════════════════════════════════════════════════
MASK FALLBACK DIRECT — OMEGA Cero-Credenciales v1.0
═══════════════════════════════════════════════════════════════════════════

Parchea una lista M3U8 existente reemplazando TODOS los
#EXT-X-APE-FALLBACK-DIRECT con URLs enmascaradas que pasan
por el proxy del VPS.

Uso:
    python3 mask_fallback_direct.py \
        --input  lista_original.m3u8 \
        --output lista_segura.m3u8 \
        --proxy  https://iptv-ape.duckdns.org/fallback_proxy.php \
        --secret CAMBIA_ESTO_POR_UNA_CLAVE_ALEATORIA_DE_64_CARACTERES_MINIMO_AQUI

El script también genera:
    - origin_table.php  → Tabla de orígenes para pegar en fallback_proxy.php
    - origin_table.json → Misma tabla en JSON para referencia
═══════════════════════════════════════════════════════════════════════════
"""

import argparse
import hashlib
import hmac
import base64
import json
import re
import time
import sys
from pathlib import Path

# ── Configuración por defecto ──────────────────────────────────────────────
DEFAULT_PROXY  = 'https://iptv-ape.duckdns.org/fallback_proxy.php'
DEFAULT_SECRET = '070cf70b0232f6ca0830d9341419c37606b6950a488bfcbb75f4d9dc07680046'
TOKEN_WINDOW   = 300  # segundos (5 minutos)


def generate_token(ch_id: str, secret: str) -> str:
    """Genera un token HMAC-SHA256 idéntico al de fallback_proxy.php."""
    window = int(time.time() / TOKEN_WINDOW)
    payload = f"{ch_id}|{window}".encode()
    sig = hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()
    # Codificar ch_id en Base64 URL-safe
    encoded = base64.urlsafe_b64encode(ch_id.encode()).rstrip(b'=').decode()
    return f"{encoded}.{sig[:32]}"


def build_masked_url(ch_id: str, proxy_base: str, secret: str) -> str:
    """Construye la URL enmascarada para el FALLBACK-DIRECT."""
    token = generate_token(ch_id, secret)
    from urllib.parse import urlencode
    return f"{proxy_base.rstrip('/')}?{urlencode({'t': token})}"


def extract_ch_id_from_extinf(extinf_line: str) -> str | None:
    """Extrae el tvg-id del EXTINF para usarlo como ch_id."""
    m = re.search(r'tvg-id="([^"]*)"', extinf_line)
    if m and m.group(1).strip():
        return m.group(1).strip()
    return None


def main():
    parser = argparse.ArgumentParser(description='Enmascara FALLBACK-DIRECT en lista M3U8')
    parser.add_argument('--input',  required=True, help='Ruta a la lista M3U8 original')
    parser.add_argument('--output', required=True, help='Ruta de la lista M3U8 segura de salida')
    parser.add_argument('--proxy',  default=DEFAULT_PROXY,  help='URL base del proxy en el VPS')
    parser.add_argument('--secret', default=DEFAULT_SECRET, help='Clave secreta HMAC (debe coincidir con fallback_proxy.php)')
    args = parser.parse_args()

    if args.secret == DEFAULT_SECRET:
        print("⚠️  ADVERTENCIA: Estás usando la clave secreta por defecto.")
        print("   Cambia --secret por una clave aleatoria de 64+ caracteres.")
        print("   La misma clave debe estar en fallback_proxy.php → FALLBACK_SECRET")
        print()

    input_path  = Path(args.input)
    output_path = Path(args.output)

    if not input_path.exists():
        print(f"❌ Archivo no encontrado: {input_path}")
        sys.exit(1)

    print(f"📂 Leyendo: {input_path}")
    with open(input_path, 'r', encoding='utf-8', errors='replace') as f:
        lines = f.readlines()

    total_lines = len(lines)
    print(f"   {total_lines:,} líneas totales")

    # ── Procesar la lista ──────────────────────────────────────────────────
    output_lines = []
    origin_table = {}          # ch_id → URL_real
    current_ch_id = None
    current_extinf = None
    fallback_count = 0
    channel_counter = 0

    for line in lines:
        stripped = line.rstrip('\n').rstrip('\r')

        # Capturar EXTINF para extraer tvg-id
        if stripped.startswith('#EXTINF:'):
            current_extinf = stripped
            ch_id = extract_ch_id_from_extinf(stripped)
            if ch_id:
                current_ch_id = ch_id
            else:
                # Si no hay tvg-id, usar contador incremental
                channel_counter += 1
                current_ch_id = str(channel_counter)
            output_lines.append(line)
            continue

        # Enmascarar FALLBACK-DIRECT
        if stripped.startswith('#EXT-X-APE-FALLBACK-DIRECT:'):
            origin_url = stripped[len('#EXT-X-APE-FALLBACK-DIRECT:'):].strip()

            if current_ch_id:
                # Guardar en la tabla de orígenes
                origin_table[current_ch_id] = origin_url

                # Generar URL enmascarada
                masked_url = build_masked_url(current_ch_id, args.proxy, args.secret)
                output_lines.append(f'#EXT-X-APE-FALLBACK-DIRECT:{masked_url}\n')
                fallback_count += 1
            else:
                # Sin ch_id: usar URL genérica de error (no exponer origen)
                output_lines.append('#EXT-X-APE-FALLBACK-DIRECT:https://iptv-ape.duckdns.org/fallback_proxy.php?t=UNKNOWN\n')
                fallback_count += 1
            continue

        # Resetear ch_id al llegar a la URL del canal (línea sin #)
        if stripped and not stripped.startswith('#'):
            current_ch_id = None
            current_extinf = None

        output_lines.append(line)

    # ── Escribir lista segura ──────────────────────────────────────────────
    print(f"\n✅ Enmascarados: {fallback_count:,} FALLBACK-DIRECT")
    print(f"📝 Escribiendo: {output_path}")
    with open(output_path, 'w', encoding='utf-8') as f:
        f.writelines(output_lines)
    print(f"   {len(output_lines):,} líneas escritas")

    # ── Generar origin_table.php ──────────────────────────────────────────
    php_table_path = output_path.parent / 'origin_table.php'
    print(f"\n📝 Generando tabla de orígenes PHP: {php_table_path}")
    with open(php_table_path, 'w', encoding='utf-8') as f:
        f.write("<?php\n")
        f.write("/**\n")
        f.write(" * ORIGIN TABLE — Generado automáticamente por mask_fallback_direct.py\n")
        f.write(f" * Canales: {len(origin_table)}\n")
        f.write(f" * Fecha:   {time.strftime('%Y-%m-%d %H:%M:%S')}\n")
        f.write(" *\n")
        f.write(" * INSTRUCCIONES:\n")
        f.write(" * 1. Pegar el contenido de ORIGIN_TABLE en fallback_proxy.php\n")
        f.write(" * 2. Subir fallback_proxy.php al VPS\n")
        f.write(" * 3. Verificar que FALLBACK_SECRET coincide con --secret usado aquí\n")
        f.write(" */\n\n")
        f.write("const ORIGIN_TABLE = [\n")
        for ch_id, url in sorted(origin_table.items(), key=lambda x: int(x[0]) if x[0].isdigit() else 0):
            f.write(f"    '{ch_id}' => '{url}',\n")
        f.write("];\n")

    # ── Generar origin_table.json ─────────────────────────────────────────
    json_table_path = output_path.parent / 'origin_table.json'
    with open(json_table_path, 'w', encoding='utf-8') as f:
        json.dump(origin_table, f, indent=2, ensure_ascii=False)
    print(f"📝 Tabla JSON: {json_table_path}")

    # ── Resumen ───────────────────────────────────────────────────────────
    print("\n" + "=" * 60)
    print("  RESUMEN DEL ENMASCARAMIENTO")
    print("=" * 60)
    print(f"  FALLBACK-DIRECT enmascarados : {fallback_count:,}")
    print(f"  Orígenes únicos en tabla     : {len(origin_table):,}")
    print(f"  Lista segura generada        : {output_path.name}")
    print(f"  Tabla PHP para VPS           : {php_table_path.name}")
    print(f"  Tabla JSON de referencia     : {json_table_path.name}")
    print()
    print("  PRÓXIMOS PASOS:")
    print("  1. Pegar ORIGIN_TABLE de origin_table.php en fallback_proxy.php")
    print("  2. Subir fallback_proxy.php al VPS en /var/www/html/")
    print("  3. Verificar: curl https://iptv-ape.duckdns.org/fallback_proxy.php?ch=1")
    print("  4. Usar la lista segura en tu reproductor")
    print("=" * 60)


if __name__ == '__main__':
    main()
