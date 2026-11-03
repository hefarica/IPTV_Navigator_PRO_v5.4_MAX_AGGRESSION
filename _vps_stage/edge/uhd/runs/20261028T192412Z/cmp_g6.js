const fs=require('fs');
const pre=JSON.parse(fs.readFileSync('_vps_stage/edge/uhd/cases/20261028T093327Z.json','utf8'));
const post=JSON.parse(fs.readFileSync('_vps_stage/edge/uhd/cases/20261028T192457Z.json','utf8'));
const crypto=require('crypto');
const sha=s=>crypto.createHash('sha256').update(s,'utf8').digest('hex');
const strip=b=>b.split('\n').filter(l=>!l.startsWith('#EXT-X-APE-UPSCALE:')).join('\n');
console.log('=== G6 · camino 4K: ¿byte-idéntico salvo el marcador nuevo? ===');
for(const p of post.pairs){
  const q=pre.pairs.find(x=>x.id===p.id);
  if(!q){console.log(`  [${p.id}] sin PRE`);continue;}
  const idRaw=p.served_sha256===q.served_sha256;
  const postStripped=sha(strip(p.served_body));
  const idStripped=postStripped===q.served_sha256;
  const codecs=[...new Set((p.source_body.match(/CODECS="[^"]+"/g)||[]))];
  const res=[...new Set((p.source_body.match(/RESOLUTION=\d+x\d+/g)||[]))];
  console.log(`  [${p.id}]`);
  console.log(`     fuente: ${codecs.join(' | ')}  ${res.join(' ')}`);
  console.log(`     x-ape-uhd: PRE='${(q.served_headers['x-ape-uhd']??'')}' POST='${p.served_headers['x-ape-uhd']??''}'`);
  console.log(`     sha crudo identico=${idRaw} · sha SIN marcador identico=${idStripped}`);
  if(!idStripped){
    const a=q.served_body.split('\n'), b=strip(p.served_body).split('\n');
    const d=[]; const n=Math.max(a.length,b.length);
    for(let i=0;i<n;i++) if(a[i]!==b[i]) d.push(`L${i+1}: PRE='${(a[i]||'').slice(0,70)}' POST='${(b[i]||'').slice(0,70)}'`);
    console.log('     diferencias:');
    d.slice(0,4).forEach(x=>console.log('       '+x));
  }
}
console.log('\n=== lua_matrix: filas que cambian PRE->POST ===');
for(let i=0;i<post.lua_matrix.length;i++){
  const a=JSON.stringify(pre.lua_matrix[i]), b=JSON.stringify(post.lua_matrix[i]);
  if(a!==b){
    const k=post.lua_matrix[i];
    console.log(`  #${i} ${k.id||k.name||k.case||''} PRE=${a.slice(0,150)}`);
    console.log(`      POST=${b.slice(0,150)}`);
  }
}
