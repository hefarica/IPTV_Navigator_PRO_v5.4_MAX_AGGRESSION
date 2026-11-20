const fs=require('fs'), path=require('path');
const N=require('C:/Users/HFRC/Desktop/IPTV_FASE2_STAGING/IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-lab-normalize.js');
const LAB='C:/Users/HFRC/AppData/Local/DSH_HERRAMIENTAS/DSH_BLUEGREEN_021/home/attachments/v1/files/8c/8c11e78148b64a3aa50fb08e5112e32182f77ef6002037a2a4072b9809284eab/APE_FUSION_PREMIUM_6K_4K_ZAPPING_ATOMICO (1).json';
const lab=N.normalize(JSON.parse(fs.readFileSync(LAB,'utf8').replace(/^\uFEFF/,''))).data.profiles_calibrated;
const dir='C:/Users/HFRC/APE_PRIVADO/fase8';
let ok=0,ko=0;
for (const pid of ['P0','P1','P2','P3','P4','P5','P0.5','P1.5','P2.5','P3.5','P4.5','P5.5']) {
  const f=fs.readdirSync(dir).filter(x=>x.indexOf('salida_'+pid+'__')===0).sort().pop();
  if(!f){ console.log(pid+' | sin archivo | FAIL'); ko++; continue; }
  const t=fs.readFileSync(path.join(dir,f),'utf8');
  const g=k=>((t.match(new RegExp('#EXTVLCOPT:'+k+'=([^\\r\\n]+)'))||[])[1]||'').trim();
  const p=lab[pid]||{}; const vl=p.vlcopt||{};
  const l3=(((p.player_enslavement||{}).level_3_per_channel||{}).EXTVLCOPT||{});
  const w=g('video-width'), h=g('video-height'), nc=g('network-caching');
  const espW=String(vl['video-width']||w), espH=String(vl['video-height']||h), espNC=String(l3['network-caching']||nc);
  const sel=((t.match(/selectedProfile":"([^"]+)"/)||[])[1]||'');
  const m = (w===espW && h===espH && nc===espNC && sel===pid);
  if(m)ok++; else ko++;
  console.log([pid.padEnd(5), (w+'x'+h).padEnd(10), 'esp='+(espW+'x'+espH).padEnd(10), 'nc='+nc.padEnd(7), 'espNC='+espNC.padEnd(7), 'sel='+sel.padEnd(5), m?'PASS':'FAIL'].join(' | '));
}
console.log('\nMATRIZ_FINAL PASS='+ok+' FAIL='+ko);
process.exit(ko===0?0:1);
