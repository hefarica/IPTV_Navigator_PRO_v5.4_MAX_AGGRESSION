const fs=require('fs'), path=require('path');
const N=require('C:/Users/HFRC/Desktop/IPTV_FASE2_STAGING/IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-lab-normalize.js');
const LAB='C:/Users/HFRC/AppData/Local/DSH_HERRAMIENTAS/DSH_BLUEGREEN_021/home/attachments/v1/files/8c/8c11e78148b64a3aa50fb08e5112e32182f77ef6002037a2a4072b9809284eab/APE_FUSION_PREMIUM_6K_4K_ZAPPING_ATOMICO (1).json';
const lab=N.normalize(JSON.parse(fs.readFileSync(LAB,'utf8').replace(/^\uFEFF/,''))).data.profiles_calibrated;
const dir='C:/Users/HFRC/APE_PRIVADO/fase8';
const M={'HDR10PLUS':'HDR10_PLUS','HDR10':'HDR10','DOLBY_VISION':'DOLBY_VISION','DOLBY_VISION_P8':'DOLBY_VISION','HLG':'HLG','SDR':'SDR'};
let ok=0,ko=0;
for (const pid of ['P0','P1','P2','P3','P4','P5','P0.5','P1.5','P2.5','P3.5','P4.5','P5.5']) {
  const f=fs.readdirSync(dir).filter(x=>x.indexOf('salida_'+pid+'__')===0).sort().pop();
  if(!f){ console.log(pid+' sin archivo'); ko++; continue; }
  const t=fs.readFileSync(path.join(dir,f),'utf8');
  const g=k=>((t.match(new RegExp('#EXTVLCOPT:'+k+'=([^\\r\\n]+)'))||[])[1]||'').trim();
  const vo=(lab[pid]||{}).vlcopt||{};
  const espHdr=M[String(vo['video-hdr-mode']||'SDR').toUpperCase()]||'SDR';
  const espAc=String(vo['audio-channels']||'2');
  const hdrOk=g('video-hdr-mode')===espHdr, acOk=g('audio-channels')===espAc;
  const hdrFlag=g('video-hdr')===(espHdr==='SDR'?'false':'true');
  const m=hdrOk&&acOk&&hdrFlag; if(m)ok++; else ko++;
  console.log([pid.padEnd(5),'hdr='+g('video-hdr').padEnd(5),'mode='+g('video-hdr-mode').padEnd(12),'esp='+espHdr.padEnd(12),'ac='+g('audio-channels').padEnd(2),'espAc='+espAc.padEnd(2),m?'PASS':'FAIL'].join(' | '));
}
console.log('\nGUARDA_HDR_AUDIO PASS='+ok+' FAIL='+ko);
process.exit(ko===0&&ok===12?0:1);
