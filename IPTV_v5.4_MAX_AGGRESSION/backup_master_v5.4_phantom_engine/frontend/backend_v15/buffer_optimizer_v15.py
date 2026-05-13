#!/usr/bin/env python3
"""
═══════════════════════════════════════════════════════════════════════════════
APE v15.0 ULTIMATE - Buffer Optimizer
Content-aware buffering strategies for LIVE vs VOD content
═══════════════════════════════════════════════════════════════════════════════

Buffer Strategies:
- LIVE_SPORTS: Ultra-low latency (2-4s) for real-time events
- LIVE_NEWS: Balanced (3-6s) for news channels
- VOD_MOVIES: Stability priority (8-15s) for movies
- VOD_SERIES: Balanced VOD (6-12s) for series

Autor: APE Team
Versión: 15.0.0-ULTIMATE
Fecha: 2026-01-02
"""

import time
import logging
from typing import Dict, Optional, Tuple
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class BufferStrategy:
    """Buffer configuration for a content type"""
    name: str
    min_ms: int
    max_ms: int
    target_ms: int
    priority: str  # "latency", "balanced", "stability"
    prebuffer_strategy: str  # "aggressive", "moderate", "netflix_style"


class BufferOptimizerV15:
    """
    Content-aware buffer optimizer for APE v15.0
    
    Features:
    - Detect content type from manifest/metadata
    - Apply appropriate buffer strategy
    - Segment caching (No-Repeat)
    """
    
    # Content type to strategy mapping
    BUFFER_STRATEGIES = {
        "LIVE_SPORTS": BufferStrategy(
            name="Ultra-Live Sports",
            min_ms=2000,
            max_ms=4000,
            target_ms=3000,
            priority="latency",
            prebuffer_strategy="aggressive"
        ),
        "LIVE_NEWS": BufferStrategy(
            name="Live News Balanced",
            min_ms=3000,
            max_ms=6000,
            target_ms=5000,
            priority="balanced",
            prebuffer_strategy="moderate"
        ),
        "VOD_MOVIES": BufferStrategy(
            name="Netflix-style Movies",
            min_ms=8000,
            max_ms=15000,
            target_ms=12000,
            priority="stability",
            prebuffer_strategy="netflix_style"
        ),
        "VOD_SERIES": BufferStrategy(
            name="Balanced VOD Series",
            min_ms=6000,
            max_ms=12000,
            target_ms=9000,
            priority="stability",
            prebuffer_strategy="balanced_vod"
        )
    }
    
    # Keywords for content type detection
    CONTENT_KEYWORDS = {
        "LIVE_SPORTS": [
            "sports", "deportes", "futbol", "football", "soccer", 
            "nfl", "nba", "mlb", "hockey", "tennis", "f1", "ufc",
            "espn", "fox sports", "bein", "dazn", "eurosport"
        ],
        "LIVE_NEWS": [
            "news", "noticias", "noticias", "cnn", "bbc", "fox news",
            "msnbc", "rt", "al jazeera", "euronews", "sky news"
        ],
        "VOD_MOVIES": [
            "movies", "peliculas", "filmes", "films", "pelis",
            "cinema", "hbo max", "netflix", "prime video"
        ],
        "VOD_SERIES": [
            "series", "tv shows", "shows", "episodios", "seasons"
        ]
    }
    
    def __init__(self):
        """Initialize buffer optimizer"""
        # Segment cache: {uri: {'content': bytes, 'headers': dict, 'expiry': float}}
        self._segment_cache: Dict[str, Dict] = {}
        
        # Cache TTLs
        self.cache_ttl_live = 2   # 2 seconds for LIVE
        self.cache_ttl_vod = 300  # 5 minutes for VOD
    
    def detect_content_type(
        self,
        manifest_content: str = None,
        group_title: str = None,
        channel_name: str = None
    ) -> str:
        """
        Detect content type from manifest or metadata
        
        Args:
            manifest_content: M3U8 content (checks for #EXT-X-ENDLIST)
            group_title: Group title from M3U metadata
            channel_name: Channel name
        
        Returns:
            Content type string (LIVE_SPORTS, LIVE_NEWS, VOD_MOVIES, VOD_SERIES)
        """
        # First check manifest for VOD indicator
        if manifest_content and "#EXT-X-ENDLIST" in manifest_content:
            # It's VOD, determine subtype
            search_text = (group_title or "").lower() + " " + (channel_name or "").lower()
            
            for content_type, keywords in self.CONTENT_KEYWORDS.items():
                if content_type.startswith("VOD"):
                    if any(kw in search_text for kw in keywords):
                        return content_type
            
            return "VOD_MOVIES"  # Default VOD
        
        # It's LIVE, determine subtype
        search_text = (group_title or "").lower() + " " + (channel_name or "").lower()
        
        # Check LIVE_SPORTS first (higher priority)
        if any(kw in search_text for kw in self.CONTENT_KEYWORDS["LIVE_SPORTS"]):
            return "LIVE_SPORTS"
        
        # Check LIVE_NEWS
        if any(kw in search_text for kw in self.CONTENT_KEYWORDS["LIVE_NEWS"]):
            return "LIVE_NEWS"
        
        # Default to LIVE_NEWS (balanced)
        return "LIVE_NEWS"
    
    def get_strategy(self, content_type: str) -> BufferStrategy:
        """
        Get buffer strategy for content type
        
        Args:
            content_type: Content type string
        
        Returns:
            BufferStrategy dataclass
        """
        return self.BUFFER_STRATEGIES.get(
            content_type,
            self.BUFFER_STRATEGIES["LIVE_NEWS"]
        )
    
    def get_strategy_string(self, content_type: str, profile: str) -> str:
        """
        Get human-readable strategy string
        
        Args:
            content_type: Content type
            profile: Current profile
        
        Returns:
            Strategy description string
        """
        strategy = self.get_strategy(content_type)
        return f"{strategy.name} ({strategy.target_ms}ms target)"
    
    # =========================================================================
    # Segment Cache (No-Repeat) Methods
    # =========================================================================
    
    def get_cached_segment(self, uri: str) -> Optional[Tuple[bytes, Dict]]:
        """
        Get segment from cache if available and not expired
        
        Args:
            uri: Segment URI
        
        Returns:
            Tuple of (content, headers) or None if not cached
        """
        if uri in self._segment_cache:
            item = self._segment_cache[uri]
            if item['expiry'] > time.time():
                logger.debug(f"⚡ Cache HIT: {uri[:50]}...")
                return item['content'], item['headers']
            else:
                # Expired, remove from cache
                del self._segment_cache[uri]
        
        return None
    
    def cache_segment(
        self,
        uri: str,
        content: bytes,
        headers: Dict,
        is_live: bool = True
    ):
        """
        Store segment in cache
        
        Args:
            uri: Segment URI
            content: Segment content bytes
            headers: Response headers dict
            is_live: True if LIVE content (shorter TTL)
        """
        ttl = self.cache_ttl_live if is_live else self.cache_ttl_vod
        
        self._segment_cache[uri] = {
            'content': content,
            'headers': headers,
            'expiry': time.time() + ttl
        }
        
        logger.debug(f"💾 Cached: {uri[:50]}... (TTL: {ttl}s)")
    
    def clear_expired_cache(self):
        """Remove expired entries from cache"""
        current_time = time.time()
        expired = [
            uri for uri, item in self._segment_cache.items()
            if item['expiry'] <= current_time
        ]
        
        for uri in expired:
            del self._segment_cache[uri]
        
        if expired:
            logger.debug(f"🧹 Cleared {len(expired)} expired cache entries")
    
    def get_cache_stats(self) -> Dict:
        """Get cache statistics"""
        current_time = time.time()
        total = len(self._segment_cache)
        active = sum(1 for item in self._segment_cache.values() if item['expiry'] > current_time)
        size_bytes = sum(len(item['content']) for item in self._segment_cache.values())
        
        return {
            "total_entries": total,
            "active_entries": active,
            "expired_entries": total - active,
            "size_mb": round(size_bytes / (1024 * 1024), 2)
        }
