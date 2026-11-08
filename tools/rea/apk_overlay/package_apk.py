#!/usr/bin/env python3
"""Rebuild eight original DEX files, add compiled REA DEX, align, sign and verify."""
from pathlib import Path
import hashlib,json,os,shutil,subprocess,zipfile

ROOT=Path(__file__).resolve().parent;WORK=ROOT.parent;TOOLS=WORK/'tools'
APK=WORK/'apk';BUILD=WORK/'build';BUILD.mkdir(exist_ok=True)
OUT=WORK.parent/'deliverables';OUT.mkdir(exist_ok=True)
for p in (ROOT/'assets').rglob('*'):
    if p.is_file():
        target=APK/'assets'/p.relative_to(ROOT/'assets');target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,target)
assert (APK/'assets/shaders/rea_sdr_to_hdr_external.glsl').exists()
base=BUILD/'unsigned-base.apk'
subprocess.run(['java','-jar',str(TOOLS/'apktool.jar'),'b',str(APK),'-o',str(base)],check=True)
dex=ROOT/'dex/classes.dex'
assert dex.is_file() and len(list((ROOT/'dex').glob('classes*.dex')))==1
combined=BUILD/'unsigned-rea.apk'
with zipfile.ZipFile(base) as source,zipfile.ZipFile(combined,'w') as target:
    assert {n for n in source.namelist() if n.endswith('.dex')}=={'classes.dex'}|{f'classes{i}.dex' for i in range(2,9)}
    for item in source.infolist():
        if item.filename.startswith('META-INF/') and item.filename.rsplit('.',1)[-1].upper() in ('RSA','DSA','EC','SF','MF'):continue
        target.writestr(item,source.read(item.filename))
    target.write(dex,'classes9.dex',compress_type=zipfile.ZIP_DEFLATED)
align=TOOLS/'sdk/android-14/zipalign';align.chmod(0o755)
aligned=BUILD/'aligned-rea.apk'
subprocess.run([str(align),'-f','-p','4',str(combined),str(aligned)],check=True)
name='APE_REA_653_OTT_DASH_2K_4K_6K_TEST_20261108.apk';final=OUT/name
signer=TOOLS/'sdk/android-14/lib/apksigner.jar'
key=WORK/'signing/ape-rea-test.p12';secret='file:'+str(WORK/'signing/password.txt')
subprocess.run(['java','-jar',str(signer),'sign','--ks',str(key),'--ks-key-alias','ape-rea','--ks-pass',secret,'--v1-signing-enabled','true','--v2-signing-enabled','true','--v3-signing-enabled','true','--out',str(final),str(aligned)],check=True)
verification=subprocess.run(['java','-jar',str(signer),'verify','--verbose','--print-certs',str(final)],check=True,text=True,capture_output=True)
(OUT/(final.stem+'_signature.txt')).write_text(verification.stdout+verification.stderr)
subprocess.run([str(align),'-c','-p','4',str(final)],check=True)
original=WORK/'input.apk'
with zipfile.ZipFile(original) as a,zipfile.ZipFile(final) as b:
    assert len(set(b.namelist()))==len(b.namelist()),'Duplicate archive entries'
    assert b.testzip() is None,'Corrupt zip entry'
    native=[n for n in a.namelist() if n.startswith('lib/') and n.endswith('.so')]
    assert all(a.read(n)==b.read(n) for n in native),'Changed native library'
    assert len([n for n in b.namelist() if n.endswith('.dex')])==9
    for n in ('assets/shaders/rea_vertex.glsl','assets/shaders/rea_adaptive.glsl','assets/shaders/rea_sdr_to_hdr_external.glsl'):assert n in b.namelist()
summary={'apk':name,'bytes':final.stat().st_size,'sha256':hashlib.sha256(final.read_bytes()).hexdigest(),'original_sha256':hashlib.sha256(original.read_bytes()).hexdigest(),'identity':json.loads((ROOT/'identity_receipt.json').read_text()),'dex_files':9,'native_libraries_preserved':len(native),'signature_verified':True,'zip_alignment_verified':True,'android_playback_tested':False,'physical_hdr_tested':False}
(OUT/(final.stem+'_verification.json')).write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(summary,ensure_ascii=False))
