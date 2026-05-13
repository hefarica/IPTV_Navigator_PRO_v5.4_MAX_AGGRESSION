#!/bin/bash

# Script de instalación del APE Guardian Engine v16
# Ejecutar en el servidor VPS: bash install_guardian_v16.sh

set -e

echo "=========================================="
echo "APE Guardian Engine v16 - Instalación"
echo "=========================================="
echo ""

# 1. Crear directorio temporal
cd /tmp
rm -rf ape-guardian-v16-realtime 2>/dev/null || true

# 2. Crear estructura de directorios
mkdir -p ape-guardian-v16-realtime/realtime

# 3. Crear archivos del sistema
echo "Creando módulos..."

# player_detector.py
cat > ape-guardian-v16-realtime/realtime/player_detector.py << 'EOFPLAYER'
"""APE Guardian Engine v16 - Player Detector"""
import re
from typing import Dict
from dataclasses import dataclass

@dataclass
class PlayerCapabilities:
    hevc_support: bool
    hdr_support: bool
    dolby_atmos_support: bool
    max_parallel_downloads: int
    max_resolution: str
    preferred_codecs: list
    buffer_strategy: str
    telemetry_interval_ms: int

class PlayerDetector:
    PLAYERS_DB = {
        'ott_navigator': {
            'patterns': [r'OTT-Navigator', r'IPTV', r'X-OTT-Navigator'],
            'capabilities': PlayerCapabilities(
                hevc_support=True, hdr_support=True, dolby_atmos_support=True,
                max_parallel_downloads=4, max_resolution='4K',
                preferred_codecs=['hevc', 'h264'], buffer_strategy='ultra_aggressive',
                telemetry_interval_ms=50
            )
        }
    }
    
    DEFAULT_PLAYER = PlayerCapabilities(
        hevc_support=False, hdr_support=False, dolby_atmos_support=False,
        max_parallel_downloads=2, max_resolution='1080p',
        preferred_codecs=['h264'], buffer_strategy='moderate',
        telemetry_interval_ms=100
    )
    
    def detect(self, headers: Dict[str, str]) -> Dict[str, any]:
        user_agent = headers.get('User-Agent', '')
        for player_name, player_data in self.PLAYERS_DB.items():
            for pattern in player_data['patterns']:
                if re.search(pattern, user_agent, re.IGNORECASE):
                    return {
                        'player_type': player_name,
                        'player_version': 'unknown',
                        'capabilities': player_data['capabilities'],
                        'fingerprint': 'test',
                        'confidence': 0.9
                    }
        return {
            'player_type': 'unknown',
            'player_version': 'unknown',
            'capabilities': self.DEFAULT_PLAYER,
            'fingerprint': 'test',
            'confidence': 0.3
        }
EOFPLAYER

# Crear __init__.py
cat > ape-guardian-v16-realtime/realtime/__init__.py << 'EOFINIT'
"""APE Guardian Engine v16 - Realtime Telemetry Package"""
from .player_detector import PlayerDetector, PlayerCapabilities
__all__ = ['PlayerDetector', 'PlayerCapabilities']
EOFINIT

# Crear realtime_guardian.py (versión simplificada)
cat > ape-guardian-v16-realtime/realtime_guardian.py << 'EOFGUARDIAN'
"""APE Guardian Engine v16 - Realtime Guardian (Simplified)"""
import time
from typing import Dict
from realtime.player_detector import PlayerDetector

class RealtimeGuardian:
    def __init__(self, jwt_secret: str):
        self.player_detector = PlayerDetector()
        self.active_sessions = {}
        
    def start_session(self, session_id: str, request_headers: Dict[str, str], jwt_token: str) -> Dict[str, any]:
        player_info = self.player_detector.detect(request_headers)
        self.active_sessions[session_id] = {
            'session_id': session_id,
            'player_info': player_info,
            'jwt_token': jwt_token,
            'start_time_ms': time.time() * 1000
        }
        return {
            'session_id': session_id,
            'player_type': player_info['player_type'],
            'status': 'active'
        }

_realtime_guardian = None

def get_realtime_guardian(jwt_secret: str = 'ape-guardian-secret-key') -> RealtimeGuardian:
    global _realtime_guardian
    if _realtime_guardian is None:
        _realtime_guardian = RealtimeGuardian(jwt_secret)
    return _realtime_guardian
EOFGUARDIAN

# Crear requirements.txt
cat > ape-guardian-v16-realtime/requirements.txt << 'EOFREQ'
pyjwt
requests
EOFREQ

echo "✓ Módulos creados"

# 4. Copiar a /opt/ape-guardian
echo "Copiando a /opt/ape-guardian..."
cp -r ape-guardian-v16-realtime/realtime /opt/ape-guardian/
cp ape-guardian-v16-realtime/realtime_guardian.py /opt/ape-guardian/

# 5. Instalar dependencias
echo "Instalando dependencias..."
cd /opt/ape-guardian
pip3 install pyjwt requests --break-system-packages 2>/dev/null || pip3 install pyjwt requests

# 6. Probar importación
echo "Probando módulos..."
python3 << 'EOFTEST'
import sys
sys.path.insert(0, '/opt/ape-guardian')
from realtime_guardian import get_realtime_guardian
guardian = get_realtime_guardian()
print("✓ Realtime Guardian importado correctamente")
EOFTEST

echo ""
echo "=========================================="
echo "✅ Instalación completada"
echo "=========================================="
echo ""
echo "Los módulos están listos en /opt/ape-guardian/"
echo ""
echo "Para integrar con tu Guardian Engine v15:"
echo "1. Edita /opt/ape-guardian/guardian_engine.py"
echo "2. Agrega: from realtime_guardian import get_realtime_guardian"
echo "3. Reinicia el servicio: systemctl restart ape-guardian-engine"
echo ""
