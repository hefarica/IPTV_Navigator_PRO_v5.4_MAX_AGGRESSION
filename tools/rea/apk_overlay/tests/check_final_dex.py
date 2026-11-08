#!/usr/bin/env python3
"""Read DEX tables/class-data and the compiled Manifest, without decompilation.
Checks class duplication, exact injected method descriptors/access flags and component existence.
This is structural verification, not an Android runtime/verifier test.
"""
import argparse
from collections import defaultdict
import hashlib
import json
from pathlib import Path
import re
import struct
import subprocess
from zipfile import ZipFile
import zlib

class Dex:
    def __init__(self, name, data):
        self.name,self.data=name,data
        if data[:4]!=b'dex\n' or data[7]!=0:raise ValueError('Bad DEX magic: '+name)
        self.version=data[4:7].decode('ascii')
        if self.u32(32)!=len(data) or self.u32(36)!=112 or self.u32(40)!=0x12345678:
            raise ValueError('Unexpected DEX header: '+name)
        if zlib.adler32(data[12:]) & 0xffffffff != self.u32(8):raise ValueError('Bad DEX checksum: '+name)
        if hashlib.sha1(data[32:]).digest()!=data[12:32]:raise ValueError('Bad DEX SHA1: '+name)
        size,off=self.pair(56)
        self.strings=[]
        for i in range(size):
            item=self.u32(off+i*4);_,item=self.uleb(item)
            end=data.index(0,item)
            raw=data[item:end].replace(b'\xc0\x80',b'\x00')
            self.strings.append(raw.decode('utf-8','surrogatepass'))
        size,off=self.pair(64)
        self.types=[self.strings[self.u32(off+i*4)] for i in range(size)]
        size,off=self.pair(72)
        self.protos=[]
        for i in range(size):
            _,ret,params=struct.unpack_from('<III',data,off+i*12)
            args=[]
            if params:
                n=self.u32(params)
                args=[self.types[struct.unpack_from('<H',data,params+4+j*2)[0]] for j in range(n)]
            self.protos.append('('+''.join(args)+')'+self.types[ret])
        size,off=self.pair(88)
        self.methods=[]
        for i in range(size):
            owner,proto,name_idx=struct.unpack_from('<HHI',data,off+i*8)
            self.methods.append(self.types[owner]+'->'+self.strings[name_idx]+self.protos[proto])
        self.classes={};self.defined_methods={}
        size,off=self.pair(96)
        for i in range(size):
            ci,flags,si,interfaces,source,annotation,cd,values=struct.unpack_from('<8I',data,off+i*32)
            desc=self.types[ci]
            if desc in self.classes:raise ValueError('Duplicate class in one DEX: '+desc)
            self.classes[desc]={'dex':name,'flags':flags,'super':None if si==0xffffffff else self.types[si]}
            if not cd:continue
            ns,cd=self.uleb(cd);ni,cd=self.uleb(cd);nd,cd=self.uleb(cd);nv,cd=self.uleb(cd)
            for n in (ns,ni):
                field_idx=0
                for j in range(n):
                    diff,cd=self.uleb(cd);_,cd=self.uleb(cd);field_idx+=diff
            for n,kind in ((nd,'direct'),(nv,'virtual')):
                idx=0
                for j in range(n):
                    diff,cd=self.uleb(cd);access,cd=self.uleb(cd);code_off,cd=self.uleb(cd);idx+=diff
                    method=self.methods[idx]
                    if not method.startswith(desc+'->'):raise ValueError('Class data owner mismatch: '+method)
                    if method in self.defined_methods:raise ValueError('Duplicate method definition: '+method)
                    self.defined_methods[method]={'dex':name,'flags':access,'code_offset':code_off,'kind':kind}
    def u32(self,off):return struct.unpack_from('<I',self.data,off)[0]
    def pair(self,off):return struct.unpack_from('<II',self.data,off)
    def uleb(self,off):
        value=0
        for shift in range(0,35,7):
            b=self.data[off];off+=1;value|=(b&127)<<shift
            if b<128:return value,off
        raise ValueError('Bad ULEB128')

def manifest_components(aapt,apk):
    dump=subprocess.run([str(aapt),'dump','xmltree',str(apk),'--file','AndroidManifest.xml'],check=True,capture_output=True,text=True).stdout
    stack=[];nodes=[];package=None
    for line in dump.splitlines():
        match=re.match(r'^(\s*)E: (\S+)',line)
        if match:
            indent=len(match.group(1))
            while stack and stack[-1]['indent']>=indent:stack.pop()
            node={'kind':match.group(2),'indent':indent,'attrs':{}}
            nodes.append(node);stack.append(node)
            continue
        match=re.match(r'^\s*A: (?:http://schemas.android.com/apk/res/android:)?([^\s(=]+)(?:\([^)]*\))?="([^"]*)"',line)
        if match and stack:stack[-1]['attrs'][match.group(1)]=match.group(2)
    for node in nodes:
        if node['kind']=='manifest':package=node['attrs']['package']
    if not package:raise ValueError('Compiled Manifest package missing')
    components=[]
    for node in nodes:
        kind,attrs=node['kind'],node['attrs']
        if kind not in ('activity','service','receiver','provider','application'):continue
        fields=['name']
        if kind=='application':fields.append('appComponentFactory')
        for field in fields:
            name=attrs.get(field)
            if not name:continue
            if name.startswith('.'):name=package+name
            elif '.' not in name:name=package+'.'+name
            components.append({'kind':kind if field=='name' else field,'name':name,'descriptor':'L'+name.replace('.','/')+';'})
    return package,components,dump

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--apk',type=Path,default=Path('deliverables/APE_REA_2K_4K_6K_OTT_TEST_20261107.apk'))
    ap.add_argument('--smali-root',type=Path,default=Path('.work/apk'))
    ap.add_argument('--aapt2',type=Path,default=Path('.work/tools/sdk/android-14/aapt2'))
    ap.add_argument('--output',type=Path,default=Path('.work/integration/evidence/final_dex_structure.json'))
    args=ap.parse_args()
    content=args.apk.read_bytes();classes=defaultdict(list);all_defs=defaultdict(list);dexes={}
    with ZipFile(args.apk) as z:
        for name in sorted(z.namelist()):
            if not re.fullmatch(r'classes(?:\d+)?\.dex',name):continue
            d=Dex(name,z.read(name));dexes[name]=d
            for desc,info in d.classes.items():classes[desc].append(info)
            for sig,info in d.defined_methods.items():all_defs[sig].append(info)
        manifest_hash=hashlib.sha256(z.read('AndroidManifest.xml')).hexdigest()
    blockers=[]
    duplicates={name:items for name,items in classes.items() if len(items)>1}
    if duplicates:blockers.append({'reason':'duplicate_class_definitions','details':duplicates})
    if 'classes9.dex' not in dexes:blockers.append({'reason':'classes9_missing'})
    new_defs=dexes['classes9.dex'].defined_methods if 'classes9.dex' in dexes else {}
    reference_dexes=defaultdict(list)
    for name,d in dexes.items():
        if name!='classes9.dex':
            for sig in d.methods:
                if sig.startswith('Lcom/ape/rea/'):reference_dexes[sig].append(name)
    callsites=defaultdict(list)
    # rg finds only the relevant originals; do not traverse/decompile thousands of classes.
    smali_dirs=sorted(str(p) for p in args.smali_root.glob('smali*') if p.is_dir() and p.name!='smali_classes9')
    found=subprocess.run(['rg','-l','Lcom/ape/rea/','--glob','*.smali',*smali_dirs],check=False,capture_output=True,text=True)
    if found.returncode not in (0,1):raise RuntimeError(found.stderr)
    for path in found.stdout.splitlines():
        for lineno,line in enumerate(Path(path).read_text().splitlines(),1):
            match=re.search(r'\b(invoke-\S+)\s+\{[^}]*\},\s+(Lcom/ape/rea/[^\s]+)',line)
            if match:callsites[match.group(2)].append({'file':path,'line':lineno,'opcode':match.group(1)})
    injected=[]
    for sig,sites in sorted(callsites.items()):
        definition=new_defs.get(sig);errors=[]
        if not definition:errors.append('exact_method_not_defined_in_classes9')
        else:
            if not definition['flags']&1:errors.append('method_not_public')
            owner=sig.split('->')[0]
            ci=dexes['classes9.dex'].classes.get(owner)
            if ci is None or not ci['flags']&1:errors.append('class_not_public')
            static=bool(definition['flags']&8)
            if any(s['opcode'].startswith('invoke-static') != static for s in sites):errors.append('static_instance_mismatch')
            if not definition['code_offset']:errors.append('implementation_has_no_code')
        if sig not in reference_dexes:errors.append('injected_reference_missing_from_final_original_dex')
        entry={'method':sig,'callsites':sites,'definition':definition,'referencing_dexes':reference_dexes.get(sig,[]),'passed':not errors}
        if errors:entry['errors']=errors;blockers.append({'reason':'injected_method_resolution','details':entry})
        injected.append(entry)
    # Every REA reference retained by the original DEXes must have the same concrete definition.
    unexpected=[]
    for sig,names in sorted(reference_dexes.items()):
        if sig not in new_defs:unexpected.append({'method':sig,'referencing_dexes':names})
    if unexpected:blockers.append({'reason':'original_dex_rea_reference_unresolved','details':unexpected})
    package,components,dump=manifest_components(args.aapt2,args.apk)
    for component in components:
        ci=classes.get(component['descriptor'],[])
        component['dexes']=[c['dex'] for c in ci]
        errors=[]
        if len(ci)!=1:errors.append('component_class_missing_or_duplicated')
        elif not ci[0]['flags']&1 or ci[0]['flags']&0x600:errors.append('component_class_not_concrete_public')
        constructor=component['descriptor']+'-><init>()V'
        ctor=all_defs.get(constructor,[])
        if len(ctor)!=1 or not ctor[0]['flags']&1 or not ctor[0]['code_offset']:errors.append('public_noarg_constructor_missing')
        component['public_noarg_constructor']=not any('constructor' in e for e in errors)
        component['passed']=not errors
        if errors:component['errors']=errors;blockers.append({'reason':'manifest_component_resolution','details':component})
    report={
        'passed':not blockers,
        'apk':str(args.apk.resolve()),'apk_sha256':hashlib.sha256(content).hexdigest(),'apk_bytes':len(content),
        'scope':'DEX ID/class-data/header tables, injected smali descriptor matching and final compiled Manifest component declarations; no decompilation or Android runtime execution.',
        'dex_count':len(dexes),'unique_class_definitions':len(classes),
        'dex_summary':[{'file':name,'version':d.version,'bytes':len(d.data),'classes':len(d.classes),'defined_methods':len(d.defined_methods),'method_ids':len(d.methods),'checksum_and_sha1_valid':True} for name,d in dexes.items()],
        'duplicate_classes':duplicates,
        'injected_method_count':len(injected),'injected_callsite_count':sum(len(x) for x in callsites.values()),'injected_methods':injected,
        'final_original_dex_rea_reference_count':len(reference_dexes),'unresolved_rea_references':unexpected,
        'manifest_package':package,'manifest_sha256':manifest_hash,'manifest_component_count':len(components),'manifest_components':components,
        'blockers':blockers
    }
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(json.dumps(report,indent=2,ensure_ascii=True)+'\n')
    (args.output.parent/'final_manifest_aapt2.txt').write_text(dump)
    print(json.dumps({k:report[k] for k in ('passed','apk_sha256','dex_count','unique_class_definitions','injected_method_count','injected_callsite_count','final_original_dex_rea_reference_count','manifest_component_count','blockers')},indent=2))
    raise SystemExit(0 if report['passed'] else 1)
if __name__=='__main__':main()
