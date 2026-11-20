const http=require('http'), fs=require('fs'), path=require('path'), {spawn}=require('child_process');
const ROOT='C:/Users/HFRC/Desktop/IPTV_FASE2_STAGING/IPTV_v5.4_MAX_AGGRESSION/frontend';
const LAB='C:/Users/HFRC/AppData/Local/DSH_HERRAMIENTAS/DSH_BLUEGREEN_021/home/attachments/v1/files/8c/8c11e78148b64a3aa50fb08e5112e32182f77ef6002037a2a4072b9809284eab/APE_FUSION_PREMIUM_6K_4K_ZAPPING_ATOMICO (1).json';
const srv=http.createServer((req,res)=>{
  const u=decodeURIComponent(req.url.split('?')[0]);
  if (u==='/lab.json') { fs.readFile(LAB,(e,b)=>{ if(e){res.writeHead(404);res.end('nf');return;} res.writeHead(200,{'Content-Type':'application/json'}); res.end(b); }); return; }
  const p=path.join(ROOT,u);
  fs.readFile(p,(e,b)=>{ if(e){res.writeHead(404);res.end('nf');return;} const ext=path.extname(p);
    res.writeHead(200,{'Content-Type': ext==='.js'?'application/javascript':ext==='.json'?'application/json':'text/html; charset=utf-8'}); res.end(b); });
});
srv.listen(0,'127.0.0.1',()=>{
  const url='http://127.0.0.1:'+srv.address().port+'/_fase3_12perfiles.html';
  let buf=''; const cp=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',
    ['--headless=old','--disable-gpu','--no-sandbox','--no-first-run','--user-data-dir='+process.env.TEMP+'/chrome-f3b',
     '--virtual-time-budget=8000','--dump-dom',url],{stdio:['ignore','pipe','pipe']});
  cp.stdout.on('data',d=>{buf+=d;});
  const fin=()=>{
    const i=buf.indexOf('RESULT:'), j=buf.indexOf('</pre>', i);
    if (i>=0 && j>i) {
      const txt = buf.slice(i+7,j);
      let r=null; try { r=JSON.parse(txt); } catch(e) { console.log('JSON_INCOMPLETO len='+txt.length); }
      if (r) {
        console.log('loaded='+r.loaded+' family='+r.family+' ids='+r.ids.length+' error='+(r.error||'none'));
        for (const f of r.filas) console.log([f.id,f.objetivo,f.premium,f.preserved,f.tag,f.offIdent].join(' | '));
      }
    } else { console.log('SIN_RESULTADO bytes='+buf.length); }
    try{cp.kill('SIGKILL');}catch(e){} srv.close(); process.exit(0);
  };
  setTimeout(fin,30000); cp.on('close',fin);
});
