"""Targeted CR-304 independent retest against a one-slot disposable stack."""
import http.cookiejar, json, threading, urllib.error, urllib.request
from pathlib import Path
HERE=Path(__file__).resolve().parent
WORK=Path((HERE/'local-stack-location.txt').read_text())
assert WORK.name.startswith('ww-m003-qa-002-')
PUBLIC=json.loads((WORK/'public.json').read_text()); ENV=json.loads((WORK/'env.json').read_text())
API=PUBLIC['api_origin']+'/api/v1'; ORIGIN=PUBLIC['frontend_origin']

class Client:
 def __init__(self): self.opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
 def request(self,path,data=None,method=None,headers=None):
  hs={'origin':ORIGIN,'sec-fetch-site':'same-origin',**(headers or {})}
  if data is not None:
   hs['content-type']='application/json'; hs.setdefault('x-csrf-token',self.request('/bootstrap')['json']['data']['csrf_token'])
  req=urllib.request.Request(API+path,data=json.dumps(data).encode() if data is not None else None,headers=hs,method=method)
  try:
   response=self.opener.open(req,timeout=60); raw=response.read(); return {'status':response.status,'headers':dict(response.headers),'json':json.loads(raw) if raw else None}
  except urllib.error.HTTPError as e:
   raw=e.read(); return {'status':e.code,'headers':dict(e.headers),'json':json.loads(raw) if raw else None}
 def login(self,u,p):
  r=self.request('/auth/login',{'username':u,'password':p,'browser_ui_locale':'en-US'}); assert r['status']==200,r
 def stream(self,data,started=None):
  csrf=self.request('/bootstrap')['json']['data']['csrf_token']
  req=urllib.request.Request(API+'/generations/stream',data=json.dumps(data).encode(),headers={'origin':ORIGIN,'sec-fetch-site':'same-origin','x-csrf-token':csrf,'content-type':'application/json','accept':'text/event-stream'},method='POST')
  try: response=self.opener.open(req,timeout=60)
  except urllib.error.HTTPError as e:
   raw=e.read(); return {'status':e.code,'headers':dict(e.headers),'problem':json.loads(raw),'event_names':[]}
  names=[]; current=None
  for raw in response:
   line=raw.decode().rstrip('\r\n')
   if line.startswith('event:'): current=line[6:].strip()
   elif line.startswith('data:'):
    names.append(current)
    if started and current=='generation.started': started.set()
   elif not line: current=None
  return {'status':response.status,'headers':dict(response.headers),'event_names':names}

basic=Client(); basic.login(ENV['BASIC_USERNAME'],ENV['BASIC_PASSWORD'])
pro=Client(); pro.login(ENV['PRO_USERNAME'],ENV['PRO_PASSWORD'])
payload={'model_id':PUBLIC['models']['pass'],'meaning_language':'en','scenario':'story','length':'short','entries':['grape','young']}
started=threading.Event(); held={}
t=threading.Thread(target=lambda: held.update(response=basic.stream(payload,started))); t.start()
assert started.wait(15),'holder did not reach generation.started'
busy=pro.stream(payload); t.join(60)
context=(busy.get('problem') or {}).get('context') or {}; retry=context.get('retry_after_seconds'); header=busy.get('headers',{}).get('Retry-After')
checks={
 'one_slot_holder_completed': held.get('response',{}).get('status')==200 and 'generation.validated' in held.get('response',{}).get('event_names',[]),
 'busy_is_503_before_acceptance': busy.get('status')==503 and busy.get('problem',{}).get('code')=='generation_busy' and context.get('accepted') is False and busy.get('event_names')==[],
 'retry_seconds_integer_1_to_600': isinstance(retry,int) and 1<=retry<=600,
 'retry_context_matches_header': header==str(retry),
 'busy_response_no_store': busy.get('headers',{}).get('Cache-Control')=='no-store'
}
result={'scope':'CR-304 targeted retest; real Go HTTP/SSE, disposable PostgreSQL, configured generation capacity=1, synthetic provider. This is contract behavior, not a production capacity claim.','configuration':{'generation_max_in_flight':1},'actual':{'status':busy.get('status'),'headers':busy.get('headers'),'problem':busy.get('problem'),'events':busy.get('event_names')},'checks':checks,'result':'PASS' if all(checks.values()) else 'FAIL'}
(HERE/'cr304-api-results.json').write_text(json.dumps(result,indent=2)+'\n'); print(json.dumps({'result':result['result'],'checks':checks}))
raise SystemExit(0 if result['result']=='PASS' else 1)
