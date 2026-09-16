import net from 'node:net';
const servers=[];
for(const port of [6101,6010]){
 const s=net.createServer(local=>{const remote=net.connect(port,'host.docker.internal');local.pipe(remote);remote.pipe(local);local.on('error',()=>remote.destroy());remote.on('error',()=>local.destroy());});
 await new Promise((resolve,reject)=>s.listen(port,'127.0.0.1',resolve).on('error',reject));servers.push(s);
}
try{await import('./browser-linux-webkit.mjs');}finally{for(const s of servers)s.close();}

