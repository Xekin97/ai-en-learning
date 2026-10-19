"""Bounded complete-business-request evidence for the single authorized OpenRouter model."""
import http.cookiejar, json, os, subprocess, sys, time, urllib.error, urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
STACK = Path("/tmp/wordweave-cr306-qa080-backend")
PUBLIC = json.loads((STACK / "public.json").read_text())
ENV = json.loads((STACK / "env.json").read_text())
API = PUBLIC["api_origin"] + "/api/v1"
ORIGIN = PUBLIC["frontend_origin"]
PG = "/opt/homebrew/opt/postgresql@18/bin/psql"
MODEL_ID = PUBLIC.get("authorized_real_model_id", "01a12f21-460b-75d9-b829-025d13ce445d")
MODE = sys.argv[1] if len(sys.argv) > 1 else "r1"
if MODE not in {"r1", "r2"}: raise SystemExit("usage: qa-real.py r1|r2")

class Client:
    def __init__(self):
        self.opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    def request(self, path, data=None, method=None, headers=None, timeout=60):
        actual = {"origin": ORIGIN, "sec-fetch-site": "same-origin", **(headers or {})}
        if data is not None:
            actual["content-type"] = "application/json"
            actual.setdefault("x-csrf-token", self.request("/bootstrap")["json"]["data"]["csrf_token"])
        req = urllib.request.Request(API + path, data=json.dumps(data, ensure_ascii=False).encode() if data is not None else None, headers=actual, method=method)
        try:
            response = self.opener.open(req, timeout=timeout); raw = response.read()
            return {"status": response.status, "json": json.loads(raw) if raw else None}
        except urllib.error.HTTPError as error:
            raw = error.read(); return {"status": error.code, "json": json.loads(raw) if raw else None}
    def login(self, username, password):
        response = self.request("/auth/login", {"username": username, "password": password, "browser_ui_locale": "zh-CN"})
        if response["status"] != 200: raise RuntimeError(f"login {response['status']}")
    def stream(self, payload):
        csrf = self.request("/bootstrap")["json"]["data"]["csrf_token"]
        req = urllib.request.Request(API + "/generations/stream", data=json.dumps(payload, ensure_ascii=False).encode(), headers={"origin":ORIGIN,"sec-fetch-site":"same-origin","x-csrf-token":csrf,"content-type":"application/json","accept":"text/event-stream"}, method="POST")
        started_at = time.monotonic()
        try: response = self.opener.open(req, timeout=240)
        except urllib.error.HTTPError as error:
            return {"status":error.code,"problem":json.loads(error.read()),"events":[],"elapsed_ms":round((time.monotonic()-started_at)*1000)}
        events=[]; current=None
        for raw in response:
            line=raw.decode().rstrip("\r\n")
            if line.startswith("event:"): current=line[6:].strip()
            elif line.startswith("data:"): events.append({"event":current,"data":json.loads(line[5:].strip()),"elapsed_ms":round((time.monotonic()-started_at)*1000)})
            elif not line: current=None
        return {"status":response.status,"events":events,"elapsed_ms":round((time.monotonic()-started_at)*1000)}

def psql_json(sql):
    result=subprocess.run([PG,ENV["APP_DATABASE_URL"],"-X","-qAt","-v","ON_ERROR_STOP=1","-c",sql],capture_output=True,text=True,check=True)
    return json.loads(result.stdout.strip())

def options_summary(client):
    response=client.request("/generation-options")
    data=response["json"]["data"]
    chosen=next((m for m in data["models"] if m["id"]==MODEL_ID),None)
    return {"status":response["status"],"selected_model_available":chosen is not None,"selected_model":chosen,"effective_plan":data["effective_plan"],"quota":data["quota"],"extra_quota":data["extra_quota"],"content_service":data["content_service"],"configuration_revision":data["configuration_revision"]}

def apply_edit(text, data):
    chars=list(text); at=data["at"]; delete=data["delete_count"]
    if data["base_rev"] < 0 or at < 0 or at+delete > len(chars): raise RuntimeError("invalid public splice")
    return "".join(chars[:at])+data["insert"]+"".join(chars[at+delete:])

client=Client()
if MODE=="r2": client.login(ENV["PRO_USERNAME"],ENV["PRO_PASSWORD"])
before=options_summary(client)
payload={"model_id":MODEL_ID,"meaning_language":"zh","scenario":"story","length":"short","entries":["machine","preclude","interim","juvenile","retroactive"]}
response=client.stream(payload)
events=response["events"]
started=next((x for x in events if x["event"]=="generation.started"),None)
terminal=next((x for x in events if x["event"] in {"generation.validated","generation.failed","generation.cancelled"}),None)
draft=""; first_body=None
for event in events:
    if event["event"]=="generation.edit":
        draft=apply_edit(draft,event["data"])
        if first_body is None and draft:
            first_body={"elapsed_ms":event["elapsed_ms"],"visible_text":draft,"edit":event["data"]}
first_plan=next(({"elapsed_ms":x["elapsed_ms"],"item":x["data"]} for x in events if x["event"]=="generation.plan_item"),None)
after=options_summary(client)

run_id=started["data"]["run_id"] if started else None
status=None; db={"run":None,"calls":[],"charge":None}
if run_id:
    token=started["data"].get("generation_token")
    status_response=client.request(f"/generations/{run_id}/status",headers={"X-Generation-Token":token})
    status=status_response["json"]["data"] if status_response["status"]==200 else {"http_status":status_response["status"]}
    safe_id=run_id.replace("'","")
    db["run"]=psql_json("SELECT row_to_json(x) FROM (SELECT id::text,group_code_snapshot,model_display_name_snapshot,provider_model_id_snapshot,meaning_language,scenario,length_code,minimum_words_snapshot,quota_limit_snapshot,max_entries_snapshot,call_status,disposition,quota_charged,failure_code,started_at,completed_at,model_request_parameters_snapshot,content_review_enabled_snapshot,content_repair_limit_snapshot,pipeline_version_snapshot,plan_origin_snapshot,content_outcome,final_content_version,content_stop_reason FROM wordweave.generation_runs WHERE id='"+safe_id+"'::uuid) x")
    db["calls"]=psql_json("SELECT coalesce(json_agg(row_to_json(x) ORDER BY x.call_no),'[]'::json) FROM (SELECT call_no,provider_request_id,model_snapshot,input_tokens,output_tokens,cost_amount,currency,usage_status,completed_at,call_stage,prompt_version,provider_invoked,review_result,reason_codes,repair_requested FROM wordweave.ai_call_usage WHERE user_run_id='"+safe_id+"'::uuid) x")
    db["charge"]=psql_json("SELECT row_to_json(x) FROM (SELECT source_kind,plan_code,origin,units,state,charged_at,settled_at FROM wordweave.generation_charges WHERE run_id='"+safe_id+"'::uuid) x")

def safe_started(data):
    if not data:return None
    return {**{k:v for k,v in data.items() if k!="generation_token"},"generation_token_present":bool(data.get("generation_token"))}
def safe_status(data):
    if not isinstance(data,dict):return data
    return {k:v for k,v in data.items() if k!="generation_token"}

call_counts={stage:sum(1 for c in db["calls"] if c["call_stage"]==stage) for stage in ["planning","generation","fixed_edit","technical_repair","content_review","content_repair"]}
usage_known=all(c["usage_status"]=="known" and c["input_tokens"] is not None and c["output_tokens"] is not None for c in db["calls"]) if db["calls"] else False
cost_known=all(c["cost_amount"] is not None and c["currency"] for c in db["calls"]) if db["calls"] else False
record={
 "scope":"One authorized complete business request through the formal application pipeline; no retry and no quality-rate extrapolation.",
 "request_kind":"visitor-basic" if MODE=="r1" else "authenticated-pro-enhanced",
 "model":{"id":MODEL_ID,"display_name":"DeepSeek V4 Flash 0731","provider_model_id":"deepseek/deepseek-v4-flash-0731","output_mode":"json_schema","custom_parameters":{"reasoning":{"enabled":False}}},
 "input":{"entries":payload["entries"],"meaning_language":"zh","scenario":"story","length":"short"},
 "http_status":response["status"],"event_names":[x["event"] for x in events],"event_count":len(events),
 "started":safe_started(started["data"] if started else None),"first_complete_plan_item":first_plan,"first_visible_body":first_body,
 "terminal":terminal,"stream_total_ms":response["elapsed_ms"],"status":safe_status(status),
 "quota_before":before,"quota_after":after,"database":db,"stage_counts":call_counts,
 "usage":{"status":"known" if usage_known else "unknown","input_tokens":sum(c["input_tokens"] for c in db["calls"]) if usage_known else None,"output_tokens":sum(c["output_tokens"] for c in db["calls"]) if usage_known else None},
 "cost":{"status":"known" if cost_known else "unknown","amounts":[{"amount":c["cost_amount"],"currency":c["currency"]} for c in db["calls"]] if cost_known else None},
}
path=HERE/("real-r1.json" if MODE=="r1" else "real-r2.json")
path.write_text(json.dumps(record,ensure_ascii=False,indent=2)+"\n")
success=response["status"]==200 and terminal is not None and terminal["event"]=="generation.validated" and db["run"] and db["run"]["content_outcome"] not in {None,"failed"}
print(json.dumps({"mode":MODE,"success":bool(success),"run_id":run_id,"terminal":terminal["event"] if terminal else None,"outcome":db["run"]["content_outcome"] if db["run"] else None,"calls":call_counts,"elapsed_ms":response["elapsed_ms"]}))
raise SystemExit(0 if success else 2)
