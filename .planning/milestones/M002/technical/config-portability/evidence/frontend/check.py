#!/usr/bin/env python3
"""CR313 FE document checks only; never execute product, database or browser tests."""
from pathlib import Path
import hashlib, json, re, tarfile
from datetime import datetime, timezone
ROOT=next(p for p in Path(__file__).resolve().parents if (p/'frontend/nuxt.config.ts').is_file())
BASE=ROOT/'.planning/milestones/M002'
OUT=Path(__file__).resolve().parent
files=[BASE/'technical/config-portability/frontend.md', BASE/'handoffs/config-portability-frontend.md', BASE/'technical/frontend.md', BASE/'handoffs/frontend-architecture.md']
def digest(b): return hashlib.sha256(b).hexdigest()
def rel(p): return str(p.relative_to(ROOT))
checks=[]
links=[]
for p in files:
 content=p.read_text()
 if p in files[2:]: content=content.split("\n\n",1)[0]
 for target in re.findall(r'\[[^\]]+\]\(([^)]+)\)',content):
  if re.match(r'^[a-zA-Z]+:',target): continue
  raw,_,anchor=target.partition('#')
  dest=(p.parent/raw).resolve() if raw else p
  exists=dest.is_file()
  anchor_ok=True
  if exists and anchor:
   body=dest.read_text()
   headings=[]
   for title in re.findall(r'^#+\s+(.+)$',body,re.M):
    headings.append(re.sub(r'[^\w\-\s]','',title.lower()).replace(' ','-'))
   anchor_ok=anchor in headings or f'id="{anchor}"' in body
  links.append({'from':rel(p),'target':target,'exists':exists,'anchor_ok':anchor_ok})
checks.append({'name':'scoped_local_links_and_anchors','pass':all(x['exists'] and x['anchor_ok'] for x in links),'count':len(links)})
with tarfile.open(BASE/'reviews/evidence/cr313-frontend-entry-128/before-entry.tar.gz') as t:
 preserved=[]
 for p in files[2:]:
  old=t.extractfile(rel(p)).read(); now=p.read_bytes()
  preserved.append({'path':rel(p),'pass':now.endswith(old),'old_sha256':digest(old),'prefix_bytes':len(now)-len(old)})
checks.append({'name':'canonical_old_bodies_byte_equal','pass':all(x['pass'] and x['prefix_bytes']>0 for x in preserved),'files':preserved})
text=files[0].read_text()
required=[f'AC-{i}' for i in range(501,515)]+[f'API-{i}' for i in range(501,506)]+[f'FE-V{i}' for i in range(1,9)]+['PAGE-501','PAGE-502','PAGE-503','PAGE-504','TECH-503','FE313-U1','FE313-U2','FE313-U3','FE313-B1']
# Ranges such as AC-501/502 are allowed in prose; the matrix also includes all end IDs.
missing=[x for x in required if x not in text and not (x.startswith('AC-') and re.search(r'\b'+x[3:]+r'\b',text))]
checks.append({'name':'trace_ids','pass':not missing,'missing':missing})
checks.append({'name':'review_status_and_runtime_limitations','pass':all('status: awaiting_user_review' in p.read_text() for p in files[:2]) and '未执行unit/build/浏览器/DB/provider' in text})
checks.append({'name':'required_contract_and_lifecycle_topics','pass':all(x in text for x in ['sessionStorage','not_applied','superseded','recovery_token_invalid','result_expired','Unicode scalar','8 MiB','retain_until','defaults_applied','showModal','target_history'])})

copy_source=BASE/'design/config-portability/technical-alignment/copy.json'
copy=json.loads(copy_source.read_text())
copy_issues=[]
for bucket in ['static','templates']:
 entries=copy[bucket]
 for key,value in entries.items():
  if not key.startswith('zh.'): continue
  counterpart='en.'+key[3:]
  if counterpart not in entries: copy_issues.append(key+':missing English')
  elif sorted(re.findall(r'{([^{}]+)}',value))!=sorted(re.findall(r'{([^{}]+)}',entries[counterpart])): copy_issues.append(key+':placeholder mismatch')
checks.append({'name':'supplement_copy_locale_placeholders','pass':not copy_issues,'issues':copy_issues,'keys':len(copy['static'])+len(copy['templates'])})
source=json.loads((OUT/'source-manifest.json').read_text())
supplements=[]
for name in source['review_with_FE']:
 row=next(x for x in source['files'] if x['path']==name)
 supplements.append({'path':name,'sha256':digest((ROOT/name).read_bytes()),'matches_source_manifest':digest((ROOT/name).read_bytes())==row['sha256']})
checks.append({'name':'received_supplement_hashes','pass':all(x['matches_source_manifest'] for x in supplements),'files':supplements})
manifest={'version':'M002-FE-CR313-01','files':{rel(p):digest(p.read_bytes()) for p in files}}
(OUT/'delivery-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
report={'version':'M002-FE-CR313-01','checked_at':datetime.now(timezone.utc).isoformat(),'kind':'static_document_checks_only','pass':all(x['pass'] for x in checks),'checks':checks,'local_links':links,'delivery_manifest':'delivery-manifest.json','not_executed':['unit/contract tests','build','browser','database','provider','UAT','fresh-session handoff test'],'known_source_gaps':[],'received_supplements':['FE313-B1','FE313-U1','FE313-U2','FE313-U3']}
(OUT/'check.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'pass':report['pass'],'checks':checks,'links':len(links)},ensure_ascii=False))
raise SystemExit(0 if report['pass'] else 1)
