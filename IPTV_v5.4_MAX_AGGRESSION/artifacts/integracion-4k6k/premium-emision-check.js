const fs=require('fs'), path=require('path');
const N=require('C:/Users/HFRC/Desktop/IPTV_FASE2_STAGING/IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-lab-normalize.js');
const LAB='C:/Users/HFRC/AppData/Local/DSH_HERRAMIENTAS/DSH_BLUEGREEN_021/home/attachments/v1/files/8c/8c11e78148b64a3aa50fb08e5112e32182f77ef6002037a2a4072b9809284eab/APE_FUSION_PREMIUM_6K_4K_ZAPPING_ATOMICO (1).json';
const lab=N.normalize(JSON.parse(fs.readFileSync(LAB,'utf8').replace(/^\uFEFF/,''))).data.profiles_calibrated;
const dir='C:/Users/HFRC/APE_PRIVADO/fase8';
let ok=0,ko=0;
for (const pid of ['P0.5','P1.5','P2.5','P3.5','P4.5','P5.5']) {
  const f=fs.readdirSync(dir).filter(x=>x.indexOf('salida_'+pid+'__')===0).sort().pop();
  const txt=fs.readFileSync(path.join(dir,f),'utf8');
  const val=(txt.match(/#EXTVLCOPT:network-caching=(\d+)/)||[])[1];
  const esp=String((((lab[pid].player_enslavement||{}).level_3_per_channel||{}).EXTVLCOPT||{})['network-caching']);
  const m=val===esp; if(m)ok++; else ko++;
  console.log([pid.padEnd(5),'esperado='+esp.padEnd(7),'emitido='+String(val).padEnd(7),f.slice(7,24),m?'PASS':'FAIL'].join(' | '));
}
console.log('\nPREMIUM_EMISION PASS='+ok+' FAIL='+ko);
process.exit(ko===0?0:1);
