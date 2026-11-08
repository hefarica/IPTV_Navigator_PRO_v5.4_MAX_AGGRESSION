#!/usr/bin/env python3
"""Compile production code against API34; exercise recovery state and real Java Intent.

No Activity, decoder, display, remote server, or substitute player is executed.
The existing interop runner provides the pinned Android Java runtime dependency.
"""
from pathlib import Path
import hashlib
import json
import os
import subprocess

ROOT=Path(__file__).resolve().parents[1]
TESTS=ROOT/'tests'
TOOLS=Path(os.environ.get('REA_TOOLS_DIR',str(ROOT.parent/'tools')))
RUNTIME=TESTS/'deps/android-all-4.4_r1-robolectric-r2.jar'
EXPECTED='5c68ab0a11d6f46e303505e75da62215f45b6a46ff7877441a31d527899359f9'
if not RUNTIME.exists() or hashlib.sha256(RUNTIME.read_bytes()).hexdigest()!=EXPECTED:
    raise RuntimeError('Run tests/run_external_interop.py to provide the pinned Android Java runtime')
CLASSES=TESTS/'native_recovery_classes';CLASSES.mkdir(exist_ok=True)
JARS=[TOOLS/'annotation.jar',TOOLS/'guava-32.1.3-android.jar']+sorted(TOOLS.glob('media3-*.jar'))
SOURCES=sorted((ROOT/'src').rglob('*.java'))+sorted((ROOT/'java').rglob('*.java'))
SOURCES += [TESTS/'ReaNativeRecoveryTest.java',TESTS/'ReaLoadGovernorTest.java']
cp=os.pathsep.join(str(p) for p in [TOOLS/'sdk/android-34-ext12/android.jar']+JARS)
subprocess.run(['java','-XX:-UsePerfData','-jar',str(TOOLS/'ecj.jar'),'-8','-proc:none','-warn:none',
                '-encoding','UTF-8','-cp',cp,'-d',str(CLASSES)]+list(map(str,SOURCES)),check=True)
runtime_cp=os.pathsep.join(str(p) for p in [CLASSES,RUNTIME]+JARS)
results=[]
for suite in ('ReaNativeRecoveryTest','ReaLoadGovernorTest'):
    completed=subprocess.run(['java','-XX:-UsePerfData','-cp',runtime_cp,suite],check=True,text=True,capture_output=True)
    item=json.loads(completed.stdout);results.append(item);print(json.dumps(item))
report={'passed':True,'scope':'Production recovery state, governor and real Android Java Intent on JVM; API34 compilation',
        'android_activity_tested':False,'physical_hdr_tested':False,'uses_test_doubles':False,
        'source_sha256':hashlib.sha256((ROOT/'src/com/ape/rea/ReaBridge.java').read_bytes()).hexdigest(),
        'suites':results}
(TESTS/'native_recovery_results.json').write_text(json.dumps(report,indent=2)+'\n')
