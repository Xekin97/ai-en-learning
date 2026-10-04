from pathlib import Path
import json,hashlib,tarfile,subprocess,datetime,re,socket
r=Path.cwd(); b=r/'.planning/milestones/M002'; e=b/'verification/evidence/qa2-010'; old=e.parent/'qa2-009'
load=lambda p:json.loads(p.read_text())
main=load(e/'analytics-results.json'); control=load(e/'deletion-control-results.json'); stalled=load(e/'stalled-results.json')
final=[x for x in main['results'] if x['id']!='A09']+control['results']+stalled['results'];assert len(final)==11 and all(x['result']=='PASS' for x in final)
inputs=load(e/'inputs.json'); data=load(old/'coverage.json');data['version']='M002-QA-10';data['previous_round']='qa2-009/manifest.json'
add={'CAP-002':'QA10 A01实际注册关联及浏览器去重','CAP-005':'QA10 A09控制：注销三条已关联浏览器访问链/分析身份/最小复习事实，保留同浏览器他人业务事实及匿名汇总','CAP-010':'QA10 A02实际生成/收录重试只写一次分析事实','CAP-020':'QA10 A02/A08恢复不重复开始、过90天迟交归原队列且无历史答案','CAP-219':'QA10 A01–11：真实业务链、成熟留存、90天读取与实际清理、匿名汇总、迟交队列、注销关联和聚合停滞保护'}
for c in data['capabilities']:
 if c['capability'] in add:c['evidence']+='；'+add[c['capability']]
for p in data['pages']:
 if p['page'] in ['PAGE-213','PAGE-218','PAGE-206']:p.setdefault('qa_evidence',[]).append('QA10 A01–11 API/数据验收；本轮不新增UI通过声明')
data['limitations']=['QA10最终11项PASS；原主轮9PASS/1测试账号长度FAIL保留，仅定向控制A09；无新增产品CR，UAT未执行。','QA10真实Go/PG与HTTP业务链；历史日期和部分事实为显式SQL夹具，等待实际分钟维护，无真实90天等待。停止聚合用advisory lock并回拨检查点，真实任务日志已验。Mac隔离库不代表生产Linux/权限部署/容量或第三方告警送达。','本地provider2次，真实0；保留其余已有UI/运行环境覆盖与AI质量限制。后续应对照批准验收收敛有限缺口，不能以“更多组合”无限扩展。']
(e/'coverage.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
p=b/'verification/coverage-matrix.md';s=(e/'previous-coverage-matrix.md').read_text().replace('M002-QA-09','M002-QA-10').replace('QA09 P/R/U为本轮（P01–07预设、R01–04原来源退款、U01–04浏览器）','QA09 P/R/U为第九轮；QA10 A01–11为本轮分析生命周期检查').replace('evidence/qa2-009/coverage.json','evidence/qa2-010/coverage.json')
lines=s.splitlines()
for i,line in enumerate(lines):
 for cap,extra in add.items():
  if line.startswith('| '+cap+' '):lines[i]=line[:-2]+'；'+extra+' |'
 if line.startswith('| API-209/900 |'):lines[i]='| API-209/900 | T11–14数值/权限、V01–04响应式；QA10 A01–11补真实注册/生成/收录/复习分析、D1/D7/D30、90天查询/物理清理/匿名汇总/迟交/注销与停滞保护 | Linux生产运行、真实90天连续运行/生产告警送达及容量不在本地证明范围；UI既有证据继续保留 |'
s='\n'.join(lines)+'\n'
s=s.replace('QA09最终15场景通过、无新增产品CR；保持质量角色按上述范围和FE2-V01–20/BE2-V01–21继续，下一批优先API209/900业务事件留存与90天清理，真机/人工读屏/生产环境不具备时明确保留未验证，不用开发通过数替代。','QA10最终11场景通过、无新增产品CR。下一批由qa-quinn对照既有FE2/BE2验收收敛剩余覆盖，优先整理CR001继承和CR002标题的应用证据及有限缺口，准备UAT候选；已匹配的开发证据不机械重跑，真机/读屏/生产环境限制单列，不以笼统“更多组合”扩展验收。')
p.write_text(s)
(b/'verification/report.md').write_text('''---
milestone: M002
stage: verification
role: quality/base
agent_name: qa-quinn
status: awaiting_user_review
result: scoped_verification_passed_remaining_coverage
version: M002-QA-10
date: 2026-09-28
---

# 二期独立验收第十轮

**监控数据90天生命周期、匿名历史汇总、跨期复习统计和注销访问链，最终11项限定场景通过，无新增产品缺陷。** 首轮9 PASS/1测试夹具FAIL，A09定向控制通过；原始失败保留。其余批准范围仍需收敛，最终UAT未执行。

## 验收依据与环境

APPROVAL-M002-036继续授权verification / quality/base / qa-quinn；PRODUCT03、UI22/H01、DB03/BE03/FE02保持。依据[API209/900](../technical/api/analytics.md)、[DB2-Q03与分析存储](../technical/database.md#10-通知与监控)、[BE2-V14/15](../technical/backend.md)、[身份删除](../technical/api/identity-library.md)及[复习最小事实](../technical/api/review.md)。90天是用户已确认的分析明细期限，与本机复习草稿无关；没有新增数据保留需求。

[输入](evidence/qa2-010/inputs.json)核对前端280、后端288源文件与当前交付一致。一次性PostgreSQL18和实际Go1.26.7服务，Node24.21.0/Playwright HTTP上下文维护真实Cookie/CSRF；本轮没有页面操作或UI新增通过声明。只配置loopback模型，共2次本地调用（兼容探针1、有效生成1），真实AI0。未重复单元、lint、类型、格式或前端构建。

## 独立结果

| 场景 | 预期与实际 |
|---|---|
| A01 | 匿名PV重试只落一次；注册关联当前会话；登录前后同浏览器同UV，另一个浏览器另算UV。真实3PV/2UV/1注册 |
| A02 | 实际生成→保存201→重复保存200→开始复习→恢复：generation_started/valid、passage_saved、registered、review_started各1；浏览器伪造提交事件422 |
| A03 | 实际分钟任务产生当日PV3/UV2、注册转化1、有效生成1、收录1、开始复习1/提交0、WAU1；尚活跃会话不算跳出，D1仍observing/null |
| A04 | 两个真实注册账号的历史事实夹具：D1/D7/D30各1/2；注册当日及后6日激活1/2，第7日收录不算；全空提交计频次但不计活跃，指定日WAU1、提交1、频次1 |
| A05 | 暂停聚合且检查点滞后，数据库仍有过期明细；读取标delayed。历史PV3、两个日UV各1仍可用，范围及渠道精确UV为unavailable/detail_expired，未相加伪造2；成熟D30仍1/2 |
| A06 | 显式删除一个历史WAU汇总点，同时保留对应个人成长日；读取为unavailable/source_unavailable，未用长期成长表重建 |
| A07 | 释放聚合锁，实际维护物理删除过期事件/会话/两个注册分析副本，真实账号保留；恰好90天处记录被清，期限内15分钟对照仍在；匿名汇总值不改、成熟D30仍1/2、旧draft最小事实保留 |
| A08 | 开始已超过90天且开始分析事件已清理的实际attempt，恢复后非空错误提交200；重放200只一次提交事件；实际下一次聚合将原开始队列更新为1开始/1提交/0成功，当天提交数1；读取不恢复答案 |
| A09 | 真实注销204，三条已关联浏览器访问链与本人分析事件/cohort/session关联/复习attempt/成长日全清；同浏览器另一个账号的registered事实保留但browser/session链解除；旧匿名汇总不改 |
| A10 | 模型不可用模式下live/ready均200，健康查询不调用提供方；公开API监听上的internal/metrics为404 |
| A11 | 持有聚合锁、检查点落后5分钟时，实际定时清理拒绝超前删除，过期对照行保留；输出analytics_cleanup_failed及有限reason；查询仍delayed且不提供过期范围UV |

主轮[结果](evidence/qa2-010/analytics-results.json)/[脚本](evidence/qa2-010/analytics-lifecycle.mjs)，A09[定向控制](evidence/qa2-010/deletion-control-results.json)/[脚本](evidence/qa2-010/deletion-control.mjs)，A11[停滞验证](evidence/qa2-010/stalled-results.json)/[脚本](evidence/qa2-010/stalled-maintenance.mjs)。稳定场景计11项，不重复计算时间点、恢复或重放次数。

## 夹具、原始失败与限制

- 注册、生成、收录、开始/恢复/提交和注销走实际HTTP事务。历史留存活动由合成服务端事实表示，时间明确调整；先让实际聚合器计算结果，再把汇总与明细一起移到过期日期，汇总值没有人为编造。真实维护执行读取和清理；不声称等待了90天或跨过实际04:00。
- A09首轮测试账号`qa10_shared_browser_`加时间戳超过32字符，被正确422拒绝，尚未执行注销。控制使用合法短名称并重建同浏览器多账号场景，原来两条访问链加新的第三条全部验证。未修改产品或放宽删除期望；原主轮FAIL不改写。
- A11通过独立数据库会话持有聚合锁，并将检查点设为5分钟前，实际等待分钟任务记录错误；证明清理保护和可观察失败，不证明生产告警已送达或长期积压恢复容量。
- 本地API/PG、权限判定和数据结果通过；隔离库运行身份不冒充生产最小授权或Linux/Nginx验收。API900本轮只补健康/公开监听边界。真实设备、辅助技术、生产网络与容量沿原限制保留。

## 交接与剩余范围

[矩阵](coverage-matrix.md)和[机器索引](evidence/qa2-010/coverage.json)保持49 CAP/25 PAGE/28视图/119 UIA；仅增加相关API/数据证据，没有把完整能力或UIA整体标通过。QA09预设/退款、此前限定修复结论均保持。

下一批按已有授权收敛剩余验收，优先对CR001一期继承、CR002标题需求建立应用证据结论，整理实际仍缺的UI/运行环境项与UAT候选。匹配开发证据与独立结果分别列明，不机械重跑或为“更多组合”新增隐性门槛。CR001/002、CR039-L1、CR042-L1、AI-QUALITY-90、W01保留；本轮没有新的返工或同角色交接审批。

## 原件与环境

仅修改QA五份正文及本轮证据；6874受保护文件不变。QA09的63原件中58原位保持、5份旧正文在[归档](evidence/qa2-010/before-owned.tar.gz)及previous副本；版本/链接/私有值保护/文档大小见[manifest](evidence/qa2-010/manifest.json)，操作说明见[README](evidence/qa2-010/README.md)。自建服务均已停止；无应用或控制面修改、提交、部署、真实AI、委派、换模。新会话交接实验未执行，input/token未知。
''')
# Use an exact existing heading rather than inventing a source anchor.
p=b/'verification/report.md';s=p.read_text().replace('database.md#10-通知与监控','database.md');p.write_text(s)
(b/'verification/ai-evaluation.md').write_text('''---
milestone: M002
stage: verification
role: quality/base
agent_name: qa-quinn
version: M002-QA-10
status: deterministic_integration_only
date: 2026-09-28
---

# AI 验证范围

QA10真实AI调用0，本地确定性provider共2次：模型兼容探针1、普通有效生成1。见[调用与结果](evidence/qa2-010/analytics-results.json)。A09控制和A11停滞检查均0次。样文仅用于实际生成/收录/复习与分析事务链，不以固定输出评价自然语言质量。

仅loopback38082配置可用，真实Go/PG完成生成与分析记录。健康检查不依赖提供方且不增加调用；本轮没有测缓存命中率、实时成本或生产可靠性。准确限制见[报告](report.md)。QA09的29次调用及原失败独立保存在[前轮原件](evidence/qa2-010/previous-ai-evaluation.md)，不混入本轮计数。

AI-QUALITY-90仍unverified；[一期评估](../../M001/verification/ai-evaluation.md)、CR039-L1、CR042-L1保持。真实模型质量批测仍需相应授权及模型/提示词/样本版本，本轮不扩大授权。
''')
p=b/'verification/uat.md';s=(e/'previous-uat.md').read_text().replace('M002-QA-09','M002-QA-10').replace('QA09预设/退款15项限定验证通过，但其余独立覆盖未完成','QA09预设/退款15项及QA10分析生命周期11项限定验证通过，但其余独立覆盖仍待收敛').replace('S02–04已独立复验通过；','S02–04已独立复验通过，QA10 A09补同浏览器多账号访问链删除与他人业务事实保留；').replace('V12/14补只读库与密码重置 |','V12/14补只读库与密码重置；QA10补业务分析、90天清理、匿名历史汇总和迟交统计，未新增后台UI验收结论 |');p.write_text(s)
(b/'handoffs/verification.md').write_text('''---
milestone: M002
stage: verification
role: quality/base
agent_name: qa-quinn
status: awaiting_user_review
result: scoped_verification_passed_remaining_coverage
version: M002-QA-10
date: 2026-09-28
---

# 质量验收交接

**QA10分析生命周期最终11场景通过，无新增产品CR。** 实际业务事件、90天查询/清理、匿名汇总、跨期复习与注销关联已补证据；不替代整体UI验收或最终UAT。

## 输入与规则

APPROVAL-M002-036授权qa-quinn继续，阶段/角色不变。PRODUCT03、UI22/H01、DB03/BE03/FE02保持；前端280/后端288源文件与当前交付匹配。依据CAP219、DB2-Q03、BE2-V14/15、API209/900及已批准账号删除/复习最小事实，不新增草稿保留需求。未重复开发单元/lint/类型/格式/前端构建。

## 原始产物与结果

- [报告](../verification/report.md)、[矩阵](../verification/coverage-matrix.md)、[机器索引](../verification/evidence/qa2-010/coverage.json)：49 CAP/25 PAGE/28视图/119 UIA保持。
- [A01–10原轮](../verification/evidence/qa2-010/analytics-results.json)：9 PASS/1夹具FAIL。HTTP注册/生成/保存/开始/恢复各一次业务事实；实际聚合的D1/D7/D30及激活；过期精确UV不可用；物理删除和匿名汇总保留；超过90天迟交正确归原队列；健康/公开监听边界。
- [A09控制](../verification/evidence/qa2-010/deletion-control-results.json)：首轮测试用户名过长，改用合法短名称后定向通过；实际注销清三条浏览器访问链和本人分析/复习事实，同浏览器其他账号保留并脱离身份链，历史匿名汇总保持。
- [A11维护停滞](../verification/evidence/qa2-010/stalled-results.json)：实际定时任务在检查点滞后时拒绝超前清理、记录有限错误；查询继续隐藏过期范围UV。
- [AI评估](../verification/ai-evaluation.md)：本地2/真实0，AI-QUALITY-90仍未验证；[UAT](../verification/uat.md)未执行；[复现与限制](../verification/evidence/qa2-010/README.md)、[manifest](../verification/evidence/qa2-010/manifest.json)。

## 验证边界与原件

真实Go/PG及HTTP事务；部分历史活动与日期为明确夹具，匿名汇总先由实际任务算出再与原始日期一起平移，不伪称等待90天。聚合暂停使用数据库锁和回拨检查点；日志检查不等于生产告警送达。没有新增UI通过声明，也未证明真机、读屏、Linux/Nginx、生产最小权限和容量。

仅改QA五份正文及新证据，6874受保护文件不变；QA09的63原件中58原位保持、5份正文可从before-owned按摘要恢复。自建服务已停，无应用/控制面修改、提交、部署、真实AI、委派或换模；新会话交接实验未执行，input/token unknown。

## 下一动作

qa-quinn沿036授权收敛剩余验收，优先核对CR001继承基线、CR002标题的应用结果，形成有限缺口及最终UAT候选清单。按已批准FE2/BE2条件区分匹配开发证据、独立证据和环境限制，不以“更多组合”无限延长，也不为同角色继续工作重复审批。

CR001/002、CR039-L1、CR042-L1、AI-QUALITY-90和W01保留；CR014/015沿036、CR012/013沿034及更早限定关闭保持。守门关闭、用户最终验收、部署均尚未发生。
''')
(e/'README.md').write_text('''# QA10 · 分析生命周期

授权APPROVAL-M002-036，qa-quinn限定API209/900与BE2-V14/15；当前有效来源PRODUCT03/UI22-H01/DB03/BE03/FE02。

## 复现

从产品根目录，以Node24和现有依赖执行。须新的一次性PG库，不连接正式数据。旧证据不可覆盖；复验应复制脚本到新证据目录。`harness.mjs`强制数据库63541与loopback provider38082。

1. `python3 frontend/tests/integration/m002-local-stack.py`：构建运行用Go二进制、迁移一次性库、创建私有合成管理员。不是重跑开发检查。
2. `node <新证据目录>/analytics-lifecycle.mjs`：复制本轮harness/api-support/provider-fixed到同目录。等待实际分钟任务三次。本轮原件有A09超长用户名422准备失败，其余9项通过；保留原脚本与结果。
3. `node <新证据目录>/deletion-control.mjs`：依赖主轮生成的fixture.json和同一个临时数据库。合法短名称重新建立多账号共用浏览器，定向A09通过，0模型调用。
4. `node <新证据目录>/stalled-maintenance.mjs`：持有聚合advisory锁、回拨检查点5分钟，等待实际分钟任务错误；断言过期行保留/查询delayed及UV不可用。0模型调用，退出释放锁。
5. `python3 frontend/tests/integration/m002-local-stack.py stop`：停止Go和PG。本轮代理、Chromium和本地provider由脚本finally停止。未启动前端页面服务。

`finalize.py`仅用于本轮记录整理：依赖已完成结果/停服记录，写五份QA文档、索引及manifest；不属于产品或通用测试入口，不应在未来轮次原地重跑覆盖冻结证据。

## 期望与证据

主轮9PASS/1测试夹具FAIL + A09定向PASS + A11PASS = 11稳定场景PASS，非12。2次本地调用（探针1、生成1），真实AI0。完整断言及数值见analytics-results/deletion-control-results/stalled-results；当前QA五文档亦纳入manifest。

历史活动是显式合成服务端事实；先让实际聚合器生成数值，再把日期及对应明细平移至90天外，验证真实读取、清理和汇总保留，不人工写入预期指标值。边界对照为创建时正好90天与期限内15分钟；真实维护时钟继续前进。日期口径北京时间04:00，非实时时点跨越测试。

A09初次超长测试账号名被正确拒绝，控制只修夹具名称，并新增第三条可识别浏览器链，不改产品或删除期望。A11显式聚合锁/回拨检查点是隔离故障注入；日志可观察不代表生产告警送达。本轮不是UI/真机/生产Linux/最小权限/容量测试。

## 保护

before-owned.tar.gz及previous五文档保留QA09；protected-before.json覆盖6874个非本轮文件。应用、状态、批准、CR和旧证据均不改。私有env.json只在临时目录，凭据/能力token不进入结果。没有提交/部署/真实AI/委派或新角色切换。
''')
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();protected=load(e/'protected-before.json');changed=[p for p,h in protected.items() if not (r/p).is_file() or sha(r/p)!=h];assert not changed,changed
owned=inputs['owned'];expected_new=str(e.relative_to(r))+'/'
current=subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z']).decode().split('\0');unexpected=[p for p in set(current) if p and (r/p).is_file() and p not in protected and p not in owned and not p.startswith(expected_new)];assert not unexpected,unexpected
previous=load(old/'manifest.json');recovered=[];unchanged=0
with tarfile.open(e/'before-owned.tar.gz') as tar:
 for p,h in previous['artifact_hashes'].items():
  if p in owned:
   assert hashlib.sha256(tar.extractfile(p).read()).hexdigest()==h;recovered.append(p)
  else:assert sha(r/p)==h,p;unchanged+=1
# Local file links: source anchors are documentary; verify targets exist, not internet access.
missing=[];links=0
for p in [r/x for x in owned]+[e/'README.md']:
 for target in re.findall(r'\]\(([^)]+)\)',p.read_text()):
  target=target.split('#')[0]
  if not target or '://' in target:continue
  links+=1
  if not (p.parent/target).resolve().exists() and (p.parent/target).resolve() != e/'manifest.json':missing.append([str(p),target])
assert not missing,missing
private=load(Path(Path('/tmp/wordweave-fe-m002-current').read_text())/'env.json');needles=[v.encode() for k,v in private.items() if isinstance(v,str) and len(v)>15 and any(t in k for t in ['PASSWORD','PEPPER','HMAC','MASTER_KEYS'])]
leaks=[str(p.relative_to(r)) for p in e.rglob('*') if p.is_file() and any(n in p.read_bytes() for n in needles)];assert not leaks,leaks
ports={}
for port in [3301,3331,38081,38082,39081,63541]:
 s=socket.socket();ports[str(port)]=s.connect_ex(('127.0.0.1',port))==0;s.close()
assert not any(ports.values()),ports
(e/'environment-stop.json').write_text(json.dumps({'ports_before':inputs['ports_before'],'ports_after':ports,'stop_exit_code':0,'frontend_started':False},indent=2)+'\n')
cap=len(data['capabilities']);page=len(data['pages']);views=sum(len(p['views']) for p in data['pages']);uia=sum(len(p['ui_acceptance']) for p in data['pages']);assert (cap,page,views,uia)==(49,25,28,119)
artifacts={str(p.relative_to(r)):sha(p) for p in sorted(e.rglob('*')) if p.is_file() and p.name!='manifest.json'};artifacts.update({p:sha(r/p) for p in owned})
manifest={'captured_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'role':'qa-quinn','milestone':'M002','version':'M002-QA-10','authorization':'APPROVAL-M002-036','result':{'status':'scoped_verification_passed_remaining_coverage','total':11,'passed':11,'failed':0,'new_change_requests':[],'original_main':{'passed':9,'failed':1,'test_fixture_case':'A09','cause':'synthetic username exceeds approved 32-character limit','preserved':'analytics-results.json','control':'deletion-control-results.json'},'final_case_ids':sorted(x['id'] for x in final)},'source_checks':inputs['sources'],'protected_audit':{'protected_count':len(protected),'unexpected_changed':changed,'unexpected_new_files':unexpected,'owned_existing_changed':owned,'control_plane_unchanged':True,'source_unchanged':True},'original_artifact_recovery':{'qa09_artifacts':len(previous['artifact_hashes']),'unchanged_at_original_path':unchanged,'mutable_originals_recovered':recovered,'archive':'before-owned.tar.gz','archive_sha256':sha(e/'before-owned.tar.gz'),'qa09_manifest_sha256':sha(old/'manifest.json')},'artifact_link_check':{'checked':links,'missing':missing},'coverage_index':{'CAP':cap,'PAGE':page,'views':views,'UIA':uia},'document_read_size':{'unit':'UTF-8 bytes','paths':{p:{'before_utf8_bytes':(e/('previous-'+Path(p).name)).stat().st_size,'after_utf8_bytes':(r/p).stat().st_size} for p in owned}},'commands':[{'command':'python3 frontend/tests/integration/m002-local-stack.py','exit_code':0},{'command':'node <QA10>/analytics-lifecycle.mjs','exit_code':1,'result':'9PASS / 1 fixture FAIL preserved'},{'command':'node <QA10>/deletion-control.mjs','exit_code':0},{'command':'node <QA10>/stalled-maintenance.mjs','exit_code':0},{'command':'python3 frontend/tests/integration/m002-local-stack.py stop','exit_code':0}],'local_provider_calls':2,'provider_call_breakdown':{'compatibility_probe':1,'valid_generation':1},'real_provider_calls':0,'browser':'Chromium API request contexts only; no UI scenarios','developer_checks_rerun':False,'fixes_applied':False,'stage_transition':False,'committed':False,'deployed':False,'private_value_copy_check':{'matching_files':leaks},'new_session_handoff_test':'not performed','input_tokens':'unknown','artifact_hashes':artifacts,'hash_note':'All new QA10 files excluding this manifest, plus five current QA documents; archives preserve original QA09 bytes.'}
(e/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'result':manifest['result'],'artifacts':len(artifacts),'manifest_sha256':sha(e/'manifest.json'),'protected':len(protected),'previous_recovered':len(recovered),'previous_unchanged':unchanged,'links':links,'ports_after':ports},ensure_ascii=False,indent=2))
