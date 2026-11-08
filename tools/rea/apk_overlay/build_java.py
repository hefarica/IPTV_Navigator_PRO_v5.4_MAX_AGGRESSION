#!/usr/bin/env python3
"""Compile new REA classes against exact APK Media3 version, then emit separate DEX."""
from pathlib import Path
import hashlib, json, subprocess, urllib.request, zipfile

ROOT=Path(__file__).resolve().parent
TOOLS=ROOT.parent/'tools'
ANDROID=TOOLS/'sdk/android-34-ext12/android.jar'
DASH_AAR=TOOLS/'media3-exoplayer-dash.aar'
DASH_JAR=TOOLS/'media3-exoplayer-dash.jar'
DASH_URL='https://dl.google.com/dl/android/maven2/androidx/media3/media3-exoplayer-dash/1.3.1/media3-exoplayer-dash-1.3.1.aar'
DASH_AAR_SHA256='c1d8f825e18d3d2c30abb46ab1dfd43dee9a41d36c2a7e9bc169eb93b221db58'
DASH_JAR_SHA256='a7d38e6b5a7192843d1726892fba7ee042a3aa68f7d5be2665f16762b41cf25b'
# Keep the optional module exactly aligned with the APK's Media3 1.3.1 host.
# A compile classpath alone does not package its 59 implementation classes.
def require_input(path, url, expected_sha256):
    if not path.exists():
        with urllib.request.urlopen(url, timeout=30) as response:
            artifact=response.read()
        if hashlib.sha256(artifact).hexdigest()!=expected_sha256:
            raise RuntimeError(f'Download checksum mismatch: {path.name}')
        path.write_bytes(artifact)
    if hashlib.sha256(path.read_bytes()).hexdigest()!=expected_sha256:
        raise RuntimeError(f'Build input checksum mismatch: {path.name}')

def extract_classes(aar, jar, expected_sha256):
    with zipfile.ZipFile(aar) as archive:
        artifact=archive.read('classes.jar')
    if hashlib.sha256(artifact).hexdigest()!=expected_sha256:
        raise RuntimeError(f'Implementation checksum mismatch: {jar.name}')
    jar.write_bytes(artifact)

require_input(DASH_AAR,DASH_URL,DASH_AAR_SHA256)
extract_classes(DASH_AAR,DASH_JAR,DASH_JAR_SHA256)
# Existing host implementations, needed only for compilation/desugaring. They must
# remain classpath inputs so the APK does not acquire duplicate runtime classes.
EXTRACTOR_AAR=TOOLS/'media3-extractor.aar'
require_input(EXTRACTOR_AAR,
    'https://dl.google.com/dl/android/maven2/androidx/media3/media3-extractor/1.3.1/media3-extractor-1.3.1.aar',
    '54400e411960da947d85567bbce3e752fade6bcb7d075c122a4e2cd05379dc62')
extract_classes(EXTRACTOR_AAR,TOOLS/'media3-extractor.jar',
    '4f4bbed96b414059eb7503375e57f77dae0f0598ac14f6f697851a817d62ea5c')
GUAVA_JAR=TOOLS/'guava-32.1.3-android.jar'
require_input(GUAVA_JAR,
    'https://repo.maven.apache.org/maven2/com/google/guava/guava/32.1.3-android/guava-32.1.3-android.jar',
    '20e6ac8902ddf49e7806cc70f3054c8d91accb5eefdc10f3207e80e0a336b263')
JARS=[TOOLS/'annotation.jar',GUAVA_JAR]+sorted(TOOLS.glob('media3-*.jar'))
sources=sorted((ROOT/'src').rglob('*.java'))+sorted((ROOT/'java').rglob('*.java'))
CLASSES=ROOT/'classes'
CLASSES.mkdir(exist_ok=True)
cp=':'.join(str(p) for p in [ANDROID]+JARS)
cmd=['java','-jar',str(TOOLS/'ecj.jar'),'-8','-proc:none','-warn:none','-encoding','UTF-8','-cp',cp,'-d',str(CLASSES)]+[str(p) for p in sources]
subprocess.run(cmd,check=True)
jar=ROOT/'rea-classes.jar'
with zipfile.ZipFile(jar,'w',zipfile.ZIP_DEFLATED) as z:
    for p in sorted(CLASSES.rglob('*.class')):z.write(p,p.relative_to(CLASSES))
dex=ROOT/'dex';dex.mkdir(exist_ok=True)
cmd=['java','-cp',str(TOOLS/'sdk/android-14/lib/d8.jar'),'com.android.tools.r8.D8','--min-api','22','--lib',str(ANDROID)]
for p in JARS:
    if p!=DASH_JAR:cmd.extend(['--classpath',str(p)])
cmd.extend(['--output',str(dex),str(jar),str(DASH_JAR)])
subprocess.run(cmd,check=True)
print(json.dumps({'java_sources':len(sources),'compiled_classes':len(list(CLASSES.rglob('*.class'))),'dash_module':'1.3.1','dash_jar_sha256':DASH_JAR_SHA256,'dex_files':[p.name for p in dex.glob('*.dex')]}))
