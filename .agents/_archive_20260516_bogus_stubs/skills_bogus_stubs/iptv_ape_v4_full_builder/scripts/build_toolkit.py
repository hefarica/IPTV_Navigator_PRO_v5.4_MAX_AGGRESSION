#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
IPTV Navigator PRO v4.0 FULL - Script de Construcción
======================================================
Ensambla el toolkit completo desde los templates incluidos en esta skill.

Uso:
    python3.11 build_toolkit.py [--output-dir /ruta/de/salida]

Salida:
    ~/IPTV_Navigator_PRO_v4.0_FULL_SKILL_BUILT.zip
"""

import os
import json
import shutil
import argparse
import datetime

# --- RUTAS BASE (calculadas dinámicamente, sin hardcoding) --- #
SKILL_DIR     = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEMPLATES_DIR = os.path.join(SKILL_DIR, 'templates')
PHP_TEMPLATES = os.path.join(TEMPLATES_DIR, 'php')

# Campos ADN completos por canal (APE v18.2 + LCEVC + VQS + degradation chain)
CHANNEL_DNA_TEMPLATE = {
    # --- Identidad ---
    "ape_version":              "18.2.0",
    "ape_build_date":           datetime.date.today().isoformat(),
    # --- CMAF ---
    "cmaf_enabled":             True,
    "cmaf_profile":             "CMAF_UNIVERSAL",
    "cmaf_segment_duration":    6,
    "cmaf_init_segment":        "init.mp4",
    # --- LCEVC ---
    "lcevc_enabled":            True,
    "lcevc_state":              "SIGNAL_ONLY",
    "lcevc_mode":               "ENHANCEMENT",
    "lcevc_base_codec":         "h264",
    "lcevc_enhancement_layer":  True,
    "lcevc_bitrate_savings_pct": 40,
    # --- HDR ---
    "hdr_profile":              "HDR10+",
    "hdr_peak_luminance":       1000,
    "hdr_color_primaries":      "bt2020",
    "hdr_transfer_function":    "smpte2084",
    # --- AI Super Resolution ---
    "ai_sr_enabled":            True,
    "ai_sr_mode":               "BALANCED",
    "ai_sr_scale_factor":       2,
    "ai_sr_filters":            ["bwdif", "nnedi3", "cas"],
    # --- Codecs y formatos ---
    "codec_priority":           ["hevc", "h264", "av1"],
    "codec_primary":            "hevc",
    "codec_fallback":           "h264",
    "container_primary":        "fmp4",
    "container_fallback":       "ts",
    "protocol_primary":         "hls",
    "protocol_fallback":        "ts_direct",
    # --- Cadena de degradación (7 niveles) ---
    "degradation_chain": [
        "CMAF_HEVC_AV1_LCEVC",
        "HLS_FMP4_HEVC_LCEVC",
        "HLS_FMP4_H264",
        "HLS_TS_H264",
        "HLS_TS_BASELINE",
        "TS_DIRECT",
        "HTTP_REDIRECT"
    ],
    # --- VQS (Visual Quality Score) ---
    "vqs_target":               90,
    "vqs_tier":                 "PREMIUM",
    # --- CDN ---
    "cdn_primary":              "auto",
    "cdn_fallback":             "origin",
    "cdn_health_check_interval": 30,
    # --- Telemetría Telchemy TVQM ---
    "tvqm_enabled":             True,
    "tvqm_vstq_threshold":      4.0,
    "tvqm_vsmq_threshold":      3.5,
    # --- Player routing ---
    "player_profile":           "AUTO",
    "player_lcevc_capable":     False,
    "player_hdr_capable":       False,
}


# --- FUNCIONES DE CONSTRUCCIÓN --- #

def create_dir_structure(base_path: str) -> None:
    """Crea la estructura de directorios del toolkit."""
    print("[1/5] Creando estructura de directorios...")
    dirs = [
        'IPTV_Navigator_PRO/iptv_nav/files/vps/cmaf_engine/modules',
        'IPTV_Navigator_PRO/iptv_nav/files/vps/cmaf_engine/tests',
        'IPTV_Navigator_PRO/iptv_nav/files/js/ape-v9',
        'IPTV_Navigator_PRO/.agents/skills',
    ]
    for d in dirs:
        os.makedirs(os.path.join(base_path, d), exist_ok=True)
    print(f"    Directorios creados en: {base_path}")


def copy_php_templates(base_path: str) -> None:
    """Copia los 17 módulos PHP del cmaf_engine desde los templates de la skill."""
    print("[2/5] Copiando templates PHP del cmaf_engine...")
    dest_cmaf = os.path.join(base_path, 'IPTV_Navigator_PRO/iptv_nav/files/vps/cmaf_engine')
    if not os.path.isdir(PHP_TEMPLATES):
        raise FileNotFoundError(
            f"No se encontró el directorio de templates PHP: {PHP_TEMPLATES}\n"
            "Asegúrate de que la skill esté correctamente instalada."
        )
    shutil.copytree(PHP_TEMPLATES, dest_cmaf, dirs_exist_ok=True)
    php_files = [f for f in os.listdir(dest_cmaf) if f.endswith('.php')]
    modules   = [f for f in os.listdir(os.path.join(dest_cmaf, 'modules')) if f.endswith('.php')]
    print(f"    Copiados: {len(php_files)} archivos raíz + {len(modules)} módulos")


def generate_channels_map(base_path: str, num_channels: int = 10) -> None:
    """
    Genera un channels_map.json con el ADN completo de APE v18.2.

    En producción, reemplazar este generador por el ChannelsMapBuilder::buildAll()
    del TelchemyTvqmEngine, que hereda más de 200 campos desde la lista madre M3U8.
    """
    print(f"[3/5] Generando channels_map.json ({num_channels} canales de ejemplo)...")
    channels = {}
    for i in range(1, num_channels + 1):
        channel_id = f"ch{i:04d}"
        dna = dict(CHANNEL_DNA_TEMPLATE)
        dna.update({
            "id":   channel_id,
            "name": f"Channel {i}",
            "logo": f"https://cdn.example.com/logos/{channel_id}.png",
            "urls": [f"https://stream.example.com/live/{channel_id}/index.m3u8"],
            "group": "General",
            "tvg_id": channel_id,
        })
        channels[channel_id] = dna

    map_dir  = os.path.join(base_path, 'IPTV_Navigator_PRO/iptv_nav/files/vps')
    map_path = os.path.join(map_dir, 'channels_map.json')
    os.makedirs(map_dir, exist_ok=True)
    with open(map_path, 'w', encoding='utf-8') as f:
        json.dump(channels, f, indent=2, ensure_ascii=False)
    print(f"    channels_map.json generado con {num_channels} canales × {len(CHANNEL_DNA_TEMPLATE)} campos ADN")


def generate_integration_patch(base_path: str) -> None:
    """
    Genera el archivo de instrucciones para parchear resolve_quality.php y resolve.php
    con las 3 líneas del shim CMAF. No modifica los archivos directamente porque
    esos archivos son específicos de cada instalación.
    """
    print("[4/5] Generando instrucciones de integración del shim CMAF...")
    patch_content = """\
# Instrucciones de Integración del Shim CMAF
# ===========================================
# Añadir estas 3 líneas en resolve_quality.php y resolve.php:

# 1. Al inicio del archivo (después de las constantes, antes de la lógica principal):
require_once __DIR__ . '/cmaf_engine/cmaf_integration_shim.php';

# 2. Después de la línea: $decision = mapDecision($ch, $map);
$cmafResult = CmafIntegrationShim::intercept($ch, $decision ?? []);
if ($cmafResult !== null) { echo $cmafResult; exit; }
"""
    patch_path = os.path.join(
        base_path,
        'IPTV_Navigator_PRO/iptv_nav/files/vps/CMAF_INTEGRATION_PATCH.txt'
    )
    with open(patch_path, 'w', encoding='utf-8') as f:
        f.write(patch_content)
    print(f"    Instrucciones guardadas en: CMAF_INTEGRATION_PATCH.txt")


def package_toolkit(base_path: str, output_dir: str) -> str:
    """Empaqueta el toolkit en un ZIP listo para desplegar."""
    print("[5/5] Empaquetando el toolkit final...")
    timestamp       = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
    output_filename = os.path.join(output_dir, f'IPTV_Navigator_PRO_v4.0_FULL_{timestamp}')
    shutil.make_archive(output_filename, 'zip', base_path)
    zip_path = f"{output_filename}.zip"
    size_mb  = os.path.getsize(zip_path) / (1024 * 1024)
    print(f"    ZIP generado: {zip_path} ({size_mb:.1f} MB)")
    return zip_path


# --- PUNTO DE ENTRADA --- #

def main():
    parser = argparse.ArgumentParser(
        description='Construye el toolkit IPTV Navigator PRO v4.0 FULL.'
    )
    parser.add_argument(
        '--output-dir',
        default=os.path.expanduser('~'),
        help='Directorio donde se guardará el ZIP final (default: ~)'
    )
    parser.add_argument(
        '--num-channels',
        type=int,
        default=10,
        help='Número de canales de ejemplo en el channels_map.json (default: 10)'
    )
    parser.add_argument(
        '--build-dir',
        default=os.path.join(os.path.expanduser('~'), 'iptv_build'),
        help='Directorio de construcción temporal (default: ~/iptv_build)'
    )
    args = parser.parse_args()

    print("=" * 60)
    print("  IPTV Navigator PRO v4.0 FULL — Script de Construcción")
    print("=" * 60)
    print(f"  Skill dir   : {SKILL_DIR}")
    print(f"  Build dir   : {args.build_dir}")
    print(f"  Output dir  : {args.output_dir}")
    print(f"  Canales     : {args.num_channels}")
    print("=" * 60)

    # Limpiar directorio de construcción previo
    if os.path.exists(args.build_dir):
        shutil.rmtree(args.build_dir)

    # Ejecutar las 5 etapas
    create_dir_structure(args.build_dir)
    copy_php_templates(args.build_dir)
    generate_channels_map(args.build_dir, num_channels=args.num_channels)
    generate_integration_patch(args.build_dir)
    zip_path = package_toolkit(args.build_dir, args.output_dir)

    print("=" * 60)
    print("  CONSTRUCCION COMPLETADA")
    print(f"  Archivo: {zip_path}")
    print("=" * 60)


if __name__ == "__main__":
    main()
