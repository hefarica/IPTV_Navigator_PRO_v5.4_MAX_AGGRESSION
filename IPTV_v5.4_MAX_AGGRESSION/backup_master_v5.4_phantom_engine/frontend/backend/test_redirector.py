#!/usr/bin/env python3
"""
═══════════════════════════════════════════════════════════════════════════
🧪 APE v15.1 REDIRECT MODE - Test Script
═══════════════════════════════════════════════════════════════════════════

Quick test to verify the redirector is working correctly.

Usage:
    python test_redirector.py

Requirements:
    - Redirector must be running on http://localhost:5000
    - pip install requests
═══════════════════════════════════════════════════════════════════════════
"""

import requests
from urllib.parse import quote
import sys

# ═══════════════════════════════════════════════════════════════════════════
# CONFIGURATION
# ═══════════════════════════════════════════════════════════════════════════

REDIRECTOR_URL = "http://localhost:5000"
TEST_CDN_URL = "http://cdn-server-1.example.com/live/premium/hbo.m3u8"

# ═══════════════════════════════════════════════════════════════════════════
# TESTS
# ═══════════════════════════════════════════════════════════════════════════

def test_health():
    """Test /health endpoint"""
    print("🧪 Testing /health endpoint...")
    try:
        response = requests.get(f"{REDIRECTOR_URL}/health", timeout=5)
        if response.status_code == 200:
            data = response.json()
            print(f"   ✅ Status: {data.get('status')}")
            print(f"   ✅ Version: {data.get('version')}")
            print(f"   ✅ Mode: {data.get('mode')}")
            print(f"   ✅ Proxy: {data.get('proxy')}")
            return True
        else:
            print(f"   ❌ HTTP {response.status_code}")
            return False
    except Exception as e:
        print(f"   ❌ Error: {e}")
        return False


def test_redirect():
    """Test /stream redirect"""
    print("\n🧪 Testing /stream redirect...")
    
    # Build redirect URL
    encoded_url = quote(TEST_CDN_URL, safe='')
    redirect_url = f"{REDIRECTOR_URL}/stream?channel_id=test_hbo&original_url={encoded_url}"
    
    print(f"   Request URL: {redirect_url[:80]}...")
    
    try:
        # Don't follow redirects automatically
        response = requests.get(redirect_url, allow_redirects=False, timeout=5)
        
        if response.status_code in [301, 302, 307]:
            location = response.headers.get('Location', '')
            print(f"   ✅ Redirect: HTTP {response.status_code}")
            print(f"   ✅ Location: {location}")
            
            # Verify location matches original URL
            if location == TEST_CDN_URL:
                print(f"   ✅ Location matches original URL")
                return True
            else:
                print(f"   ⚠️  Location does NOT match")
                print(f"      Expected: {TEST_CDN_URL}")
                print(f"      Got:      {location}")
                return False
        else:
            print(f"   ❌ Unexpected status: HTTP {response.status_code}")
            return False
            
    except Exception as e:
        print(f"   ❌ Error: {e}")
        return False


def test_validation():
    """Test URL validation (should reject localhost)"""
    print("\n🧪 Testing URL validation...")
    
    # Try to redirect to localhost (should be rejected)
    dangerous_url = "http://localhost:8080/dangerous"
    encoded_url = quote(dangerous_url, safe='')
    redirect_url = f"{REDIRECTOR_URL}/stream?channel_id=test&original_url={encoded_url}"
    
    try:
        response = requests.get(redirect_url, allow_redirects=False, timeout=5)
        
        if response.status_code == 403:
            print(f"   ✅ Correctly rejected dangerous URL (403)")
            return True
        else:
            print(f"   ❌ Security issue: Accepted dangerous URL (HTTP {response.status_code})")
            return False
            
    except Exception as e:
        print(f"   ❌ Error: {e}")
        return False


def test_performance():
    """Test response time"""
    print("\n🧪 Testing performance...")
    
    encoded_url = quote(TEST_CDN_URL, safe='')
    redirect_url = f"{REDIRECTOR_URL}/stream?channel_id=perf_test&original_url={encoded_url}"
    
    try:
        import time
        times = []
        
        for i in range(10):
            start = time.time()
            response = requests.get(redirect_url, allow_redirects=False, timeout=5)
            elapsed = (time.time() - start) * 1000  # ms
            times.append(elapsed)
        
        avg_time = sum(times) / len(times)
        max_time = max(times)
        min_time = min(times)
        
        print(f"   Response times (10 requests):")
        print(f"   📊 Average: {avg_time:.2f}ms")
        print(f"   📊 Min:     {min_time:.2f}ms")
        print(f"   📊 Max:     {max_time:.2f}ms")
        
        if avg_time < 5:
            print(f"   ✅ Performance target met (<5ms)")
            return True
        else:
            print(f"   ⚠️  Slower than target (target: <5ms)")
            return True  # Still pass, just warn
            
    except Exception as e:
        print(f"   ❌ Error: {e}")
        return False


# ═══════════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════════

def main():
    print("═══════════════════════════════════════════════════════════")
    print("🧪 APE v15.1 REDIRECT MODE - Test Suite")
    print("═══════════════════════════════════════════════════════════")
    print(f"Target: {REDIRECTOR_URL}")
    print()
    
    results = []
    
    # Run tests
    results.append(("Health Check", test_health()))
    results.append(("Redirect Functionality", test_redirect()))
    results.append(("Security Validation", test_validation()))
    results.append(("Performance", test_performance()))
    
    # Summary
    print()
    print("═══════════════════════════════════════════════════════════")
    print("📊 Test Results")
    print("═══════════════════════════════════════════════════════════")
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for test_name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status} - {test_name}")
    
    print()
    print(f"Total: {passed}/{total} tests passed")
    print("═══════════════════════════════════════════════════════════")
    
    sys.exit(0 if passed == total else 1)


if __name__ == '__main__':
    main()
