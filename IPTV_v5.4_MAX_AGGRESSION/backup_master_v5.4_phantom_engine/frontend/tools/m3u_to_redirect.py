#!/usr/bin/env python3
"""
═══════════════════════════════════════════════════════════════════════════
🔧 M3U to REDIRECT MODE - Transformer
═══════════════════════════════════════════════════════════════════════════

Transforms original M3U playlist to APE v15.1 REDIRECT MODE format.

BEFORE (Original M3U):
    #EXTINF:-1,HBO
    http://cdn.example.com/live/hbo.m3u8

AFTER (Redirect Mode):
    #EXTINF:-1,HBO
    http://REDIRECTOR:5000/stream?channel_id=hbo&original_url=http%3A%2F%2Fcdn.example.com%2Flive%2Fhbo.m3u8

═══════════════════════════════════════════════════════════════════════════
"""

import sys
import re
from urllib.parse import quote
from pathlib import Path

# ═══════════════════════════════════════════════════════════════════════════
# CONFIGURATION
# ═══════════════════════════════════════════════════════════════════════════

# Your redirector server URL (change this to your actual server)
REDIRECTOR_URL = "https://api.ape-tv.net"

# ═══════════════════════════════════════════════════════════════════════════
# FUNCTIONS
# ═══════════════════════════════════════════════════════════════════════════

def extract_channel_id(extinf_line: str) -> str:
    """
    Extract a simple channel ID from EXTINF line.
    Uses tvg-id if available, otherwise generates from channel name.
    """
    # Try to extract tvg-id
    tvg_id_match = re.search(r'tvg-id="([^"]+)"', extinf_line)
    if tvg_id_match:
        return tvg_id_match.group(1).lower().replace(' ', '_')
    
    # Try to extract channel name (last part after comma)
    name_match = re.search(r',(.+)$', extinf_line)
    if name_match:
        channel_name = name_match.group(1).strip()
        # Sanitize for URL
        return re.sub(r'[^a-z0-9_-]', '', channel_name.lower().replace(' ', '_'))
    
    return 'unknown'


def is_stream_url(line: str) -> bool:
    """
    Check if line is a stream URL (not a directive).
    """
    line = line.strip()
    return line and not line.startswith('#') and (
        line.startswith('http://') or line.startswith('https://')
    )


def transform_m3u(input_file: str, output_file: str):
    """
    Transform M3U from direct URLs to redirect mode.
    """
    print(f"📖 Reading: {input_file}")
    
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
            
            # URL-encode the original URL
            encoded_url = quote(original_url, safe='')
            
            # Build redirect URL
            redirect_url = f"{REDIRECTOR_URL}/stream?channel_id={current_channel_id}&original_url={encoded_url}"
            
            output_lines.append(redirect_url + '\n')
            transformed_count += 1
            
            # Reset channel ID for next entry
            current_channel_id = 'unknown'
        else:
            # Pass through comments and other directives
            output_lines.append(line)
    
    # Write output
    print(f"💾 Writing: {output_file}")
    with open(output_file, 'w', encoding='utf-8') as f:
        f.writelines(output_lines)
    
    print(f"✅ Transformed {transformed_count} stream URLs")
    print(f"📡 Redirector: {REDIRECTOR_URL}")


# ═══════════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════════

def main():
    if len(sys.argv) < 2:
        print("Usage: python m3u_to_redirect.py <input.m3u> [output.m3u]")
        print()
        print("Example:")
        print("  python m3u_to_redirect.py original.m3u redirect_mode.m3u")
        sys.exit(1)
    
    input_file = sys.argv[1]
    
    # Auto-generate output filename if not provided
    if len(sys.argv) >= 3:
        output_file = sys.argv[2]
    else:
        input_path = Path(input_file)
        output_file = str(input_path.parent / f"{input_path.stem}_redirect{input_path.suffix}")
    
    print("═══════════════════════════════════════════════════════════")
    print("🔧 M3U to APE v15.1 REDIRECT MODE")
    print("═══════════════════════════════════════════════════════════")
    
    try:
        transform_m3u(input_file, output_file)
        print("═══════════════════════════════════════════════════════════")
        print("✅ Transformation Complete!")
        print(f"📄 Output: {output_file}")
        print()
        print("Next steps:")
        print("1. Start redirector: python ape_redirector_v15.1.py")
        print(f"2. Load M3U in OTT Navigator: {output_file}")
        print("3. Monitor server logs for redirect activity")
        print("═══════════════════════════════════════════════════════════")
    except Exception as e:
        print(f"❌ Error: {e}")
        sys.exit(1)


if __name__ == '__main__':
    main()
