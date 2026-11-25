// 本地 / 自托管 Node 入口：静态单文件 dist/index.html + /api/v1/*（共用 backend/handler.mjs）。
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createApi,clientIp,MAX_BODY} from './backend/handler.mjs';
import {activeSelection} from './backend/providers.mjs';
const base=fileURLToPath(new URL('./dist/',import.meta.url));
const types={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};
// 构建产物为单文件 dist/index.html（js/css 全内联），白名单仅放行它；lib/ 逻辑不直接对外暴露。
const files=new Set(['index.html']);
const SECURITY={'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','X-Frame-Options':'SAMEORIGIN'};
export function createServer(opts={}){
 const env=opts.env||process.env;
 const handle=createApi({...opts,env});
 return http.createServer(async(req,res)=>{
  let name;try{name=decodeURIComponent(new URL(req.url,'http://localhost').pathname).slice(1)||'index.html';}catch{res.writeHead(400).end();return;}
  if(name.startsWith('functions/v1/app/api/'))name=name.slice('functions/v1/app/'.length);
  if(name.startsWith('api/')){
   let body='',bytes=0;
   if(req.method==='POST'){const chunks=[];for await(const c of req){bytes+=c.length;if(bytes>MAX_BODY)break;chunks.push(c);}if(bytes<=MAX_BODY)body=Buffer.concat(chunks).toString('utf8');}
   const r=await handle({method:req.method,path:name,headers:req.headers,body,bytes,ip:clientIp(req.headers,req.socket.remoteAddress,env)});
   res.writeHead(r.status,{...SECURITY,...r.headers});res.end(r.body||undefined);return;
  }
  if(!['GET','HEAD'].includes(req.method)||!files.has(name)){res.writeHead(404).end('Not found');return;}
  try{const body=await readFile(path.join(base,name));res.writeHead(200,{...SECURITY,'Content-Type':types[path.extname(name)],'Cache-Control':'no-cache'});res.end(req.method==='HEAD'?undefined:body);}catch{res.writeHead(500).end('Unable to read asset - run npm run build first');}
 });
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(typeof process.loadEnvFile==='function'){try{process.loadEnvFile(fileURLToPath(new URL('./.env',import.meta.url)));}catch(e){if(e.code!=='ENOENT')console.error('Local AI configuration could not be loaded');}}
 const host=process.env.HOST||'127.0.0.1';
 const server=createServer();server.on('error',err=>{console.error(`Preview failed: ${err.code||'UNKNOWN'}`);process.exit(1);});
 server.listen(Number(process.env.PORT||18762),host,()=>console.log(`Whale Demo: http://${host}:${server.address().port}  (AI ${process.env.WHALE_EXTRACT_URL?'whale bridge':(()=>{const a=activeSelection(process.env);return a?a.provider+' · '+a.model:'not configured → rules fallback';})()})`));
}
