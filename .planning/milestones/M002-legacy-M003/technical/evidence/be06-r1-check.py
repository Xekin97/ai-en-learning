#!/usr/bin/env python3
"""Capacity recalibration only; no application or historical checker execution."""
import hashlib,json,re,tarfile
from pathlib import Path
R=Path(__file__).resolve().parents[5];B=R/'.planning/milestones/M003';E=B/'technical/evidence'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
before=json.loads((E/'be06-r1-before.json').read_text());old=json.loads((E/'be06-source-manifest.json').read_text())
paths=list(before['previous_document_sha256']);texts={p:(R/p).read_text() for p in paths}
changed=[p for p in paths if sha(R/p)!=before['previous_document_sha256'][p]]
expected=[str((B/p).relative_to(R)) for p in ['technical/backend.md','technical/capacity-and-deployment.md','handoffs/backend-architecture.md']]
c=texts[expected[1]];checks={}
checks['only_three_current_docs_changed']=set(changed)==set(expected)
checks['versions']=all('version: '+('M003-BE-06-R1' if p in expected else 'M003-BE-06')+'\n' in s for p,s in texts.items())
checks['five_ai_api_exact_be06']=all(sha(R/p)==old['files'][p] for p in paths if p not in expected)
checks['no_hidden_two']=not any(x in c for x in ['IN_FLIGHT=2','PREFLIGHT_MAX=2','两个生成','两槽代表','C2→C4','global租约≤2'])
checks['target_and_test_config']=all(x in c for x in ['10→20→50→100','global=C_test、connection=C_test、preflight=C_test','生产值尚未测定','offered','admitted','首次失败停止升档'])
checks['inputs_and_qualification']=all(x in c for x in ['100–400词','16MiB raw/200万rune','C_mem=floor((1228.8−I−H)/Δ)','不能直接作为全输入生产容量','正常目标20并不证明20个同时最大输出安全'])
checks['numerics']=1536+1024+512+128+896==4096 and '60×C/平均lease占用秒数' in c and 'C20且平均60秒≈20篇/分钟、平均120秒≈10篇/分钟' in c
checks['previous_archive']=sha(E/'be06-source.tar.gz')==before['be06_archive_sha256']==old['sha256']
checks['before_equal_frozen']=all(old['files'][p]==h for p,h in before['previous_document_sha256'].items())
diff=[p for p,h in before['protected'].items() if not (R/p).is_file() or sha(R/p)!=h]
checks['previous_evidence_fixture_hashes']=not diff
future={E/n for n in ['be06-r1-check.json','be06-r1-source.tar.gz','be06-r1-source-manifest.json']};bad=[];n=0
for p in expected:
 for url in re.findall(r'\]\(([^)]+)\)',texts[p]):
  if '://' in url or url.startswith('#'):continue
  path,sep,anchor=url.partition('#');target=((R/p).parent/path).resolve();n+=1
  if not target.exists() and target not in future:bad.append(url)
  elif sep and target.exists() and target.suffix=='.md':
   slugs=[re.sub(r'[^\w\s-]','',h.lower()).replace(' ','-') for h in re.findall(r'^#{1,6} (.+)$',target.read_text(),re.M)]
   if anchor not in slugs:bad.append(url)
checks['local_links']=not bad
report={'version':'M003-BE-06-R1','status':'PASS' if all(checks.values()) else 'FAIL','scope':'3 documents recalibrated; 5 AI/API documents exact BE06; no load/provider/DB/browser or historic checker run','checks':checks,'changed_documents':changed,'protected_files':len(before['protected']),'protected_changes':diff,'local_links_checked':n,'bad_links':bad,'document_versions':{p:re.search(r'^version: (.+)$',s,re.M).group(1) for p,s in texts.items()},'current_document_sha256':{p:sha(R/p) for p in paths},'not_measured':['all concurrency tiers','idle/normal delta/pathological RSS','CPU/control API latency','provider limits']}
(E/'be06-r1-check.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:report[k] for k in ['status','checks','protected_files','local_links_checked','bad_links']},ensure_ascii=False))
assert report['status']=='PASS'
