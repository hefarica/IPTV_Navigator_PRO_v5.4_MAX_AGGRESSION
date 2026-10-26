import fs from 'node:fs';
import { StringDecoder } from 'node:string_decoder';
const file = process.argv[2];
const hosts = {};
const fd = fs.openSync(file, 'r');
const CHUNK = 8*1024*1024, buf = Buffer.alloc(CHUNK), dec = new StringDecoder('utf8');
let depth=0,inStr=false,esc=false,keyBuf='',stage='seek',recBuf='',recDepth=0;
function finish(){ let rec; try{rec=JSON.parse(recBuf);}catch{recBuf='';return;} 
  for (const f of ['origin','referer']) { const v=rec[f]; if (typeof v==='string' && v) { const h=v.replace(/^[a-z]+:\/\//i,'').split(/[/:]/)[0].toLowerCase(); hosts[f+'::'+h]=(hosts[f+'::'+h]||0)+1; } }
  recBuf=''; }
function feed(s){ for(let i=0;i<s.length;i++){ const c=s[i];
 if(inStr){ if(esc){esc=false; if(stage==='key')keyBuf+=c; else if(stage==='record')recBuf+=c; continue;}
  if(c==='\\'){esc=true; if(stage==='key')keyBuf+=c; else if(stage==='record')recBuf+=c; continue;}
  if(c==='"'){inStr=false; if(stage==='key'){keyBuf='';stage='afterKey';} else if(stage==='record')recBuf+=c; continue;}
  if(stage==='key')keyBuf+=c; else if(stage==='record')recBuf+=c; continue; }
 if(depth===0){ if(c==='{')depth=1; continue; }
 if(stage==='record'){ recBuf+=c; if(c==='{'||c==='[')recDepth++; else if(c==='}'){recDepth--; if(recDepth===0){finish();stage='afterRecord';depth=1;}} else if(c===']')recDepth--; continue; }
 if(c==='"'){inStr=true; if(stage==='seek'||stage==='afterRecord'){stage='key';keyBuf='';} continue;}
 if(c==='{'){ if(depth===1){depth=2;stage='record';recBuf='{';recDepth=1;} else depth++; continue;}
 if(c==='}'){depth--;continue;} if(c==='['){depth++;continue;} if(c===']'){depth--;continue;} } }
let n; while((n=fs.readSync(fd,buf,0,CHUNK))>0) feed(dec.write(buf.subarray(0,n)));
feed(dec.end()); fs.closeSync(fd);
console.log(JSON.stringify(hosts,null,2));
