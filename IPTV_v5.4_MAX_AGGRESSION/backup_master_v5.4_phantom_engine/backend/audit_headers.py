#!/usr/bin/env python3
"""Audit header parity between JS generator and PHP resolver."""
import re, os

BASE = r'c:\Users\HFRC\Desktop\IPTV_Navigator_PRO (12)'

# 1. JS headers from exthttpHEVC
js_path = os.path.join(BASE, r'IPTV_Navigator_PRO\iptv_nav\files\js\ape-v9\m3u8-typed-arrays-ultimate.js')
js = open(js_path, 'r', encoding='utf-8').read()
m = re.search(r'const exthttpHEVC = \{(.*?)\};', js, re.DOTALL)
js_keys = set()
if m:
    block = m.group(1)
    js_keys = set(re.findall(r'"([A-Za-z][A-Za-z0-9-]+)"', block))
    # Remove values that look like header values, keep only header names
    js_keys = {k for k in js_keys if k[0].isupper() or k.startswith('X-')}

# 2. PHP headers from $exthttp
php_path = os.path.join(BASE, r'vps_backup_20260222\resolve.php')
php = open(php_path, 'r', encoding='utf-8').read()
m2 = re.search(r'\$exthttp = \[(.*?)\];', php, re.DOTALL)
php_keys = set()
if m2:
    block2 = m2.group(1)
    php_keys = set(re.findall(r'"([A-Za-z][A-Za-z0-9-]+)"', block2))
    php_keys = {k for k in php_keys if k[0].isupper() or k.startswith('X-')}

# 3. Compare
print(f"=== HEADER PARITY AUDIT ===")
print(f"JS  exthttpHEVC: {len(js_keys)} headers")
print(f"PHP exthttp:     {len(php_keys)} headers")
print()

only_js = sorted(js_keys - php_keys)
only_php = sorted(php_keys - js_keys)
both = sorted(js_keys & php_keys)

print(f"MATCHED (both): {len(both)}")
print(f"ONLY in JS:     {len(only_js)}")
for k in only_js:
    print(f"  + {k}")
print(f"ONLY in PHP:    {len(only_php)}")
for k in only_php:
    print(f"  + {k}")
print()
print(f"TOTAL UNIQUE:   {len(js_keys | php_keys)}")
print(f"TARGET:         120+")
print(f"GAP:            {max(0, 120 - len(js_keys | php_keys))} headers needed")
