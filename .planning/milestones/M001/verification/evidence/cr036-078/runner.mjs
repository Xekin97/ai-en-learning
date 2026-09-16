import{spawn}from'node:child_process';import{writeFileSync}from'node:fs';import{join}from'node:path';import{dir}from'./lib.mjs';
const group=process.argv[2],commands={
 seed:['baseline','setup','seed','actors','range-seed','long-seed'],
 users:['users-matrix-neutral','focus','long-reader','detail-capture'],
 plans:['plans','plans-warning','plans-warning-finite','plans-expanded'],
 flows:['flows','users-supplemental'],
 api:['api','api-edge','visual','regression','models-list-corrected','lost-response','review-regression'],
 range:['range-flows','range-matrix']
}[group];if(!commands)throw Error('Unknown execution group');
const results=[];for(const name of commands){const start=Date.now();console.log('START '+name);const result=await new Promise(resolve=>{const p=spawn(process.execPath,[join(dir,name+'.mjs')],{stdio:['ignore','pipe','pipe']}),chunks=[];p.stdout.on('data',x=>chunks.push(x));p.stderr.on('data',x=>chunks.push(x));p.on('exit',status=>resolve({status,output:Buffer.concat(chunks).toString()}));});writeFileSync(join(dir,name+'-execution.log'),result.output,{flag:'wx'});results.push({name,status:result.status,seconds:(Date.now()-start)/1000});console.log(JSON.stringify(results.at(-1)));if(result.status!==0){console.log(result.output.slice(-7000));break;}}
writeFileSync(join(dir,'commands-'+group+'.json'),JSON.stringify(results,null,2),{flag:'wx'});if(results.some(x=>x.status!==0))process.exitCode=1;
