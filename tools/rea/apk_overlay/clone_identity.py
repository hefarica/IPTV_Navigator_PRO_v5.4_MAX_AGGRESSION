#!/usr/bin/env python3
"""Give the rebuilt APK its own install identity without renaming Java classes."""
from pathlib import Path
import json,re,xml.etree.ElementTree as ET

ROOT=Path(__file__).resolve().parent
APK=ROOT.parent/'apk'
OLD='com.ape.crystalagent';NEW=OLD+'.rea'
VERSION='3.9.7-rea-interop-test';CODE=653
ANDROID='http://schemas.android.com/apk/res/android'
ET.register_namespace('android',ANDROID)
manifest=APK/'AndroidManifest.xml'
tree=ET.parse(manifest);node=tree.getroot()
if node.attrib.get('package') not in (OLD,NEW):raise RuntimeError('Unexpected input package')
if not any(x.attrib.get('{'+ANDROID+'}name')=='com.ape.rea.ReaExternalPlayerActivity' for x in node.iter('activity')):
    raise RuntimeError('OTT external activity must be integrated before package cloning')
node.set('package',NEW)
app=node.find('application');app.set('{'+ANDROID+'}label','APE Crystal REA (Prueba)')
app.set('{'+ANDROID+'}debuggable','false')
identities={OLD:NEW}
for suffix in ('.provider','.ZAP','.AB','.AB_DONE','.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION'):
    identities[OLD+suffix]=NEW+suffix
for element in node.iter():
    for key,value in list(element.attrib.items()):
        if value in identities:element.set(key,identities[value])
tree.write(manifest,encoding='utf-8',xml_declaration=True)
changed=[]
for path in APK.glob('smali*/**/*.smali'):
    text=original=path.read_text()
    for old,new in identities.items():text=text.replace('"'+old+'"','"'+new+'"')
    text=text.replace('pm grant '+OLD+' ','pm grant '+NEW+' ')
    if path.name=='BuildConfig.smali' and '/com/ape/crystalagent/' in str(path):
        text=re.sub(r'(?m)^(\.field public static final VERSION_CODE:I = ).*$',r'\g<1>'+hex(CODE),text)
        text=re.sub(r'(?m)^(\.field public static final VERSION_NAME:Ljava/lang/String; = ).*$',r'\g<1>"'+VERSION+'"',text)
    if text!=original:path.write_text(text);changed.append(str(path.relative_to(APK)))
yml=APK/'apktool.yml';text=yml.read_text()
text=re.sub(r'(?m)^  versionCode: .*$',f'  versionCode: {CODE}',text)
text=re.sub(r'(?m)^  versionName: .*$',f'  versionName: {VERSION}',text)
yml.write_text(text)
receipt={'package':NEW,'version_code':CODE,'version_name':VERSION,'label':'APE Crystal REA (Prueba)','install':'separate package','signing':'development identity; not original publisher certificate','modified_smali':changed}
(ROOT/'identity_receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps(receipt))
