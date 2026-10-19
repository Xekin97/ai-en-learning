"""Static document evidence only. No DB, application, provider or real secrets."""
from pathlib import Path
import hashlib,json,re,tarfile,datetime
root=Path(__file__).resolve().parents[7]
base=root/'.planning/milestones/M002'
evidence=base/'technical/config-portability/evidence/backend'
scoped=[base/'technical/config-portability/backend.md',base/'technical/config-portability/api.md',base/'handoffs/config-portability-backend.md']
canonical=[base/'technical/backend.md',base/'technical/api/index.md',base/'handoffs/backend-architecture.md']
errors=[]; checks=[]
def record(name,passed,detail):
    checks.append({'check':name,'passed':passed,'detail':detail})
    if not passed:errors.append(name)
record('scoped_metadata',all('version: M002-BE-CR313-01' in p.read_text() and 'status: awaiting_user_review' in p.read_text() for p in scoped),'All three scoped documents remain awaiting_user_review')
text='\n'.join(p.read_text() for p in scoped)
record('acceptance_ids',all(f'AC-{n}' in text for n in range(501,515)), 'AC-501 through AC-514 present; semantic coverage requires review')
record('receiving_ids',all(k in text for k in ['DB501-B1','DB501-B2','DB501-B3','TECH-501','TECH-502','TECH-503','DB313-Q01']), 'All upstream handoff IDs represented')
record('api_ids',all(f'API-{n}' in text for n in range(501,506)), 'Five endpoints defined')
link_errors=[];checked=0
for p in scoped+canonical:
    content=p.read_text() if p in scoped else p.read_text().split('<!-- M002-BE-CR313-01 preserved body below -->')[0]
    for link in re.findall(r'\]\(([^)]+)\)',content):
        if link.startswith(('http:','https:','mailto:')):continue
        path,_,fragment=link.partition('#');target=(p.parent/path).resolve() if path else p
        checked+=1
        # check.json is produced by this run.
        if target==evidence/'check.json':continue
        if not target.exists():link_errors.append({'source':str(p.relative_to(root)),'target':link})
        elif fragment and target.suffix=='.md':
            contents=target.read_text()
            headings=[re.sub(r'[^\w\-\u4e00-\u9fff ]','',m.lower()).replace(' ','-') for m in re.findall(r'^#+\s+(.*)$',contents,re.M)]
            if f'id="{fragment}"' not in contents and fragment not in headings:link_errors.append({'source':str(p.relative_to(root)),'target':link,'reason':'anchor'})
record('local_links',not link_errors,{'checked':checked,'errors':link_errors})
old_rows=[]
with tarfile.open(base/'reviews/evidence/cr313-backend-entry-127/before-entry.tar.gz') as tar:
    for p in canonical:
        old=tar.extractfile(str(p.relative_to(root))).read();now=p.read_bytes()
        marker=b'<!-- M002-BE-CR313-01 preserved body below -->\n\n'
        preserved=now.partition(marker)[2]
        same=preserved==old
        old_rows.append({'path':str(p.relative_to(root)),'old_sha256':hashlib.sha256(old).hexdigest(),'preserved_body_sha256':hashlib.sha256(preserved).hexdigest(),'byte_identical':same})
record('canonical_old_body_byte_identity',all(x['byte_identical'] for x in old_rows),old_rows)
manifest=json.loads((evidence/'source-manifest.json').read_text())
changed=[]
for row in manifest['files']:
    p=root/row['path']
    if hashlib.sha256(p.read_bytes()).hexdigest()!=row['sha256']:changed.append(row['path'])
record('selected_inputs_unchanged',not changed,{'changed':changed,'scope':'selected 51 source/input files; not full repository audit'})
files=[]
for p in scoped+canonical:
    raw=p.read_bytes();files.append({'path':str(p.relative_to(root)),'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()})
result={'version':'M002-BE-CR313-01','checked_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'result':'PASS' if not errors else 'FAIL','scope':'static documents, links, identifiers and preserved body hashes only','checks':checks,'delivery_file_count':len(files),'delivery_files':files,'not_executed':['application tests/build','DB/schema/migrations/privilege tests','provider calls','crypto interop/performance experiment','concurrency/fault injection','new-session handoff test'],'runtime_acceptance':'unverified; no AC pass claimed'}
(evidence/'check.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'result':result['result'],'delivery_file_count':len(files),'link_errors':link_errors,'failed_checks':errors},ensure_ascii=False))
raise SystemExit(bool(errors))
