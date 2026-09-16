// Isolated QA provider. Never forwards requests, stores headers, or calls AI.
import http from 'node:http';
const queue = [], calls = [];
let catalogs = 0;
http.createServer(async (req, res) => {
  const raw = await new Promise(resolve => { let s=''; req.on('data', b=>s+=b); req.on('end',()=>resolve(s)); });
  const json = x => { res.setHeader('Content-Type','application/json'); res.end(JSON.stringify(x)); };
  if(req.url === '/qa/queue') { queue.push(JSON.parse(raw)); return json({queued:queue.length}); }
  if(req.url === '/qa/stats') return json({catalogs,calls,queued:queue.length});
  if(req.url === '/models') { catalogs++; return json({data:[{id:'qa/synthetic',supported_parameters:['structured_outputs']}]}); }
  if(req.url !== '/chat/completions') {res.statusCode=404;return json({error:'unexpected path'});}
  const request=JSON.parse(raw), item=queue.shift();
  calls.push({ordinal:calls.length+1,fixture:item?.id??'missing',stream:request.stream,
    schema:request.response_format?.json_schema,provider:request.provider,model:request.model,closed:false});
  const call=calls.at(-1);res.on('close',()=>call.closed=true);
  if(!item){res.statusCode=503;return json({error:'no synthetic fixture queued'});}
  res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-store'});
  let body=item.raw??JSON.stringify(item.candidate);
  // Exercise JSON surrogate pairs, not just literal UTF-8 emoji.
  if(item.escapeEmoji) body=body.replaceAll('🧵','\\ud83e\\uddf5');
  const sizes=item.chunks??[1,7,2,19,3,11]; let i=0, part=0;
  const send=()=>{
    if(res.destroyed)return;
    if(i>=body.length){res.end('data: [DONE]\n\n');return;}
    const n=sizes[part++%sizes.length]; const content=body.slice(i,i+n);i+=n;
    res.write('data: '+JSON.stringify({choices:[{delta:{content}}]})+'\n\n');
    setTimeout(send,item.delayMs??0);
  };send();
}).listen(8081,'0.0.0.0');
