#!/usr/bin/env python3
"""
═══════════════════════════════════════════════════════════════════════════════
APE v15.0 ULTIMATE - M3U Parametrizer
Converts original M3U to APE-parametrized M3U with local proxy URLs
═══════════════════════════════════════════════════════════════════════════════

Features:
- Parse M3U metadata (tvg-id, tvg-name, group-title, tvg-logo)
- Detect content type from group patterns
- Generate unique channel_id
- Inject APE headers into EXTINF
- Convert URLs to proxy format: http://localhost:8080/stream?channel_id=...

Autor: APE Team
Versión: 15.0.0-ULTIMATE
Fecha: 2026-01-02
"""

import re
import os
import hashlib
import argparse
from urllib.parse import quote
from typing import Dict, Optional, List
from dataclasses import dataclass


@dataclass
class ChannelMetadata:
    """Parsed channel metadata"""
    tvg_id: str = ""
    tvg_name: str = ""
    tvg_logo: str = ""
    group_title: str = ""
    channel_name: str = ""
    original_url: str = ""


class M3UParametrizer:
    """
    Converts M3U to APE v15.0 parametrized format
    """
    
    # Content type detection patterns
    CONTENT_PATTERNS = {
        "LIVE_SPORTS": [
            r'sports?', r'deportes?', r'futbol', r'football', r'soccer',
            r'nfl', r'nba', r'mlb', r'nhl', r'hockey', r'tennis', r'golf',
            r'f1', r'formula', r'ufc', r'mma', r'boxing', r'boxeo',
            r'espn', r'fox\s*sports?', r'bein', r'dazn', r'eurosport'
        ],
        "LIVE_NEWS": [
            r'news', r'noticias', r'notícias', r'notizie',
            r'cnn', r'bbc', r'fox\s*news', r'msnbc', r'rt\b', r'ntv',
            r'al\s*jazeera', r'euronews', r'sky\s*news', r'france\s*24'
        ],
        "VOD_MOVIES": [
            r'movies?', r'peliculas?', r'filmes?', r'films?', r'pelis',
            r'cinema', r'cine\b', r'hbo\s*max', r'netflix', r'prime\s*video'
        ],
        "VOD_SERIES": [
            r'series?', r'tv\s*shows?', r'shows?', r'episodios?', r'seasons?'
        ]
    }
    
    def __init__(
        self,
        input_path: str,
        output_path: str,
        proxy_base_url: str = "http://localhost:8080"
    ):
        """
        Initialize parametrizer
        
        Args:
            input_path: Path to original M3U file
            output_path: Path for parametrized output
            proxy_base_url: Base URL for APE proxy
        """
        self.input_path = input_path
        self.output_path = output_path
        self.proxy_base_url = proxy_base_url.rstrip('/')
        
        # Statistics
        self.stats = {
            'total_channels': 0,
            'live_sports': 0,
            'live_news': 0,
            'vod_movies': 0,
            'vod_series': 0
        }
    
    def parametrize(self) -> int:
        """
        Process M3U file and generate parametrized version
        
        Returns:
            Number of channels processed
        """
        print(f"📥 Reading: {self.input_path}")
        
        with open(self.input_path, 'r', encoding='utf-8', errors='ignore') as infile:
            with open(self.output_path, 'w', encoding='utf-8') as outfile:
                # Write header
                self._write_header(outfile)
                
                current_extinf = None
                
                for line in infile:
                    line = line.strip()
                    
                    if not line:
                        continue
                    
                    if line.startswith('#EXTM3U'):
                        # Skip, we write our own header
                        continue
                    
                    if line.startswith('#EXTINF'):
                        current_extinf = line
                    
                    elif line.startswith('http') or line.startswith('rtmp'):
                        if current_extinf:
                            # Process channel
                            metadata = self._parse_extinf(current_extinf)
                            metadata.original_url = line
                            
                            self._write_channel_entry(outfile, metadata)
                            self.stats['total_channels'] += 1
                            
                            current_extinf = None
                    
                    elif line.startswith('#'):
                        # Other comments/tags - pass through
                        outfile.write(line + '\n')
        
        print(f"✅ Output: {self.output_path}")
        print(f"📊 Processed {self.stats['total_channels']} channels")
        print(f"   LIVE_SPORTS: {self.stats['live_sports']}")
        print(f"   LIVE_NEWS: {self.stats['live_news']}")
        print(f"   VOD_MOVIES: {self.stats['vod_movies']}")
        print(f"   VOD_SERIES: {self.stats['vod_series']}")
        
        return self.stats['total_channels']
    
    def _write_header(self, outfile):
        """Write M3U header with APE metadata"""
        outfile.write('#EXTM3U\n')
        outfile.write('#EXT-X-VERSION:7\n')
        outfile.write('#EXT-X-APE-VERSION:15.0.0-ULTIMATE\n')
        outfile.write(f'#EXT-X-APE-PROXY-BASE:{self.proxy_base_url}\n')
        outfile.write('#EXT-X-APE-GENERATED:2026-01-02T09:30:00Z\n')
        outfile.write('#EXT-X-APE-FEATURES:ABR,FAILOVER,HYSTERESIS,CONTENT-BUFFERS\n')
        outfile.write('\n')
    
    def _parse_extinf(self, extinf_line: str) -> ChannelMetadata:
        """
        Parse EXTINF line to extract metadata
        """
        metadata = ChannelMetadata()
        
        # tvg-id
        match = re.search(r'tvg-id="([^"]*)"', extinf_line, re.IGNORECASE)
        if match:
            metadata.tvg_id = match.group(1)
        
        # tvg-name
        match = re.search(r'tvg-name="([^"]*)"', extinf_line, re.IGNORECASE)
        if match:
            metadata.tvg_name = match.group(1)
        
        # tvg-logo
        match = re.search(r'tvg-logo="([^"]*)"', extinf_line, re.IGNORECASE)
        if match:
            metadata.tvg_logo = match.group(1)
        
        # group-title
        match = re.search(r'group-title="([^"]*)"', extinf_line, re.IGNORECASE)
        if match:
            metadata.group_title = match.group(1)
        
        # channel name (after last comma)
        match = re.search(r',([^,]*)$', extinf_line)
        if match:
            metadata.channel_name = match.group(1).strip()
        
        return metadata
    
    def _generate_channel_id(self, metadata: ChannelMetadata) -> str:
        """
        Generate unique channel ID
        """
        if metadata.tvg_id:
            return metadata.tvg_id.replace(' ', '_')
        
        # Generate from name
        name = metadata.tvg_name or metadata.channel_name or 'unknown'
        hash_id = hashlib.md5(name.encode()).hexdigest()[:12]
        return f"CH_{hash_id}"
    
    def _detect_content_type(self, metadata: ChannelMetadata) -> str:
        """
        Detect content type from metadata
        """
        search_text = f"{metadata.group_title} {metadata.channel_name}".lower()
        
        # Check patterns in priority order
        for content_type, patterns in self.CONTENT_PATTERNS.items():
            for pattern in patterns:
                if re.search(pattern, search_text, re.IGNORECASE):
                    # Update stats
                    stat_key = content_type.lower()
                    if stat_key in self.stats:
                        self.stats[stat_key] += 1
                    return content_type
        
        # Default to LIVE_NEWS (balanced)
        self.stats['live_news'] += 1
        return "LIVE_NEWS"
    
    def _write_channel_entry(self, outfile, metadata: ChannelMetadata):
        """
        Write parametrized channel entry
        """
        channel_id = self._generate_channel_id(metadata)
        content_type = self._detect_content_type(metadata)
        
        # Build enriched EXTINF
        extinf_parts = ['#EXTINF:-1']
        
        if metadata.tvg_id:
            extinf_parts.append(f'tvg-id="{metadata.tvg_id}"')
        if metadata.tvg_name:
            extinf_parts.append(f'tvg-name="{metadata.tvg_name}"')
        if metadata.tvg_logo:
            extinf_parts.append(f'tvg-logo="{metadata.tvg_logo}"')
        if metadata.group_title:
            extinf_parts.append(f'group-title="{metadata.group_title}"')
        
        # Add APE-specific attributes
        extinf_parts.append(f'ape-channel-id="{channel_id}"')
        extinf_parts.append(f'ape-content-type="{content_type}"')
        extinf_parts.append('ape-default-profile="P2"')
        extinf_parts.append('ape-failover-enabled="true"')
        extinf_parts.append('ape-failback-hysteresis="60"')
        
        # End with channel name
        channel_name = metadata.channel_name or metadata.tvg_name or "Unknown"
        extinf_line = ' '.join(extinf_parts) + f',{channel_name}'
        
        # Build proxy URL
        proxy_url = self._build_proxy_url(channel_id, metadata)
        
        # Write
        outfile.write(extinf_line + '\n')
        outfile.write(proxy_url + '\n')
    
    def _build_proxy_url(self, channel_id: str, metadata: ChannelMetadata) -> str:
        """
        Build APE proxy URL
        """
        encoded_url = quote(metadata.original_url, safe='')
        encoded_name = quote(metadata.tvg_name or metadata.channel_name or '', safe='')
        encoded_group = quote(metadata.group_title, safe='')
        
        return (
            f"{self.proxy_base_url}/stream"
            f"?channel_id={channel_id}"
            f"&original_url={encoded_url}"
            f"&tvg_name={encoded_name}"
            f"&group_title={encoded_group}"
        )


def main():
    parser = argparse.ArgumentParser(
        description='APE v15.0 M3U Parametrizer - Convert M3U to APE proxy format'
    )
    parser.add_argument(
        'input',
        help='Input M3U file path'
    )
    parser.add_argument(
        '-o', '--output',
        help='Output M3U file path (default: input_APE_v15.m3u8)'
    )
    parser.add_argument(
        '--proxy-url',
        default='http://localhost:8080',
        help='APE proxy base URL (default: http://localhost:8080)'
    )
    
    args = parser.parse_args()
    
    # Determine output path
    if args.output:
        output_path = args.output
    else:
        base, ext = os.path.splitext(args.input)
        output_path = f"{base}_APE_v15{ext}"
    
    # Run parametrization
    parametrizer = M3UParametrizer(
        input_path=args.input,
        output_path=output_path,
        proxy_base_url=args.proxy_url
    )
    
    count = parametrizer.parametrize()
    
    print(f"\n✅ Parametrization complete: {count} channels processed")
    print(f"📄 Output file: {output_path}")


if __name__ == '__main__':
    main()
