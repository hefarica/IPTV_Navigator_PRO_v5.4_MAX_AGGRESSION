const http=require('http'), fs=require('fs'), path=require('path'), crypto=require('crypto'), {spawn}=require('child_process');
const ROOT='C:/Users/HFRC/Desktop/IPTV_FASE2_STAGING/IPTV_v5.4_MAX_AGGRESSION/frontend';
const LAB='C:/Users/HFRC/AppData/Local/DSH_HERRAMIENTAS/DSH_BLUEGREEN_021/home/attachments/v1/files/8c/8c11e78148b64a3aa50fb08e5112e32182f77ef6002037a2a4072b9809284eab/APE_FUSION_PREMIUM_6K_4K_ZAPPING_ATOMICO (1).json';
const M3U='C:/Users/HFRC/APE_PRIVADO/entrada_3ch.m3u8';
const OUT='C:/Users/HFRC/APE_PRIVADO';
const srv=http.createServer((req,res)=>{
  const u=decodeURIComponent(req.url.split('?')[0].split('#')[0]);
  if (req.method==='POST' && u==='/guardar') {
    let body=''; req.on('data',c=>body+=c); req.on('end',()=>{
      const pid=String(req.headers['x-perfil']||'X').replace(/[^A-Za-z0-9.]/g,'');
      const f=path.join(OUT,'salida_'+pid+'.m3u8');
      fs.writeFileSync(f, body, 'utf8');
      const sha=crypto.createHash('sha256').update(body).digest('hex').slice(0,16);
      res.writeHead(200,{'Content-Type':'application/json'});
      res.end(JSON.stringify({perfil:pid, bytes:Buffer.byteLength(body), sha:sha, ruta:f}));
    }); return;
  }
  if (u==='/salida.m3u8') { const p=(new URL(req.url,'http://x')).searchParams.get('p')||'X';
    const f=path.join(OUT,'salida_'+p.replace(/[^A-Za-z0-9.]/g,'')+'.m3u8');
    fs.readFile(f,(e,b)=>{ if(e){res.writeHead(404);res.end('nf');return;} res.writeHead(200,{'Content-Type':'audio/x-mpegurl'}); res.end(b); }); return; }
  const f = u==='/lab.json'?LAB : u==='/entrada.m3u8'?M3U : path.join(ROOT,u);
  fs.readFile(f,(e,b)=>{ if(e){res.writeHead(404);res.end('nf');return;} const ext=path.extname(f);
    res.writeHead(200,{'Content-Type': ext==='.js'?'application/javascript':ext==='.json'?'application/json':ext==='.m3u8'?'audio/x-mpegurl':ext==='.css'?'text/css':'text/html; charset=utf-8'}); res.end(b); });
});
srv.listen(0,'127.0.0.1',()=>{
  const url='http://127.0.0.1:'+srv.address().port+'/index-v4.html#ape-e2e';
  let buf='';
  const cp=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',
    ['--headless=old','--disable-gpu','--no-sandbox','--no-first-run','--user-data-dir='+process.env.TEMP+'/chrome-f6',
     '--virtual-time-budget=600000','--dump-dom',url],{stdio:['ignore','pipe','pipe']});
  cp.stdout.on('data',d=>{buf+=d;});
  const fin=()=>{ const i=buf.indexOf('E2E:'), j=buf.indexOf('</pre>', i);
    console.log(i>=0&&j>i ? 'E2E='+buf.slice(i+4,j) : 'SIN_MARCADOR bytes='+buf.length);
    try{cp.kill('SIGKILL');}catch(e){} srv.close(); process.exit(0); };
  setTimeout(fin,420000); cp.on('close',fin);
});
