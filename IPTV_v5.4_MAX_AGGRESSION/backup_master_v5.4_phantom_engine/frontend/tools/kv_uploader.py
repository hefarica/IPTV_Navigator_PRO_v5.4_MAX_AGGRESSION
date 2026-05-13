#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
═══════════════════════════════════════════════════════════════════════════════
📤 APE KV SESSION UPLOADER v15.0
═══════════════════════════════════════════════════════════════════════════════

Sube las sesiones generadas por m3u8_transformer_v15.py a Cloudflare KV.
Utiliza la API de Cloudflare directamente para bulk upload.

USO:
    python kv_uploader.py session_map.json --account-id YOUR_ACCOUNT_ID --namespace-id YOUR_KV_ID

REQUISITOS:
    pip install requests

═══════════════════════════════════════════════════════════════════════════════
"""

import json
import argparse
import subprocess
from pathlib import Path


def upload_via_wrangler(session_map_path: str, kv_namespace: str = "PLAYLISTS_KV"):
    """
    Sube sesiones usando wrangler kv:key put (más simple, no requiere API token).
    """
    print(f"📤 Subiendo sesiones a Cloudflare KV via wrangler...")
    print(f"   Namespace: {kv_namespace}")
    
    with open(session_map_path, 'r', encoding='utf-8') as f:
        sessions = json.load(f)
    
    total = len(sessions)
    success = 0
    failed = 0
    
    print(f"   Total sesiones: {total:,}")
    print()
    
    for i, (session_id, data) in enumerate(sessions.items()):
        key = f"session:{session_id}"
        value = json.dumps(data)
        
        # Usar wrangler kv:key put
        try:
            result = subprocess.run([
                'npx', 'wrangler', 'kv:key', 'put',
                '--binding', kv_namespace,
                '--ttl', '21600',  # 6 horas
                key,
                value
            ], capture_output=True, text=True, timeout=30)
            
            if result.returncode == 0:
                success += 1
            else:
                failed += 1
                if failed <= 5:  # Solo mostrar primeros 5 errores
                    print(f"   ❌ Error en {session_id}: {result.stderr[:100]}")
                    
        except Exception as e:
            failed += 1
            if failed <= 5:
                print(f"   ❌ Excepción en {session_id}: {e}")
        
        # Progreso cada 100
        if (i + 1) % 100 == 0:
            print(f"   ✓ {i + 1:,}/{total:,} sesiones procesadas...")
    
    print()
    print("=" * 60)
    print("📊 RESUMEN")
    print("=" * 60)
    print(f"   Total:    {total:,}")
    print(f"   Éxito:    {success:,}")
    print(f"   Fallidos: {failed:,}")


def generate_bulk_json(session_map_path: str, output_path: str):
    """
    Genera un archivo JSON en formato bulk para wrangler kv:bulk put.
    Más eficiente para grandes cantidades de sesiones.
    """
    print(f"📦 Generando archivo bulk para KV...")
    
    with open(session_map_path, 'r', encoding='utf-8') as f:
        sessions = json.load(f)
    
    bulk_entries = []
    
    for session_id, data in sessions.items():
        bulk_entries.append({
            'key': f"session:{session_id}",
            'value': json.dumps(data),
            'expiration_ttl': 21600  # 6 horas
        })
    
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(bulk_entries, f)
    
    print(f"   ✅ Archivo bulk generado: {output_path}")
    print(f"   Total entradas: {len(bulk_entries):,}")
    print()
    print("   Para subir, ejecuta:")
    print(f"   npx wrangler kv:bulk put --binding PLAYLISTS_KV {output_path}")


def main():
    parser = argparse.ArgumentParser(
        description='APE KV Session Uploader - Sube sesiones a Cloudflare KV'
    )
    parser.add_argument('session_map', help='Archivo session_map.json generado por m3u8_transformer')
    parser.add_argument(
        '--mode', '-m',
        choices=['bulk', 'individual'],
        default='bulk',
        help='Modo de upload: bulk (genera archivo) o individual (sube uno a uno)'
    )
    parser.add_argument(
        '--output', '-o',
        default='kv_bulk_upload.json',
        help='Archivo de salida para modo bulk (default: kv_bulk_upload.json)'
    )
    parser.add_argument(
        '--namespace', '-n',
        default='PLAYLISTS_KV',
        help='Nombre del binding KV (default: PLAYLISTS_KV)'
    )
    
    args = parser.parse_args()
    
    if not Path(args.session_map).exists():
        print(f"❌ Error: Archivo no encontrado: {args.session_map}")
        return
    
    if args.mode == 'bulk':
        generate_bulk_json(args.session_map, args.output)
    else:
        upload_via_wrangler(args.session_map, args.namespace)


if __name__ == '__main__':
    main()
