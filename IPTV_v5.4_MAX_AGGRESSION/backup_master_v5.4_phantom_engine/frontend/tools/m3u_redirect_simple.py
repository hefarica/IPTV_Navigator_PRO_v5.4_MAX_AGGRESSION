#!/usr/bin/env python3
"""
M3U to REDIRECT MODE - Transformer (Windows-safe)
Transforms original M3U playlist to APE v15.1 REDIRECT MODE format.
"""

import sys
import re
from urllib.parse import quote
from pathlib import Path

# Redirector server URL
REDIRECTOR_URL = "https://api.ape-tv.net"

def extract_channel_id(extinf_line):
    """Extract channel ID from EXTINF line."""
    # Try tvg-id
    tvg_id_match = re.search(r'tvg-id="([^"]+)"', extinf_line)
    if tvg_id_match:
        return tvg_id_match.group(1).lower().replace(' ', '_')
    
    # Try channel name
    name_match = re.search(r',(.+)$', extinf_line)
    if name_match:
        channel_name = name_match.group(1).strip()
        return re.sub(r'[^a-z0-9_-]', '', channel_name.lower().replace(' ', '_'))
    
    return 'unknown'

def is_stream_url(line):
    """Check if line is a stream URL."""
    line = line.strip()
    return line and not line.startswith('#') and (
        line.startswith('http://') or line.startswith('https://')
    )

def transform_m3u(input_file, output_file):
    """Transform M3U from direct URLs to redirect mode."""
    print(f"Reading: {input_file}")
    
    with open(input_file, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    output_lines = []
    current_channel_id = 'unknown'
    transformed_count = 0
    
    for line in lines:
        stripped = line.strip()
        
        # Pass through M3U header
        if stripped.startswith('#EXTM3U'):
            output_lines.append(line)
            continue
        
        # Extract channel ID from EXTINF
        if stripped.startswith('#EXTINF'):
            current_channel_id = extract_channel_id(stripped)
            output_lines.append(line)
            continue
        
        # Transform stream URLs
        if is_stream_url(stripped):
            original_url = stripped
            encoded_url = quote(original_url, safe='')
            redirect_url = f"{REDIRECTOR_URL}/stream?channel_id={current_channel_id}&original_url={encoded_url}"
            output_lines.append(redirect_url + '\n')
            transformed_count += 1
            current_channel_id = 'unknown'
        else:
            output_lines.append(line)
    
    # Write output
    print(f"Writing: {output_file}")
    with open(output_file, 'w', encoding='utf-8') as f:
        f.writelines(output_lines)
    
    print(f"Transformed {transformed_count} stream URLs")
    print(f"Redirector: {REDIRECTOR_URL}")

def main():
    if len(sys.argv) < 2:
        print("Usage: python m3u_redirect_simple.py <input.m3u> [output.m3u]")
        sys.exit(1)
    
    input_file = sys.argv[1]
    
    if len(sys.argv) >= 3:
        output_file = sys.argv[2]
    else:
        input_path = Path(input_file)
        output_file = str(input_path.parent / f"{input_path.stem}_redirect{input_path.suffix}")
    
    print("=" * 50)
    print("M3U to APE v15.1 REDIRECT MODE")
    print("=" * 50)
    
    try:
        transform_m3u(input_file, output_file)
        print("=" * 50)
        print("Transformation Complete!")
        print(f"Output: {output_file}")
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)

if __name__ == '__main__':
    main()
