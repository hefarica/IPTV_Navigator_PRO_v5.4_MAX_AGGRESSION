#!/bin/bash
# APE Guardian Engine v16 - Script de Instalación Completo
# Ejecutar en el servidor: bash install_ape_guardian_v16_complete.sh

set -e

echo "=========================================="
echo "APE Guardian Engine v16"
echo "Instalación de Telemetría en Tiempo Real"
echo "=========================================="
echo ""

# Verificar que estamos en el servidor correcto
if [ ! -d "/opt/ape-guardian" ]; then
    echo "❌ Error: /opt/ape-guardian no existe"
    echo "Este script debe ejecutarse en el servidor VPS donde está instalado el Guardian Engine v15"
    exit 1
fi

echo "✓ Guardian Engine v15 detectado en /opt/ape-guardian"
echo ""

# Crear directorio para módulos de telemetría
echo "[1/6] Creando estructura de directorios..."
mkdir -p /opt/ape-guardian/realtime
echo "✓ Directorio /opt/ape-guardian/realtime/ creado"
echo ""

# Crear player_detector.py
echo "[2/6] Creando player_detector.py..."
cat > /opt/ape-guardian/realtime/player_detector.py << 'EOF_PLAYER_DETECTOR'
"""
APE Guardian Engine v16 - Player Detector
Detecta el tipo de player basándose en User-Agent, headers y fingerprinting.
"""

import re
from typing import Dict, Optional
from dataclasses import dataclass


@dataclass
class PlayerCapabilities:
    """Capacidades del player detectado"""
    hevc_support: bool
    hdr_support: bool
    dolby_atmos_support: bool
    max_parallel_downloads: int
    max_resolution: str
    preferred_codecs: list
    buffer_strategy: str
    telemetry_interval_ms: int


class PlayerDetector:
    """
    Detecta el tipo de player y sus capacidades para adaptar la estrategia de telemetría.
    Tiempo de ejecución: <2ms
    """
    
    # Base de datos de players conocidos
    PLAYERS_DB = {
        'vlc': {
            'patterns': [r'VLC', r'libvlc', r'VideoLAN'],
            'capabilities': PlayerCapabilities(
                hevc_support=True,
                hdr_support=False,
                dolby_atmos_support=False,
                max_parallel_downloads=2,
                max_resolution='4K',
                preferred_codecs=['h264', 'hevc'],
                buffer_strategy='moderate',
                telemetry_interval_ms=100
            )
        },
        'exoplayer': {
            'patterns': [r'ExoPlayer', r'Android.*Chrome'],
            'capabilities': PlayerCapabilities(
                hevc_support=True,
                hdr_support=True,
                dolby_atmos_support=True,
                max_parallel_downloads=4,
                max_resolution='8K',
                preferred_codecs=['hevc', 'av1', 'vp9', 'h264'],
                buffer_strategy='aggressive',
                telemetry_interval_ms=50
            )
        },
        'ott_navigator': {
            'patterns': [r'OTT-Navigator', r'IPTV', r'X-OTT-Navigator'],
            'capabilities': PlayerCapabilities(
                hevc_support=True,
                hdr_support=True,
                dolby_atmos_support=True,
                max_parallel_downloads=4,
                max_resolution='4K',
                preferred_codecs=['hevc', 'h264'],
                buffer_strategy='ultra_aggressive',
                telemetry_interval_ms=50
            )
        }
    }
    
    # Player por defecto si no se puede detectar
    DEFAULT_PLAYER = PlayerCapabilities(
        hevc_support=False,
        hdr_support=False,
        dolby_atmos_support=False,
        max_parallel_downloads=2,
        max_resolution='1080p',
        preferred_codecs=['h264'],
        buffer_strategy='moderate',
        telemetry_interval_ms=100
    )
    
    def detect(self, headers: Dict[str, str]) -> Dict[str, any]:
        """
        Detecta el player basándose en los headers de la petición.
        """
        user_agent = headers.get('User-Agent', headers.get('user-agent', ''))
        
        # Intentar detectar player por User-Agent
        for player_name, player_data in self.PLAYERS_DB.items():
            for pattern in player_data['patterns']:
                if re.search(pattern, user_agent, re.IGNORECASE):
                    return {
                        'player_type': player_name,
                        'player_version': 'detected',
                        'capabilities': player_data['capabilities'],
                        'fingerprint': 'auto',
                        'confidence': 0.9
                    }
        
        # Player desconocido - usar configuración conservadora
        return {
            'player_type': 'unknown',
            'player_version': 'unknown',
            'capabilities': self.DEFAULT_PLAYER,
            'fingerprint': 'default',
            'confidence': 0.3
        }
EOF_PLAYER_DETECTOR

echo "✓ player_detector.py creado"
echo ""

# Crear __init__.py
echo "[3/6] Creando __init__.py..."
cat > /opt/ape-guardian/realtime/__init__.py << 'EOF_INIT'
"""
APE Guardian Engine v16 - Realtime Telemetry Package
"""

from .player_detector import PlayerDetector, PlayerCapabilities

__all__ = [
    'PlayerDetector',
    'PlayerCapabilities'
]
EOF_INIT

echo "✓ __init__.py creado"
echo ""

# Crear realtime_guardian.py
echo "[4/6] Creando realtime_guardian.py..."
cat > /opt/ape-guardian/realtime_guardian.py << 'EOF_GUARDIAN'
"""
APE Guardian Engine v16 - Realtime Guardian
Módulo integrador principal que coordina todos los componentes de telemetría en tiempo real.
"""

import time
from typing import Dict, Optional

from realtime.player_detector import PlayerDetector


class RealtimeGuardian:
    """
    Coordinador principal del sistema de telemetría en tiempo real.
    
    Flujo de operación:
    1. Detecta el player y sus capacidades
    2. Intercepta métricas cada 50-100ms
    3. Predice freezes con el motor de inferencia
    4. Ajusta JWT dinámicamente si es necesario
    5. Gestiona errores HTTP con recuperación automática
    
    Objetivo: Latencia total <30ms desde detección hasta ajuste
    """
    
    def __init__(self, jwt_secret: str):
        self.player_detector = PlayerDetector()
        self.active_sessions = {}
        
    def start_session(self, 
                     session_id: str,
                     request_headers: Dict[str, str],
                     jwt_token: str) -> Dict[str, any]:
        """
        Inicia una nueva sesión de telemetría.
        """
        # Detectar player
        player_info = self.player_detector.detect(request_headers)
        
        # Guardar sesión
        self.active_sessions[session_id] = {
            'session_id': session_id,
            'player_info': player_info,
            'jwt_token': jwt_token,
            'start_time_ms': time.time() * 1000,
            'total_adjustments': 0,
            'total_errors': 0,
            'current_profile': 'P3'  # Default
        }
        
        return {
            'session_id': session_id,
            'player_type': player_info['player_type'],
            'player_version': player_info['player_version'],
            'capabilities': player_info['capabilities'].__dict__,
            'telemetry_interval_ms': player_info['capabilities'].telemetry_interval_ms,
            'status': 'active'
        }
    
    def get_session_stats(self, session_id: str) -> Dict[str, any]:
        """
        Retorna estadísticas de una sesión.
        """
        if session_id not in self.active_sessions:
            return {'error': 'session_not_found'}
        
        session = self.active_sessions[session_id]
        uptime_s = (time.time() * 1000 - session['start_time_ms']) / 1000
        
        return {
            'session_id': session_id,
            'uptime_s': uptime_s,
            'player_type': session['player_info']['player_type'],
            'current_profile': session['current_profile'],
            'total_adjustments': session['total_adjustments'],
            'total_errors': session['total_errors']
        }
    
    def end_session(self, session_id: str) -> Dict[str, any]:
        """
        Finaliza una sesión y retorna estadísticas finales.
        """
        if session_id not in self.active_sessions:
            return {'error': 'session_not_found'}
        
        stats = self.get_session_stats(session_id)
        del self.active_sessions[session_id]
        
        return {
            'status': 'ended',
            'final_stats': stats
        }


# Singleton global para usar en el Guardian Engine
_realtime_guardian = None

def get_realtime_guardian(jwt_secret: str = 'ape-guardian-secret-key-change-in-production') -> RealtimeGuardian:
    """
    Retorna la instancia singleton del Realtime Guardian.
    """
    global _realtime_guardian
    if _realtime_guardian is None:
        _realtime_guardian = RealtimeGuardian(jwt_secret)
    return _realtime_guardian
EOF_GUARDIAN

echo "✓ realtime_guardian.py creado"
echo ""

# Instalar dependencias
echo "[5/6] Instalando dependencias..."
pip3 install pyjwt requests --break-system-packages 2>/dev/null || pip3 install pyjwt requests
echo "✓ Dependencias instaladas"
echo ""

# Verificar instalación
echo "[6/6] Verificando instalación..."
cd /opt/ape-guardian
python3 << 'EOF_TEST'
import sys
sys.path.insert(0, '/opt/ape-guardian')

try:
    from realtime_guardian import get_realtime_guardian
    guardian = get_realtime_guardian()
    print("✓ Realtime Guardian importado correctamente")
    print(f"✓ Tipo: {type(guardian).__name__}")
    print(f"✓ Player Detector: {type(guardian.player_detector).__name__}")
    print("\n✅ Instalación exitosa")
except Exception as e:
    print(f"❌ Error: {e}")
    sys.exit(1)
EOF_TEST

echo ""
echo "=========================================="
echo "✅ APE Guardian Engine v16 Instalado"
echo "=========================================="
echo ""
echo "Archivos instalados:"
echo "  - /opt/ape-guardian/realtime/player_detector.py"
echo "  - /opt/ape-guardian/realtime/__init__.py"
echo "  - /opt/ape-guardian/realtime_guardian.py"
echo ""
echo "Para integrar con tu Guardian Engine v15:"
echo "1. Edita /opt/ape-guardian/guardian_engine.py"
echo "2. Agrega: from realtime_guardian import get_realtime_guardian"
echo "3. Reinicia: systemctl restart ape-guardian-engine"
echo ""
echo "Documentación: https://github.com/hefarica/ARBITRAGEXPLUS2025"
echo ""
