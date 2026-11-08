#!/usr/bin/env python3
"""Compile/run real REA request/container/routing/DASH factory code on the JVM.

This runner does not package an APK, start Android, or contact a media provider.
Only pinned public build dependencies are downloaded if missing from the test cache.
"""
from pathlib import Path
import hashlib
import json
import os
import subprocess
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1]
TESTS = ROOT / 'tests'
TOOLS = Path(os.environ.get('REA_TOOLS_DIR', str(ROOT.parent / 'tools')))
CACHE = TESTS / 'deps'
CLASSES = TESTS / 'header_classes'
CACHE.mkdir(exist_ok=True)
CLASSES.mkdir(exist_ok=True)


def dependency(name, url, digest, jar_digest=None):
    path = CACHE / name
    if not path.exists():
        with urllib.request.urlopen(url, timeout=45) as response:
            content = response.read()
        if hashlib.sha256(content).hexdigest() != digest:
            raise RuntimeError('Dependency checksum mismatch: ' + name)
        path.write_bytes(content)
    if hashlib.sha256(path.read_bytes()).hexdigest() != digest:
        raise RuntimeError('Cached dependency checksum mismatch: ' + name)
    if jar_digest:
        with zipfile.ZipFile(path) as archive:
            content = archive.read('classes.jar')
        if hashlib.sha256(content).hexdigest() != jar_digest:
            raise RuntimeError('Dependency classes checksum mismatch: ' + name)
        path = path.with_suffix('.jar')
        path.write_bytes(content)
    return path


android_runtime = dependency(
    'android-all-4.4_r1-robolectric-r2.jar',
    'https://repo.maven.apache.org/maven2/org/robolectric/android-all/4.4_r1-robolectric-r2/android-all-4.4_r1-robolectric-r2.jar',
    '5c68ab0a11d6f46e303505e75da62215f45b6a46ff7877441a31d527899359f9')
dash = dependency(
    'media3-exoplayer-dash-1.3.1.aar',
    'https://dl.google.com/dl/android/maven2/androidx/media3/media3-exoplayer-dash/1.3.1/media3-exoplayer-dash-1.3.1.aar',
    'c1d8f825e18d3d2c30abb46ab1dfd43dee9a41d36c2a7e9bc169eb93b221db58',
    'a7d38e6b5a7192843d1726892fba7ee042a3aa68f7d5be2665f16762b41cf25b')
extractor = dependency(
    'media3-extractor-1.3.1.aar',
    'https://dl.google.com/dl/android/maven2/androidx/media3/media3-extractor/1.3.1/media3-extractor-1.3.1.aar',
    '54400e411960da947d85567bbce3e752fade6bcb7d075c122a4e2cd05379dc62',
    '4f4bbed96b414059eb7503375e57f77dae0f0598ac14f6f697851a817d62ea5c')
guava = dependency(
    'guava-32.1.3-android.jar',
    'https://repo.maven.apache.org/maven2/com/google/guava/guava/32.1.3-android/guava-32.1.3-android.jar',
    '20e6ac8902ddf49e7806cc70f3054c8d91accb5eefdc10f3207e80e0a336b263')
host_jars = [path for path in sorted(TOOLS.glob('media3-*.jar'))
             if path.name not in ('media3-exoplayer-dash.jar', 'media3-extractor.jar')]
jars = [TOOLS / 'annotation.jar', dash, extractor, guava] + host_jars
production = [ROOT / 'src/com/ape/rea' / name for name in
              ('ReaExternalRequest.java', 'ReaExternalPlayerActivity.java', 'ReaMediaSources.java')]
suites = ['ReaExternalRequestTest', 'ReaExternalHeadersContainerTest',
          'ReaMediaSourcesTest', 'ReaDashFactoryTest']
sources = production + [TESTS / (name + '.java') for name in suites]
compile_cp = os.pathsep.join(map(str, [TOOLS / 'sdk/android-34-ext12/android.jar'] + jars))
subprocess.run(['java', '-XX:-UsePerfData', '-jar', str(TOOLS / 'ecj.jar'), '-8', '-proc:none',
                '-warn:none', '-encoding', 'UTF-8', '-cp', compile_cp, '-d', str(CLASSES)]
               + list(map(str, sources)), check=True)
runtime_cp = os.pathsep.join(map(str, [CLASSES, android_runtime] + jars))
results = []
for suite in suites:
    completed = subprocess.run(['java', '-XX:-UsePerfData', '-cp', runtime_cp, suite],
                               text=True, capture_output=True, check=True)
    result = json.loads(completed.stdout)
    results.append(result)
    print(json.dumps(result))
report = {
    'passed': all(item['passed'] for item in results),
    'assertions': sum(item['assertions'] for item in results),
    'android_runtime_tested': False,
    'network_playback_tested': False,
    'physical_hdr_tested': False,
    'uses_test_doubles': False,
    'coverage': 'Real production parser and MIME helper; real Android Java Bundle/JSONObject; pinned official DASH and HTTP factory objects.',
    'suites': results,
    'source_sha256': {str(path.relative_to(ROOT)): hashlib.sha256(path.read_bytes()).hexdigest()
                      for path in production},
    'dash_jar_sha256': hashlib.sha256(dash.read_bytes()).hexdigest(),
}
(TESTS / 'external_interop_results.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({'suite': 'external_interop_total', 'assertions': report['assertions'], 'passed': report['passed']}))
