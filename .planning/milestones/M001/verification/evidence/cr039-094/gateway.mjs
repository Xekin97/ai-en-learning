// Host-only QA ingress. Both destinations are fixed isolated-container names.
import http from 'node:http';
for (const [port,host,targetPort] of [[8081,'provider',8081],[8082,'old',8080]]) {
  http.createServer((req,res)=>{
    const out=http.request({host,port:targetPort,path:req.url,method:req.method,headers:req.headers},up=>{res.writeHead(up.statusCode,up.headers);up.pipe(res);});
    out.on('error',()=>{res.statusCode=502;res.end('QA destination unavailable');});
    req.pipe(out);res.on('close',()=>out.destroy());
  }).listen(port,'0.0.0.0');
}
