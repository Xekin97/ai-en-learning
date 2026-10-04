import {createServer,request} from 'node:http';
// Integrated UI proxy only. Real inference is performed by Go directly against
// its configured OpenRouter endpoint. No mock provider or fallback is started.
const proxy=createServer((req,res)=>{
  const upstream=request({hostname:'127.0.0.1',port:req.url.startsWith('/api/v1')?38083:3332,path:req.url,method:req.method,
    headers:{...req.headers,'x-forwarded-host':'127.0.0.1:3302','x-forwarded-proto':'http'}},response=>{
    res.writeHead(response.statusCode,response.headers);response.pipe(res);
  });
  upstream.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end();});req.pipe(upstream);
});
proxy.listen(3302,'127.0.0.1');
process.on('SIGTERM',()=>proxy.close());
