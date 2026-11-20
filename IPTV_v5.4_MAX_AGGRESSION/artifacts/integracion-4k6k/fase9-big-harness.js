const http=require('http'), fs=require('fs'), path=require('path'), crypto=require('crypto'), {spawn}=require('child_process');
const ROOT='C:/Users/HFRC/Desktop/IPTV_FASE2_STAGING/IPTV_v5.4_MAX_AGGRESSION/frontend';
const BIG='C:/Users/HFRC/AppData/Local/DSH_HERRAMIENTAS/DSH_BLUEGREEN_021/home/attachments/v1/files/00/001713fcf1f91f4c4cc40f8cfb4539228dd976ec532c5cb3e6069c3e8c6844f4/APE_4K_PREMIUM_6K_METADATA.m3u8';
const TOKEN=crypto.randomBytes(16).toString('hex');
const srv=http.createServer((req,res)=>{
  const u=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
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
srv.listen(0,'127.0.0.1',()=>{
  const port=srv.address().port;
  const url='http://127.0.0.1:'+port+'/_fase9_big.html#t='+TOKEN;
  let buf='';
  const cp=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',
    ['--headless=old','--disable-gpu','--no-sandbox','--no-first-run','--js-flags=--expose-gc',
     '--user-data-dir='+process.env.TEMP+'/chrome-f9-'+Date.now(),'--virtual-time-budget=600000','--dump-dom',url],
    {stdio:['ignore','pipe','pipe']});
  cp.stdout.on('data',d=>{buf+=d;});
  const fin=()=>{ const i=buf.indexOf('BIG:'), j=buf.indexOf('</pre>',i);
    if(i>=0&&j>i){ console.log('BIG='+buf.slice(i+4,j)); process.exitCode=0; } else { console.log('SIN_MARCADOR bytes='+buf.length); process.exitCode=1; }
    try{cp.kill('SIGKILL');}catch(e){} srv.close(); };
  setTimeout(fin,600000); cp.on('close',fin);
});
