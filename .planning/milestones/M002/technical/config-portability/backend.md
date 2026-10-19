---
milestone: M002
stage: technical-design
role: backend-architect/base
agent_name: backend-alex
version: M002-BE-CR313-01
status: awaiting_user_review
date: 2026-10-15
requested_model: gpt-6-astra
requested_effort: high
actual_model: unknown
scope: CR-313
---

# CR313 后端技术设计

后端建议在现Go单体、PostgreSQL和CredentialStore中增加一个分类配置用例。文件只在请求内处理，完整类别只用一次事务替换，最终回执与配置同事务；未知结果通过同配置锁判定。无需MQ、新vault、上传文件库或后台审计平台。完整前端合同见[API/文件格式](api.md)。本稿与交接待用户审阅，未实现，不自行批准/切换角色。

## BE501-01 输入与决策性质

**CONFIRMED**：[产品09-R1](../../product/config-portability.md)及[UI33-R3](../../design/config-portability/design-spec.md)已接收，完整模型/四固定计划/道具/成长分别整类替换；每连接包内Key必填、跨类别依赖整次拒绝、非运行数据迁移。[DB01](database.md)已由[127授权](../../reviews/evidence/cr313-backend-entry-127/authorization.json)接收，包括身份策略、退役生命周期、单例锁、DATA-506回执及未知结果屏障。DB原件“待审/PROPOSED”是冻结提交文本，本稿依127接收，不冒充其当时已批准。DB313-Q01不同成就身份同kind+threshold整次拒绝，不合并/不加mapping界面。用户未上线，不迁移历史库，仅可设计未发布schema初始化。

**FACT**：single解析、当前M002/technical-design/backend-alex与注册表一致；Profile consumer-ai-web@1.0.0、路由锁保持；requested gpt-6-astra/high、actual_model及运行token/费用unknown。工作区代码是只读输入，不能当成已部署数据库/应用事实。定向输入及hash见[evidence](evidence/backend/source-manifest.json)。

**PROPOSED**：本轮的API命名、包格式、KDF、限制/期限、模块接点、锁加固及清理方法。均落实既有需求，未新增业务功能。无需再提问的范围歧义；整份后端技术建议仍待审。TECH-501/502、DB501-B1/B2/B3在本稿完成设计接收，未完成实现验证。TECH-503仍归frontend-bob。

| 取舍 | 采用及原因 |
|---|---|
| 整类repository vs 循环单项service | 前者；现SaveProvider/RemoveModel含联动、SaveLevels/SaveAchievements是merge，循环会多次commit/revision且不能实现原子全替换 |
| 请求内文件 vs 持久上传/任务 | 前者；有界文件同步处理、客户端重传，只有最终回执；无需要支持大包任务平台的依据 |
| 服务端包解密 vs 浏览器解密 | 前者；复用Go密码库、不把明文Key送浏览器，口令经现同源HTTPS；不新增浏览器加密协议实现 |
| 明文配置+加密Key vs 全内包AEAD | 全内包；配置/Key一起认证，避免编辑外层后与秘密配对不一致；普通无KeyJSON仍可编辑 |

## BE501-02 模块与事务接点（DB501-B2 / TECH-501）

建议新 `internal/admin/config_portability.go` 负责Export/Preview/Commit/Resolve/Current用例；同包`config_portability_repository.go`接收调用者pgx.Tx，只读/写完整集合，绝不自行Begin/Commit；`internal/httpapi/config_portability_handlers.go`接入现server管理员路由。文件DTO/严格presence与规范化可放该用例的局部文件；密码编解码放`platform/security/config_package.go`。这些是待实施接点，本轮不创建源码。复用business.LockConfiguration/AdvanceConfiguration、ai.CanonicalCustomParameters、现growth规则校验；必要时提取纯验证或tx级函数，不复制整套domain service、不建通用导入框架。

`DecodeFile → NormalizeFullCategory → ValidateAndMap(tx) → ReadImpact(tx) → Diff → ReplaceCategory(tx)` 是同一套规则，预览/提交共用；提交不信任客户端差异。Bilingual现UnmarshalJSON强制双语言键，单项保存DTO奖励数量/Key缺省亦不符合产品，导入须先保持presence、完成可选语义，再转领域值。金额沿business.Amount，额度显式null、false/0/空集合分别处理；不得把json.Unmarshal默认值当必填验证。

完整类别写集合沿DB501-03：模型连接/模型/包内Key与退役清理；计划四行及其自身模型/长度关联；道具定义及其自身模型集合；成长mastery、下一日签到、等级及全部四种成就。固定计划/等级匹配业务键，其余UUID；保留本地历史ID、award/settlement，不复制源历史。等级source_id仅说明。道具ever_issued使用目标事实、不回退。精确匹配之外一律报依赖/身份错误。

提交锁序固定：`growth_settings FOR UPDATE → 管理员account FOR SHARE → 当前会话FOR SHARE → operation receipt → 配置对象(表固定序、UUID升序) → 必需引用行`。其他业务沿配置FOR SHARE→账号/访客→领域行；不能先锁用户再升级配置锁。账号删除/会话撤销保持现有单向顺序，不可新增逆序。调用前校验签名/文件/解密、做好数据库信封加密；锁内不做KDF、网络、提供方验证或全用户重算。设置事务局部lock_timeout=2s、statement_timeout=5s，提交用例总上限15s；超时由结果屏障确定，不能假装已回滚。规模达到限额而超时时拒绝本次，不偷偷分批。

拿锁后时间与权限重验→查终态→无终态时期限/CAS→精确映射/字段/引用/历史投影重新计算→全部一致才写。同类最终集合验证后，先退出旧活动项腾挪唯一键，再插入/更新/替换自己的关联。模型活动唯一index不可延迟，需要在事务内为需交换唯一值的活动模型设置本次随机临时provider_model_id/display_name（≤500/200字符，预先验证不与当前/最终集合冲突），再全量赋最终值；不改身份/归属/retired_at，也不调用provider。锁及MVCC使外部不读到中间值，最终读回禁止残留占位值。计划优先级沿现entitlement_groups_priority_unique先DEFERRED再全集更新/IMMEDIATE；不要逐个validateGroup用旧优先级误报交换冲突。成长按DB01命名DEFERRABLE约束在全集写后立即检查；不能放宽最终约束或复活已退役模型。

最终读回活动集合必须与规范命令一致（排除服务端时间/source说明），AdvanceConfiguration恰一次，即使全非秘密值相同也只推进一次；写applied回执→COMMIT。失败回滚包括凭据。配置change仅一次推进重算游标，不现场发奖/重算全用户。禁止调用现RemoveModel的DELETE group_models；仍被计划、预设draft/published或道具定义引用的模型整次阻止，disabled也算引用。道具缺失且有ever_issued/奖励引用整次阻止。历史库存只产生退役影响，不删除/改其模型快照。

<a id="be501-03"></a>

## BE501-03 凭据与加密（DB501-B1 / TECH-502）

普通导出仅app pool读安全配置，根本不调用秘密读取；显式include_credentials=true才在已验管理员、持app配置FOR SHARE期间，由CredentialStore现ai pool按完整连接集合一次读取密文并解密。建议增加仅服务内部可用的`ReadExportCredentials(ctx, providerIDs)`，不增加HTTP密钥读取API、不返回可JSON序列化Key DTO；每个ID须与这次锁下活动连接集一致。含空模型连接亦需Key，全体成功才释放共享锁，再做KDF/加密/序列化。ai pool不同时请求配置锁，避免app锁与ai池互相等待；池等待计入期限。app继续不能SELECT凭据表，ai继续不能读用户/回执。

| 凭据/连接实际路径 | 代码事实与必须落实的锁/退役规则 |
|---|---|
| admin.SaveProvider → UpdateConnection/WriteConnection | model_providers.go先LockConfiguration(true)，复用同tx；新增导入不允许留空保留Key/source-copy |
| admin.SaveModel / SaveModelBatch → WriteConnection | model_connections.go/model_batch.go先排他锁；每个新包Key明确写，不传source；更新既有身份用tx窄upsert |
| CredentialStore.Replace/Put → replace_openrouter_credential | 0015 SQL函数第一步配置FOR UPDATE及revision CAS；Put是内部初始化。旧PutCredential先读共享锁后释放再验证provider，不会跨provider调用持锁；**导入不调用此service**。现ai pool与函数EXECUTE权限需隔离验证，不能为兼容死路径给ai写权限；若保留旧管理写入口，改为app tx调用现窄函数 |
| write_provider_credential / update_provider_credential | 0015/0016函数当前依赖调用者锁，无自身锁/退役守卫。未发布schema设计补第一步配置FOR UPDATE（调用者已持时可重入）、actor仍admin、目标活动校验；source-copy须source也活动。不得从任意后置调用“补锁”，所有代码调用必须先配置锁 |
| httpapi.New legacy_url_pending初始化 | server.go有直接UPDATE base_url的启动路径，没有配置锁；必须改为配置排他锁下、仅活动目标、实际改动推进一次revision，或未发布空库初始化时预先完成。不可让滚动启动改URL绕过导出一致性 |
| 退役连接凭据删除 | 新窄SECURITY DEFINER `delete_retired_provider_credential(provider,actor)`：同tx先配置锁、admin、目标retired且无活动模型，再DELETE该ID凭据；更新provider credential_configured=false/masked_hint=NULL；只app可EXECUTE，PUBLIC/ai无权，固定search_path |

现0015 credential状态trigger已覆盖INSERT/UPDATE/DELETE，窄删除函数复用其DELETE分支清configured/hint并验证结果，不另外写一个竞争状态真源。旧replace_openrouter_credential同样补retired检查，不能给退出活动的legacy连接重新写Key。退役连接历史行与退役模型FK保留；连接仍在包中但零模型仍属当前连接并持新Key。移出的模型即便所属连接仍在包中也失去活动资格。

文件密码合同见FILE501：**Argon2id v19 / 64 MiB / 3轮 / 4 lanes / 32-byte key + AES-256-GCM / 96-bit nonce / 128-bit tag**。采用现golang.org/x/crypto依赖，无新服务；本方案采用RFC9106第二组资源配置，Go IDKey的memory单位是KiB。[RFC9106](https://www.rfc-editor.org/rfc/rfc9106.html)、[Go Argon2](https://pkg.go.dev/golang.org/x/crypto/argon2)、[Go AEAD](https://pkg.go.dev/crypto/cipher#NewGCM)为查证来源。只选择受支持固定参数，不把库最新版当项目升级授权；项目go.mod现x/crypto v0.55.0，实施须用锁定版本验证同参数互通。

每管理员10次/分钟KDF准入、进程并发2，超限429而不排后台任务；最多约128MiB KDF工作内存，实际总RSS/延时仍需隔离测量。无吞吐承诺。口令12～128字符建议由FILE501明确，复制粘贴保留原字节，确认匹配；不建找回/托管。

服务端请求body、口令、KDF输出、解密包和明文Key只在该请求内存；避免string多份拷贝，尽量[]byte、使用后清零并释放引用，但Go GC/第三方拷贝不保证物理内存完全擦除，不能声称可证明零残留。不写临时文件、缓存、数据库、panic值、trace或metrics标签。导入转现Envelope.Encrypt写当前环境密文，绝不把外部包密文直接入库；预先生成的密文同配置事务写入。HTTP敏感路由panic处理只记request_id/固定reason，不沿当前recoverPanic记录recovered任意值；SQL错误只映射安全code，不记参数/原始密文。反向代理body日志/抓包/崩溃转储不得启用；浏览器口令/文件只内存，下载Blob及时revoke，成功/取消/权限失效清除。现generation evidence不捕获这些非generation路径，保持。

新BindSpec首次绑定、ConnectionKey和probe读目标时须要求连接与模型未退役；已绑定私有snapshot继续返回原快照，不因删除凭据中断在途请求。导入从不调用Gateway/ValidateAPIKey/Probe；本地格式有效不代表provider接受。

## BE501-04 预览、指纹和历史一致性（DB501-B2/B3）

导出/预览持配置共享锁，配置写方均排他；单事务全集读取，不能逐页开事务拼接。预览相关历史在**单条SQL语句的同一MVCC快照**形成投影，各CTE限定受影响配置对象；流式读该单语句结果按固定主键顺序输入HMAC，不把个人名单返回客户端。不能把多条Read Committed查询或纯计数摘要冒充一致历史快照。提交持配置排他锁后全部业务共享锁持有者已结束，重算同投影；不为每次学习事件推进配置revision。

| 类别 | 指纹必须覆盖的目标投影及现接点 |
|---|---|
| models | 被移模型的group_models；presets当前draft/published指向的版本/模型；item_definition_models；相关user_item_models及user_items的owner/状态/期限与model_time_contributions有效状态。model_removal.go、generation/presets.go、growth/retirement.go/inventory.go；只出安全计数 |
| plans | 四计划当前内容、accounts基础计划/状态、plan_trials identity/owner/code/start/end；接受快照不动。admin/groups.go、entitlement/service.go；锁后时间重算有效体验，不只count |
| items | 缺失道具ever_issued、库存引用存在性及成长全部奖励引用；变更道具引用的目标模型状态/固定计划。item_definitions.go、receipts.go、awards.go；相关发放先后由配置锁串行 |
| growth | 当前/待生效签到与目标学习日；本次level/tier身份的award achieved_at/claimed_at/settlement；相关user_growth进度及growth_balances经验用于升降/待领影响；奖励道具可用性。levels.go、achievements.go、awards.go、settlement.go；04:00跨界旧票据拒绝 |

将包规范值（含全部Key）、原文件字节摘要、目标映射、配置revision、历史投影、学习日/生效日、actor/category/operation_id/两截止时间绑定。所有含秘密或个人投影的摘要用HMAC-SHA256，复用现CursorKey派生域隔离子键（HMAC标签 `config-portability/v1/{input,impact,token}`），不存裸Key hash/口令hash。规范值以固定字段次序、集合按身份排序、明确null/类型、现custom参数canonical输出序列化；length-prefixed组件防串接歧义。原文件字节用域HMAC绑定，所以改空白/source也须重预览；口令自身不入fingerprint，只有成功解密出的内容参与。目标新等级ID可由签名operation_id+level_number确定性派生UUID，预览/提交一致且仍按本地既有level_no优先，避免预览随机ID每次变动。

无状态签名token包含version、actor、operation_id、category、输入fingerprint、目标revision/映射digest/影响digest、学习日、created_at/commit_not_after/retain_until；不含秘密/名单/原文件。token≤16KiB，HMAC常量时间校验；客户端不解析或修改。入库request_fingerprint再绑定上述票据全部字段（排除签名本身），杜绝循环定义；同一公式在预览生成、提交和resolve使用。预览5分钟，retain_until=commit_not_after+24h。无包表/preview表。正常重启必须使用原CursorKey以可恢复；常规轮换等窗口排空，紧急轮换优先安全、承认旧token不可判定，不假报not_applied。

## BE501-05 结果屏障与清理（DB501-B3）

DATA-506 schema完整沿DB01；operation_id全局唯一，只插入applied/not_applied，不存pending，不允许更新终态。服务先验证管理员/token/ID/类别，提交还重解密文件并比较指纹。拿排他配置锁后先查同ID终态，同actor/category/fingerprint返回原结果；冲突拒绝。无终态才检查提交截止/CAS/影响；业务失效直接在此事务插入not_applied且不改变配置revision。成功更新配置和applied一并commit。

数据库错误导致原tx aborted：先结束/rollback，再新tx按相同锁序resolve。COMMIT网络错误即unknown，绝不先覆盖失败；resolve重新排他拿锁后看到已提交applied便返回，否则插入not_applied阻挡仍未拿锁的迟到请求。不能用GetReceipt无行就说未应用。与提交使用同锁意味着先到提交完成可成功，先到resolve可确定阻止；两者均不会双重生效。锁/连接不可用仍unknown，HTTP语义见API-504。

所有新提交、包括排队/预先验证后才拿锁的请求，**必须锁后再次检查commit_not_after及retain_until**。超过retain_until，即使旧applied行还在也统一结果到期合同；不再允许写新的判定/导入。maintenance沿现Runner周期按retain_until限量≤200清理，索引retain_until；锁序配置FOR SHARE→receipt行FOR UPDATE SKIP LOCKED→DELETE，禁止反序。清理仅终态记录，不改配置、不读取/清除用户历史；与账号删除ON DELETE CASCADE相容。retain_until到期以后没有回执只说明记录到期；API读当前配置不是操作证明。

## BE501-06 退役读取/写入闭环

| 接点 | 实施必须调整的行为 |
|---|---|
| admin model_providers.go/readProviders、model_connections.go、models.go | 当前列表/编辑/导出同时过滤provider/model retired；编辑已退役返回not_found，不能从旧前端draft写回 |
| ai/connections.go BindSpec/ConnectionKey，admin probe | 新调用只读取活动provider/model；已绑定snapshot直接使用；导出受限读取显式活动ID集 |
| entitlement/service.go及db/queries/entitlement.sql（生成dbgen保持同步）；generation/service.go/preset_preview.go/preset_catalog.go/presets.go | 当前候选/受理拒退役provider/model，保留enabled和权益过滤；preset当前引用本来已阻止移出，额外过滤防悬挂；学习/历史结果仍按原模型身份读取 |
| growth levels.go/readLevels、achievements.go/readAchievements、普通Save/Preview | 当前规则/编辑只读未退役；仅新的整类repository可按DB01恢复同level_no或同UUID+kind，普通编辑不得误复活 |
| growth settlement.go/Recompute、operations.go Activate/RecomputeBatch、personal.go及awards.go readCompactGrowth | 仅当前等级/成就参与level/next/达成/待领计算；后台recompute游标沿旧机制，不为导入重发 |
| awards.go/readLevelAwards/readPersonalAchievements/Claim | 显示当前或本用户已有award的退役项；退役已领取从settlement快照返回，未领禁止；Claim tx内再次检查活动状态，不只依赖列表 |
| admin/user_detail.go | 管理员个人成长/领奖概览需同样区分当前与已存历史，不把退役项列为新可领奖 |
| item_definitions.go、receipts.go、inventory.go、retirement.go、configuration.go/validateReward | 保持issued历史与模型卡发放快照、计划动态权益、下架积分；道具奖励引用取当前/停用配置，退役成长引用已在成长替换时清空；库存历史不得被活动过滤隐藏/删除；奖励可用模型同时检查provider活动 |
| identity账号/会话撤销、growth发放/领奖/兑换、learning/review/generation结算、maintenance | 保持先配置锁的既有写路径；如有影响摘要字段写方未持锁，实施应补同一共享锁后才允许发布导入。不能把所有学习历史拉入摘要扩大冲突 |

退役成长行按DB01清item_definition_id/item_count并关奖励，但保留身份/描述/门槛、award/settlement；本包再次包含同身份时用全新包完整赋值，不继承遗漏奖励。模型/连接禁复活规则不套用成长恢复。此表是定向实现范围，不要求审计全库。

## BE501-07 部署、验证与交接边界

只复用现Go服务+PG roles、MasterKeys和CursorKey；不新增托管设施。未发布schema需添加DB01列/约束/回执/最小权限及B1窄删除守卫，更新postgres/migrate.go/m002_verify.go启动检查。先在隔离空库验证schema初始化、权限/约束/过滤及事务，再部署同版本API；没有旧库迁移/回填/真实凭据读取授权，不自动改现UAT或seed。回滚应用不能让旧版本在含退役配置的新schema上运行；失败时停止本功能并恢复匹配的代码/schema测试环境，不能恢复旧运行库来“撤销”配置。配置包恢复仍是新导入并完整校验。

| 后端验证 | AC / 必须在未来隔离测试证明 |
|---|---|
| BE-V1 | AC-501/502/512：权限/CSRF、全量跨分页导出、普通路径零Key读取、并发Key+URL一致快照、秘密无输出日志；DB501-V1 |
| BE-V2 | AC-503/510/513/514：FILE502每字段missing/null/空白/false/0/空集合/条件表；单语言省略、可选清空；所有连接Key强制、无provider调用；DB501-V2 |
| BE-V3 | AC-504/508/511/512：准确身份/依赖、同名不同UUID、唯一值交换、整类回滚含Key；被引用模型无解绑；DB501-V3 |
| BE-V4 | AC-505：四计划、额度null、旧usage/trials/在途快照不变；DB501-V4 |
| BE-V5 | AC-506：发放/导入两时序、ever_issued永久保护、库存/计划卡/下架积分；DB501-V5 |
| BE-V6 | AC-507/514：源pending优先、04:00边界、原签到保留、成长退役/恢复/已领奖不重发、Q01冲突和合法同身份门槛交换；DB501-V6 |
| BE-V7 | AC-508/509：双击/异指纹、末步错误、COMMIT成功丢响应、查询先于迟到提交、重启/DB不可达、窗口清理、取消不假回滚；DB501-V7 |
| BE-V8 | AC-501/502/503：固定KDF参数/随机性/错口令/篡改tag、跨环境信封重加密、body/包/深度/内存限制与并发2；DB角色拒读/写及窄函数、初始化Verify；DB501-V8 |

产品逐项追踪：

| 产品验收 | 当前合同 / 未来验证 |
|---|---|
| AC-501 | API501-00鉴权及BE501-03秘密边界 / BE-V1 |
| AC-502 | FILE501、API-501全量无Key或显式加密 / BE-V1、BE-V8 |
| AC-503 | FILE501/502严格格式、身份和解密 / BE-V2、BE-V8 |
| AC-504 | API-502逐项预览、BE501-02完整替换 / BE-V3 |
| AC-505 | FILE502固定四计划与接受快照 / BE-V4 |
| AC-506 | FILE502道具历史/类型保护 / BE-V5 |
| AC-507 | BE501-06成长退役与签到目标日 / BE-V6 |
| AC-508 | BE501-04基线/历史指纹、单tx和重复ID / BE-V3、BE-V7 |
| AC-509 | API-504串行判定及unknown / BE-V7 |
| AC-510 | 每连接本包Key、无补填/探测 / BE-V2 |
| AC-511 | API-502依赖定位及无联动 / BE-V3 |
| AC-512 | FILE502稳定身份、不复制运行数据 / BE-V1、BE-V3 |
| AC-513 | FILE502逐字段presence/null/0/false/集合 / BE-V2 |
| AC-514 | FILE502可选清空/名称推导/pending来源 / BE-V2、BE-V6 |

本轮仅文档/链接/追踪/六份hash和canonical旧正文逐字保留静态检查，见[check.json](evidence/backend/check.json)。未执行Go/前端测试、DB/迁移、密码实验或真实provider；所有BE-V/DB501-V均未验证，静态PASS不是AC通过。QA仅功能/实现，不评文章质量/模型审稿漏判。

下一步按[交接](../../handoffs/config-portability-backend.md)审阅本稿，批准后交frontend-bob完成TECH-503；实现和隔离验证须依原阶段门禁。CR313保持open，UI32发音待审，M002未收尾；保留CR039-L1/CR042-L1/AI-QUALITY-90/W01/QA26-MINIMAX原状态。
