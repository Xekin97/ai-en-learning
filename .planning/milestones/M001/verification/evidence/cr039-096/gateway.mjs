import http from 'node:http';
// Fixed internal destinations; this gateway cannot forward arbitrary external URLs.
for(const [port,hostname,targetPort] of [[8080,'backend',8080],[8081,'provider',8081]]){
 http.createServer((req,res)=>{
  const upstream=http.request({hostname,port:targetPort,path:req.url,method:req.method,headers:req.headers},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res);});
  upstream.on('error',()=>{res.writeHead(502);res.end('QA upstream unavailable');});req.pipe(upstream);
 }).listen(port,'0.0.0.0');
}
