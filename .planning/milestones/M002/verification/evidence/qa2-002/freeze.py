from pathlib import Path
import hashlib,json,tarfile,re,datetime
root=Path.cwd();base=Path('.planning/milestones/M002');out=base/'verification/evidence/qa2-002'
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def dump(name,data):(out/name).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
inputs=json.loads((out/'inputs.json').read_text())
changed=[];missing=[]
for name,expected in inputs['protected_files'].items():
 p=Path(name)
 if not p.is_file():missing.append(name)
 elif sha(p)!=expected:changed.append(name)
protection={'count':len(inputs['protected_files']),'unexpected_changed':changed,'missing':missing,'control_plane_unchanged':not any('/agt/' in p or p.endswith('state.yaml') for p in changed+missing)}
assert not changed and not missing,protection
dump('protection.json',protection)
source_checks={}
for key,entry in inputs['source_checks'].items():
 p=Path(entry['manifest']);d=json.loads(p.read_text());bad=[name for name,h in d['files'].items() if not Path(name).is_file() or sha(name)!=h]
 assert sha(p)==entry['sha256'] and not bad,(key,bad)
 source_checks[key]={**entry,'working_tree_mismatches':bad,'count':len(d['files'])}
with tarfile.open(out/'before-owned.tar.gz') as t:
 restored={}
 for name,expected in inputs['before_owned_sha256'].items():
  actual=hashlib.sha256(t.extractfile(name).read()).hexdigest();assert actual==expected,(name,actual);restored[name]=actual
 old=json.loads((base/'verification/evidence/qa2-001/manifest.json').read_text());rawchecked=0
 for name,expected in old['artifact_hashes'].items():
  if name in restored:actual=restored[name]
  else:actual=sha(name);rawchecked+=1
  assert actual==expected,('old artifact changed',name)
originals={'before_owned_files_verified':len(restored),'old_manifest_artifacts_matched':len(old['artifact_hashes']),'unchanged_artifacts_checked':rawchecked,'changed_current_documents_recoverable_in_before_archive':list(restored)}
dump('originals.json',originals)
docs=[base/'verification'/name for name in ['report.md','coverage-matrix.md','uat.md','ai-evaluation.md']]+[base/'handoffs/verification.md']+[base/'changes'/name for name in ['CR-005.md','CR-006.md','CR-007.md','CR-008.md']]
# Manifest is written after links have been verified; its link is explicitly accounted for.
missing_links=[];checked=0
for p in docs:
 for target in re.findall(r'\]\(([^\s)]+)(?:\s+"[^"\n]*")?\)',p.read_text()):
  if target.startswith(('https:','http:','mailto:','#')):continue
  target=target.split('#',1)[0];dest=(p.parent/target).resolve();checked+=1
  if dest==(out/'manifest.json').resolve():continue
  if not dest.exists():missing_links.append({'document':str(p),'target':target})
assert not missing_links,missing_links
links={'documents':len(docs),'local_links_checked':checked,'missing':missing_links,'new_session_handoff_test':'not_executed_no_delegation_authorization'};dump('links.json',links)
coverage=json.loads((out/'coverage.json').read_text());caps=coverage['capabilities'];pages=coverage['pages'];ui=sum(len(p['ui_acceptance']) for p in pages);views=sum(len(p['views']) for p in pages)
assert (len(caps),len(pages),views,ui)==(49,25,28,119)
md=(base/'verification/coverage-matrix.md').read_text()
for c in caps:
 line=next(x for x in md.splitlines() if x.startswith('| '+c['capability']+' '));parts=line.split('|');assert parts[4].strip()==c['qa_status'],c['capability'];assert parts[5].strip()==c['evidence'],c['capability']
assert {c['capability'] for c in caps if c['qa_status']=='FAIL'}=={'CAP-005','CAP-215','CAP-217'}
results=[]
for name in ['review-reverify.json','cards-audit.json','additional-audit.json']:
 for r in json.loads((out/name).read_text())['results']:results.append({'source':name,**r})
passed=[r for r in results if r['result']=='PASS'];assert len(passed)==14
assert [(r['source'],r['id']) for r in results if r['result']=='FAIL']==[('review-reverify.json','R07'),('cards-audit.json','R08'),('cards-audit.json','C06'),('additional-audit.json','R07-repro')]
result={'overall':'FAIL','passed_valid_checks':len(passed),'passed_ids':[r['id'] for r in passed],'verified_scoped_fixes':['M002-CR-005','M002-CR-006'],'verified_fixes_pending_formal_gate_closure':True,'new_confirmed_defects':['QA2-F03','QA2-F04'],'new_change_requests':['M002-CR-007','M002-CR-008'],'repeated_failure_not_additional_defect':'R07-repro','invalid_harness_results':[{'source':'cards-audit.json','id':'C06','reason':'Incorrect Problem body.error.code access; corrected root body.code in independent R09/R10'}],'not_counted_as_full_pass':['R07 password preconditions','fixture preparation','screenshots','duplicate reproduction'],'notes':['R06 learning statistics unchanged; no direct quota ledger assertion.','C01-05/07 repeat previous QA cases, not new feature coverage.','CR-006 API fix does not resolve CR-008 browser form submission blocker.']}
dump('results-summary.json',result)
stop=json.loads((out/'environment-stop.json').read_text())
manifest={'captured_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'role':'qa-quinn','milestone':'M002','version':'M002-QA-02','authorization':'TRANSITION-M002-021','result':result,'source_checks':source_checks,'protected_audit':protection,'original_artifact_recovery':originals,'artifact_link_check':links,'coverage_index':{'capabilities':len(caps),'pages':len(pages),'views':views,'ui_items':ui,'full_acceptance':False},'real_provider_calls':0,'local_provider_calls':4,'developer_checks_rerun':False,'fixes_applied':False,'stage_transition':False,'committed':False,'deployed':False,'environment':stop,'input_tokens':'unknown','artifact_hashes':{},'hash_note':'Current QA2 artifacts and current document versions. QA1 raw evidence unchanged; its mutable document versions recover from before-owned.tar.gz. Excludes this manifest itself. Do not overwrite frozen files on later reruns.'}
for p in sorted([*docs,*[p for p in out.rglob('*') if p.is_file() and p.name!='manifest.json']]):manifest['artifact_hashes'][str(p)]=sha(p)
dump('manifest.json',manifest)
print(json.dumps({'result':result,'source_counts':{k:v['count'] for k,v in source_checks.items()},'protection':protection,'links':links,'coverage':manifest['coverage_index'],'artifacts':len(manifest['artifact_hashes'])},ensure_ascii=False,indent=2))
