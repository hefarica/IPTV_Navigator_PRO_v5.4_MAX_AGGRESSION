#!/usr/bin/env python3
"""Entrada segura al auditor reutilizado. Solo catálogos IPTV; sin red.
Rechaza colisiones, destinos existentes, HLS real y parche de señal ya verificada.
"""
from __future__ import annotations
import argparse
from pathlib import Path
import re
import auditar_y_ampliar as core

HLS_MEDIA_TAGS = ('#EXT-X-TARGETDURATION:', '#EXT-X-MEDIA-SEQUENCE:',
                  '#EXT-X-MAP:', '#EXT-X-BYTERANGE:', '#EXT-X-PART:',
                  '#EXT-X-PART-INF:', '#EXT-X-PRELOAD-HINT:', '#EXT-X-I-FRAMES-ONLY')
# [2026-11-20 · MEDIDO, NO SUPUESTO] Reparto de la guarda en FUERTE / DEBIL.
# Un catalogo APE puede emitir `#EXT-X-TARGETDURATION:` como boilerplate de su
# cabecera HLS. Medido sobre APE_4K_PREMIUM_6K_METADATA.m3u8 (754.247.241 B):
# UNA sola linea, la 59 (`#EXT-X-TARGETDURATION:2`), conviviendo con 11.222
# bloques `#EXTINF:-1` con atributos y 11.222 URLs /pulse/. Tomar esa linea sola
# como prueba de "media playlist" hacia que la herramienta rechazara la lista del
# propietario con `Formato hls_media_or_segment_playlist`. Las etiquetas de abajo
# SOLO existen en media playlists reales; TARGETDURATION no basta por si sola.
HLS_MEDIA_STRONG_TAGS = ('#EXT-X-MEDIA-SEQUENCE:', '#EXT-X-MAP:',
                         '#EXT-X-BYTERANGE:', '#EXT-X-PART:',
                         '#EXT-X-PRELOAD-HINT:', '#EXT-X-I-FRAMES-ONLY')
CATALOG_MIN_ENTRIES = 100
VERIFIED_SOURCE_TAGS = ('#EXT-X-APE-RESOLUTION-VERIFIED:true',
                        '#EXT-X-APE-CODEC-VERIFIED:true', '#EXT-X-APE-HDR-VERIFIED:true')


def inspect_format(path):
    entries = 0
    hls_variants = 0
    has_media = False
    has_media_strong = False
    has_ape_channels = False
    has_pulse = False
    has_segment_duration = False
    has_verified_sources = False
    with core.open_text(path) as f:
        for line in f:
            if line.startswith(HLS_MEDIA_TAGS):
                has_media = True
            if line.startswith(HLS_MEDIA_STRONG_TAGS):
                has_media_strong = True
            if line.startswith('#EXT-X-APE-CHANNELS:'):
                has_ape_channels = True
            if line.startswith(VERIFIED_SOURCE_TAGS):
                has_verified_sources = True
            if line.startswith('#EXT-X-STREAM-INF:'):
                hls_variants += 1
            if line.startswith('#EXTINF:'):
                entries += 1
                value = line.split(':', 1)[1].split(',', 1)[0]
                duration = re.match(r'\s*([-+]?\d+(?:\.\d+)?)', value)
                channel_attrs = bool(core.ATTR_RE.findall(line))
                if duration and float(duration[1]) > 0 and not channel_attrs:
                    has_segment_duration = True
            elif line.startswith('http') and '/pulse/' in line:
                has_pulse = True
    # Firma de catalogo: muchos bloques con atributos y sin duracion de segmento.
    catalog_signature = (entries >= CATALOG_MIN_ENTRIES
                         and not has_segment_duration
                         and (has_ape_channels or has_pulse))
    if has_media_strong or has_segment_duration:
        kind = 'hls_media_or_segment_playlist'
        override = None
    elif has_media and not catalog_signature:
        kind = 'hls_media_or_segment_playlist'
        override = None
    elif not entries and hls_variants:
        kind = 'hls_master'
        override = None
    elif not entries:
        kind = 'unsupported_no_extinf_entries'
        override = None
    else:
        kind = 'iptv_catalog_hybrid' if hls_variants else 'iptv_catalog'
        override = 'catalog_signature' if has_media else None
    return {'kind': kind, 'has_verified_sources': has_verified_sources,
            'catalog_signature': catalog_signature, 'media_override': override,
            'entries': entries}


def check_paths(source, outputs):
    source = Path(source).resolve()
    if not source.is_file():
        raise ValueError('Entrada inexistente.')
    resolved = [Path(p).resolve() for p in outputs if p is not None]
    if source in resolved or len(set(resolved)) != len(resolved):
        raise ValueError('Entrada y todos los destinos deben ser rutas distintas.')
    for dest in resolved:
        if dest.exists():
            raise ValueError('Destino existente: usar una carpeta de ejecución nueva.')
        if not dest.parent.is_dir():
            raise ValueError('Crear las carpetas de destino antes de ejecutar.')
    return source


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('source', type=Path)
    ap.add_argument('--output', type=Path)
    ap.add_argument('--audit-json', type=Path, required=True)
    ap.add_argument('--inventory-jsonl', type=Path)
    ap.add_argument('--policy-json', type=Path)
    args = ap.parse_args()
    try:
        source = check_paths(args.source, [args.output, args.audit_json,
                                         args.inventory_jsonl, args.policy_json])
        if args.output and args.output.name.endswith('.gz'):
            raise ValueError('La salida del parche debe ser M3U sin gzip; comprimir después.')
        info = inspect_format(source)
        if not info['kind'].startswith('iptv_catalog'):
            raise ValueError(f"Formato {info['kind']}: usar auditor HLS/segmentos, no el parche de catálogo IPTV.")
        if args.output and info['has_verified_sources']:
            raise ValueError('Fuentes verificadas presentes: auditar sin --output y adaptar el contrato sin degradar la verdad de fuente.')
    except (ValueError, OSError, UnicodeError) as e:
        ap.error(str(e))
    print(f"Formato detectado: {info['kind']}", flush=True)
    # El parser original interpreta el mismo conjunto de argumentos de sys.argv.
    core.main()


if __name__ == '__main__':
    main()
