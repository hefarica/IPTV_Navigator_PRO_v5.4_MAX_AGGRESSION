const fs=require('fs'), path=require('path');
const N=require('C:/Users/HFRC/Desktop/IPTV_FASE2_STAGING/IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-lab-normalize.js');
const LAB='C:/Users/HFRC/AppData/Local/DSH_HERRAMIENTAS/DSH_BLUEGREEN_021/home/attachments/v1/files/8c/8c11e78148b64a3aa50fb08e5112e32182f77ef6002037a2a4072b9809284eab/APE_FUSION_PREMIUM_6K_4K_ZAPPING_ATOMICO (1).json';
const lab=N.normalize(JSON.parse(fs.readFileSync(LAB,'utf8').replace(/^\uFEFF/,''))).data.profiles_calibrated;
const dir='C:/Users/HFRC/APE_PRIVADO/fase8';
function emitidos(pid){
  const f=fs.readdirSync(dir).filter(x=>x.indexOf('salida_'+pid+'__')===0).sort().pop();
  if(!f) return null;
  const txt=fs.readFileSync(path.join(dir,f),'utf8');
  const m={};
  (txt.match(/^#EXTVLCOPT:([A-Za-z0-9._-]+)=(.*)$/gm)||[]).forEach(l=>{
    const kv=l.slice('#EXTVLCOPT:'.length); const i=kv.indexOf('=');
    const k=kv.slice(0,i), v=kv.slice(i+1).trim();
    if(!(k in m)) m[k]=v;
  });
  return {f:f, m:m};
}
for (const pid of ['P0','P0.5']) {
  const e=emitidos(pid); if(!e){ console.log(pid+' sin archivo'); continue; }
  const l3=(((lab[pid]||{}).player_enslavement||{}).level_3_per_channel||{}).EXTVLCOPT||{};
  const vl=(lab[pid]||{}).vlcopt||{};
  console.log('=== '+pid+' ('+e.f.slice(7,26)+') ===');
  const claves=[...new Set(Object.keys(l3).concat(Object.keys(e.m)))].sort();
  let ok=0,ko=0,na=0;
  for (const k of claves) {
    const a=l3[k], b=e.m[k], c=vl[k];
    let est='NO_EN_LAB';
    if (a!==undefined) { est = (String(a)===String(b)) ? 'PASS(L3)' : (c!==undefined && String(c)===String(b) ? 'PASS(vlcopt)' : 'FAIL'); }
    else if (c!==undefined) { est = String(c)===String(b) ? 'PASS(vlcopt)' : 'FAIL'; }
    else { na++; continue; }
    if (est.indexOf('PASS')===0) ok++; else ko++;
    console.log('  '+k.padEnd(24)+' L3='+String(a).padEnd(10)+' vlcopt='+String(c).padEnd(8)+' emitido='+String(b).padEnd(10)+est);
  }
  console.log('  -> PASS='+ok+' FAIL='+ko+' sin_referencia='+na);
}
