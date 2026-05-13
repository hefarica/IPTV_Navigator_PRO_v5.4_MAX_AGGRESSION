#!/usr/bin/env python3
"""
═══════════════════════════════════════════════════════════════════════════
🧪 APE v15.1 STREAMING UPLOAD - Test Script
═══════════════════════════════════════════════════════════════════════════

Tests the /upload-m3u endpoint with streaming processing.

Usage:
    python test_upload.py <input.m3u> [output.m3u]

Requirements:
    - Redirector must be running on http://localhost:5000
    - pip install requests
═══════════════════════════════════════════════════════════════════════════
"""

import requests
import sys
import os
from pathlib import Path

# ═══════════════════════════════════════════════════════════════════════════
# CONFIGURATION
# ═══════════════════════════════════════════════════════════════════════════

REDIRECTOR_URL = "http://localhost:5000"

# ═══════════════════════════════════════════════════════════════════════════
# TESTS
# ═══════════════════════════════════════════════════════════════════════════

def test_streaming_upload(input_file: str, output_file: str):
    """Test streaming M3U upload"""
    print(f"🧪 Testing streaming upload: {input_file}")
    
    # Check file exists and get size
    if not os.path.exists(input_file):
        print(f"   ❌ File not found: {input_file}")
        return False
    
    file_size = os.path.getsize(input_file)
    print(f"   📊 File size: {file_size / 1024 / 1024:.2f} MB")
    
    try:
        # Open file for streaming upload
        with open(input_file, 'rb') as f:
            print(f"   📤 Uploading to {REDIRECTOR_URL}/upload-m3u...")
            
            # Upload with streaming
            files = {'file': (os.path.basename(input_file), f, 'application/x-mpegURL')}
            response = requests.post(
                f"{REDIRECTOR_URL}/upload-m3u",
                files=files,
                stream=True  # Important: stream the response
            )
            
            if response.status_code == 200:
                print(f"   ✅ Upload successful")
                print(f"   📥 Saving response to {output_file}...")
                
                # Save streaming response to file
                with open(output_file, 'wb') as out:
                    for chunk in response.iter_content(chunk_size=8192):
                        if chunk:
                            out.write(chunk)
                
                output_size = os.path.getsize(output_file)
                print(f"   📊 Output size: {output_size / 1024 / 1024:.2f} MB")
                print(f"   ✅ Saved to {output_file}")
                
                # Check headers
                ape_version = response.headers.get('X-APE-Version', 'unknown')
                ape_mode = response.headers.get('X-APE-Mode', 'unknown')
                print(f"   📋 APE Version: {ape_version}")
                print(f"   📋 APE Mode: {ape_mode}")
                
                return True
            else:
                print(f"   ❌ HTTP {response.status_code}")
                print(f"   Content: {response.text[:200]}")
                return False
                
    except Exception as e:
        print(f"   ❌ Error: {e}")
        return False


def verify_transformation(output_file: str):
    """Verify that URLs were transformed"""
    print(f"\n🔍 Verifying transformation in {output_file}...")
    
    try:
        with open(output_file, 'r', encoding='utf-8') as f:
            lines = f.readlines()
        
        redirect_count = 0
        original_url_count = 0
        
        for line in lines:
            stripped = line.strip()
            if stripped.startswith('http://localhost:5000/stream?'):
                redirect_count += 1
            elif stripped.startswith('http://') or stripped.startswith('https://'):
                if '/stream?' not in stripped:
                    original_url_count += 1
        
        print(f"   📊 Redirect URLs: {redirect_count}")
        print(f"   📊 Original URLs (not transformed): {original_url_count}")
        
        if redirect_count > 0:
            print(f"   ✅ Transformation successful")
            return True
        else:
            print(f"   ⚠️  No redirect URLs found")
            return False
            
    except Exception as e:
        print(f"   ❌ Error: {e}")
        return False


# ═══════════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════════

def main():
    if len(sys.argv) < 2:
        print("Usage: python test_upload.py <input.m3u> [output.m3u]")
        print()
        print("Example:")
        print("  python test_upload.py original.m3u transformed.m3u")
        sys.exit(1)
    
    input_file = sys.argv[1]
    
    # Auto-generate output filename if not provided
    if len(sys.argv) >= 3:
        output_file = sys.argv[2]
    else:
        input_path = Path(input_file)
        output_file = str(input_path.parent / f"{input_path.stem}_redirect{input_path.suffix}")
    
    print("═══════════════════════════════════════════════════════════")
    print("🧪 APE v15.1 STREAMING UPLOAD TEST")
    print("═══════════════════════════════════════════════════════════")
    
    # Test upload
    upload_success = test_streaming_upload(input_file, output_file)
    
    if not upload_success:
        print("\n❌ Upload test failed")
        sys.exit(1)
    
    # Verify transformation
    verify_success = verify_transformation(output_file)
    
    print()
    print("═══════════════════════════════════════════════════════════")
    if upload_success and verify_success:
        print("✅ ALL TESTS PASSED")
        print(f"📄 Transformed file: {output_file}")
    else:
        print("⚠️  SOME TESTS FAILED")
    print("═══════════════════════════════════════════════════════════")
    
    sys.exit(0 if (upload_success and verify_success) else 1)


if __name__ == '__main__':
    main()
