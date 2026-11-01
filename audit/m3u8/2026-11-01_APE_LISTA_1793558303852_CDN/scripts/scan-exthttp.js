'use strict';
const fs=require('fs'),readline=require('readline');
const BANNED=['Connection','Keep-Alive','Proxy-Connection','Range','If-None-Match','If-Modified-Since','TE','Priority','Upgrade-Insecure-Requests','X-Forwarded-For','X-Real-IP','Host','Cookie','Authorization'];
const c={channels:0,invalid:0,withBanned:0,banned:{},headerCounts:{},over7800:0,over8192:0,maxBytes:0};
const rl=readline.createInterface({input:fs.createReadStream(process.argv[2]),crlfDelay:Infinity});
rl.on('line',l=>{
 if(l.startsWith('#EXTHTTP:')){
  c.channels++;
  const p=l.slice(9);
  c.maxBytes=Math.max(c.maxBytes,p.length);
  if(p.length>7800)c.over7800++;
  if(p.length>8192)c.over8192++;
  try{
   const o=JSON.parse(p); const ks=Object.keys(o); c.headerCounts[ks.length]=(c.headerCounts[ks.length]||0)+1;
   let bad=false;
   for(const b of BANNED){ if(Object.prototype.hasOwnProperty.call(o,b)){ c.banned[b]=(c.banned[b]||0)+1; bad=true; } }
   if(bad)c.withBanned++;
  }catch(e){c.invalid++;}
 }
});
rl.on('close',()=>{console.log(JSON.stringify(c,null,2));});
