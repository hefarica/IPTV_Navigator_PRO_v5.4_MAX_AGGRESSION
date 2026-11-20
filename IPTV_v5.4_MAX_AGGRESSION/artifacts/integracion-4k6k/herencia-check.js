const fs=require('fs'), path=require('path');
const N=require('C:/Users/HFRC/Desktop/IPTV_FASE2_STAGING/IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-lab-normalize.js');
const LAB='C:/Users/HFRC/AppData/Local/DSH_HERRAMIENTAS/DSH_BLUEGREEN_021/home/attachments/v1/files/8c/8c11e78148b64a3aa50fb08e5112e32182f77ef6002037a2a4072b9809284eab/APE_FUSION_PREMIUM_6K_4K_ZAPPING_ATOMICO (1).json';
const lab=N.normalize(JSON.parse(fs.readFileSync(LAB,'utf8').replace(/^\uFEFF/,''))).data.profiles_calibrated;
const dir='C:/Users/HFRC/APE_PRIVADO/fase8';
const ex=fs.readdirSync(dir).filter(f=>/^salida_P[0-9]__\d+\.m3u8$/.test(f)).sort().pop();
const txt=fs.readFileSync(path.join(dir,ex),'utf8');
console.log('export='+ex);
console.log('perfil | LAB network-caching | emitido LAB_VLCOPT | match');
let ok=0,ko=0;
for (const pid of ['P0','P1','P2','P3','P4','P5']) {
  const labVal = lab[pid] && lab[pid].vlcopt && lab[pid].vlcopt['network-caching'];
  const m = txt.match(new RegExp('#EXT-X-APE-CACHING-PRECEDENCE:PROFILE=' + pid + ';EMITTED=unknown;LAB_VLCOPT=(\\d+)'));
  const emit = m ? m[1] : 'no-emitido';
  const match = (labVal !== undefined && String(labVal) === String(emit));
  if (match) ok++; else ko++;
  console.log([pid, String(labVal), String(emit), match ? 'PASS' : 'FAIL'].join(' | '));
}
console.log('\nHERENCIA_VLCOPT PASS='+ok+' FAIL='+ko);
process.exit(ko===0&&ok===6?0:1);
