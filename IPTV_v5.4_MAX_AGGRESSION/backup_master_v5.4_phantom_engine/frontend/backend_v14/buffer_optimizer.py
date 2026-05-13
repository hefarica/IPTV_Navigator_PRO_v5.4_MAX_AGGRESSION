import time
import logging

logger = logging.getLogger(__name__)

class BufferOptimizer:
    """
    Optimizador de Buffering APE v14.
    Maneja estrategias de cacheo (No-Repeat) y latencia (Edge-Live).
    """
    
    def __init__(self):
        # Cache simple en memoria para el prototipo
        # En producción se usaría Redis o Disco
        self.segment_cache = {} # {uri: {content: b'', expiry: timestamp}}
        self.cache_ttl_vod = 300 # 5 minutos para VOD
        self.cache_ttl_live = 2   # 2 segundos para LIVE (mínimo)

    def get_segment(self, uri):
        """Intenta obtener un segmento del cache"""
        if uri in self.segment_cache:
            item = self.segment_cache[uri]
            if item['expiry'] > time.time():
                logger.debug(f"⚡ Cache HIT: {uri}")
                return item['content'], item['headers']
            else:
                del self.segment_cache[uri]
        return None, None

    def store_segment(self, uri, content, headers, is_live=True):
        """Almacena un segmento en el cache"""
        ttl = self.cache_ttl_live if is_live else self.cache_ttl_vod
        self.segment_cache[uri] = {
            'content': content,
            'headers': headers,
            'expiry': time.time() + ttl
        }
        logger.debug(f"💾 Cache STORE: {uri} (TTL: {ttl}s)")

    def get_strategy(self, content_type, profile):
        """
        Retorna la estrategia de buffering según el manual APE v14.
        """
        if content_type == 'LIVE':
            if profile in ['P0', 'P1']:
                return "Ultra-Live (0.5s buffer)"
            return "Live-Edge 2.0 (1s buffer)"
        else:
            return "Drip-Feed (20s buffer)"

    def detect_content_type(self, manifest_content):
        """Detecta si el contenido es LIVE o VOD"""
        if '#EXT-X-ENDLIST' in manifest_content:
            return 'VOD'
        return 'LIVE'
