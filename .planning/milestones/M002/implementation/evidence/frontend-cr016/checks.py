from pathlib import Path
import os, subprocess, json
root=Path.cwd();out=root/'.planning/milestones/M002/implementation/evidence/frontend-cr016'
env=dict(os.environ);env['PATH']='/Users/xekinzhuo/.npm/_npx/387698761821791d/node_modules/node/bin:'+env['PATH']
results=[]
for name in ['typecheck','lint','format:check','lint:boundaries','test']:
 log=name.replace(':','-')+'.log'
 with (out/log).open('w') as f:
  run=subprocess.run(['pnpm','--dir','frontend',name],env=env,stdout=f,stderr=subprocess.STDOUT)
 results.append({'command':'pnpm --dir frontend '+name,'exit_code':run.returncode,'log':log})
 print(name,run.returncode,flush=True)
 (out/'checks.json').write_text(json.dumps(results,indent=2)+'\n')
raise SystemExit(any(x['exit_code'] for x in results))
