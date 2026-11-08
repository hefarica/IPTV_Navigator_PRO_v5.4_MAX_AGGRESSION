#!/usr/bin/env python3
"""Execute the six real temporal filters on an explicit synthetic FFmpeg source.

This checks filter acceptance and execution, not perceptual improvement, real
channel performance or VLC module availability. The recorded invalid legacy
arguments must still fail so a self-confirming recipe check cannot hide them.
"""
import json
from pathlib import Path
import shutil
import subprocess

recipes = json.loads((Path(__file__).with_name('recipes.json')).read_text())
binary = shutil.which('ffmpeg')
if not binary:
    raise SystemExit('FFmpeg is required; this test was not executed.')
version = subprocess.check_output([binary, '-version'], text=True).splitlines()[0]
results = []
for name, profile in recipes['profiles'].items():
    stage = next(item for item in profile['stages'] if item['id'] == 'atadenoise')
    def execute(chain):
        return subprocess.run([binary, '-v', 'error', '-nostdin', '-f', 'lavfi',
            '-i', 'testsrc2=size=64x36:rate=25', '-vf', chain,
            '-frames:v', '1', '-f', 'null', '-'], text=True, capture_output=True, timeout=15)
    corrected = execute(stage['ffmpeg'])
    previous = execute(stage['legacy_invalid_ffmpeg'])
    passed = corrected.returncode == 0 and previous.returncode != 0
    results.append({'profile': name, 'filter': stage['ffmpeg'], 'corrected_exit': corrected.returncode,
                    'legacy_exit': previous.returncode, 'passed': passed})
    if corrected.returncode:
        print(corrected.stderr)
print(json.dumps({'ffmpeg': version, 'synthetic_source': 'testsrc2 64x36 25fps',
                  'results': results, 'physical_or_perceptual_quality_measured': False}, indent=2))
raise SystemExit(0 if all(item['passed'] for item in results) else 1)
