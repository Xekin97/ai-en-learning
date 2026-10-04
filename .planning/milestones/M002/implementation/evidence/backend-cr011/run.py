from pathlib import Path
import sys,subprocess,tempfile,socket,json,os,time,hashlib
root=Path(__file__).resolve().parents[6];out=Path(__file__).resolve().parent
pg=Path('/opt/homebrew/opt/postgresql@18/bin')
def save(name,data): (out/name).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
if sys.argv[1]=='start':
 work=Path(tempfile.mkdtemp(prefix='wordweave-cr011-'))
 with socket.socket() as s:s.bind(('127.0.0.1',0));port=s.getsockname()[1]
 with (out/'environment-start.log').open('w') as log:
  subprocess.run([str(pg/'initdb'),'-D',str(work/'data'),'-U','cr011_test','--auth=trust','--encoding=UTF8','--no-locale'],stdout=log,stderr=subprocess.STDOUT,check=True)
  subprocess.run([str(pg/'pg_ctl'),'-D',str(work/'data'),'-l',str(work/'postgres.log'),'-o',f'-h 127.0.0.1 -p {port} -k {work}','-w','start'],stdout=log,stderr=subprocess.STDOUT,check=True)
 save('environment.json',{'work':str(work),'pg_bin':str(pg),'url':f'postgres://cr011_test@127.0.0.1:{port}/postgres?sslmode=disable','isolation':'new disposable local cluster, not existing QA/UAT or production'})
 print('isolated PostgreSQL started')
elif sys.argv[1]=='stop':
 e=json.loads((out/'environment.json').read_text())
 with (out/'environment-stop.log').open('w') as log:r=subprocess.run([str(pg/'pg_ctl'),'-D',e['work']+'/data','-m','fast','-w','stop'],stdout=log,stderr=subprocess.STDOUT)
 save('environment-stop.json',{'exit_code':r.returncode,'private_temporary_data_preserved':True,'existing_services_modified':False});sys.exit(r.returncode)
else:
 name=sys.argv[1];command=sys.argv[2:];env=dict(os.environ,GOTOOLCHAIN='go1.26.7');e=json.loads((out/'environment.json').read_text());env['TEST_DATABASE_URL']=e['url'];env['OPENROUTER_TEST_API_KEY']='';env['OPENROUTER_TEST_MODEL']='';start=time.monotonic()
 with (out/(name+'.log')).open('w') as log:r=subprocess.run(command,cwd=root/'backend',env=env,stdout=log,stderr=subprocess.STDOUT)
 content=(out/(name+'.log')).read_bytes();save(name+'.json',{'command':command,'cwd':'backend','exit_code':r.returncode,'seconds':round(time.monotonic()-start,2),'log_sha256':hashlib.sha256(content).hexdigest(),'real_provider_calls':0});print(name,'exit',r.returncode);sys.exit(r.returncode)
