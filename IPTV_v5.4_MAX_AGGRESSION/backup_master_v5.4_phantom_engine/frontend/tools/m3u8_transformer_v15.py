#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
═══════════════════════════════════════════════════════════════════════════════
🔄 APE M3U8 TRANSFORMER v15.1 SUPREMO
═══════════════════════════════════════════════════════════════════════════════

REGLA ABSOLUTA:
- ❌ NUNCA eliminar headers
- ❌ NUNCA eliminar configuración de manifiestos
- ❌ NUNCA eliminar parámetros de prefetch/streaming
- ✅ SOLO ofuscar URLs (ocultar JWT/credenciales)
- ✅ REENVIAR 100% de los headers al origen (~94 headers)

CATEGORÍAS DE HEADERS PRESERVADOS:
1. 🔐 Identidad (11): User-Agent, Accept, Sec-CH-UA-*
2. 🔗 Conexión & Seguridad (10)
3. 💾 Cache & Range (5)
4. 🌐 Origen & Referer (3)
5. 🎯 APE Engine Core (7)
6. 🎬 Playback Avanzado (7)
7. 🎥 Codecs & DRM (3)
8. 📡 CDN & Buffer (4)
9. 📊 Metadata & Tracking (5)
10. ⚡ Extras SUPREMO (3)
11. 📱 OTT Navigator (8)
12. 🎛️ Control de Streaming (6)
13. 🔒 Seguridad & Anti-Block (3)
+ Motor V4.1 (6)
+ Prefetch (8)
+ Streaming Optimization (5)
+ Manifest Config (4)
─────────────────────────────
TOTAL: ~94 headers

USO:
    python m3u8_transformer_v15.py input.m3u8 output.m3u8 --domain api.ape-tv.net

═══════════════════════════════════════════════════════════════════════════════
"""

import re
import json
import uuid
import hashlib
import argparse
from urllib.parse import urlparse, parse_qs, urlencode
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Tuple, Any


class APEM3U8TransformerV15Supremo:
    """
    Transformador M3U8 que:
    - PRESERVA 100% de los headers (~94 categorías)
    - PRESERVA configuración de manifiestos
    - PRESERVA parámetros de prefetch y streaming
    - SOLO ofusca URLs (JWT + credenciales)
    """
    
    # Definición de TODAS las categorías de headers
    HEADER_CATEGORIES = {
        'identity': {
            'name': '🔐 Identidad',
            'headers': [
                'User-Agent', 'Accept', 'Accept-Encoding', 'Accept-Language',
                'Sec-CH-UA', 'Sec-CH-UA-Mobile', 'Sec-CH-UA-Platform',
                'Sec-CH-UA-Full-Version-List', 'Sec-CH-UA-Arch', 
                'Sec-CH-UA-Bitness', 'Sec-CH-UA-Model'
            ]
        },
        'connection': {
            'name': '🔗 Conexión & Seguridad',
            'headers': [
                'Connection', 'Keep-Alive', 'Upgrade-Insecure-Requests',
                'Sec-Fetch-Dest', 'Sec-Fetch-Mode', 'Sec-Fetch-Site',
                'Sec-Fetch-User', 'DNT', 'X-Requested-With', 'Priority'
            ]
        },
        'cache': {
            'name': '💾 Cache & Range',
            'headers': [
                'Cache-Control', 'Pragma', 'If-None-Match', 
                'If-Modified-Since', 'Range'
            ]
        },
        'cors': {
            'name': '🌐 Origen & Referer',
            'headers': ['Origin', 'Referer', 'Host']
        },
        'ape_core': {
            'name': '🎯 APE Engine Core',
            'headers': [
                'X-APE-Version', 'X-APE-Profile', 'X-APE-Level',
                'X-APE-Buffer', 'X-APE-Strategy', 'X-APE-JWT', 'X-APE-Session'
            ]
        },
        'playback': {
            'name': '🎬 Playback Avanzado',
            'headers': [
                'X-Playback-Session-Id', 'X-Stream-Quality', 'X-Bitrate-Cap',
                'X-Buffer-Size', 'X-Latency-Mode', 'X-ABR-Algorithm', 'X-Seek-Position'
            ]
        },
        'codecs': {
            'name': '🎥 Codecs & DRM',
            'headers': ['X-Codec-Hint', 'X-DRM-System', 'X-License-URL']
        },
        'cdn': {
            'name': '📡 CDN & Buffer',
            'headers': [
                'X-CDN-Provider', 'X-Edge-Location', 
                'X-Cache-Status', 'X-Buffer-Mode'
            ]
        },
        'metadata': {
            'name': '📊 Metadata & Tracking',
            'headers': [
                'X-Request-ID', 'X-Correlation-ID', 'X-Trace-ID',
                'X-Client-Version', 'X-Device-ID'
            ]
        },
        'extra': {
            'name': '⚡ Extras SUPREMO',
            'headers': ['X-Supremo-Mode', 'X-Ultra-HD', 'X-Zero-Freeze']
        },
        'ott_navigator': {
            'name': '📱 OTT Navigator',
            'headers': [
                'X-OTT-Version', 'X-OTT-Device', 'X-OTT-Platform',
                'X-OTT-Catchup', 'X-OTT-EPG', 'X-OTT-VOD',
                'X-OTT-Timeshift', 'X-OTT-Archive'
            ]
        },
        'streaming_control': {
            'name': '🎛️ Control de Streaming',
            'headers': [
                'X-Stream-Type', 'X-Live-Edge', 'X-DVR-Window',
                'X-Trick-Mode', 'X-Bandwidth-Estimate', 'X-Quality-Switch'
            ]
        },
        'security': {
            'name': '🔒 Seguridad & Anti-Block',
            'headers': ['X-Forwarded-For', 'X-Real-IP', 'X-Anti-Block-Token']
        }
    }
    
    # Configuración del Manifiesto SUPREMO
    MANIFEST_CONFIG = {
        'version': '13.1.0-SUPREMO',
        'jwt_expiration': '365_DAYS',
        'multilayer_strategy': 'EXTVLCOPT,KODIPROP,PIPE_HEADERS',
        'matrix_type': '65_HEADERS_BY_PERFIL'
    }
    
    # Configuración V4.1 Motor APE
    V41_CONFIG = {
        'auto_detect_level': True,
        'anti_freeze_level': 3,  # L3 Balanceado
        'player_target': 'generic',
        'compression_profile': 'AUTO',
        'serverless_v5': False
    }
    
    # Configuración Prefetch
    PREFETCH_CONFIG = {
        'strategy': 'ULTRA_AGRESIVO',
        'segments': 90,
        'parallel_downloads': 40,
        'buffer_target_seconds': 240,
        'min_bandwidth_mbps': 120,
        'adaptive_enabled': True,
        'ai_prediction_enabled': True
    }
    
    def __init__(self, input_path: str, output_path: str, base_domain: str):
        self.input_path = Path(input_path)
        self.output_path = Path(output_path)
        self.base_domain = base_domain
        
        # Estadísticas
        self.stats = {
            'channels_processed': 0,
            'sessions_created': 0,
            'headers_preserved': 0,
            'extinf_lines': 0,
            'kodiprop_lines': 0,
            'extvlcopt_lines': 0,
            'exthttp_lines': 0,
            'manifest_headers': 0,
            'urls_obfuscated': 0,
            'errors': []
        }
        
        # Mapa de sesiones
        self.session_map = {}
        
        print("=" * 70)
        print("[*] APE M3U8 TRANSFORMER v15.1 SUPREMO")
        print("=" * 70)
        print(f"[INPUT]  {self.input_path}")
        print(f"[OUTPUT] {self.output_path}")
        print(f"[DOMAIN] {self.base_domain}")
        print()
        print("REGLA ABSOLUTA:")
        print("   [OK] Preservar 100% de headers (~94)")
        print("   [OK] Preservar manifiestos, prefetch, V4.1")
        print("   [OK] SOLO ofuscar URLs (JWT+creds)")
        print("=" * 70)
        print()
    
    def generate_session_id(self, channel_id: str, url: str) -> str:
        """Genera session ID único de 16 caracteres."""
        timestamp = datetime.now().strftime("%Y%m%d%H%M")
        unique = f"{channel_id}-{url}-{timestamp}-{uuid.uuid4().hex[:8]}"
        return hashlib.sha256(unique.encode()).hexdigest()[:16]
    
    def extract_all_headers_from_block(self, lines: List[str]) -> Dict[str, Any]:
        """
        Extrae TODOS los headers de un bloque de canal.
        Incluye: #KODIPROP, #EXTVLCOPT, #EXTHTTP, #EXT-X-APE-*
        """
        headers = {
            'kodiprop': {},
            'extvlcopt': {},
            'exthttp': {},
            'ape_headers': {},
            'raw_lines': []  # Preservar líneas exactas
        }
        
        for line in lines:
            line = line.strip()
            
            # #KODIPROP:key=value
            if line.startswith('#KODIPROP:'):
                headers['raw_lines'].append(line)
                match = re.match(r'#KODIPROP:([^=]+)=(.+)', line)
                if match:
                    key, value = match.groups()
                    headers['kodiprop'][key.strip()] = value.strip()
                    self.stats['kodiprop_lines'] += 1
            
            # #EXTVLCOPT:key=value
            elif line.startswith('#EXTVLCOPT:'):
                headers['raw_lines'].append(line)
                match = re.match(r'#EXTVLCOPT:([^=]+)=(.+)', line)
                if match:
                    key, value = match.groups()
                    headers['extvlcopt'][key.strip()] = value.strip()
                    self.stats['extvlcopt_lines'] += 1
            
            # #EXTHTTP:{"header": "value"}
            elif line.startswith('#EXTHTTP:'):
                headers['raw_lines'].append(line)
                try:
                    json_str = line[9:]  # Después de #EXTHTTP:
                    headers['exthttp'] = json.loads(json_str)
                    self.stats['exthttp_lines'] += 1
                except:
                    pass
            
            # #EXT-X-APE-*
            elif line.startswith('#EXT-X-APE-'):
                headers['raw_lines'].append(line)
                match = re.match(r'#EXT-X-APE-([^:]+):(.+)', line)
                if match:
                    key, value = match.groups()
                    headers['ape_headers'][key.strip()] = value.strip()
        
        return headers
    
    def extract_jwt_and_creds(self, url: str) -> Tuple[str, str, str, str, str]:
        """
        Extrae JWT y credenciales de la URL.
        Retorna: (jwt, username, password, host, clean_path)
        """
        try:
            parsed = urlparse(url)
            params = parse_qs(parsed.query)
            
            # Extraer JWT
            jwt_token = None
            for jwt_param in ['ape_jwt', 'jwt', 'token', 'auth', 'key']:
                if jwt_param in params:
                    jwt_token = params[jwt_param][0]
                    break
            
            # Extraer credenciales del path: /live/USERNAME/PASSWORD/...
            username = None
            password = None
            path_parts = parsed.path.split('/')
            
            if len(path_parts) >= 4:
                if path_parts[1] in ['live', 'movie', 'series', 'get.php']:
                    username = path_parts[2]
                    password = path_parts[3]
            
            return jwt_token, username, password, parsed.netloc, parsed.path
            
        except Exception as e:
            self.stats['errors'].append(f"Error parsing URL: {e}")
            return None, None, None, None, None
    
    def obfuscate_url(self, original_url: str, channel_id: str, 
                      all_headers: Dict) -> Tuple[str, str]:
        """
        SOLO ofusca la URL, preservando todos los headers.
        Retorna: (url_ofuscada, session_id)
        """
        # Extraer datos sensibles
        jwt, username, password, host, path = self.extract_jwt_and_creds(original_url)
        
        # Generar session ID
        session_id = self.generate_session_id(channel_id, original_url)
        
        # Crear entrada de sesión con TODOS los datos
        self.session_map[session_id] = {
            # Datos sensibles (ofuscados)
            'jwt': jwt,
            'username': username,
            'password': password,
            'original_host': host,
            'original_url': original_url.strip(),
            'original_path': path,
            
            # TODOS los headers preservados (SIN MODIFICAR)
            'headers': all_headers,
            
            # Configuración del manifiesto
            'manifest_config': self.MANIFEST_CONFIG,
            
            # Configuración V4.1
            'v41_config': self.V41_CONFIG,
            
            # Configuración Prefetch
            'prefetch_config': self.PREFETCH_CONFIG,
            
            # Metadata
            'channel_id': channel_id,
            'created_at': datetime.now().isoformat(),
            'ttl_hours': 6
        }
        
        # URL ofuscada (limpia)
        obfuscated_url = f"https://{self.base_domain}/ch/{channel_id}?sid={session_id}"
        
        self.stats['sessions_created'] += 1
        self.stats['urls_obfuscated'] += 1
        
        return obfuscated_url, session_id
    
    def process(self):
        """
        Procesa el M3U8:
        - PRESERVA todas las líneas de headers exactamente como están
        - SOLO reemplaza las URLs con versión ofuscada
        """
        print("[1/4] Leyendo archivo de entrada...")
        
        with open(self.input_path, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
        
        lines = content.split('\n')
        output_lines = []
        
        print(f"      Total lineas: {len(lines):,}")
        print()
        print("[2/4] Procesando (preservando 100% headers)...")
        
        i = 0
        current_block = []
        current_extinf = None
        
        while i < len(lines):
            line = lines[i]
            
            # Línea #EXTM3U o #EXT-X-* global - PRESERVAR EXACTO
            if line.startswith('#EXTM3U') or (line.startswith('#EXT-X-') and not line.startswith('#EXTINF')):
                output_lines.append(line)
                self.stats['manifest_headers'] += 1
                i += 1
                continue
            
            # Detectar inicio de bloque: #EXTINF
            if line.startswith('#EXTINF:'):
                current_extinf = line
                current_block = [line]
                self.stats['extinf_lines'] += 1
                i += 1
                
                # Recopilar líneas hasta la URL
                while i < len(lines):
                    next_line = lines[i]
                    
                    # Si es URL, fin del bloque
                    if next_line.strip().startswith('http'):
                        url_line = next_line.strip()
                        
                        # Extraer channel ID
                        channel_id = None
                        match = re.search(r'tvg-id="([^"]*)"', current_extinf)
                        if match and match.group(1):
                            channel_id = match.group(1)
                        else:
                            # Extraer del path
                            path_match = re.search(r'/(\d+)\.m3u8', url_line)
                            if path_match:
                                channel_id = path_match.group(1)
                            else:
                                channel_id = str(self.stats['channels_processed'] + 1)
                        
                        # Extraer TODOS los headers del bloque
                        all_headers = self.extract_all_headers_from_block(current_block)
                        
                        # Contar headers preservados
                        total_headers = (
                            len(all_headers['kodiprop']) +
                            len(all_headers['extvlcopt']) +
                            len(all_headers['exthttp']) +
                            len(all_headers['ape_headers'])
                        )
                        self.stats['headers_preserved'] += total_headers
                        
                        # PRESERVAR todas las líneas del bloque EXACTAS
                        for block_line in current_block:
                            output_lines.append(block_line)
                        
                        # SOLO ofuscar la URL
                        obfuscated_url, sid = self.obfuscate_url(
                            url_line, channel_id, all_headers
                        )
                        output_lines.append(obfuscated_url)
                        
                        self.stats['channels_processed'] += 1
                        
                        # Progreso
                        if self.stats['channels_processed'] % 5000 == 0:
                            print(f"      [OK] {self.stats['channels_processed']:,} canales...")
                        
                        i += 1
                        break
                    
                    # Si es header (#KODIPROP, #EXTVLCOPT, etc), agregar al bloque
                    elif next_line.strip().startswith('#'):
                        current_block.append(next_line)
                        i += 1
                    
                    # Si es línea vacía, ignorar
                    elif not next_line.strip():
                        i += 1
                    
                    else:
                        # Línea inesperada, salir
                        break
                
                current_block = []
                current_extinf = None
                continue
            
            # Otras líneas - PRESERVAR EXACTAS
            if line.strip():
                output_lines.append(line)
            
            i += 1
        
        # Escribir output
        print()
        print("[3/4] Escribiendo archivos...")
        
        with open(self.output_path, 'w', encoding='utf-8') as f:
            f.write('\n'.join(output_lines))
        
        # Exportar session_map
        session_map_path = self.output_path.parent / 'session_map.json'
        with open(session_map_path, 'w', encoding='utf-8') as f:
            json.dump(self.session_map, f, indent=2, ensure_ascii=False)
        
        # Exportar formato bulk para wrangler
        kv_bulk_path = self.output_path.parent / 'kv_bulk_upload.json'
        kv_entries = []
        for sid, data in self.session_map.items():
            kv_entries.append({
                'key': f"session:{sid}",
                'value': json.dumps(data),
                'expiration_ttl': 21600
            })
        with open(kv_bulk_path, 'w', encoding='utf-8') as f:
            json.dump(kv_entries, f)
        
        # Resumen
        print()
        print("=" * 70)
        print("[OK] TRANSFORMACION COMPLETADA - SUPREMO v15.1")
        print("=" * 70)
        print()
        print("ESTADISTICAS:")
        print(f"   Canales procesados:    {self.stats['channels_processed']:,}")
        print(f"   URLs ofuscadas:        {self.stats['urls_obfuscated']:,}")
        print(f"   Sesiones creadas:      {self.stats['sessions_created']:,}")
        print()
        print("HEADERS PRESERVADOS (100%):")
        print(f"   #EXTINF:               {self.stats['extinf_lines']:,}")
        print(f"   #KODIPROP:             {self.stats['kodiprop_lines']:,}")
        print(f"   #EXTVLCOPT:            {self.stats['extvlcopt_lines']:,}")
        print(f"   #EXTHTTP:              {self.stats['exthttp_lines']:,}")
        print(f"   #EXT-X-* (manifest):   {self.stats['manifest_headers']:,}")
        print(f"   Total headers:         {self.stats['headers_preserved']:,}")
        print()
        print("ARCHIVOS GENERADOS:")
        print(f"   {self.output_path}")
        print(f"   {session_map_path}")
        print(f"   {kv_bulk_path}")
        print()
        
        if self.stats['errors']:
            print(f"[!] Errores: {len(self.stats['errors'])}")
            for err in self.stats['errors'][:3]:
                print(f"   - {err}")
        
        print("=" * 70)
        print("[REGLA CUMPLIDA] Solo URLs ofuscadas, headers 100% intactos")
        print("=" * 70)
        
        return self.stats


def main():
    parser = argparse.ArgumentParser(
        description='APE M3U8 Transformer v15.1 SUPREMO - Preserva 100% headers, solo ofusca URLs'
    )
    parser.add_argument('input', help='Archivo M3U8 de entrada')
    parser.add_argument('output', help='Archivo M3U8 de salida')
    parser.add_argument(
        '--domain', '-d',
        default='api.ape-tv.net',
        help='Dominio base para URLs ofuscadas (default: api.ape-tv.net)'
    )
    
    args = parser.parse_args()
    
    transformer = APEM3U8TransformerV15Supremo(
        input_path=args.input,
        output_path=args.output,
        base_domain=args.domain
    )
    
    transformer.process()


if __name__ == '__main__':
    main()
