"""
NginxLuaAdapter — Writes demand to NGINX lua_shared_dict via HTTP.

Requires opt-in: adding `lua_shared_dict ape_demand 2m;` to iptv-lua-circuit.conf.
Phase 3 only — NOT used in day-1.
"""

import logging
from typing import Any, Dict

from .base import SpeedInjectionAdapter

logger = logging.getLogger('ape-guardian.adapter.nginx')

try:
    import urllib.request
    HAS_URLLIB = True
except ImportError:
    HAS_URLLIB = False


class NginxLuaAdapter(SpeedInjectionAdapter):
    """HTTP POST to NGINX Lua endpoint (opt-in phase 3)."""

    def __init__(self, endpoint: str = 'http://127.0.0.1/internal/ape-demand'):
        self._endpoint = endpoint

    @property
    def name(self) -> str:
        return 'nginx_lua'

    async def apply(self, demand_mbps: float, state: Dict[str, Any],
                    metrics: Dict[str, Any]) -> bool:
        if not HAS_URLLIB:
            logger.error('urllib not available')
            return False

        try:
            import json
            payload = json.dumps({
                'demand_mbps': round(demand_mbps, 2),
                'buffer_state': state.get('buffer_state', 'unknown'),
            }).encode()

            req = urllib.request.Request(
                self._endpoint,
                data=payload,
                headers={'Content-Type': 'application/json'},
                method='POST',
            )

            with urllib.request.urlopen(req, timeout=2) as resp:
                if resp.status == 200:
                    logger.debug(f'NGINX Lua: {demand_mbps:.2f} Mbps → {self._endpoint}')
                    return True
                else:
                    logger.warning(f'NGINX Lua returned {resp.status}')
                    return False

        except Exception as e:
            logger.error(f'NGINX Lua adapter failed: {e}')
            return False
