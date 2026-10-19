import hashlib,json,re
from pathlib import Path
repo=Path(__file__).resolve().parents[6]
source=repo/'frontend/app/presentation/home/sample-stories.ts'
fixture_path=repo/'.planning/milestones/M003/design/fixtures/ui13-r3-bookshop.json'
out_path=Path(__file__).with_name('fixture-integrity.json')
fixture=json.loads(fixture_path.read_text())
raw=source.read_text()
first=raw.split('export const sampleStories = [',1)[1].split('\n  {',2)[1]
parts_block=first.split('parts: [',1)[1].split('],\n    words:',1)[0]
source_prose=''.join(re.findall(r'"([^"\\]*(?:\\.[^"\\]*)*)"',parts_block))
source_words=re.findall(r'"([a-z]+)"',first.split('words: [',1)[1].split(']',1)[0])
source_title=re.search(r'title: "([^"]+)"',first).group(1)
source_weave_zh=re.search(r'meaning:\s*\{\s*zh: "([^"]+)"',first,re.S).group(1)
checks={}
checks['source_hash']=hashlib.sha256(source.read_bytes()).hexdigest()==fixture['sample_source']['sha256']
checks['source_identity']=fixture['sample_source']['title']==source_title and fixture['request']['entries']==source_words
final=fixture['wire'][-1]['data']['result']['passage']
checks['final_only_paragraph_whitespace']=re.sub(r'\s+',' ',final).strip()==source_prose
checks['source_weave_meaning']=next(t for t in fixture['wire'][-1]['data']['result']['targets'] if t['entry']=='weave')['entry_meaning']==source_weave_zh

def reduce(wire,prefix):
 state={'accepted':False,'rev':0,'published':'','working':'','mode':None,'plan':[],'result':None}
 snapshots={}
 for expected,frame in enumerate(wire,1):
  data=frame['data'];kind=frame['event'].split('.')[-1]
  assert frame['event'].startswith(prefix+'.') and data['seq']==expected
  if kind=='started': state.update(accepted=True)
  elif kind=='plan_item': state['plan'].append(data['item'])
  elif kind=='draft':
   if data['action']=='begin':
    assert data['base_rev']==state['rev'];state['mode']=data['mode'];state['working']='' if data['mode']=='initial' else state['published']
   elif data['action']=='paragraph_complete':
    assert data['base_rev']==state['rev']
    pub=state['published'].split('\n\n');work=state['working'].split('\n\n');i=data['paragraph_index']
    while len(pub)<=i:pub.append('')
    pub[i]=work[i];state['published']='\n\n'.join(pub)
   elif data['action']=='body_complete':
    assert data['base_rev']==state['rev'] and data['body_length']==len(state['working'])
    assert data['paragraph_count']==len(state['working'].split('\n\n'))
    state['published']=state['working']
  elif kind=='edit':
   assert data['base_rev']==state['rev'] and data['rev']==state['rev']+1
   chars=list(state['working']);assert 0<=data['at']<=len(chars) and data['at']+data['delete_count']<=len(chars)
   chars[data['at']:data['at']+data['delete_count']]=list(data['insert']);state['working']=''.join(chars);state['rev']=data['rev']
   if state['mode']=='initial':state['published']=state['working']
  elif kind=='validated': state['result']=data['result']
  snapshots[expected]={'published':state['published'],'working':state['working'],'rev':state['rev']}
 return state,snapshots
state,snaps=reduce(fixture['wire'],'generation');preview,p_snaps=reduce(fixture['preview_wire'],'preview')
checks['seq_rev_integrity']=state['rev']==8 and preview['rev']==8 and len(fixture['wire'])==len(fixture['preview_wire'])==29
checks['six_plan_and_targets']=len([i for i in state['plan'] if i['kind']=='word_use'])==6 and len(state['result']['targets'])==6
checks['half_paragraph_hidden']=snaps[22]['working']!=snaps[22]['published'] and "shop's writing group" in snaps[22]['published'] and 'its writing group' in snaps[22]['working']
checks['paragraph_commits']=snaps[21]['published'].split('\n\n')[0]==final.split('\n\n')[0] and snaps[24]['published'].split('\n\n')[2]==final.split('\n\n')[2] and snaps[26]['published'].split('\n\n')[3]==final.split('\n\n')[3]
initial=snaps[17]['published'].split('\n\n');final_parts=final.split('\n\n')
checks['three_changed_one_unchanged']=sum(a!=b for a,b in zip(initial,final_parts))==3 and initial[1]==final_parts[1] and len(final_parts)==4
checks['generation_preview_same_final']=state['published']==state['result']['passage']==preview['published']==preview['result']['passage']==final
checks['target_offsets']=all(final[t['occurrences'][0]['start']:t['occurrences'][0]['end']]==t['entry'] and t['hint_phrase'][t['hint_blanks'][0]['start']:t['hint_blanks'][0]['end']]==t['entry'] for t in state['result']['targets'])
checks['design_only_provenance']=fixture['synthetic'] is True and fixture['design_owned'] is True and len(fixture['synthetic_additions'])>=8
report={'version':'M003-UI-13-R3','status':'PASS' if all(checks.values()) else 'FAIL','source':fixture['sample_source'],'counts':{'entries':len(source_words),'plan_word_uses':len([i for i in state['plan'] if i['kind']=='word_use']),'final_targets':len(state['result']['targets']),'paragraphs':len(final_parts),'changed_paragraphs':sum(a!=b for a,b in zip(initial,final_parts)),'unchanged_paragraphs':sum(a==b for a,b in zip(initial,final_parts)),'events':len(fixture['wire'])},'checks':checks,'provider_calls':0}
out_path.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(report,ensure_ascii=False,indent=2))
raise SystemExit(0 if report['status']=='PASS' else 1)
