#!/usr/bin/env python3
"""BLINDAJE TOTAL: Wrap ALL external function calls with function_exists guards
and ensure ALL module files have require_once with file_exists protection."""
import re, subprocess, os

FILE = '/var/www/html/iptv-ape/resolve_quality.php'
MODULES_DIR = '/var/www/html/iptv-ape/'

# All known external modules and their functions
EXTERNAL_MODULES = {
    'rq_sniper_mode.php': [],       # Core - always exists
    'rq_anti_cut_engine.php': [
        'rq_anti_cut_isp_strangler',
        'rq_get_anti_cut_profile',
    ],
    'ape_anti_noise_engine.php': [
        'ape_noise_engine_integrate',
        'ape_noise_classify_source',
        'ape_noise_get_pipeline',
    ],
    'ape_hdr_peak_nit_engine.php': [
        'ape_hdr_peak_nit_integrate',
        'ape_hdr_dynamic_metadata',
        'ape_hdr_static_st2086',
        'ape_hdr_gpu_tonemap',
    ],
    'ape_stream_validator_proxy.php': [
        'ape_sniper_stream_guard',
        'ape_stream_validate',
    ],
}

with open(FILE, 'r') as f:
    content = f.read()

changes = 0

# STEP 1: Ensure ALL modules have require_once with file_exists guard
print("=== STEP 1: REQUIRE_ONCE HARDENING ===")
for module_file in EXTERNAL_MODULES:
    if module_file == 'rq_sniper_mode.php':
        continue  # Core module, skip
    
    # Check if require_once exists
    if module_file in content:
        # Check if it has file_exists guard
        if f'file_exists(__DIR__ . "/{module_file}")' in content:
            print(f"  ✅ {module_file} — guarded require_once exists")
        else:
            print(f"  ⚠️  {module_file} — referenced but no file_exists guard. Adding...")
            # Find the require_once line and wrap it
            old = f'require_once __DIR__ . "/{module_file}";'
            new = f'if (file_exists(__DIR__ . "/{module_file}")) {{\n    require_once __DIR__ . "/{module_file}";\n}}'
            if old in content:
                content = content.replace(old, new)
                changes += 1
                print(f"     ✅ Wrapped with file_exists guard")
    else:
        print(f"  ❌ {module_file} — NOT included. Adding guarded require_once")
        # Add after the sniper mode require_once
        anchor = 'require_once __DIR__ . "/rq_sniper_mode.php";'
        if anchor in content:
            insert = f'\nif (file_exists(__DIR__ . "/{module_file}")) {{\n    require_once __DIR__ . "/{module_file}";\n}}'
            content = content.replace(anchor, anchor + insert, 1)
            changes += 1
            print(f"     ✅ Added guarded require_once")

# STEP 2: Wrap ALL external function calls with function_exists
print("\n=== STEP 2: FUNCTION_EXISTS GUARDS ===")
for module_file, functions in EXTERNAL_MODULES.items():
    for func_name in functions:
        # Find all calls to this function
        pattern = re.compile(r'(?<!function_exists\(["\'])' + re.escape(func_name) + r'\s*\(', re.MULTILINE)
        
        lines = content.split('\n')
        for i, line in enumerate(lines):
            # Skip function definitions
            if line.strip().startswith('function '):
                continue
            # Skip already guarded calls
            if 'function_exists' in line and func_name in line:
                continue
            # Skip comments
            if line.strip().startswith('//') or line.strip().startswith('*'):
                continue
            
            if func_name + '(' in line:
                # Check if there's a function_exists guard in previous 3 lines
                has_guard = False
                for j in range(max(0, i-3), i):
                    if f'function_exists' in lines[j] and func_name in lines[j]:
                        has_guard = True
                        break
                
                if not has_guard:
                    # Add function_exists guard
                    indent = len(line) - len(line.lstrip())
                    spaces = ' ' * indent
                    guard = f'{spaces}if (function_exists(\'{func_name}\')) {{'
                    end_guard = f'{spaces}}}'
                    lines[i] = guard + '\n' + spaces + '    ' + line.strip() + '\n' + end_guard
                    changes += 1
                    print(f"  ✅ Guarded {func_name}() at L{i+1}")
        
        content = '\n'.join(lines)

# STEP 3: Add a master module loader function at the top
LOADER = '''
// === APE MODULE LOADER — BULLETPROOF ===
// All external modules loaded with file_exists + function_exists guards
// This prevents Fatal Errors when a module is missing from the VPS
function ape_safe_call($func_name, ...$args) {
    if (function_exists($func_name)) {
        return call_user_func_array($func_name, $args);
    }
    // Log missing function for debugging
    @file_put_contents(__DIR__ . '/logs/missing_functions.log',
        date('Y-m-d H:i:s') . " MISSING: {$func_name}()\\n", FILE_APPEND);
    return null;
}
'''

# Add loader if not exists
if 'ape_safe_call' not in content:
    # Insert after the opening <?php tag and any initial comments
    insert_pos = content.find('require_once')
    if insert_pos > 0:
        content = content[:insert_pos] + LOADER + '\n' + content[insert_pos:]
        changes += 1
        print("\n✅ Added ape_safe_call() master loader function")

# Write
with open(FILE, 'w') as f:
    f.write(content)

print(f"\n=== TOTAL CHANGES: {changes} ===")

# Verify
r = subprocess.run(['php', '-l', FILE], capture_output=True, text=True)
print(f"PHP: {r.stdout.strip()}")
if r.returncode != 0:
    print(f"SYNTAX ERROR: {r.stderr.strip()[:300]}")
    # ROLLBACK
    print("ROLLING BACK...")
    subprocess.run(['cp', FILE + '.bak', FILE])
else:
    # Backup
    subprocess.run(['cp', FILE, FILE + '.hardened.bak'])
    print("Hardened backup saved")
    
    # Restart FPM
    subprocess.run(['systemctl', 'restart', 'php8.3-fpm'], capture_output=True)
    print("FPM restarted")
    
    # Test
    r2 = subprocess.run(['curl', '-sk', '-o', '/dev/null', '-w', '%{http_code}',
        'https://localhost/iptv-ape/resolve_quality.php?ch=12'], 
        capture_output=True, text=True, timeout=10)
    print(f"HTTP: {r2.stdout.strip()}")
