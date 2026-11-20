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
VERIFIED_SOURCE_TAGS = ('#EXT-X-APE-RESOLUTION-VERIFIED:true',
                        '#EXT-X-APE-CODEC-VERIFIED:true', '#EXT-X-APE-HDR-VERIFIED:true')


def inspect_format(path):
    entries = 0
    hls_variants = 0
    has_media = False
    has_segment_duration = False
    has_verified_sources = False
    with core.open_text(path) as f:
        for line in f:
            if line.startswith(HLS_MEDIA_TAGS):
                has_media = True
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
    if has_media or has_segment_duration:
        kind = 'hls_media_or_segment_playlist'
    elif not entries and hls_variants:
        kind = 'hls_master'
    elif not entries:
        kind = 'unsupported_no_extinf_entries'
    else:
        kind = 'iptv_catalog_hybrid' if hls_variants else 'iptv_catalog'
    return {'kind': kind, 'has_verified_sources': has_verified_sources}


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
