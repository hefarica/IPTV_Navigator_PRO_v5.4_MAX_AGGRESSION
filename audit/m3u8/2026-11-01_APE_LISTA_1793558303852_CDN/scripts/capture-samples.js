'use strict';
const fs=require('fs'),readline=require('readline');
const out={ultra:null, p1:null, uhdCount:0, p1Count:0};
let cur=null, url=null, profile=null, group=null;
const rl=readline.createInterface({input:fs.createReadStream(process.argv[2]),crlfDelay:Infinity});
rl.on('line',l=>{
 if(l.startsWith('#EXTINF')){
   if(cur){ finish(); }
   cur=l; url=null; profile=null;
   const g=l.match(/group-title="([^"]*)"/); group=g?g[1]:'';
   return;
 }
 if(!cur) return;
 if(l.startsWith('#EXTHTTP:')){ const m=l.match(/"X-APE-Profile":"([^"]+)"/); if(m) profile=m[1]; return; }
 if(l[0]!=='#' && l.startsWith('http')){ url=l; }
});
function finish(){
 if(!cur) return;
 if(group && /ULTRA HD|UHD|4K/i.test(group)){ out.uhdCount++; if(!out.ultra && url) out.ultra={group,url,name:cur.slice(cur.lastIndexOf(',')+1).trim()}; }
 if(profile==='P1'){ out.p1Count++; if(!out.p1 && url) out.p1={profile,url,name:cur.slice(cur.lastIndexOf(',')+1).trim()}; }
}
rl.on('close',()=>{ finish(); console.log(JSON.stringify(out,null,2)); });
