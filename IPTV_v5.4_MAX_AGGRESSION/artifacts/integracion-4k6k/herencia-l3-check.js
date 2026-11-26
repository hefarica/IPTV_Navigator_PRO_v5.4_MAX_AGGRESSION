const fs=require('fs');
const N=require('C:/Users/HFRC/Desktop/IPTV_FASE2_STAGING/IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-lab-normalize.js');
const LAB='C:/Users/HFRC/AppData/Local/DSH_HERRAMIENTAS/DSH_BLUEGREEN_021/home/attachments/v1/files/8c/8c11e78148b64a3aa50fb08e5112e32182f77ef6002037a2a4072b9809284eab/APE_FUSION_PREMIUM_6K_4K_ZAPPING_ATOMICO (1).json';
const lab=N.normalize(JSON.parse(fs.readFileSync(LAB,'utf8').replace(/^\uFEFF/,''))).data.profiles_calibrated;
let ok=0,ko=0;
for (const pid of ['P0','P1','P2','P3','P4','P5','P0.5','P1.5','P2.5','P3.5','P4.5','P5.5']) {
  const p=lab[pid]||{};
  const vl=p.vlcopt&&p.vlcopt['network-caching'];
  const l3=(((p.player_enslavement||{}).level_3_per_channel||{}).EXTVLCOPT||{})['network-caching'];
  const emitido = (pid.indexOf('.5')>0) ? '55000' : null;
  const match = String(l3) === (pid.indexOf('.5')>0 ? '55000' : String(l3));
  if (pid.indexOf('.5')>0) { if(match) ok++; else ko++; }
  console.log([pid.padEnd(5), 'vlcopt='+String(vl).padEnd(6), 'L3_EXTVLCOPT='+String(l3).padEnd(6), 'emitido='+String(emitido||'(ver P0-P5: 19000/12000/10000/8000/10000/5000)')].join(' | '));
}
console.log('\nPREMIVM_L3_vs_55000 PASS='+ok+' FAIL='+ko);
