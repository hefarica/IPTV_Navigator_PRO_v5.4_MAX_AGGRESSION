const http=require('http'),fs=require('fs'),path=require('path');
const root=process.argv[2],port=Number(process.argv[3]);
http.createServer((req,res)=>{
  const p=path.join(root, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(p,(e,b)=>{ if(e){res.writeHead(404);res.end('nf');return;} res.writeHead(200,{'Content-Type':p.endsWith('.js')?'application/javascript':'text/html; charset=utf-8'}); res.end(b); });
}).listen(port,'127.0.0.1',()=>console.log('LISTENING '+port));
