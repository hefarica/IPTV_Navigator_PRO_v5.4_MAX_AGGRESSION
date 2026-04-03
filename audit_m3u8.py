import sys
import os
import re
import urllib.parse

def audit(file_path):
    if not os.path.exists(file_path):
        print(f"Error: {file_path} no encontrado.")
        return

    stats = {
        "size_bytes": os.path.getsize(file_path),
        "total_lines": 0,
        "extinf": 0,
        "extvlcopt": 0,
        "kodiprop": 0,
        "ext_x_ape": 0,
        "exthttp": 0,
        "fallback_direct": 0,
        "extattrfromurl": 0,
        "resolve_quality": 0,
        "ctx": 0,
        "srv": 0,
    }
    
    first_url = None
    url_lengths = []
    ctx_lengths = []

    print(f"Auditing file: {file_path} ({stats['size_bytes'] / 1024 / 1024:.2f} MB)")

    ctx_pattern = re.compile(r'ctx=([^&\s]+)')
    
    with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
        for line in f:
            stats["total_lines"] += 1
            if "EXTINF" in line: stats["extinf"] += 1
            if "EXTVLCOPT" in line: stats["extvlcopt"] += 1
            if "KODIPROP" in line: stats["kodiprop"] += 1
            if "EXT-X-APE" in line: stats["ext_x_ape"] += 1
            if "EXTHTTP" in line: stats["exthttp"] += 1
            if "FALLBACK-DIRECT" in line: stats["fallback_direct"] += 1
            if "EXTATTRFROMURL" in line: stats["extattrfromurl"] += 1
            if "resolve_quality" in line:
                stats["resolve_quality"] += 1
                if not first_url:
                    first_url = line.strip()
                url_lengths.append(len(line.strip()))
            
            if "ctx=" in line:
                stats["ctx"] += 1
                match = ctx_pattern.search(line)
                if match:
                    ctx_lengths.append(len(match.group(0)))
            
            if "srv=" in line:
                stats["srv"] += 1

    print("\n--- METRICS ---")
    for key, val in stats.items():
        print(f"{key}: {val}")

    print("\n--- URL ANALYSIS ---")
    if url_lengths:
        max_url_len = max(url_lengths)
        print(f"Max URL Length: {max_url_len} chars (< 800 is required)")
    else:
        print("No resolve_quality URLs found!")
        
    if ctx_lengths:
        max_ctx_len = max(ctx_lengths)
        print(f"Max ctx= Payload Length: {max_ctx_len} chars (< 200 is required)")
    else:
        print("No ctx= payloads found!")

    if first_url:
        print("\n--- FIRST URL SAMPLE ---")
        print(first_url)
        if "%3D%3D" in first_url:
            print("WARNING: %3D%3D detected in URL (encodeURIComponent used, MUST NOT BE THERE)")
        else:
            print("OK: URL does not contain escaped %3D%3D")
            
        if "api/resolve" in first_url:
            print("OK: /api/resolve structure used.")
        else:
            print("WARNING: Path should be /api/resolve_quality_... instead of bare /resolve.php")

if __name__ == "__main__":
    file_path = sys.argv[1]
    audit(file_path)
