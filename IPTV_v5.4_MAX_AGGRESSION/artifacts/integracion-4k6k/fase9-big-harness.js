const http=require('http'), fs=require('fs'), path=require('path'), crypto=require('crypto'), {spawn}=require('child_process');
const ROOT='C:/Users/HFRC/Desktop/IPTV_FASE2_STAGING/IPTV_v5.4_MAX_AGGRESSION/frontend';
const BIG='C:/Users/HFRC/AppData/Local/DSH_HERRAMIENTAS/DSH_BLUEGREEN_021/home/attachments/v1/files/00/001713fcf1f91f4c4cc40f8cfb4539228dd976ec532c5cb3e6069c3e8c6844f4/APE_4K_PREMIUM_6K_METADATA.m3u8';
const TOKEN=crypto.randomBytes(16).toString('hex');
let cerrado=false;
const srv=http.createServer((req,res)=>{
  const u=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
  if (u==='/resultado' && req.method==='POST') { let b=''; req.on('data',c=>b+=c); req.on('end',()=>{ console.log('BIG='+b); cerrado=true; res.writeHead(200); res.end('ok'); setTimeout(()=>fin(0),50); }); return; }
  if (u==='/grande.m3u8') {
    if (req.headers['x-ape-token']!==TOKEN) { res.writeHead(401); res.end('no'); return; }
    res.writeHead(200,{'Content-Type':'audio/x-mpegurl','Content-Length':fs.statSync(BIG).size});
    fs.createReadStream(BIG).pipe(res); return;
  }
  const p=path.resolve(path.join(ROOT,u));
  if(!p.startsWith(path.resolve(ROOT))) { res.writeHead(403); res.end('no'); return; }
  fs.readFile(p,(e,b)=>{ if(e){res.writeHead(404);res.end('nf');return;} const x=path.extname(p);
    res.writeHead(200,{'Content-Type':x==='.js'?'application/javascript':'text/html; charset=utf-8'}); res.end(b); });
});
let cp=null;
function fin(code){ try{cp&&cp.kill('SIGKILL');}catch(e){} try{srv.close();}catch(e){} process.exit(code); }
srv.listen(0,'127.0.0.1',()=>{
  const port=srv.address().port;
  const url='http://127.0.0.1:'+port+'/_fase9_big.html#t='+TOKEN;
  cp=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',
    ['--headless=old','--disable-gpu','--no-sandbox','--no-first-run','--js-flags=--expose-gc --max-old-space-size=4096',
     '--user-data-dir='+process.env.TEMP+'/chrome-f10-'+Date.now(), url],
    {stdio:['ignore','pipe','pipe']});
  cp.stdout.on('data',d=>{});
  setTimeout(()=>{ if(!cerrado){ console.log('TIMEOUT_SIN_RESULTADO'); fin(1); } }, 300000);
});
process.on('SIGINT',()=>fin(2));
