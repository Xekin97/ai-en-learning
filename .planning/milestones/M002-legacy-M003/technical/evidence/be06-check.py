#!/usr/bin/env python3
"""BE06 bounded document checks only. No application/provider/DB execution."""
import hashlib,json,re,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[5]
BASE=ROOT/'.planning/milestones/M003'
E=BASE/'technical/evidence'
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
checks={}
def check(name,condition):
    checks[name]=bool(condition)
    if not condition: print('FAIL:',name,file=sys.stderr)
before=json.loads((E/'be06-before.json').read_text())
paths=list(before['previous_document_sha256'])+['.planning/milestones/M003/technical/capacity-and-deployment.md']
docs={p:(ROOT/p).read_text() for p in paths}
check('eight_document_versions',all(re.search(r'^version: M003-BE-06$',s,re.M) for s in docs.values()))
cap=docs[paths[-1]]; gen=docs['.planning/milestones/M003/technical/api/generation.md']
check('seven_capacity_sections',len(re.findall(r'^## BE6-C0[1-7] ',cap,re.M))==7)
rows=re.findall(r'^\| (Go|PostgreSQL及受控备份子进程|Nuxt Nitro|Nginx|宿主/Docker/可用余量) \| (\d+)MiB \| (?:剩余)?([0-9.]+)核',cap,re.M)
check('resource_table_sums',len(rows)==5 and sum(int(r[1]) for r in rows)==4096 and abs(sum(float(r[2]) for r in rows)-2)<1e-8)
check('disk_and_memory_arithmetic',10+12+8+2+8==40 and 512+2*160+256==1088 and '1228.8MiB' in cap and abs(1536*.8-1228.8)<1e-8)
http=re.search(r'```http\n(HTTP/1.1 503 Service Unavailable.*?)\n```',gen,re.S).group(1)
headers,payload=http.split('\n\n',1);problem=json.loads(payload)
check('busy_problem_exact',problem['status']==503 and problem['code']=='generation_busy' and problem['context']=={'accepted':False,'retry_after_seconds':5} and 'Retry-After: 5' in headers and not ({'run_id','token','generation_token'}&set(problem)))
check('three_busy_entrypoints',all('`'+p+'`' in gen for p in ['/generations/stream','/presets/{id}/generations/stream','/admin/presets/{id}/previews/stream']))
for p,rows in before['event_schema_rows'].items():
    now=[l for l in docs[p].splitlines() if re.match(r'^\| (generation|preview)\.(started|progress|plan_item|edit|validated|failed|cancelled|settlement_pending) \|',l)]
    check('unchanged_wire_'+Path(p).stem,now==rows)
check('pending_gate_order_and_probe',all(x in cap for x in ['先置settlement_health=false','受理COMMIT未知与终态结算未知','不占preview子槽','global数=普通/用户预设/后台preview租约＋真实模型probe租约']))
check('sampling_and_limits',all(x in cap for x in ['offered并发','admitted并发','快速503','+∞','至少200','2→C4','180s/总执行600s','30分钟等同200样本']) and '不执行3–99轮' in cap)
check('current_handoff_not_old_next_step','下一步由主会话审核本设计并依法接交FE02' in docs[paths[6]] and '建议主会话交designer-tony制作UI07-R1' not in docs[paths[6]])
# Local markdown path/heading validation; two archive outputs are created after this check.
future={E/'be06-check.json',E/'be06-source.tar.gz',E/'be06-source-manifest.json'}
bad=[]; links=0
for p,s in docs.items():
    for url in re.findall(r'\]\(([^)]+)\)',s):
        if '://' in url or url.startswith('#'):continue
        dest,sep,anchor=url.partition('#');target=((ROOT/p).parent/dest).resolve();links+=1
        if not target.exists() and target not in future:bad.append((p,url,'missing'))
        elif sep and target.suffix=='.md' and target.exists():
            slugs=[re.sub(r'[^\w\s-]','',h.lower()).replace(' ','-') for h in re.findall(r'^#{1,6} (.+)$',target.read_text(),re.M)]
            if anchor not in slugs:bad.append((p,url,'anchor'))
check('local_links',not bad)
protected=json.loads((BASE/'reviews/evidence/control-042/preservation-before.json').read_text())['files']
changed=[p for p,h in protected.items() if not (ROOT/p).is_file() or digest(ROOT/p)!=h]
check('protected_851_sources',len(protected)==851 and not changed)
old=json.loads((BASE/'reviews/evidence/control-038/M003-BE-05-R1-source-manifest.json').read_text())
check('seven_before_equal_frozen',all(old['files'][p]==h for p,h in before['previous_document_sha256'].items()))
check('old_archive_unchanged',digest(ROOT/before['previous_archive'])==before['previous_archive_sha256']==old['sha256'])
result={'version':'M003-BE-06','scope':'static documents only; no old fixture checker/application/provider/DB/load/browser run','status':'PASS' if all(checks.values()) else 'FAIL','checks':checks,'protected_count':len(protected),'changed_protected':changed,'local_links_checked':links,'bad_links':bad,'unchanged_wire_rows':sum(map(len,before['event_schema_rows'].values())),'before_document_characters':before['before_document_characters'],'after_document_characters':sum(map(len,docs.values())),'current_document_sha256':{p:digest(ROOT/p) for p in paths},'unverified':['actual resource capacity','real provider latency/quality/cost','deployment/backups/restore','FE/browser integration']}
(E/'be06-check.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:result[k] for k in ['status','protected_count','local_links_checked','bad_links','after_document_characters']},ensure_ascii=False))
sys.exit(0 if result['status']=='PASS' else 1)
