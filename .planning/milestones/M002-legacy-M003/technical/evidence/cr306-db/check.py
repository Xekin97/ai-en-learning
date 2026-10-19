#!/usr/bin/env python3
"""DB04 limited static document check; no application/SQL/model execution."""
from pathlib import Path
import hashlib,json,re,tarfile
from datetime import datetime,timezone
ROOT=Path(__file__).resolve().parents[6]
BASE=ROOT/'.planning/milestones/M003'
OUT=Path(__file__).resolve().parent
files=[BASE/'technical/database.md',BASE/'handoffs/database.md',BASE/'changes/CR-306.md']
hashof=lambda b:hashlib.sha256(b).hexdigest()
manifest=json.loads((BASE/'reviews/evidence/cr306-design-baselines/database-before-manifest.json').read_text())
archive=ROOT/manifest['archive']
assert hashof(archive.read_bytes())==manifest['sha256']
before=0
with tarfile.open(archive) as tar:
 for f in manifest['files']:
  b=tar.extractfile(f['path']).read()
  assert hashof(b)==f['sha256']
  before+=len(b.decode())
links=[]
for p in files[:2]:
 body=p.read_text()
 assert 'version: M003-DB-04' in body
 for href in re.findall(r'\]\(([^)]+)\)',body):
  if href.startswith(('https:','http:')):continue
  rel,_,anchor=href.partition('#'); target=(p.parent/rel).resolve() if rel else p
  assert target.exists(),(p,href)
  if anchor and target.suffix=='.md':
   text=target.read_text(); ids=set(re.findall(r'<a id="([^"]+)"',text))
   for heading in re.findall(r'^#+\s+(.+)$',text,re.M):
    ids.add(re.sub(r'[^\w\-\s]','',heading.lower()).replace(' ','-'))
   assert anchor in ids,(p,href,'anchor')
  links.append({'source':str(p.relative_to(ROOT)),'target':href})
body=files[0].read_text()
for id in range(1,10):assert f'DB3-{id:02}' in body
for id in range(1,7):assert f'DB3-V{id:02}' in body
for id in range(1,5):assert f'DB4-{id:02}' in body
for text in ['custom-parameters-v1','16,384','深度8','IS TRUE','IS DISTINCT FROM','180/600','Q02','USER-M003-NO-DATA-MIGRATION','NOT NULL','无默认','不新增历史迁移文件','未验证']:
 assert text in body,text
assert 'status: open' in files[2].read_text()
for path in ['backend/db/migrations/0017_m003_content_review.sql','backend/internal/platform/postgres/migrate.go','backend/internal/platform/postgres/m002_verify.go','backend/internal/ai/connections.go','backend/internal/admin/models.go','backend/internal/admin/model_connections.go','backend/internal/admin/model_providers.go','backend/internal/generation/service.go','backend/internal/generation/preset_preview.go']:
 assert (ROOT/path).is_file(),path
assert 'm003-content-v5' in (ROOT/'backend/internal/entitlement/service.go').read_text()
assert 'model_request_parameters_snapshot' not in (ROOT/'backend/internal/generation/service.go').read_text()
rows=[{'path':str(p.relative_to(ROOT)),'sha256':hashof(p.read_bytes()),'unicode_characters':len(p.read_text())} for p in files]
(OUT/'source-manifest.json').write_text(json.dumps({'version':'M003-DB-04','files':rows},ensure_ascii=False,indent=2)+'\n')
result={'version':'M003-DB-04','scope':'limited static design/links/frozen hashes/source locations only','result':'PASS','frozen_db03_archive_and_two_sources':'PASS','stable_ids':'PASS','links_checked':len(links),'source_locations':'PASS','two_db_documents_unicode_characters':{'before':before,'after':sum(len(p.read_text()) for p in files[:2])},'checks_do_not_prove':['PostgreSQL CHECK or trigger execution','JSONB/API byte and Unicode roundtrip','concurrency or atomic rollback','Go/API/browser/model behavior','AC-317–322','independent fresh-session handoff','workflow or user approval'],'runtime_tokens':'unknown','runtime_total_input':'unknown','links':links}
(OUT/'check.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:v for k,v in result.items() if k!='links'},ensure_ascii=False))
