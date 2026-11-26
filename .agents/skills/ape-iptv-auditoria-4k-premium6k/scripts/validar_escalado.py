#!/usr/bin/env python3
"""Pruebas offline con señales sintéticas; NO demuestra mejora visual ni IPTV vivo.
Comprueba geometría 4K/6K y codificación HEVC de diez bits con FFmpeg/ffprobe.
"""
from __future__ import annotations
import argparse
import json
from pathlib import Path
import re
import subprocess
import tempfile


def graph(width, height):
    # DAR toma en cuenta SAR: no deformar fuentes 4:3 o anamórficas.
    aspect = 'if(gt(sar,0),dar,iw/ih)'
    w = f'max(2,2*floor(min({width},{height}*{aspect})/2))'
    h = f'max(2,2*floor(min({height},{width}/{aspect})/2))'
    return (f"scale=w='{w}':h='{h}':flags=lanczos,setsar=1,"
            f'pad=w={width}:h={height}:x=(ow-iw)/2:y=(oh-ih)/2:color=black')


def select_geometry(source_width, source_height, target_width, target_height):
    if source_width > target_width or source_height > target_height:
        return {'mode': 'preserve_higher_source', 'width': source_width,
                'height': source_height, 'graph': 'null'}
    return {'mode': 'spatial_upscale', 'width': target_width,
            'height': target_height, 'graph': graph(target_width, target_height)}


def run(cmd, timeout=120):
    return subprocess.run(cmd, check=True, capture_output=True, text=True, timeout=timeout)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--output-json', type=Path, required=True)
    args = ap.parse_args()
    results = []
    for tw, th in [(3840, 2160), (5760, 3240)]:
        for sw, sh, sar in [(720, 480, '8/9'), (720, 576, '16/15'),
                            (1280, 720, '1/1'), (1920, 1080, '1/1'),
                            (3840, 2160, '1/1')]:
            geometry = select_geometry(sw, sh, tw, th)
            vf = f'setsar={sar},' + geometry['graph'] + ',showinfo'
            cmd = ['ffmpeg', '-hide_banner', '-nostdin', '-filter_threads', '2',
                   '-f', 'lavfi', '-i', f'color=c=gray:s={sw}x{sh}:r=25',
                   '-vf', vf, '-frames:v', '1', '-an', '-f', 'null', '-']
            out = run(cmd)
            frames = re.findall(r'sar:([\d/]+) s:(\d+)x(\d+)', out.stderr)
            assert frames, 'No se obtuvo geometría de showinfo.'
            final = frames[-1]
            assert tuple(map(int, final[1:])) == (geometry['width'], geometry['height'])
            assert final[0] == '1/1'
            results.append({'kind': 'geometry', 'source': f'{sw}x{sh}', 'source_sar': sar,
                            'output': f'{tw}x{th}', 'output_sar': final[0], 'passed': True})
            print(f'Geometría {sw}x{sh} SAR {sar} -> {tw}x{th}: OK', flush=True)
        # Un frame codificado de verdad: HEVC main10, sin simular HDR.
        with tempfile.TemporaryDirectory(prefix='ape-encode-') as temp:
            file = Path(temp) / 'test.mkv'
            cmd = ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-nostdin',
                   '-filter_threads', '2', '-f', 'lavfi', '-i', 'testsrc2=s=640x360:r=25',
                   '-vf', graph(tw, th), '-frames:v', '1', '-an', '-c:v', 'libx265',
                   '-preset', 'ultrafast', '-crf', '18', '-pix_fmt', 'yuv420p10le',
                   '-x265-params', 'pools=2:frame-threads=1:log-level=error', str(file)]
            run(cmd)
            info = json.loads(run(['ffprobe', '-v', 'error', '-select_streams', 'v:0',
                                  '-show_streams', '-of', 'json', str(file)]).stdout)['streams'][0]
            assert (info['width'], info['height']) == (tw, th)
            assert info['codec_name'] == 'hevc'
            assert info['pix_fmt'] == 'yuv420p10le'
            assert info.get('color_transfer') not in ('smpte2084', 'arib-std-b67')
            # Comprobar que el frame HEVC se decodifica, no solo leer cabeceras.
            run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-nostdin', '-threads', '2',
                 '-i', str(file), '-frames:v', '1', '-f', 'null', '-'])
            results.append({'kind': 'encode_decode', 'source': '640x360 synthetic',
                            'output': f'{tw}x{th}', 'codec': info['codec_name'],
                            'profile': info.get('profile'), 'pixel_format': info['pix_fmt'],
                            'hdr_claim': False, 'passed': True})
            print(f'HEVC Main10 {tw}x{th}, codificación y decodificación: OK', flush=True)
    for tw, th in [(3840, 2160), (5760, 3240)]:
        geometry = select_geometry(7680, 4320, tw, th)
        assert geometry['mode'] == 'preserve_higher_source'
        assert geometry['graph'] == 'null'
        results.append({'kind': 'no_downscale_policy', 'source': '7680x4320',
                        'requested': f'{tw}x{th}', 'output': '7680x4320', 'passed': True})
    record = {'scope': 'offline_synthetic_not_live_iptv', 'ffmpeg_version': run(['ffmpeg', '-version']).stdout.splitlines()[0],
              'tests': results, 'all_passed': True,
              'not_verified': ['subjective_image_improvement', 'live_realtime_throughput',
                               'vps_deployment', 'player_compatibility', 'live_channels',
                               'sub_30_ms_latency', 'automatic_zapping']}
    args.output_json.write_text(json.dumps(record, ensure_ascii=False, indent=2) + '\n')


if __name__ == '__main__':
    main()
