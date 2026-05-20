import os
import sys
import re

def verify_zapping_integration(resolve_quality_path):
    if not os.path.exists(resolve_quality_path):
        print(f"Error: {resolve_quality_path} not found.")
        return False
        
    with open(resolve_quality_path, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()
        
    # Verify require_once blocks
    if "visual_supremacy_orchestrator.php" not in content:
        print("FAIL: visual_supremacy_orchestrator.php requirement is missing in resolve_quality_unified.php")
        return False
        
    # Verify VisualSupremacyOrchestrator::process call
    match_process = re.search(r"VisualSupremacyOrchestrator::process\(([^)]+)\)", content)
    if not match_process:
        print("FAIL: VisualSupremacyOrchestrator::process call not found in resolve_quality_unified.php")
        return False
        
    args = [arg.strip() for arg in match_process.group(1).split(',')]
    print(f"Detected process arguments: {args}")
    
    # Check that it passes: $channelId (or similar), $healthMetrics, $streamInfo, $detected_scene (or similar)
    if len(args) < 3:
        print(f"FAIL: process() call has only {len(args)} arguments, expected at least 3 (channelId, health, streamInfo)")
        return False
        
    # Verify streamInfo construction contains width, height, hdr_type, codec mapped from GET parameters
    required_keys = ['width', 'height', 'hdr_type', 'codec']
    missing_keys = []
    for key in required_keys:
        if f"'{key}'" not in content and f'"{key}"' not in content:
            missing_keys.append(key)
            
    if missing_keys:
        print(f"FAIL: resolve_quality_unified.php is missing mapping for streamInfo keys: {missing_keys}")
        return False
        
    # Verify header outputs preg_replace injection syntax
    if "preg_replace" not in content or "addcslashes" not in content:
        print("FAIL: Missing safe injection pattern (preg_replace / addcslashes) for output directives.")
        return False
        
    print("PASS: resolve_quality_unified.php integration matches all specification requirements.")
    return True

if __name__ == "__main__":
    script_dir = os.path.dirname(os.path.abspath(__file__))
    resolve_quality_path = os.path.abspath(os.path.join(script_dir, "..", "resolve_quality_unified.php"))
    
    success = verify_zapping_integration(resolve_quality_path)
    if success:
        sys.exit(0)
    else:
        sys.exit(1)
