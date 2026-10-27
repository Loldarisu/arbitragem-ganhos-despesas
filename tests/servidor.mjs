// Servidor estático mínimo, para os testes não dependerem de python nem de
// nada instalado na máquina.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const TIPOS={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
  '.mjs':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8',
  '.webmanifest':'application/manifest+json; charset=utf-8','.png':'image/png',
  '.svg':'image/svg+xml','.css':'text/css; charset=utf-8','.md':'text/markdown; charset=utf-8',
  '.ics':'text/calendar; charset=utf-8','.sql':'text/plain; charset=utf-8'};

export function serve(dir,porta,{excluir=[]}={}){
  const raiz=path.resolve(dir);
  const srv=http.createServer((req,res)=>{
    const nome=decodeURIComponent(new URL(req.url,'http://x').pathname);
    if(excluir.some(e=>nome.endsWith(e))){res.writeHead(404);return res.end('nao encontrado');}
    const alvo=path.join(raiz,nome==='/'?'/index.html':nome);
    if(!alvo.startsWith(raiz)){res.writeHead(403);return res.end('fora da raiz');}
    fs.readFile(alvo,(err,dados)=>{
      if(err){res.writeHead(404);return res.end('nao encontrado');}
      res.writeHead(200,{'Content-Type':TIPOS[path.extname(alvo)]||'application/octet-stream','Cache-Control':'no-store'});
      res.end(dados);
    });
  });
  return new Promise(r=>srv.listen(porta,()=>r(srv)));
}

if(import.meta.url===`file://${process.argv[1]}`){
  const [,,dir='.',porta='8099']=process.argv;
  serve(dir,+porta).then(()=>console.log(`a servir ${path.resolve(dir)} em http://localhost:${porta}`));
}
