const fs=require('fs');
const vm=require('vm');

const sandbox={};
sandbox.window=sandbox; sandbox.globalThis=sandbox; sandbox.self=sandbox;
sandbox.console=console;
Object.assign(sandbox,{URL,URLSearchParams,TextEncoder,TextDecoder,ReadableStream,WritableStream,TransformStream,Headers,Request,Response,AbortController,Blob,FormData});
sandbox.fetch=async()=>({ok:false,status:0,text:async()=>'',json:async()=>({}),headers:{get:()=>null}});
sandbox.btoa=s=>Buffer.from(String(s),'binary').toString('base64');
sandbox.atob=s=>Buffer.from(String(s),'base64').toString('binary');
sandbox.document={createElement:()=>({style:{},setAttribute(){},appendChild(){},click(){}}),head:{appendChild(){}},body:{appendChild(){}},querySelector:()=>null,addEventListener(){},documentElement:{style:{}}};
sandbox.navigator={userAgent:'Mozilla/5.0 (Linux; Android 14) VLC/3.0.21',platform:'Linux',hardwareConcurrency:4};
sandbox.localStorage={_d:{},getItem(k){return this._d[k]??null},setItem(k,v){this._d[k]=String(v)},removeItem(k){delete this._d[k]},clear(){this._d={}},key(){return null},get length(){return Object.keys(this._d).length}};
sandbox.sessionStorage=sandbox.localStorage;
sandbox.location={href:'https://iptv-ape.duckdns.org/',origin:'https://iptv-ape.duckdns.org',protocol:'https:',host:'iptv-ape.duckdns.org'};
Object.assign(sandbox,{setTimeout,clearTimeout,setInterval,clearInterval,queueMicrotask});
sandbox.crypto={getRandomValues:a=>{for(let i=0;i<a.length;i++)a[i]=Math.floor(Math.random()*256);return a;}};
sandbox.performance={now:()=>Date.now()};
sandbox.matchMedia=()=>({matches:false,addListener(){},removeListener(){}});
sandbox.APE_STRICT_URI=false;
vm.createContext(sandbox);

vm.runInContext(fs.readFileSync('scratch/prod2_bundle.js','utf8'), sandbox, {filename:'prod-bundle.js'});
vm.runInContext(fs.readFileSync('scratch/prod2_gen.js','utf8'), sandbox, {filename:'prod-gen.js'});

(async()=>{
  const srv=[{id:1,name:'srv',url:'line.tivi-ott.net',port:'25461',protocol:'http',username:'USER',password:'PASS',active:true}];
  const canal={name:'|DE| BUNDESLIGA REPLAY 2 HD',url:'http://line.tivi-ott.net/live/USER/PASS/569289.m3u8',
    group:'DE',tvgId:'569289',tvgName:'BUNDESLIGA',_servers:srv,server:srv[0]};

  let out=sandbox.APE_GEN([canal],{profile:'P3',width:1920,height:1080,fps:60,hdr:'SDR',
    _activeServers:srv,servers:srv,server:srv[0],user:'USER',pass:'PASS'});

  let texto='';
  if(out && typeof out.getReader==='function'){
    const rd=out.getReader(); const dec=new TextDecoder(); let fin=false;
    while(!fin){ const r=await rd.read(); if(r.done){ fin=true; break; } texto+=dec.decode(r.value,{stream:true}); }
    texto+=dec.decode();
  } else if(out && typeof out[Symbol.asyncIterator]==='function'){
    const dec=new TextDecoder();
    for await(const c of out){ texto += typeof c==='string'?c:dec.decode(c,{stream:true}); }
  } else { texto=String(out||''); }

  const L=texto.split('\n');
  console.log('  lineas generadas: '+L.length);
  const si=L.findIndex(l=>l.startsWith('#EXT-X-STREAM-INF'));
  console.log('  STREAM-INF: '+(si>=0?'L'+(si+1):'(no)'));
  if(si>=0){
    let j=si+1, entre=0;
    while(j<L.length && L[j].trim()!=='' && !/^https?:\/\//.test(L[j])){ entre++; j++; }
    console.log('  RESOLUTION: '+((L[si].match(/RESOLUTION=([^,]*)/)||[])[1]));
    console.log('  CODECS: '+((L[si].match(/CODECS="([^,]*)/)||[])[1]));
    console.log('  entre STREAM-INF y URI: '+entre+(entre===0?'  OK':'  ROTO'));
  }
  const T40=['#EXT-X-APE-URL2-CARTRIDGE','#EXT-X-APE-URL2-DEVICE','#EXT-X-APE-STREAM-TRUTH','#EXT-X-APE-UPSCALE',
  '#EXT-X-APE-QUALITY','#EXT-X-APE-QUALITY-RANGE','#EXT-X-APE-CODEC-FALLBACK-CHAIN','#EXT-X-APE-AI-SR-ENABLED',
  '#EXT-X-APE-AI-SR-SCALE','#EXT-X-APE-AI-DENOISING','#EXT-X-APE-AI-SHARPENING','#EXT-X-APE-AI-FRAME-INTERPOLATION',
  '#EXT-X-APE-AI-HDR-UPCONVERT','#EXT-X-APE-CRYSTAL-6K','#EXT-X-APE-CRYSTAL-6K-MODE','#EXT-X-APE-CRYSTAL-6K-BITRATE',
  '#EXT-X-APE-CRYSTAL-6K-TRUTH','#EXT-X-APE-NR-MODE','#EXT-X-APE-SUPER-RES-MODEL','#EXT-X-APE-ANTI-NOISE-ENGINE',
  '#EXT-X-APE-ANTI-NOISE-RESOLUTION','#EXT-X-APE-ANTI-NOISE-FILTERS','#EXT-X-APE-ANTI-NOISE-FILTER-CHAIN',
  '#EXT-X-APE-ANTI-NOISE-NLMEANS','#EXT-X-APE-ANTI-NOISE-HQDN3D','#EXT-X-APE-ANTI-NOISE-AFFTDN',
  '#EXT-X-APE-ANTI-NOISE-PRESERVE','#EXT-X-APE-HDR-PEAK-NIT-ENGINE','#EXT-X-APE-HDR-MASTERING-DISPLAY',
  '#EXT-X-APE-HDR-PQ-EOTF','#EXT-X-APE-HDR-DISPLAY','#EXT-X-APE-HDR-GPU-TONEMAP','#EXT-X-APE-HDR-FILM-GRAIN',
  '#EXT-X-APE-LCEVC-STANDARD','#EXT-X-APE-LCEVC-PLAYER-REQUIRED','#EXT-X-APE-LCEVC-ENHANCEMENT',
  '#EXT-X-APE-CORTEX-AI-SUPER-RESOLUTION','#EXT-X-APE-CORTEX-AI-SPATIAL-DENOISE','#EXT-X-APE-CORTEX-LCEVC',
  '#EXT-X-APE-CORTEX-TEMPORAL-ARTIFACT-REPAIR','#EXT-X-APE-CRYSTAL-ENHANCEMENT','#EXT-X-APE-REALCE-SOURCE'];
  let ok=0, falta=[];
  for(const x of T40){ if(L.some(l=>l.startsWith(x+':'))) ok++; else falta.push(x); }
  console.log('');
  console.log('  === LOS 40 TIPOS EN LA LISTA REAL DE PRODUCCION ===');
  console.log('  presentes: '+ok+'/'+T40.length);
  if(falta.length) falta.forEach(x=>console.log('    FALTA '+x)); else console.log('  ==> TODOS');
  console.log('');
  console.log('  EXTINF: '+(L.some(l=>l.startsWith('#EXTINF'))?'SI':'NO'));
  const vf=L.find(l=>l.includes('video-filter='));
  console.log('  video-filter: '+(vf?vf.slice(vf.indexOf('video-filter='),vf.indexOf('video-filter=')+110):'(no)'));
})();
