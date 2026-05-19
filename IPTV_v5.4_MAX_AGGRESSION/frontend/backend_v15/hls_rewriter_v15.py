#!/usr/bin/env python3
"""
═══════════════════════════════════════════════════════════════════════════════
APE v15.0 ULTIMATE - HLS Rewriter
Enhanced manifest rewriting with APE headers and segment proxy URLs
═══════════════════════════════════════════════════════════════════════════════

Features:
- Absolutizes relative URLs in manifests
- Injects APE custom headers (#EXT-X-APE-*)
- Redirects segments through APE proxy
- Supports mid-stream profile switching

Autor: APE Team
Versión: 15.0.0-ULTIMATE
Fecha: 2026-01-02
"""

import re
import logging
from urllib.parse import urljoin, urlparse, quote
from typing import Dict, Optional

logger = logging.getLogger(__name__)


class HLSRewriterV15:
    """
    HLS Manifest Rewriter for APE v15.0
    
    Transforms original M3U8 manifests to:
    1. Add APE custom extension headers
    2. Redirect segment URLs through APE proxy
    3. Inject buffer strategy tags
    """
    
    def __init__(self, proxy_base_url: str = "http://localhost:8080"):
        """
        Initialize rewriter
        
        Args:
            proxy_base_url: Base URL of APE proxy server
        """
        self.proxy_base_url = proxy_base_url.rstrip('/')
    
    def rewrite_manifest(
        self,
        content: str,
        origin_url: str,
        channel_id: str,
        profile: str,
        profile_config: Dict,
        content_type: str = "LIVE"
    ) -> str:
        """
        Rewrite an M3U8 manifest with APE enhancements
        
        Args:
            content: Original M3U8 content
            origin_url: Base URL for resolving relative paths
            channel_id: Channel identifier
            profile: Current APE profile (P0-P5)
            profile_config: Profile configuration dict
            content_type: LIVE_SPORTS, LIVE_NEWS, VOD_MOVIES, VOD_SERIES
        
        Returns:
            Rewritten M3U8 content
        """
        lines = content.splitlines()
        new_lines = []
        
        # Get buffer config
        buffer_config = profile_config.get('buffer_config', {})
        content_buffer = buffer_config.get(content_type, buffer_config.get('LIVE_NEWS', {}))
        buffer_min = content_buffer.get('min_ms', 2000)
        buffer_max = content_buffer.get('max_ms', 6000)
        buffer_target = content_buffer.get('target_ms', 3000)
        
        # Get resolution info
        resolution = profile_config.get('resolution', {})
        resolution_label = resolution.get('label', '1080p')
        
        # Process first line (header)
        if lines and lines[0].strip().startswith("#EXTM3U"):
            new_lines.append("#EXTM3U")
            
            # Inject APE custom headers
            new_lines.append(f"#EXT-X-APE-VERSION:15.0")
            new_lines.append(f"#EXT-X-APE-PROFILE:{profile}")
            new_lines.append(f"#EXT-X-APE-RESOLUTION:{resolution_label}")
            new_lines.append(f"#EXT-X-APE-CONTENT-TYPE:{content_type}")
            new_lines.append(f"#EXT-X-APE-BUFFER-MIN:{buffer_min}")
            new_lines.append(f"#EXT-X-APE-BUFFER-MAX:{buffer_max}")
            new_lines.append(f"#EXT-X-APE-BUFFER-TARGET:{buffer_target}")
            new_lines.append(f"#EXT-X-APE-FAILOVER-ENABLED:true")
            new_lines.append(f"#EXT-X-APE-FAILBACK-HYSTERESIS:60")
            
            # Skip original header
            lines = lines[1:]
        
        # Process remaining lines
        for line in lines:
            line = line.strip()
            if not line:
                continue
            
            # Keep comment/tag lines (with some modifications)
            if line.startswith("#"):
                # Optionally modify specific tags
                new_lines.append(line)
                continue
            
            # URL line - need to absolutize and proxy
            absolute_url = urljoin(origin_url, line)
            
            # Create proxy URL
            proxy_url = self._create_proxy_url(
                absolute_url,
                channel_id,
                profile,
                content_type
            )
            
            new_lines.append(proxy_url)

        result = "\n".join(new_lines)

        # [2026-05-19 · MULTI-SELECT DOCTRINE]
        # Per user doctrine "ampliar cobertura de reproducción es usar todos los
        # parches disponibles en la misma lista generada": default behavior is
        # UNIVERSAL COVERAGE — every player's overlay is injected so any player
        # consuming the list can reproduce it. The cell value is a multi-select
        # hint (empty / 'ALL' / single name / comma-separated) for which
        # players additionally receive their overlays in THIS rewrite pass.
        #
        #   value semantics:
        #     '' (empty) | 'ALL'              → all known players receive overlays
        #     'VLC'                            → VLC only
        #     'VLC,KODI'                       → VLC + Kodi/TiviMate
        #     'VLC,KODI,TIVIMATE,OTT_NAV'      → all explicit
        #
        # Note: the M3U8 generator (m3u8-typed-arrays-ultimate.js) ALREADY emits
        # EXTVLCOPT + KODIPROP + EXTHTTP + X-APE-* tags universally per channel
        # block at generation time. This rewriter is the SECONDARY overlay pass
        # for post-generation manifest rewrites — defaulting to universal
        # coverage here means no player ever sees a list missing its directives.
        player_target_raw = profile_config.get('player_target', '')
        player_overlay_buffer = profile_config.get('player_overlay_buffer_ms', buffer_target)
        player_overlay_ua = profile_config.get('player_overlay_user_agent')  # None → SmartTV default

        targets = self._parse_player_target(player_target_raw)

        if 'VLC' in targets:
            result = self.inject_vlc_options(result, buffer_ms=player_overlay_buffer, user_agent=player_overlay_ua)
        if 'KODI' in targets or 'TIVIMATE' in targets:
            manifest_type = "mpd" if result.lower().endswith('.mpd') else "hls"
            result = self.inject_kodi_props(result, manifest_type=manifest_type, user_agent=player_overlay_ua)
        # OTT_NAV / ExoPlayer overlays handled via the EXTHTTP path already
        # baked at generation time — this rewriter is a no-op for them per
        # the M3U8 universal-emission contract.

        return result

    # ─── multi-select parser ──────────────────────────────────────────────
    _ALL_TARGETS = ('VLC', 'KODI', 'TIVIMATE', 'OTT_NAV')

    @classmethod
    def _parse_player_target(cls, raw):
        """Parse LAB `player_target` cell value to a list of player names.

        Per the multi-select doctrine (2026-05-19):
          · '' / None / 'ALL' → return all known targets (universal coverage)
          · 'VLC,KODI'        → ['VLC', 'KODI']
          · 'VLC'             → ['VLC']

        Unknown tokens are silently dropped — never narrows below 0; if the
        cell is malformed (e.g. typo), the safety fallback is universal
        coverage to honor the cardinal doctrine.
        """
        if raw is None:
            return list(cls._ALL_TARGETS)
        s = str(raw).strip().upper()
        if not s or s == 'ALL':
            return list(cls._ALL_TARGETS)
        parts = [p.strip().upper() for p in s.split(',') if p.strip()]
        known = [p for p in parts if p in cls._ALL_TARGETS]
        return known if known else list(cls._ALL_TARGETS)

    def _create_proxy_url(
        self,
        original_url: str,
        channel_id: str,
        profile: str,
        content_type: str
    ) -> str:
        """
        Create proxy URL for a segment
        
        Args:
            original_url: Original segment URL
            channel_id: Channel identifier
            profile: Current profile
            content_type: Content type string
        
        Returns:
            Proxy URL pointing to APE server
        """
        encoded_url = quote(original_url, safe='')
        
        # Determine if likely a LIVE stream
        is_live = "1" if content_type.startswith("LIVE") else "0"
        
        return (
            f"{self.proxy_base_url}/segment"
            f"?uri={encoded_url}"
            f"&ch={channel_id}"
            f"&profile={profile}"
            f"&live={is_live}"
        )
    
    def inject_vlc_options(
        self,
        content: str,
        buffer_ms: int = 5000,
        user_agent: str = None
    ) -> str:
        """
        Inject EXTVLCOPT tags for VLC player compatibility
        
        Args:
            content: M3U8 content
            buffer_ms: Buffer duration in milliseconds
            user_agent: Custom user agent string
        
        Returns:
            Content with VLC options injected
        """
        if not user_agent:
            # SmartTV UA (TIER1 99% per feedback_http_407_proxy_auth_doctrine + m3u8-typed-arrays UA_PHANTOM_BANK)
            # Browser-like UAs trigger anti-bot/anti-fingerprint 407 in many Xtream providers.
            user_agent = "Mozilla/5.0 (SMART-TV; LINUX; Tizen 7.0) AppleWebKit/537.36 (KHTML, like Gecko) 94.0.4606.31/7.0 TV Safari/537.36"

        vlc_opts = [
            f"#EXTVLCOPT:network-caching={buffer_ms}",
            f"#EXTVLCOPT:http-user-agent={user_agent}",
            "#EXTVLCOPT:http-reconnect=true"
        ]
        
        # Insert after #EXTM3U
        lines = content.split("\n")
        if lines and lines[0].startswith("#EXTM3U"):
            return "\n".join([lines[0]] + vlc_opts + lines[1:])
        
        return "\n".join(vlc_opts) + "\n" + content
    
    def inject_kodi_props(
        self,
        content: str,
        manifest_type: str = "hls",
        user_agent: str = None
    ) -> str:
        """
        Inject KODIPROP tags for Kodi compatibility
        
        Args:
            content: M3U8 content
            manifest_type: Manifest type (hls/mpd)
            user_agent: Custom user agent
        
        Returns:
            Content with Kodi properties injected
        """
        if not user_agent:
            # SmartTV UA — see inject_vlc_options() rationale.
            user_agent = "Mozilla/5.0 (SMART-TV; LINUX; Tizen 7.0) AppleWebKit/537.36 (KHTML, like Gecko) 94.0.4606.31/7.0 TV Safari/537.36"

        kodi_props = [
            f"#KODIPROP:inputstream.adaptive.manifest_type={manifest_type}",
            f"#KODIPROP:inputstream.adaptive.stream_headers=User-Agent={user_agent}"
        ]
        
        lines = content.split("\n")
        if lines and lines[0].startswith("#EXTM3U"):
            return "\n".join([lines[0]] + kodi_props + lines[1:])
        
        return "\n".join(kodi_props) + "\n" + content
    
    def is_master_playlist(self, content: str) -> bool:
        """
        Check if content is a master playlist (contains variant streams)
        
        Args:
            content: M3U8 content
        
        Returns:
            True if master playlist, False if media playlist
        """
        return "#EXT-X-STREAM-INF" in content
    
    def extract_base_url(self, url: str) -> str:
        """
        Extract base URL for resolving relative paths
        
        Args:
            url: Full URL
        
        Returns:
            Base URL (directory path)
        """
        parsed = urlparse(url)
        path = '/'.join(parsed.path.split('/')[:-1]) + '/'
        return f"{parsed.scheme}://{parsed.netloc}{path}"
