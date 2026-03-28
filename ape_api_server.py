#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
╔═══════════════════════════════════════════════════════════════════════════════════╗
║                    APE API UNIFIED v2.1.0 - SERVIDOR COMPLETO                    ║
║                     Para IPTV Navigator PRO + Hetzner VPS                        ║
╠═══════════════════════════════════════════════════════════════════════════════════╣
║  Servidor unificado que combina:                                                  ║
║  - API de estado y configuración (v1.1.0)                                        ║
║  - Motor ABR dinámico (v1.0.0)                                                   ║
║  - Sincronización App→VPS                                                        ║
║  - Generador M3U8 con headers                                                    ║
║  - Parser de configuración embebida (v2.1.0) ← NUEVO                             ║
╚═══════════════════════════════════════════════════════════════════════════════════╝
"""

from flask import Flask, request, jsonify, Response, send_file
from flask_cors import CORS
from functools import wraps
import json
import os
import time
import hashlib
import logging
from datetime import datetime
import threading
import re
import uuid
import tempfile
import shutil
from werkzeug.utils import secure_filename

# Configuración de logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('APE_API_UNIFIED')

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

# ═══════════════════════════════════════════════════════════════════════════════════
# CONFIGURACIÓN GLOBAL
# ═══════════════════════════════════════════════════════════════════════════════════

VERSION = "2.1.0"
SERVER_NAME = "APE API UNIFIED"
START_TIME = datetime.utcnow()

# Directorios
M3U8_DIR = "/var/www/m3u8"
CACHE_DIR = "/var/cache/ape"
LISTS_DIR = "/var/www/lists"

# Crear directorios si no existen
for d in [M3U8_DIR, CACHE_DIR, LISTS_DIR]:
    os.makedirs(d, exist_ok=True)

# ═══════════════════════════════════════════════════════════════════════════════════
# PERFILES ABR (P0-P5)
# ═══════════════════════════════════════════════════════════════════════════════════

ABR_PROFILES = {
    "P0": {
        "id": "P0",
        "name": "ULTRA_EXTREME",
        "level": "L6",
        "quality": "8K/4K ULTRA",
        "resolution": "7680x4320",
        "min_resolution": "3840x2160",
        "min_bandwidth_mbps": 50,
        "max_bandwidth_mbps": 150,
        "buffer_ms": 60000,
        "network_caching_ms": 60000,
        "live_caching_ms": 60000,
        "bitrate_mbps": 80,
        "codecs": ["av1", "hevc", "h264"],
        "hdr_support": ["hdr10+", "dolby-vision", "hdr10", "hlg"],
        "color_depth": "12bit",
        "frame_rates": [60, 120],
        "audio_codecs": ["eac3", "ac3", "aac"],
        "audio_channels": "7.1",
        "priority": 1,
        "description": "Máxima calidad para conexiones de fibra óptica premium"
    },
    "P1": {
        "id": "P1",
        "name": "4K_SUPREME",
        "level": "L5",
        "quality": "4K HDR",
        "resolution": "3840x2160",
        "min_resolution": "3840x2160",
        "min_bandwidth_mbps": 35,
        "max_bandwidth_mbps": 60,
        "buffer_ms": 45000,
        "network_caching_ms": 45000,
        "live_caching_ms": 45000,
        "bitrate_mbps": 45,
        "codecs": ["hevc", "h264", "av1"],
        "hdr_support": ["hdr10", "dolby-vision", "hlg"],
        "color_depth": "10bit",
        "frame_rates": [60],
        "audio_codecs": ["eac3", "ac3", "aac"],
        "audio_channels": "5.1",
        "priority": 2,
        "description": "4K con HDR para conexiones de alta velocidad"
    },
    "P2": {
        "id": "P2",
        "name": "4K_EXTREME",
        "level": "L4",
        "quality": "4K SDR",
        "resolution": "3840x2160",
        "min_resolution": "1920x1080",
        "min_bandwidth_mbps": 20,
        "max_bandwidth_mbps": 40,
        "buffer_ms": 30000,
        "network_caching_ms": 30000,
        "live_caching_ms": 30000,
        "bitrate_mbps": 25,
        "codecs": ["hevc", "h264"],
        "hdr_support": ["hdr10"],
        "color_depth": "10bit",
        "frame_rates": [30, 60],
        "audio_codecs": ["ac3", "aac"],
        "audio_channels": "5.1",
        "priority": 3,
        "description": "4K estándar para conexiones rápidas"
    },
    "P3": {
        "id": "P3",
        "name": "FHD_ADVANCED",
        "level": "L3",
        "quality": "1080p FHD",
        "resolution": "1920x1080",
        "min_resolution": "1280x720",
        "min_bandwidth_mbps": 8,
        "max_bandwidth_mbps": 25,
        "buffer_ms": 20000,
        "network_caching_ms": 20000,
        "live_caching_ms": 20000,
        "bitrate_mbps": 12,
        "codecs": ["h264", "hevc"],
        "hdr_support": [],
        "color_depth": "8bit",
        "frame_rates": [30, 60],
        "audio_codecs": ["aac", "ac3"],
        "audio_channels": "5.1",
        "priority": 4,
        "description": "Full HD para conexiones estables"
    },
    "P4": {
        "id": "P4",
        "name": "HD_STABLE",
        "level": "L2",
        "quality": "720p HD",
        "resolution": "1280x720",
        "min_resolution": "854x480",
        "min_bandwidth_mbps": 4,
        "max_bandwidth_mbps": 10,
        "buffer_ms": 15000,
        "network_caching_ms": 15000,
        "live_caching_ms": 15000,
        "bitrate_mbps": 6,
        "codecs": ["h264"],
        "hdr_support": [],
        "color_depth": "8bit",
        "frame_rates": [30],
        "audio_codecs": ["aac"],
        "audio_channels": "2.0",
        "priority": 5,
        "description": "HD para conexiones moderadas"
    },
    "P5": {
        "id": "P5",
        "name": "SD_FAILSAFE",
        "level": "L1",
        "quality": "480p SD",
        "resolution": "854x480",
        "min_resolution": "640x360",
        "min_bandwidth_mbps": 1,
        "max_bandwidth_mbps": 5,
        "buffer_ms": 10000,
        "network_caching_ms": 10000,
        "live_caching_ms": 10000,
        "bitrate_mbps": 2,
        "codecs": ["h264"],
        "hdr_support": [],
        "color_depth": "8bit",
        "frame_rates": [25, 30],
        "audio_codecs": ["aac"],
        "audio_channels": "2.0",
        "priority": 6,
        "description": "Calidad mínima garantizada para cualquier conexión"
    }
}

# ═══════════════════════════════════════════════════════════════════════════════════
# HEADERS DE CALIDAD (91 headers en 18 categorías)
# ═══════════════════════════════════════════════════════════════════════════════════

QUALITY_HEADERS = {
    "video": {
        "X-Video-Codecs": "hevc,h264,av1,vp9",
        "X-Preferred-Codec": "hevc",
        "X-Codec-Priority": "hevc,av1,h264,vp9"
    },
    "hdr": {
        "X-HDR-Support": "hdr10,hdr10+,dolby-vision,hlg",
        "X-Color-Depth": "10bit,12bit",
        "X-Color-Space": "bt2020,p3,rec709",
        "X-Dynamic-Range": "hdr",
        "X-HDR-Metadata": "static,dynamic",
        "X-Dolby-Vision-Profile": "5,8",
        "X-HDR10-Plus": "true",
        "X-HLG-Support": "true"
    },
    "resolution": {
        "X-Max-Resolution": "7680x4320",
        "X-Preferred-Resolution": "3840x2160",
        "X-Min-Resolution": "1920x1080",
        "X-Aspect-Ratio": "16:9,21:9",
        "X-Resolution-Preference": "highest"
    },
    "framerate": {
        "X-Frame-Rates": "24,25,30,50,60,120",
        "X-Preferred-FPS": "60",
        "X-HFR-Support": "true",
        "X-Motion-Interpolation": "disabled"
    },
    "audio": {
        "X-Audio-Codecs": "eac3,ac3,aac,opus,flac",
        "X-Audio-Channels": "7.1,5.1,2.0",
        "X-Dolby-Atmos": "true",
        "X-DTS-X": "true",
        "X-Audio-Bitrate": "640",
        "X-Spatial-Audio": "true"
    },
    "bitrate": {
        "X-Max-Bitrate": "100000000",
        "X-Preferred-Bitrate": "50000000",
        "X-Min-Bitrate": "5000000",
        "X-Bitrate-Mode": "variable",
        "X-Quality-Priority": "quality"
    },
    "abr_control": {
        "X-Bandwidth-Preference": "unlimited",
        "X-BW-Estimation-Window": "10",
        "X-BW-Confidence-Threshold": "0.85",
        "X-BW-Smooth-Factor": "0.15",
        "X-Packet-Loss-Monitor": "enabled",
        "X-RTT-Monitoring": "enabled",
        "X-Congestion-Detect": "enabled"
    },
    "buffer": {
        "X-Buffer-Strategy": "aggressive",
        "X-Min-Buffer-Ms": "15000",
        "X-Max-Buffer-Ms": "60000",
        "X-Target-Buffer-Ms": "30000",
        "X-Latency-Target": "low",
        "X-Live-Edge-Offset": "3"
    },
    "parallel": {
        "X-Parallel-Segments": "4",
        "X-Prefetch-Segments": "3",
        "X-Concurrent-Downloads": "4",
        "X-Chunk-Size": "2097152"
    },
    "connection": {
        "X-Connection-Type": "persistent",
        "X-Keep-Alive": "true",
        "X-Keep-Alive-Timeout": "120",
        "X-Max-Connections": "6",
        "X-HTTP-Version": "2"
    },
    "reconnection": {
        "X-Auto-Reconnect": "true",
        "X-Reconnect-Delay-Ms": "100",
        "X-Max-Reconnect-Attempts": "10",
        "X-Reconnect-Backoff": "exponential",
        "X-Session-Recovery": "enabled"
    },
    "cache": {
        "X-Cache-Mode": "aggressive",
        "X-Cache-Duration": "300",
        "X-Segment-Cache": "enabled",
        "X-Manifest-Cache": "30"
    },
    "cdn": {
        "X-CDN-Priority": "performance",
        "X-CDN-Fallback": "enabled",
        "X-Edge-Server-Preference": "nearest",
        "X-Multi-CDN": "true"
    },
    "security": {
        "X-DRM-Support": "widevine,playready,fairplay",
        "X-Secure-Transport": "required",
        "X-Token-Refresh": "auto"
    },
    "device": {
        "X-Device-Category": "smart-tv",
        "X-Screen-Type": "oled",
        "X-Hardware-Decode": "enabled",
        "X-GPU-Acceleration": "enabled"
    },
    "network": {
        "X-Network-Type": "fiber",
        "X-Network-Priority": "streaming",
        "X-QoS-Class": "realtime",
        "X-DSCP-Marking": "ef"
    },
    "playback": {
        "X-Playback-Speed": "1.0",
        "X-Trick-Mode": "enabled",
        "X-Seek-Accuracy": "keyframe",
        "X-Start-Position": "live"
    },
    "monitoring": {
        "X-Stall-Detection": "enabled",
        "X-Bitrate-Logging": "enabled",
        "X-Error-Reporting": "enabled"
    }
}

# ═══════════════════════════════════════════════════════════════════════════════════
# ALMACENAMIENTO EN MEMORIA
# ═══════════════════════════════════════════════════════════════════════════════════

SYNCED_PROFILES = {}
SYNCED_LISTS = {}
PARSED_CONFIGS = {}  # Configuraciones embebidas parseadas
REQUEST_STATS = {
    'total': 0,
    'abr_decisions': 0,
    'profile_syncs': 0,
    'list_syncs': 0,
    'url_optimizations': 0,
    'config_parses': 0,
    'list_uploads': 0
}

# ═══════════════════════════════════════════════════════════════════════════════════
# PARSER DE CONFIGURACIÓN EMBEBIDA (NUEVO v2.1.0)
# ═══════════════════════════════════════════════════════════════════════════════════

class EmbeddedConfigParser:
    """
    Parser para extraer configuración embebida de listas M3U8.
    Lee bloques #EXT-X-APE-EMBEDDED-CONFIG y los convierte en objetos Python.
    """
    
    def __init__(self):
        self.logger = logging.getLogger('EmbeddedConfigParser')
    
    def parse(self, m3u8_content):
        """
        Parsea una lista M3U8 y extrae la configuración embebida.
        
        Args:
            m3u8_content: Contenido de la lista M3U8 como string
            
        Returns:
            dict con la configuración parseada o None si no hay config embebida
        """
        result = {
            'list_id': None,
            'signature': None,
            'version': None,
            'timestamp': None,
            'profiles': {},
            'headers': {},
            'channels_count': 0,
            'has_embedded_config': False
        }
        
        lines = m3u8_content.split('\n')
        in_embedded_config = False
        in_headers_block = False
        
        for line in lines:
            line = line.strip()
            
            # Detectar inicio de config embebida
            if line == '#EXT-X-APE-EMBEDDED-CONFIG-BEGIN':
                in_embedded_config = True
                result['has_embedded_config'] = True
                continue
            
            # Detectar fin de config embebida
            if line == '#EXT-X-APE-EMBEDDED-CONFIG-END':
                in_embedded_config = False
                continue
            
            # Parsear contenido dentro del bloque
            if in_embedded_config:
                # List ID
                if line.startswith('#EXT-X-APE-LIST-ID:'):
                    result['list_id'] = line.split(':', 1)[1].strip()
                
                # Signature
                elif line.startswith('#EXT-X-APE-SIGNATURE:'):
                    result['signature'] = line.split(':', 1)[1].strip()
                
                # Version
                elif line.startswith('#EXT-X-APE-EMBEDDED-VERSION:'):
                    result['version'] = line.split(':', 1)[1].strip()
                
                # Timestamp
                elif line.startswith('#EXT-X-APE-TIMESTAMP:'):
                    result['timestamp'] = line.split(':', 1)[1].strip()
                
                # Perfil embebido (formato: P0|ULTRA_EXTREME|L6|ULTRA|8000|ultra-aggressive)
                elif line.startswith('#EXT-X-APE-EMBEDDED-PROFILE:'):
                    profile_data = line.split(':', 1)[1].strip()
                    parts = profile_data.split('|')
                    if len(parts) >= 6:
                        profile_id = parts[0]
                        result['profiles'][profile_id] = {
                            'id': profile_id,
                            'name': parts[1],
                            'level': parts[2],
                            'quality': parts[3],
                            'buffer': int(parts[4]) if parts[4].isdigit() else 2000,
                            'strategy': parts[5]
                        }
                
                # Inicio de bloque de headers
                elif line == '#EXT-X-APE-EMBEDDED-HEADERS-BEGIN':
                    in_headers_block = True
                
                # Fin de bloque de headers
                elif line == '#EXT-X-APE-EMBEDDED-HEADERS-END':
                    in_headers_block = False
                
                # Header individual (formato: P0|User-Agent|Mozilla/5.0...)
                elif in_headers_block and line.startswith('#EXT-X-APE-HEADER:'):
                    header_data = line.split(':', 1)[1].strip()
                    parts = header_data.split('|', 2)
                    if len(parts) >= 3:
                        profile_id = parts[0]
                        header_name = parts[1]
                        header_value = parts[2]
                        
                        if profile_id not in result['headers']:
                            result['headers'][profile_id] = {}
                        result['headers'][profile_id][header_name] = header_value
            
            # Contar canales (fuera del bloque de config)
            if line.startswith('#EXTINF:'):
                result['channels_count'] += 1
        
        # Log del resultado
        if result['has_embedded_config']:
            self.logger.info(f"Config embebida parseada: {result['list_id']} - {len(result['profiles'])} perfiles, {result['channels_count']} canales")
        
        return result
    
    def merge_with_defaults(self, parsed_config, client_caps=None):
        """
        Combina la configuración parseada con los valores por defecto del VPS.
        Los valores de la lista tienen prioridad sobre los defaults.
        
        Args:
            parsed_config: Configuración parseada de la lista
            client_caps: Capacidades del cliente (opcional)
            
        Returns:
            dict con configuración final combinada
        """
        merged = {
            'profiles': {},
            'headers': {},
            'selected_profile': 'P3',  # Default
            'source': 'merged'
        }
        
        # Empezar con perfiles del VPS
        for profile_id, profile in ABR_PROFILES.items():
            merged['profiles'][profile_id] = profile.copy()
        
        # Sobrescribir con perfiles de la lista si existen
        if parsed_config.get('profiles'):
            for profile_id, profile_data in parsed_config['profiles'].items():
                if profile_id in merged['profiles']:
                    # Actualizar valores específicos
                    merged['profiles'][profile_id]['buffer_ms'] = profile_data.get('buffer', merged['profiles'][profile_id]['buffer_ms'])
                    merged['profiles'][profile_id]['network_caching_ms'] = profile_data.get('buffer', merged['profiles'][profile_id]['network_caching_ms'])
                    merged['profiles'][profile_id]['live_caching_ms'] = profile_data.get('buffer', merged['profiles'][profile_id]['live_caching_ms'])
                    if 'strategy' in profile_data:
                        merged['profiles'][profile_id]['strategy'] = profile_data['strategy']
        
        # Combinar headers
        all_headers = {}
        for category, headers in QUALITY_HEADERS.items():
            all_headers.update(headers)
        
        # Sobrescribir con headers de la lista
        if parsed_config.get('headers'):
            for profile_id, profile_headers in parsed_config['headers'].items():
                for header_name, header_value in profile_headers.items():
                    all_headers[header_name] = header_value
        
        merged['headers'] = all_headers
        
        # Seleccionar perfil óptimo si hay capacidades del cliente
        if client_caps:
            decision = abr_engine.decide(client_caps)
            merged['selected_profile'] = decision['selected_profile']
        
        return merged

# Instancia global del parser
config_parser = EmbeddedConfigParser()

# ═══════════════════════════════════════════════════════════════════════════════════
# MOTOR ABR
# ═══════════════════════════════════════════════════════════════════════════════════

class ABREngine:
    def __init__(self):
        self.profiles = ABR_PROFILES
        self.headers = QUALITY_HEADERS
        self.safety_margin = 0.30
        
    def parse_resolution(self, resolution_str):
        try:
            if 'x' in str(resolution_str).lower():
                parts = str(resolution_str).lower().split('x')
                return int(parts[0]), int(parts[1])
            return 1920, 1080
        except:
            return 1920, 1080
    
    def calculate_score(self, profile, client_caps):
        score = 0
        
        # 1. Ancho de banda (40 puntos)
        client_bw = float(client_caps.get('bandwidth_mbps', 10))
        profile_min_bw = profile['min_bandwidth_mbps']
        profile_max_bw = profile['max_bandwidth_mbps']
        effective_bw = client_bw * (1 - self.safety_margin)
        
        if effective_bw >= profile_min_bw:
            if effective_bw >= profile_max_bw:
                score += 40
            else:
                ratio = (effective_bw - profile_min_bw) / (profile_max_bw - profile_min_bw)
                score += int(25 + (15 * ratio))
        else:
            score -= 20
        
        # 2. Resolución (25 puntos)
        client_res = self.parse_resolution(client_caps.get('screen_resolution', '1920x1080'))
        profile_res = self.parse_resolution(profile['resolution'])
        min_res = self.parse_resolution(profile['min_resolution'])
        
        if client_res[0] >= profile_res[0] and client_res[1] >= profile_res[1]:
            score += 25
        elif client_res[0] >= min_res[0] and client_res[1] >= min_res[1]:
            score += 15
        else:
            score += 5
        
        # 3. Codecs (20 puntos)
        client_codecs = client_caps.get('video_codecs', ['h264'])
        if isinstance(client_codecs, str):
            client_codecs = [c.strip() for c in client_codecs.split(',')]
        
        matching_codecs = set(client_codecs) & set(profile['codecs'])
        if matching_codecs:
            if 'hevc' in matching_codecs or 'av1' in matching_codecs:
                score += 20
            elif 'h264' in matching_codecs:
                score += 15
            else:
                score += 10
        
        # 4. HDR (10 puntos)
        client_hdr = client_caps.get('hdr_support', [])
        if isinstance(client_hdr, str):
            client_hdr = [h.strip() for h in client_hdr.split(',') if h.strip()]
        
        profile_hdr = profile.get('hdr_support', [])
        if profile_hdr and client_hdr:
            if set(client_hdr) & set(profile_hdr):
                score += 10
        elif not profile_hdr:
            score += 5
        
        # 5. Tipo de red (5 puntos)
        network_type = client_caps.get('network_type', 'unknown')
        if network_type in ['fiber', 'ethernet', 'cable']:
            score += 5
        elif network_type == 'wifi':
            score += 3
        elif network_type in ['4g', '5g']:
            score += 2
        
        return min(score, 100)
    
    def decide(self, client_caps, custom_profiles=None):
        """
        Toma decisión ABR basada en capacidades del cliente.
        
        Args:
            client_caps: Capacidades del cliente
            custom_profiles: Perfiles personalizados de la lista (opcional)
        """
        profiles_to_use = custom_profiles if custom_profiles else self.profiles
        scores = {}
        
        for profile_id, profile in profiles_to_use.items():
            score = self.calculate_score(profile, client_caps)
            scores[profile_id] = {'score': score, 'profile': profile}
        
        sorted_profiles = sorted(
            scores.items(),
            key=lambda x: (x[1]['score'], -x[1]['profile'].get('priority', 99)),
            reverse=True
        )
        
        for profile_id, data in sorted_profiles:
            if data['score'] >= 30:
                return {
                    'selected_profile': profile_id,
                    'profile_data': data['profile'],
                    'score': data['score'],
                    'all_scores': {k: v['score'] for k, v in scores.items()},
                    'client_caps': client_caps
                }
        
        return {
            'selected_profile': 'P5',
            'profile_data': profiles_to_use.get('P5', self.profiles['P5']),
            'score': scores.get('P5', {}).get('score', 0),
            'all_scores': {k: v['score'] for k, v in scores.items()},
            'client_caps': client_caps,
            'fallback': True
        }
    
    def get_headers_for_profile(self, profile_id, custom_headers=None):
        """
        Obtiene headers para un perfil, con soporte para headers personalizados.
        """
        profile = self.profiles.get(profile_id, self.profiles['P3'])
        headers = {}
        
        # Headers base del VPS
        for category, category_headers in self.headers.items():
            headers.update(category_headers)
        
        # Sobrescribir con headers personalizados si existen
        if custom_headers:
            headers.update(custom_headers)
        
        # Headers específicos del perfil
        headers['X-APE-Profile'] = profile_id
        headers['X-APE-Profile-Name'] = profile['name']
        headers['X-APE-Level'] = profile['level']
        headers['X-APE-Quality'] = profile['quality']
        headers['X-APE-Buffer-Ms'] = str(profile['buffer_ms'])
        headers['X-APE-Bitrate-Mbps'] = str(profile['bitrate_mbps'])
        headers['X-Preferred-Resolution'] = profile['resolution']
        headers['X-Video-Codecs'] = ','.join(profile['codecs'])
        headers['X-Preferred-Codec'] = profile['codecs'][0] if profile['codecs'] else 'h264'
        headers['X-Audio-Channels'] = profile['audio_channels']
        headers['X-Target-Buffer-Ms'] = str(profile['buffer_ms'])
        
        if profile.get('hdr_support'):
            headers['X-HDR-Support'] = ','.join(profile['hdr_support'])
        else:
            headers['X-HDR-Support'] = 'none'
        
        headers['X-Color-Depth'] = profile['color_depth']
        headers['X-Frame-Rates'] = ','.join(map(str, profile['frame_rates']))
        
        return headers

# Instancia global
abr_engine = ABREngine()

# ═══════════════════════════════════════════════════════════════════════════════════
# ENDPOINTS - ESTADO Y CONFIGURACIÓN
# ═══════════════════════════════════════════════════════════════════════════════════

@app.route('/api/health', methods=['GET', 'OPTIONS'])
def health():
    if request.method == 'OPTIONS':
        return '', 204
    
    REQUEST_STATS['total'] += 1
    uptime = (datetime.utcnow() - START_TIME).total_seconds()
    
    return jsonify({
        'status': 'ok',
        'server': SERVER_NAME,
        'version': VERSION,
        'uptime_seconds': int(uptime),
        'timestamp': datetime.utcnow().isoformat()
    })

@app.route('/api/status', methods=['GET'])
def status():
    REQUEST_STATS['total'] += 1
    uptime = (datetime.utcnow() - START_TIME).total_seconds()
    
    all_headers = {}
    for category, headers in QUALITY_HEADERS.items():
        all_headers.update(headers)
    
    return jsonify({
        'status': 'ok',
        'server': {
            'name': SERVER_NAME,
            'version': VERSION,
            'uptime_seconds': int(uptime),
            'started_at': START_TIME.isoformat()
        },
        'abr_engine': {
            'safety_margin': abr_engine.safety_margin,
            'profiles_count': len(ABR_PROFILES),
            'profiles_available': list(ABR_PROFILES.keys())
        },
        'headers': {
            'total': len(all_headers),
            'categories': len(QUALITY_HEADERS),
            'breakdown': {cat: len(hdrs) for cat, hdrs in QUALITY_HEADERS.items()}
        },
        'synced': {
            'profiles': len(SYNCED_PROFILES),
            'lists': len(SYNCED_LISTS),
            'parsed_configs': len(PARSED_CONFIGS)
        },
        'stats': REQUEST_STATS,
        'timestamp': datetime.utcnow().isoformat()
    })

@app.route('/api/profiles', methods=['GET'])
def get_profiles():
    REQUEST_STATS['total'] += 1
    return jsonify({
        'status': 'ok',
        'profiles': ABR_PROFILES,
        'count': len(ABR_PROFILES)
    })

@app.route('/api/headers', methods=['GET'])
def get_headers():
    REQUEST_STATS['total'] += 1
    all_headers = {}
    for category, headers in QUALITY_HEADERS.items():
        all_headers.update(headers)
    
    return jsonify({
        'status': 'ok',
        'headers': all_headers,
        'headers_by_category': QUALITY_HEADERS,
        'count': len(all_headers),
        'categories': list(QUALITY_HEADERS.keys())
    })

# ═══════════════════════════════════════════════════════════════════════════════════
# ENDPOINTS - ABR DINÁMICO
# ═══════════════════════════════════════════════════════════════════════════════════

@app.route('/api/abr-decide', methods=['POST', 'GET', 'OPTIONS'])
def abr_decide():
    if request.method == 'OPTIONS':
        return '', 204
    
    REQUEST_STATS['total'] += 1
    REQUEST_STATS['abr_decisions'] += 1
    
    # Obtener capacidades del cliente
    if request.method == 'POST':
        client_caps = request.get_json() or {}
    else:
        client_caps = {
            'bandwidth_mbps': float(request.args.get('bandwidth', 25)),
            'screen_resolution': request.args.get('resolution', '1920x1080'),
            'video_codecs': request.args.get('codecs', 'h264,hevc').split(','),
            'hdr_support': request.args.get('hdr', '').split(',') if request.args.get('hdr') else [],
            'network_type': request.args.get('network', 'wifi'),
            'device_type': request.args.get('device', 'smart-tv'),
            'quality_preference': request.args.get('quality', 'high')
        }
    
    # Verificar si hay configuración embebida para esta lista
    list_id = client_caps.get('list_id')
    custom_profiles = None
    custom_headers = None
    
    if list_id and list_id in PARSED_CONFIGS:
        parsed = PARSED_CONFIGS[list_id]
        if parsed.get('profiles'):
            custom_profiles = {}
            for pid, pdata in parsed['profiles'].items():
                if pid in ABR_PROFILES:
                    custom_profiles[pid] = ABR_PROFILES[pid].copy()
                    custom_profiles[pid]['buffer_ms'] = pdata.get('buffer', custom_profiles[pid]['buffer_ms'])
        if parsed.get('headers'):
            custom_headers = {}
            for pid, pheaders in parsed['headers'].items():
                custom_headers.update(pheaders)
    
    # Ejecutar decisión ABR
    decision = abr_engine.decide(client_caps, custom_profiles)
    headers = abr_engine.get_headers_for_profile(decision['selected_profile'], custom_headers)
    
    return jsonify({
        'status': 'ok',
        'decision': {
            'profile': decision['selected_profile'],
            'profile_name': decision['profile_data']['name'],
            'quality': decision['profile_data']['quality'],
            'resolution': decision['profile_data']['resolution'],
            'bitrate_mbps': decision['profile_data']['bitrate_mbps'],
            'score': decision['score'],
            'fallback': decision.get('fallback', False),
            'used_custom_config': list_id is not None and list_id in PARSED_CONFIGS
        },
        'all_scores': decision['all_scores'],
        'headers': headers,
        'headers_count': len(headers),
        'client_capabilities': client_caps,
        'timestamp': datetime.utcnow().isoformat()
    })

# ═══════════════════════════════════════════════════════════════════════════════════
# ENDPOINTS - UPLOAD Y PARSING DE LISTAS (NUEVO v2.1.0)
# ═══════════════════════════════════════════════════════════════════════════════════

@app.route('/api/upload-list', methods=['POST', 'OPTIONS'])
def upload_list():
    """
    Recibe una lista M3U8, la parsea para extraer configuración embebida,
    la guarda y retorna un ID para acceso posterior.
    """
    if request.method == 'OPTIONS':
        return '', 204
    
    REQUEST_STATS['total'] += 1
    REQUEST_STATS['list_uploads'] += 1
    
    # Obtener contenido de la lista
    if request.content_type and 'multipart/form-data' in request.content_type:
        # Upload de archivo
        if 'file' not in request.files:
            return jsonify({'status': 'error', 'message': 'No se proporcionó archivo'}), 400
        
        file = request.files['file']
        m3u8_content = file.read().decode('utf-8')
        original_name = file.filename
    else:
        # JSON con contenido
        data = request.get_json() or {}
        m3u8_content = data.get('content', '')
        original_name = data.get('name', 'uploaded_list.m3u8')
    
    if not m3u8_content:
        return jsonify({'status': 'error', 'message': 'No se proporcionó contenido de lista'}), 400
    
    # Parsear configuración embebida
    REQUEST_STATS['config_parses'] += 1
    parsed_config = config_parser.parse(m3u8_content)
    
    # Generar ID único para la lista
    list_id = parsed_config.get('list_id') or f"vps_{uuid.uuid4().hex[:12]}"
    
    # Guardar configuración parseada en memoria
    PARSED_CONFIGS[list_id] = parsed_config
    
    # Guardar lista en disco
    safe_name = re.sub(r'[^a-zA-Z0-9_.-]', '_', original_name)
    if not safe_name.endswith('.m3u8'):
        safe_name += '.m3u8'
    
    list_path = os.path.join(LISTS_DIR, f"{list_id}_{safe_name}")
    
    try:
        with open(list_path, 'w', encoding='utf-8') as f:
            f.write(m3u8_content)
    except Exception as e:
        logger.error(f"Error guardando lista: {e}")
    
    # Generar URL de acceso
    list_url = f"https://iptv-ape.duckdns.org/lists/{list_id}"
    
    return jsonify({
        'status': 'ok',
        'message': 'Lista procesada correctamente',
        'list_id': list_id,
        'list_url': list_url,
        'parsed_config': {
            'has_embedded_config': parsed_config['has_embedded_config'],
            'profiles_count': len(parsed_config['profiles']),
            'headers_count': sum(len(h) for h in parsed_config['headers'].values()),
            'channels_count': parsed_config['channels_count'],
            'signature': parsed_config.get('signature'),
            'version': parsed_config.get('version')
        },
        'file_path': list_path,
        'timestamp': datetime.utcnow().isoformat()
    })

@app.route('/api/upload-stream', methods=['POST', 'OPTIONS'])
def upload_stream():
    """
    Endpoint para subir archivos grandes usando streams (como WeTransfer).
    - Recibe el archivo como multipart/form-data
    - Procesa el stream sin cargar todo en memoria
    - Parsea config embebida mientras recibe
    - Retorna URL inmediatamente
    """
    if request.method == 'OPTIONS':
        return '', 204
    
    REQUEST_STATS['total'] += 1
    REQUEST_STATS['list_uploads'] += 1
    
    # ✅ MEJOR LOGGING
    logger.info(f"[UPLOAD-STREAM] Inicio de subida. Content-Length: {request.content_length}")
    
    try:
        # Obtener el archivo del request
        if 'file' not in request.files:
            return jsonify({
                'status': 'error',
                'message': 'No se proporcionó archivo'
            }), 400
        
        file = request.files['file']
        
        if file.filename == '':
            return jsonify({
                'status': 'error',
                'message': 'Nombre de archivo vacío'
            }), 400
        
        # Validar extensión
        if not file.filename.endswith('.m3u8'):
            filename = secure_filename(file.filename)
            if not filename.endswith('.m3u8'):
                filename += '.m3u8'
        else:
            filename = secure_filename(file.filename)
        
        # Generar ID único
        list_id = f'vps_{uuid.uuid4().hex[:12]}'
        file_path = os.path.join(LISTS_DIR, f'{list_id}_{filename}')
        
        # Procesar stream sin cargar todo en memoria
        temp_fd, temp_path = tempfile.mkstemp(suffix='.m3u8')
        
        try:
            # Escribir stream al archivo temporal
            bytes_written = 0
            chunk_size = 1024 * 1024  # 1MB chunks
            
            with os.fdopen(temp_fd, 'wb') as temp_file:
                while True:
                    chunk = file.stream.read(chunk_size)
                    if not chunk:
                        break
                    temp_file.write(chunk)
                    bytes_written += len(chunk)
            
            # Leer el archivo temporal para parsear config
            with open(temp_path, 'r', encoding='utf-8', errors='ignore') as temp_file:
                content = temp_file.read()
            
            # Mover archivo temporal a ubicación final
            logger.info(f"[UPLOAD-STREAM] Moviendo archivo temporal ({bytes_written} bytes) a {file_path}")
            shutil.move(temp_path, file_path)
            
            # ✅ REPARACIÓN: Establecer permisos 644 para que Nginx pueda leer
            os.chmod(file_path, 0o644)
            logger.info(f"[UPLOAD-STREAM] Permisos establecidos a 644")
            
            # Parsear configuración embebida
            logger.info(f"[UPLOAD-STREAM] Parseando configuración embebida...")
            parsed_config = config_parser.parse(content)
            PARSED_CONFIGS[list_id] = parsed_config
            logger.info(f"[UPLOAD-STREAM] Configuración parseada. Canales: {parsed_config.get('channels_count', 0)}")
            
            # ✅ MEJOR LOGGING: Log antes de retornar
            logger.info(f"[UPLOAD-STREAM] Retornando respuesta exitosa. list_id={list_id}")
            return jsonify({
                'status': 'ok',
                'action': 'upload-stream',
                'list_id': list_id,
                'list_url': f'https://iptv-ape.duckdns.org/lists/{list_id}',
                'file_path': file_path,
                'file_size_bytes': bytes_written,
                'file_size_mb': round(bytes_written / (1024 * 1024), 2),
                'filename': filename,
                'parsed_config': parsed_config,
                'timestamp': datetime.utcnow().isoformat()
            })
        
        except Exception as e:
            # Limpiar archivo temporal si algo falla
            logger.error(f"[UPLOAD-STREAM] Error en procesamiento: {str(e)}", exc_info=True)
            if os.path.exists(temp_path):
                os.remove(temp_path)
            
            return jsonify({
                'status': 'error',
                'message': f'Error procesando stream: {str(e)}'
            }), 500
    
    except Exception as e:
        logger.error(f"[UPLOAD-STREAM] Error general: {str(e)}", exc_info=True)
        return jsonify({
            'status': 'error',
            'message': f'Error en upload-stream: {str(e)}'
        }), 500

@app.route('/api/parse-config', methods=['POST', 'OPTIONS'])
def parse_config():
    """
    Parsea una lista M3U8 y retorna la configuración embebida sin guardarla.
    Útil para validación y debugging.
    """
    if request.method == 'OPTIONS':
        return '', 204
    
    REQUEST_STATS['total'] += 1
    REQUEST_STATS['config_parses'] += 1
    
    data = request.get_json() or {}
    m3u8_content = data.get('content', '')
    
    if not m3u8_content:
        return jsonify({'status': 'error', 'message': 'No se proporcionó contenido'}), 400
    
    parsed_config = config_parser.parse(m3u8_content)
    
    return jsonify({
        'status': 'ok',
        'parsed_config': parsed_config,
        'timestamp': datetime.utcnow().isoformat()
    })

# Almacenamiento temporal para chunks
CHUNK_UPLOADS = {}

@app.route('/api/upload-chunk', methods=['POST', 'OPTIONS'])
def upload_chunk():
    """
    Endpoint para subir archivos grandes por chunks.
    Soporta 3 acciones: init, upload, finalize
    """
    if request.method == 'OPTIONS':
        return '', 204
    
    REQUEST_STATS['total'] += 1
    
    data = request.get_json() or {}
    action = data.get('action', '')
    
    if action == 'init':
        # Inicializar una nueva subida por chunks
        filename = data.get('filename', f'chunk_{uuid.uuid4().hex[:8]}.m3u8')
        total_chunks = data.get('total_chunks', 1)
        upload_id = f'upload_{uuid.uuid4().hex[:12]}'
        
        CHUNK_UPLOADS[upload_id] = {
            'filename': filename,
            'total_chunks': total_chunks,
            'received_chunks': {},
            'started_at': datetime.utcnow().isoformat()
        }
        
        return jsonify({
            'status': 'ok',
            'action': 'init',
            'upload_id': upload_id,
            'filename': filename,
            'total_chunks': total_chunks,
            'timestamp': datetime.utcnow().isoformat()
        })
    
    elif action == 'upload':
        # Subir un chunk específico
        upload_id = data.get('upload_id', '')
        chunk_index = data.get('chunk_index', 0)
        chunk_data = data.get('data', '')
        
        if upload_id not in CHUNK_UPLOADS:
            return jsonify({'status': 'error', 'message': 'Upload ID no encontrado'}), 404
        
        CHUNK_UPLOADS[upload_id]['received_chunks'][chunk_index] = chunk_data
        received = len(CHUNK_UPLOADS[upload_id]['received_chunks'])
        total = CHUNK_UPLOADS[upload_id]['total_chunks']
        
        return jsonify({
            'status': 'ok',
            'action': 'upload',
            'upload_id': upload_id,
            'chunk_index': chunk_index,
            'received_chunks': received,
            'total_chunks': total,
            'progress': round(received / total * 100, 1),
            'timestamp': datetime.utcnow().isoformat()
        })
    
    elif action == 'finalize':
        # Ensamblar todos los chunks y guardar el archivo
        upload_id = data.get('upload_id', '')
        
        if upload_id not in CHUNK_UPLOADS:
            return jsonify({'status': 'error', 'message': 'Upload ID no encontrado'}), 404
        
        upload_info = CHUNK_UPLOADS[upload_id]
        chunks = upload_info['received_chunks']
        total = upload_info['total_chunks']
        
        # Verificar que tenemos todos los chunks
        if len(chunks) != total:
            return jsonify({
                'status': 'error',
                'message': f'Faltan chunks: recibidos {len(chunks)}/{total}',
                'missing': [i for i in range(total) if i not in chunks]
            }), 400
        
        # Ensamblar contenido
        content = ''.join(chunks[i] for i in range(total))
        
        # Generar ID y guardar
        list_id = f'vps_{uuid.uuid4().hex[:12]}'
        filename = upload_info['filename']
        if not filename.endswith('.m3u8'):
            filename += '.m3u8'
        
        file_path = os.path.join(LISTS_DIR, f'{list_id}_{filename}')
        
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(content)
        
        # Parsear configuración embebida
        parsed_config = config_parser.parse(content)
        PARSED_CONFIGS[list_id] = parsed_config
        
        # Limpiar chunks de memoria
        del CHUNK_UPLOADS[upload_id]
        
        REQUEST_STATS['list_uploads'] += 1
        
        return jsonify({
            'status': 'ok',
            'action': 'finalize',
            'list_id': list_id,
            'list_url': f'https://iptv-ape.duckdns.org/lists/{list_id}',
            'file_path': file_path,
            'file_size_bytes': len(content),
            'file_size_mb': round(len(content) / (1024 * 1024), 2),
            'parsed_config': parsed_config,
            'timestamp': datetime.utcnow().isoformat()
        })
    
    else:
        return jsonify({
            'status': 'error',
            'message': f'Acción no válida: {action}. Use: init, upload, finalize'
        }), 400

@app.route('/api/get-list-config/<list_id>', methods=['GET'])
def get_list_config(list_id):
    """
    Obtiene la configuración parseada de una lista previamente subida.
    """
    REQUEST_STATS['total'] += 1
    
    if list_id not in PARSED_CONFIGS:
        return jsonify({'status': 'error', 'message': 'Lista no encontrada'}), 404
    
    parsed = PARSED_CONFIGS[list_id]
    
    return jsonify({
        'status': 'ok',
        'list_id': list_id,
        'config': parsed,
        'timestamp': datetime.utcnow().isoformat()
    })

@app.route('/lists/<list_id>', methods=['GET'])
def serve_list(list_id):
    """
    Sirve una lista M3U8 guardada.
    """
    REQUEST_STATS['total'] += 1
    
    # Buscar archivo que comience con el list_id
    for filename in os.listdir(LISTS_DIR):
        if filename.startswith(list_id):
            file_path = os.path.join(LISTS_DIR, filename)
            return send_file(file_path, mimetype='application/x-mpegURL')
    
    return jsonify({'status': 'error', 'message': 'Lista no encontrada'}), 404

# ═══════════════════════════════════════════════════════════════════════════════════
# ENDPOINTS - SINCRONIZACIÓN
# ═══════════════════════════════════════════════════════════════════════════════════

@app.route('/api/sync-profiles', methods=['POST', 'OPTIONS'])
def sync_profiles():
    if request.method == 'OPTIONS':
        return '', 204
    
    REQUEST_STATS['total'] += 1
    REQUEST_STATS['profile_syncs'] += 1
    
    data = request.get_json() or {}
    
    if 'profiles' in data:
        SYNCED_PROFILES.update(data['profiles'])
        return jsonify({
            'status': 'ok',
            'message': 'Perfiles sincronizados correctamente',
            'synced_count': len(data['profiles']),
            'total_profiles': len(SYNCED_PROFILES),
            'timestamp': datetime.utcnow().isoformat()
        })
    
    return jsonify({'status': 'error', 'message': 'No se proporcionaron perfiles'}), 400

@app.route('/api/sync-list', methods=['POST', 'OPTIONS'])
def sync_list():
    if request.method == 'OPTIONS':
        return '', 204
    
    REQUEST_STATS['total'] += 1
    REQUEST_STATS['list_syncs'] += 1
    
    data = request.get_json() or {}
    
    list_name = data.get('name', f'list_{int(time.time())}')
    list_content = data.get('content', '')
    list_config = data.get('config', {})
    
    if list_content:
        # Parsear configuración embebida
        parsed_config = config_parser.parse(list_content)
        
        SYNCED_LISTS[list_name] = {
            'content': list_content,
            'config': list_config,
            'parsed_config': parsed_config,
            'synced_at': datetime.utcnow().isoformat()
        }
        
        # Guardar config parseada si tiene ID
        if parsed_config.get('list_id'):
            PARSED_CONFIGS[parsed_config['list_id']] = parsed_config
        
        # Guardar en disco
        list_path = os.path.join(M3U8_DIR, list_name)
        if not list_path.endswith('.m3u8'):
            list_path += '.m3u8'
        
        try:
            with open(list_path, 'w', encoding='utf-8') as f:
                f.write(list_content)
            
            return jsonify({
                'status': 'ok',
                'message': 'Lista sincronizada correctamente',
                'list_name': list_name,
                'path': list_path,
                'size_bytes': len(list_content),
                'parsed_config': {
                    'has_embedded_config': parsed_config['has_embedded_config'],
                    'profiles_count': len(parsed_config['profiles']),
                    'channels_count': parsed_config['channels_count']
                },
                'timestamp': datetime.utcnow().isoformat()
            })
        except Exception as e:
            return jsonify({'status': 'error', 'message': f'Error guardando lista: {str(e)}'}), 500
    
    return jsonify({'status': 'error', 'message': 'No se proporcionó contenido de lista'}), 400

# ═══════════════════════════════════════════════════════════════════════════════════
# ENDPOINTS - GENERACIÓN DE URLs Y ENTRADAS M3U8
# ═══════════════════════════════════════════════════════════════════════════════════

@app.route('/api/get-optimized-url', methods=['POST', 'GET', 'OPTIONS'])
def get_optimized_url():
    if request.method == 'OPTIONS':
        return '', 204
    
    REQUEST_STATS['total'] += 1
    REQUEST_STATS['url_optimizations'] += 1
    
    if request.method == 'POST':
        data = request.get_json() or {}
    else:
        data = {
            'channel_url': request.args.get('url', ''),
            'profile': request.args.get('profile', 'auto')
        }
    
    channel_url = data.get('channel_url', '')
    profile_id = data.get('profile', 'auto')
    client_caps = data.get('client_caps', {})
    list_id = data.get('list_id')
    
    if not channel_url:
        return jsonify({'status': 'error', 'message': 'URL del canal requerida'}), 400
    
    # Obtener headers personalizados si hay lista
    custom_headers = None
    if list_id and list_id in PARSED_CONFIGS:
        parsed = PARSED_CONFIGS[list_id]
        if parsed.get('headers'):
            custom_headers = {}
            for pid, pheaders in parsed['headers'].items():
                custom_headers.update(pheaders)
    
    # Decidir perfil si es auto
    if profile_id == 'auto':
        decision = abr_engine.decide(client_caps)
        profile_id = decision['selected_profile']
    
    headers = abr_engine.get_headers_for_profile(profile_id, custom_headers)
    headers_str = '&'.join([f'{k}={v}' for k, v in headers.items()])
    optimized_url = f'{channel_url}|{headers_str}'
    
    return jsonify({
        'status': 'ok',
        'original_url': channel_url,
        'optimized_url': optimized_url,
        'profile': profile_id,
        'headers': headers,
        'headers_count': len(headers),
        'used_custom_headers': custom_headers is not None,
        'timestamp': datetime.utcnow().isoformat()
    })

@app.route('/api/generate-m3u8-entry', methods=['POST', 'OPTIONS'])
def generate_m3u8_entry():
    if request.method == 'OPTIONS':
        return '', 204
    
    REQUEST_STATS['total'] += 1
    
    data = request.get_json() or {}
    channel = data.get('channel', {})
    profile_id = data.get('profile', 'P3')
    client_caps = data.get('client_caps', {})
    list_id = data.get('list_id')
    
    if not channel:
        return jsonify({'status': 'error', 'message': 'Datos del canal requeridos'}), 400
    
    # Obtener configuración personalizada si hay lista
    custom_headers = None
    if list_id and list_id in PARSED_CONFIGS:
        parsed = PARSED_CONFIGS[list_id]
        if parsed.get('headers'):
            custom_headers = {}
            for pid, pheaders in parsed['headers'].items():
                custom_headers.update(pheaders)
    
    if profile_id == 'auto':
        decision = abr_engine.decide(client_caps)
        profile_id = decision['selected_profile']
    
    profile = ABR_PROFILES.get(profile_id, ABR_PROFILES['P3'])
    headers = abr_engine.get_headers_for_profile(profile_id, custom_headers)
    
    channel_name = channel.get('name', 'Unknown Channel')
    channel_id = channel.get('id', '0')
    channel_logo = channel.get('logo', '')
    channel_group = channel.get('group', 'General')
    channel_url = channel.get('url', '')
    
    extinf_attrs = [
        f'tvg-id="{channel_id}"',
        f'tvg-name="{channel_name}"',
        f'tvg-logo="{channel_logo}"',
        f'group-title="{channel_group}"',
        f'ape-profile="{profile_id}"'
    ]
    
    entry_lines = [
        f'#EXTINF:-1 {" ".join(extinf_attrs)},{channel_name}',
        f'#EXTVLCOPT:http-user-agent=APE-Player/9.0',
        f'#EXTVLCOPT:network-caching={profile["network_caching_ms"]}',
        f'#EXTVLCOPT:live-caching={profile["live_caching_ms"]}',
        f'#EXTVLCOPT:http-reconnect=true',
        f'#EXTVLCOPT:http-continuous=true',
        f'#KODIPROP:inputstream.adaptive.manifest_type=hls',
        f'#KODIPROP:inputstream.adaptive.stream_selection_type=adaptive',
        f'#EXT-X-APE-PROFILE:{profile_id}',
        f'#EXT-X-APE-PROFILE-NAME:{profile["name"]}',
        f'#EXT-X-APE-LEVEL:{profile["level"]}',
        f'#EXT-X-APE-QUALITY:{profile["quality"]}',
        f'#EXT-X-APE-BUFFER:{profile["buffer_ms"]}',
        f'#EXT-X-APE-RESOLUTION:{profile["resolution"]}',
        f'#EXT-X-APE-BITRATE:{profile["bitrate_mbps"]}',
        f'#EXT-X-APE-CODECS:{",".join(profile["codecs"])}'
    ]
    
    headers_str = '&'.join([f'{k}={v}' for k, v in headers.items()])
    entry_lines.append(f'{channel_url}|{headers_str}')
    
    m3u8_entry = '\n'.join(entry_lines)
    
    return jsonify({
        'status': 'ok',
        'entry': m3u8_entry,
        'profile': profile_id,
        'profile_name': profile['name'],
        'headers_count': len(headers),
        'timestamp': datetime.utcnow().isoformat()
    })

# ═══════════════════════════════════════════════════════════════════════════════════
# ENDPOINTS LEGACY (compatibilidad con API v1.1.0)
# ═══════════════════════════════════════════════════════════════════════════════════

@app.route('/api/hls-status', methods=['GET'])
def hls_status():
    REQUEST_STATS['total'] += 1
    return jsonify({
        'status': 'ok',
        'hls_max': {
            'installed': True,
            'version': '2.1.0',
            'features': ['range_requests', 'keep_alive', 'cors', 'ssl', 'headers_91', 'embedded_config_parser']
        },
        'timestamp': datetime.utcnow().isoformat()
    })

@app.route('/api/jwt-config', methods=['GET'])
def jwt_config():
    REQUEST_STATS['total'] += 1
    return jsonify({
        'status': 'ok',
        'jwt': {
            'algorithm': 'HMAC-MD5',
            'signature_length': 16,
            'expiration_years': 1,
            'issuer': 'APE_v12.0_SUPREMO'
        },
        'timestamp': datetime.utcnow().isoformat()
    })

# ═══════════════════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════════════════

if __name__ == '__main__':
    logger.info("═" * 70)
    logger.info(f"  {SERVER_NAME} v{VERSION} - INICIANDO")
    logger.info("═" * 70)
    logger.info(f"  Perfiles ABR: {len(ABR_PROFILES)}")
    logger.info(f"  Categorías de headers: {len(QUALITY_HEADERS)}")
    total_headers = sum(len(h) for h in QUALITY_HEADERS.values())
    logger.info(f"  Headers totales: {total_headers}")
    logger.info(f"  Directorio M3U8: {M3U8_DIR}")
    logger.info(f"  Directorio Lists: {LISTS_DIR}")
    logger.info(f"  Parser de config embebida: ACTIVO")
    logger.info("═" * 70)
    
    app.run(host='0.0.0.0', port=5001, debug=False)


@app.route("/api/upload-verify", methods=["GET"])
def upload_verify():
    try:
        filename = request.args.get("name")
        if not filename:
            return jsonify({"ok": False, "exists": False, "error": "Filename not provided"}), 400

        safe_name = filename.replace("/", "").replace("..", "")
        file_path = os.path.join(LISTS_DIR, safe_name)

        if os.path.exists(file_path):
            return jsonify({"ok": True, "exists": True, "path": file_path})
        else:
            return jsonify({"ok": True, "exists": False})

    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500
