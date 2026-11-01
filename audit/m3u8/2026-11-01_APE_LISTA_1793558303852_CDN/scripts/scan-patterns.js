'use strict';
const fs=require('fs'), readline=require('readline');
const F=process.argv[2];
const pats=['X-HDR-MAX-FALL=','#EXT-X-PART:','#EXT-X-PRELOAD-HINT:','#EXT-X-KEY:','#EXT-X-MEDIA:','#EXT-X-DEFINE:','vrr_sync','inputstream.adaptive.audio_passthrough','#EXT-X-APE-HDR-METADATA:MDCV=true,CLLI=true','X-HDR-MAX-CLL=','#EXT-X-CONTENT-STEERING','#EXT-X-I-FRAME-STREAM-INF','#EXT-X-STREAM-INF','#EXT-X-SESSION-DATA','drm_widevine','TELEMETRY-TVQM','TELCHEMY'];
const c={};pats.forEach(p=>c[p]=0);
const rl=readline.createInterface({input:fs.createReadStream(F),crlfDelay:Infinity});
rl.on('line',l=>{for(const p of pats){if(l.indexOf(p)!==-1)c[p]++;}});
rl.on('close',()=>{console.log(JSON.stringify(c,null,2));});
