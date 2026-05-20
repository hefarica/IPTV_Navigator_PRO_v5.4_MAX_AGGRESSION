import re
import sys
import os

def run_verification(engine_path):
    print(f"Running automated python verification on: {engine_path}")
    if not os.path.exists(engine_path):
        print(f"Error: {engine_path} not found.")
        sys.exit(1)
        
    with open(engine_path, "r", encoding="utf-8") as f:
        content = f.read()

    # Extract thresholds
    thresholds = {}
    pattern = r"self::LEVEL_(\d+)\s*=>\s*\[\s*'risk'\s*=>\s*([\d\.]+),\s*'stall'\s*=>\s*([\d\.]+),\s*'jitter'\s*=>\s*([\d\.]+),\s*'loss'\s*=>\s*([\d\.]+),\s*'vfi'\s*=>\s*([\d\.]+)\s*\]"
    matches = re.findall(pattern, content)
    for m in matches:
        level = int(m[0])
        thresholds[level] = {
            'risk': float(m[1]),
            'stall': float(m[2]),
            'jitter': float(m[3]),
            'loss': float(m[4]),
            'vfi': float(m[5])
        }

    if not thresholds:
        print("Error: Could not extract thresholds from GracefulDegradationEngine.")
        sys.exit(1)

    print("Successfully extracted thresholds:")
    for level, t in sorted(thresholds.items()):
        print(f"  Level {level}: risk<={t['risk']}, stall<={t['stall']}, jitter<={t['jitter']}, loss<={t['loss']}, vfi>={t['vfi']}")

    def compute_level(health, stable=True):
        risk = float(health.get('riskScore', 0.0))
        # stallRate from evaluateStreamHealth is percentage (e.g. 1.67%)
        # thresholds expect ratio (0.00 - 1.00), so divide by 100.0
        stall = float(health.get('stallRate', 0.0)) / 100.0
        jitter = float(health.get('jitterMax', health.get('jitterMs', 0.0)))
        loss = float(health.get('lossRate', 0.0))
        vfi = float(health.get('vfi', 100.0))
        
        # Stream completely fallen -> L7 immediate
        if not stable and risk >= 90 and stall >= 0.6:
            return 7

        for level in sorted(thresholds.keys()):
            t = thresholds[level]
            if (risk <= t['risk'] and 
                stall <= t['stall'] and 
                jitter <= t['jitter'] and 
                loss <= t['loss'] and 
                vfi >= t['vfi']):
                return level
        return 7

    # Assertions
    test_cases = [
        {
            'name': 'God-Tier Network (Optimal)',
            'health': {
                'riskScore': 10,
                'stallRate': 5.0,
                'jitterMs': 20,
                'lossRate': 0.002,
                'vfi': 55,
            },
            'stable': True,
            'expected': 1
        },
        {
            'name': 'Excellent Network',
            'health': {
                'riskScore': 20,
                'stallRate': 10.0,
                'jitterMs': 40,
                'lossRate': 0.008,
                'vfi': 45,
            },
            'stable': True,
            'expected': 2
        },
        {
            'name': 'Good Network',
            'health': {
                'riskScore': 35,
                'stallRate': 18.0,
                'jitterMs': 120,
                'lossRate': 0.015,
                'vfi': 35,
            },
            'stable': True,
            'expected': 3
        },
        {
            'name': 'Acceptable Network',
            'health': {
                'riskScore': 55,
                'stallRate': 25.0,
                'jitterMs': 250,
                'lossRate': 0.04,
                'vfi': 25,
            },
            'stable': True,
            'expected': 4
        },
        {
            'name': 'Degraded Network',
            'health': {
                'riskScore': 70,
                'stallRate': 40.0,
                'jitterMs': 450,
                'lossRate': 0.08,
                'vfi': 15,
            },
            'stable': True,
            'expected': 5
        },
        {
            'name': 'Minimal Network',
            'health': {
                'riskScore': 85,
                'stallRate': 55.0,
                'jitterMs': 800,
                'lossRate': 0.15,
                'vfi': 5,
            },
            'stable': True,
            'expected': 6
        },
        {
            'name': 'Failover Network (Worst Case)',
            'health': {
                'riskScore': 95,
                'stallRate': 80.0,
                'jitterMs': 1200,
                'lossRate': 0.30,
                'vfi': 2,
            },
            'stable': False,
            'expected': 7
        },
        {
            'name': 'Missing fields fallback (defaults to safe best)',
            'health': {
                'jitterMs': 20
            },
            'stable': True,
            'expected': 1
        },
        {
            'name': 'Missing fields fallback with vfi optimal',
            'health': {
                'jitterMs': 20,
                'vfi': 55
            },
            'stable': True,
            'expected': 1
        },
        {
            'name': 'jitterMax fallback check',
            'health': {
                'riskScore': 10,
                'stallRate': 5.0,
                'jitterMax': 25,
                'lossRate': 0.002,
                'vfi': 55
            },
            'stable': True,
            'expected': 1
        }
    ]

    passed = 0
    failed = 0
    print("\nEvaluating test cases...")
    print("=" * 60)
    for tc in test_cases:
        res = compute_level(tc['health'], tc['stable'])
        if res == tc['expected']:
            print(f"[PASS] {tc['name']}: Resolved to Level {res}")
            passed += 1
        else:
            print(f"[FAIL] {tc['name']}: Expected Level {tc['expected']}, got Level {res}")
            failed += 1
    print("=" * 60)
    print(f"Results: {passed} passed, {failed} failed.")
    
    if failed > 0:
        sys.exit(1)
    else:
        sys.exit(0)

if __name__ == "__main__":
    path = "graceful_degradation_engine.php"
    if len(sys.argv) > 1:
        path = sys.argv[1]
    run_verification(path)
