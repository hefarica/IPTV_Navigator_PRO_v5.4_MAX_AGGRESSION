"""
═══════════════════════════════════════════════════════════════
🔧 APE v15 - Redis Configuration
IPTV Navigator PRO - Backend Stack
═══════════════════════════════════════════════════════════════

Configuración centralizada para conexión Redis.
Importar en cualquier módulo APE:

    from config.redis_config import get_redis_client, REDIS_CONFIG

═══════════════════════════════════════════════════════════════
"""

import redis
import os
from typing import Optional

# ─────────────────────────────────────────────────────────────
# CONFIGURACIÓN REDIS
# ─────────────────────────────────────────────────────────────

REDIS_CONFIG = {
    "host": os.getenv("REDIS_HOST", "localhost"),
    "port": int(os.getenv("REDIS_PORT", 6379)),
    "db": int(os.getenv("REDIS_DB", 0)),
    "password": os.getenv("REDIS_PASSWORD", None),
    "decode_responses": True,
    "socket_timeout": 5,
    "socket_connect_timeout": 5,
    "retry_on_timeout": True,
}

# ─────────────────────────────────────────────────────────────
# KEY PREFIXES - Organización de datos en Redis
# ─────────────────────────────────────────────────────────────

REDIS_KEYS = {
    # Sesiones de streaming
    "session": "ape:session:{session_id}",
    
    # Último segmento servido por canal (edge-live)
    "last_seq": "ape:seq:{channel_id}",
    
    # Segmentos recientes LRU (no-repeat)
    "recent_segments": "ape:lru:{channel_id}",
    
    # Perfil activo por canal
    "profile": "ape:profile:{channel_id}",
    
    # Hysteresis anti-flapping
    "hysteresis": "ape:hyst:{channel_id}",
    
    # Métricas de telemetría
    "telemetry": "ape:telem:{channel_id}",
    
    # Health del engine
    "health": "ape:health:engine",
    
    # Failover tracking
    "failover": "ape:failover:{channel_id}",
}

# ─────────────────────────────────────────────────────────────
# TTL (Time To Live) por tipo de key
# ─────────────────────────────────────────────────────────────

REDIS_TTL = {
    "session": 3600,        # 1 hora
    "last_seq": 300,        # 5 minutos
    "recent_segments": 600, # 10 minutos
    "profile": 1800,        # 30 minutos
    "hysteresis": 120,      # 2 minutos
    "telemetry": 60,        # 1 minuto
    "health": 30,           # 30 segundos
    "failover": 300,        # 5 minutos
}

# ─────────────────────────────────────────────────────────────
# SINGLETON CLIENT
# ─────────────────────────────────────────────────────────────

_redis_client: Optional[redis.Redis] = None


def get_redis_client() -> redis.Redis:
    """
    Obtiene cliente Redis singleton.
    Crea conexión si no existe.
    """
    global _redis_client
    
    if _redis_client is None:
        _redis_client = redis.Redis(**REDIS_CONFIG)
    
    return _redis_client


def test_redis_connection() -> dict:
    """
    Prueba conexión a Redis.
    Retorna estado de conexión.
    """
    try:
        client = get_redis_client()
        ping = client.ping()
        info = client.info("server")
        
        return {
            "connected": ping,
            "redis_version": info.get("redis_version", "unknown"),
            "uptime_days": info.get("uptime_in_days", 0),
            "host": REDIS_CONFIG["host"],
            "port": REDIS_CONFIG["port"],
        }
    except redis.ConnectionError as e:
        return {
            "connected": False,
            "error": str(e),
            "host": REDIS_CONFIG["host"],
            "port": REDIS_CONFIG["port"],
        }


def get_key(key_type: str, **kwargs) -> str:
    """
    Genera key Redis formateada.
    
    Uso:
        get_key("session", session_id="abc123")
        → "ape:session:abc123"
    """
    template = REDIS_KEYS.get(key_type, "ape:unknown:{id}")
    return template.format(**kwargs)


# ─────────────────────────────────────────────────────────────
# TEST DIRECTO
# ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("🔌 Testing Redis Connection...")
    result = test_redis_connection()
    
    if result.get("connected"):
        print(f"✅ Redis OK - Version: {result['redis_version']}")
        print(f"   Host: {result['host']}:{result['port']}")
        print(f"   Uptime: {result['uptime_days']} days")
    else:
        print(f"❌ Redis FAILED - {result.get('error', 'Unknown error')}")
        print(f"   Expected: {result['host']}:{result['port']}")
