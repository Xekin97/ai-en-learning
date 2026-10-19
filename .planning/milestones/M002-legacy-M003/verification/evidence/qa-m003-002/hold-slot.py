"""Hold the configured single generation slot for the CR-304 browser check."""
import http.cookiejar,json,urllib.request
from pathlib import Path
HERE=Path(__file__).resolve().parent; WORK=Path((HERE/'local-stack-location.txt').read_text())
P=json.loads((WORK/'public.json').read_text()); E=json.loads((WORK/'env.json').read_text()); API=P['api_origin']+'/api/v1'; ORIGIN=P['frontend_origin']
opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
def req(path,data=None):
 h={'origin':ORIGIN,'sec-fetch-site':'same-origin'}
 if data is not None: h.update({'content-type':'application/json','x-csrf-token':req('/bootstrap')['data']['csrf_token']})
 r=opener.open(urllib.request.Request(API+path,data=json.dumps(data).encode() if data is not None else None,headers=h)); raw=r.read(); return json.loads(raw) if raw else None
req('/auth/login',{'username':E['PRO_USERNAME'],'password':E['PRO_PASSWORD'],'browser_ui_locale':'en-US'})
csrf=req('/bootstrap')['data']['csrf_token']; payload={'model_id':P['models']['pass'],'meaning_language':'en','scenario':'story','length':'short','entries':['grape','young']}
r=opener.open(urllib.request.Request(API+'/generations/stream',data=json.dumps(payload).encode(),headers={'origin':ORIGIN,'sec-fetch-site':'same-origin','content-type':'application/json','x-csrf-token':csrf,'accept':'text/event-stream'},method='POST'),timeout=60)
names=[]; event=None
for raw in r:
 line=raw.decode().rstrip('\r\n')
 if line.startswith('event:'): event=line[6:].strip()
 elif line.startswith('data:'):
  names.append(event)
  if event=='generation.started' and not (HERE/'holder-started').exists(): (HERE/'holder-started').write_text('started\n')
 elif not line: event=None
(HERE/'holder-result.json').write_text(json.dumps({'status':r.status,'event_names':names,'result':'PASS' if 'generation.validated' in names else 'FAIL'},indent=2)+'\n')
