const fs=require('fs'), path=require('path'), crypto=require('crypto');
const C = require('C:/Users/HFRC/Desktop/IPTV_FASE2_STAGING/IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-4k6k-consumer.js');
const dir='C:/Users/HFRC/APE_PRIVADO/fase8';
const fs2=fs.readdirSync(dir).filter(f=>/^salida_.+__\d+\.m3u8$/.test(f)).sort();
console.log('archivos='+fs2.length);
let ok=0, ko=0;
for (const f of fs2) {
  const p=path.join(dir,f), buf=fs.readFileSync(p);
  const r=C.leer(buf.toString('utf8'));
  const sha=crypto.createHash('sha256').update(buf).digest('hex').slice(0,16);
  const primero=r.planes[0]||{};
  const estado=(r.metadata_valid && r.sidecars===3 && r.processing_executed===false) ? 'PASS' : 'FAIL';
  if (estado==='PASS') ok++; else ko++;
  console.log([f.slice(7,12), sha, r.sidecars, r.metadata_valid, r.errores.length, primero.profile||'-', primero.selectedProfile||'-', primero.target||'-', primero.procesamiento||'-', estado].join(' | '));
}
console.log('\nRESUMEN PASS='+ok+' FAIL='+ko);
process.exit(ko===0&&ok>0?0:1);
