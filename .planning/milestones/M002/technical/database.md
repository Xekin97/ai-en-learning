## CR029-F05 服务商原位编辑（当前）

DATA007/008 的 ai_providers ID 为稳定服务商身份；新增0016将显示名称唯一约束从全平台改为服务商内，并添加 update_provider_credential SECURITY DEFINER函数，密钥密文原位upsert，app仅EXECUTE、ai只SELECT、PUBLIC无权限。既有0015不改，迁移不更新业务行。URL/协议修改无新Key拒绝，保留Key时不触碰密文。连接名/协议/地址更新与旗下模型新增修改在同一配置锁/CAS事务中，服务商和模型UUID不变，引用无需重建。

聚合保存必须包含所有未下架原模型，禁止借省略行隐式移除；未知/别家modelUUID拒绝。模型最终ID集合先校验唯一；如互换ID，事务内临时唯一标识后写最终值，不对外可见。下架模型的历史引用仍保留，原移除影响接口独立。查询同一共享配置锁读取服务商与全部活跃配置模型，不受旧20条模型分页截断。保存整个聚合失败含连接/密钥全量回滚。

0016前本地3302私有pg_dump备份、隔离恢复和迁移演练；核对全部业务表摘要不变，新应用启动失败且尚无业务写入时可撤销0016函数/索引/账本后恢复旧二进制；新版本使用后优先前滚修复，旧二进制会严格检查迁移账本，不能直接带0016回退。角色权限、稳定身份、计划/卡引用、CAS、Key留空/换址保护、原子回滚均需隔离DB测试。未授权生产部署不执行。

# CR029 · 通用模型数据库设计（当前模型部分）

本节替代下方历史方案中 DATA-007/008 的单全局凭据假设；其他业务数据规则继续有效。输入 PRODUCT-06、UI29、D2-90–92，授权092/094。

- 0015 新建 ai_providers：UUID、name、protocol（三枚举）、base_url、credential_configured、masked_hint、created_at。连接配置一经引用不原地修改；编辑模型的连接字段时复制新连接，其他模型不受影响。显式选择已有连接才复用。
- ai_provider_credentials：provider_id 主外键、密文/nonce/key_version/fingerprint、操作者、更新时间。AI角色读；app不能读，只可通过有限definer函数写加密值或在连接之间复制；PUBLIC无权。沿用当前信封加密，不存明文。
- ai_models 新增 provider_id（非空FK）、max_output_tokens（可空正整数，Anthropic为空采用请求级4096，不声称模型元数据）、output_mode（prompt/json_schema，旧模型json_schema，新模型prompt）。唯一范围改成(provider_id,provider_model_id)，保留显示名称唯一约束。模型UUID、启停/下架、计划/卡/预设/历史FK不变。
- 迁移复制既有加密数据到统一表；保留仅面向旧初始化工具的受限视图/凭据函数入口，运行时和新管理界面不使用全局配置。旧服务baseURL来自原部署配置，首次新服务启动在迁移标记下补齐一次，此后编辑不会被环境覆盖。
- 保存模型/新连接/加密凭据/配置revision同一app事务，配置行先锁，CAS冲突全部回滚；新连接保存不发网络请求。启用/测试分开，新建默认停用；管理员可显式启用，保存/启用均不自动付费请求。
- 生成预检在配置共享锁内绑定不可变连接及模型ID、解密密钥到私有内存快照，提交扣额后全过程沿用；不把密钥写入run/json/trace。缺失密钥预检失败不扣额。
- 下架继续既有软删除流程和退款资格，不级联删除连接/历史。移除最后模型后的连接可继续复用，不新增自动清理需求。

验证：从0014旧数据迁移，UUID/权限关系/密文解密保持；多服务同名模型；失败保存全回滚；app拒读密文、AI无个人资料访问；配置并发冲突；备份后本地隔离库应用。生产发布/恢复不在本轮执行。

---

---
milestone: M002
stage: technical-design
role: dba/base
agent_name: dba-diana
version: M002-DB-03
status: awaiting_user_review
date: 2026-09-20
input_product: M002-PRODUCT-03
input_design: M002-UI-22-H01
revision_scope: M002-CR-004
previous_approved_version: M002-DB-02
open_questions: []
---

## CR026 / DB04 一次提醒配置

DATA205/CAP210：platform_notices新增remind_once boolean NOT NULL DEFAULT false；迁移0014仅加列，既有记录false，不修改发布顺序/索引/权限。保留配置锁与revision整份更新。无服务端账号提醒表。先迁移再启动新后端；回退应用可保留列，避免删数据。只在隔离测试库验证，不应用到3302 UAT库。

# M002 数据库方案

## 1. 当前范围、确认与依据

当前角色激活依据为 [TRANSITION-M002-013](../reviews/frontend-reception-rework.md)，仅接收 [M002-CR-004](../changes/CR-004.md) 的成就说明存储和成长表单事务边界。产品以 [PRODUCT-03](../product/overview.md) / [006 批准](../reviews/product-title-revision.md)为准；设计以 [UI22 验收](../reviews/uiux-design.md)及 [H01 交接](../handoffs/uiux.md)为准。DB-02 的 [011 批准](../reviews/database-revision.md)与[原件快照](./evidence/M002-DB-02.tar.gz)、BE-02 的 [012 批准](../reviews/backend-design.md)保持；FE-01 是本轮缺口输入，并未获完整接收批准。本 DB-03 是待审修订，不能沿用旧版本审批。上游正文的历史待审措辞不覆盖后续正式批准。

本稿是二期数据库设计建议，不是已执行迁移。数据库、接口、界面、部署均未改动。继承一期有效数据和权限；二期对复习、成长、临时权益及预设的替代在本文明确映射，不要求接收者把一期所有历史稿重新拼起来。DB-03 仅补齐 FE2-G01 的可空双语说明及 FE2-G02 的一次保存原子性、约束和验证；FE2-G03 管理员生成选项由 backend-alex 补严格接口契约，无新增存储需求。CR-003 已由 012 关闭设计接收，相关 DB2-V17–19 仍待实施验证。

### 1.1 需求确认记录

| ID / 状态 | 理解、依据与边界 |
|---|---|
| DB2-C01 / CONFIRMED | [D2-18/25/43](../decisions/product-decisions.md)：掌握按用户与稳定原词去重；成长不回填一期；批次删除保留累计成长；提交后的逐题答案只在当次显示。不是删除已有批次或一期统计的授权。 |
| DB2-C02 / CONFIRMED | D2-41/49/51/52/56/59/60/63–75：配置历史效力、手动领奖、四类道具、逐模型加时、下架积分及降级资格，逐项按 CAP-211–217；不使用原型示例值作为运营种子。 |
| DB2-C03 / CONFIRMED | D2-22 与产品时间表：学习日为北京时间 04:00；日期范围复习仍按浏览器本地日期；额度仍是滚动 24 小时。三个时间口径分别存储和查询。 |
| DB2-C04 / CONFIRMED | D2-62/81/82：保留旧批次，私人标题可编辑；预设单标题且无说明；草稿、成功预览、发布版本分离；私人标题不继承公开标题。 |
| DB2-C05 / CONFIRMED | [USER-COMPAT-001](../../M001/reviews/first-release-compatibility-policy.md)：不自动建设旧客户端、旧 API、旧镜像混跑兼容层。已确认保留的现有业务数据转换是本期需求，不等于批准旧协议兼容。禁止复用 CR-040 一次性清库授权。 |
| DB2-C06 / CONFIRMED | [USER-CLAIM-DELETE-001](../../M001/reviews/claimed-batch-delete-retention-exception.md)：本人删除批次时，同事务删除对应 consumed claim；其他 consumed claim 仍保留 24 小时；不建可恢复墓碑。 |
| DB2-Q01 / CORRECTED | 用户指出“我不记得我有跨设备保留草稿的需求”。撤销 DBA 提出的跨设备扩展；原需求只有 CAP-204 中断恢复。当前技术建议收敛为同一浏览器保存未提交草稿；不在 PostgreSQL 建逐题答案草稿表，不承诺换设备恢复。具体本机生命周期见 §5。此纠正不撤销恢复确认。 |
| DB2-Q02 / CONFIRMED | 2026-09-20 用户明确“采用基础与体验分别记账”，对应 Pro 体验已用 8 次、管理员改基础为 Pro 的完整示例：重置后使用基础余额，体验原用量/到期保持，日后切回体验 Pro 仍沿用体验用量。额度键与重置见 §8，不再询问同一口径。 |
| DB2-Q03 / CONFIRMED | 2026-09-20 用户对独立留存问题选择“90 天（推荐）”：监控访问及分析明细保留 90 天，之后只保留不含个人标识的汇总；不采集短文正文/复习答案，注销立即清除关联个人数据。与草稿恢复无依赖。 |
| DB2-R07 / CONFIRMED | CR-003 第 1 项，011 批准 / 012 接收；CAP-020 / DATA-014/202：新增 submitted 的 `has_unanswered` 最小事实，承接旧 skip_count>0；进度看首次提交，成功/未成功/跳过概况看每批最新提交，累计成功次数仍看所有成功尝试。见 §5.1/5.3/5.4、DB2-V17。 |
| DB2-R08 / CONFIRMED | CR-003 第 2 项，011 批准 / 012 接收；UI22 范围替换交互 / DATA-014/201/202：旧范围置 abandoned，未提交 attempt 失效，已提交事实保留；与新范围建立同事务，不能假装完成或删除整场会话。见 §5.5、DB2-T14、DB2-V18。 |
| DB2-R09 / CONFIRMED | CR-003 第 3 项，011 批准 / 012 接收；UI22 adminMessages / DATA-205 / CAP-210：保存独立双语标题，至少一种语言标题和正文完整，整套回退；不引入个人已读关系。见 §4.3、DB2-V19。 |
| DB2-R10 / PROPOSED | FE2-G01；DATA-209 / CAP-214/217 / D2-54/76：成就说明用独立可空双语纯文本；缺当前语言回退另一语言，两种均空不显示说明；管理读写保留原始语言槽。名称与达成时称号快照不混用。见 §6.3、DB2-V20。 |
| DB2-R11 / PROPOSED | FE2-G02；DATA-206/208/209 / AC-217、UI22 一次保存：签到四值与首次掌握经验一次提交；等级或同类成就的多档变化集一次提交；最终全集校验、稳定 ID、共享配置锁和 revision，失败全部回滚。见 §6.4、DB2-T15/16、DB2-V21–23。 |

DB2-Q01 的跨设备扩展已撤下，DB2-Q02/03 已分别得到明确答复；本轮无新的待确认业务解释。DB2-R10/11 依据现有批准范围，有限修订已由 013 授权；具体数据库方案仍为 PROPOSED。CR-004 仅完成 DBA 方案部分，待批准及后端、前端接收，不能在此关闭。

### 1.2 实测事实与容量假设

源码基线 HEAD `5da571b226635113c41cd9cb8c4f33433946fbad`，本次工作区输入与保护摘要见 [DB-03 输入记录](./evidence/M002-DB-03-inputs.json)。没有连接运行数据库、读取凭据、统计真实用户量或调用模型。

| 分类 | 结论 |
|---|---|
| FACT | [0001–0007 迁移](../../../../backend/db/migrations/)定义 23 张表，包含迁移账本；使用 PostgreSQL 18、`wordweave` schema、Go/pgx/sqlc。迁移逐文件单事务，不能把多文件链声称为一个原子事务。 |
| FACT | [固定词表](../../../../backend/assets/vocabulary/english-words.json)实际 13,860 项、144,527 字节；SHA-256 `de75e77fdff529b4e6726730c80c11415abbce215ec7852a6c4a670b061dea75`。 |
| FACT | `review_results` 只有成功、错误数、跳过数及阶段完成汇总，并未保存逐题答案；`UNIQUE(session_id,batch_id)` 不支持一个会话批次多次重来。当前作答主要在进程内 attempt，二期需要持久未提交草稿。 |
| FACT | 现有额度查询只按账号和 `accounts.quota_reset_at` 计数；不能直接支持多计划体验、额外次数来源或管理员预览。`generation_runs` 当前 CHECK 强制用户请求占额，管理员预览不能直接塞入后假称免额。 |
| FACT | 批次完整性、Unicode code point 位置、原词释义 `entry_meaning` 已有约束；后台用户按精确匹配优先再用户名/ID 分页。保留这些实现事实，不借二期修改词表和生成内容。 |
| FACT | UI22 `operations.js` 的 `content` 独立编辑 title/description/honor；`settings-save` 对签到五值或多档表格只保存一次。BE-02 API-206 仍拆成多个写调用；M001 迁移尚无 `achievement_tiers`，不能把 DB-02 设计文档当作已上线表结构。 |
| INFERRED | 用户数、峰值并发、保存年限内流量与数据库磁盘量未知。按现有单应用、单写 PostgreSQL 设计；表数量由数据生命周期决定，不按虚构百万日活引入分区、分片或新队列。 |

### 1.3 选型比较

| 方向 | 收益与代价 | 结论 |
|---|---|---|
| 现有 PostgreSQL：关系表记录约束/流水，JSONB 只承载完整配置和生成快照 | 复用权限、迁移和备份；跨积分、库存、掌握、签到可同事务；需要明确锁顺序 | 推荐，继承已确认单库；本期不更换版本主线或新增数据库服务 |
| 把用户成长/道具全部塞进一个 JSONB | 初期表少，但无法清晰约束每词、每奖励、每卡来源唯一性，多个写路径争抢同文档 | 不采用 |
| 增加 Redis、事件总线或分析仓库 | 需要跨存储一致性、恢复和删除传播；当前无负载证据 | 不纳入本期；先用实际查询和锁数据判断 |
| 成长配置一次保存：领域变化集 + 单库事务 | 可校验修改后的完整规则，并与领奖共用现有配置锁；后端需补对应命令与错误定位 | 采用；复用现有表，不增加通用批处理/配置 JSON 平台。逐行 HTTP 保存及客户端补偿不能满足 AC-217 的整体失败保证 |

PostgreSQL 外键、唯一约束与行锁作为实现基础；跨行奖励金额或等级门槛不能伪装成单行 CHECK。[约束文档](https://www.postgresql.org/docs/18/ddl-constraints.html)、[锁文档](https://www.postgresql.org/docs/18/explicit-locking.html)

## 2. 全量产品数据映射

名称是建议的生产表名；全部位于 `wordweave`。保留不变的列、约束和索引以既有迁移为准确来源；下文只对本期增改完整列出。`owner_id` 总是来自认证主体，不能信任客户端指定。

| DATA | 二期物理去向与处理 | CAP |
|---|---|---|
| DATA-001 | 保留 `vocabulary_snapshots` 和冻结词表，当前唯一选词快照 | CAP-006/008 |
| DATA-002 | 保留 `vocabulary_entries`；新增指向稳定 `lexemes` 的成员关系 | CAP-006/013/208 |
| DATA-003 | 保留 `accounts`、密码、角色、基础组；扩展资料/时间 | CAP-002–005/104–106/209 |
| DATA-004 | `account_sessions` 原生命周期不变，登录时间单独记录 | CAP-003/004/106 |
| DATA-005 | `visitor_identities` 原额度身份保留；分析标识不延长其计量留存 | CAP-007–011/219 |
| DATA-006 | 四个 `entitlement_groups`、`group_models`、`group_lengths` 保留；新增唯一优先级 | CAP-007/103/105/216 |
| DATA-007 | `openrouter_credentials` 原加密与最小权限不变 | CAP-101 |
| DATA-008 | `ai_models` 增正式移除时间；计划引用解除，历史身份保留 | CAP-102/205 |
| DATA-009 | `generation_runs` 保留；新增 `generation_charges` 记录实际扣额来源；预览另表 | CAP-008/009/105/216/219 |
| DATA-010 | 原请求/词条表保留，增加普通/预设入口与固定配置版本来源 | CAP-008/218 |
| DATA-011 | 原 `generation_drafts` 保留，仍只存完整有效结果，TTL 不套用复习草稿 | CAP-008–011 |
| DATA-012 | `learning_batches` 加 `title`、`title_revision`，旧标题按输入顺序回填 | CAP-010/012/014–017/022/107/220 |
| DATA-013 | `batch_targets`、`hint_occurrences`、`passage_occurrences` 保留完整资源和全部位置 | CAP-010/014/201–203 |
| DATA-014 | 三张 `review_session*` 保留范围/单批模式及固定随机顺序；加批次进度 | CAP-017/020/022/204 |
| DATA-015 | 替代索引；原最小结果迁至 `review_attempts`，不建历史答案库 | CAP-018/019/020/203 |
| DATA-016 | 原六项库统计仍从原计量、当前库和关联最小复习事实派生；不混入成长计数 | CAP-012 |
| DATA-017 | 原 `visitor_claims`；保存/成长认领同事务；主动删除例外保持 | CAP-011/016/211 |
| DATA-018 | 原 `accounts.ui_locale`；访客语言仍是浏览器设置 | CAP-021 |
| DATA-201 | 当前浏览器 IndexedDB，仅未提交；关联服务端 `review_attempts`，不入 PostgreSQL | CAP-201/202/204 |
| DATA-202 | `review_attempts` 最小开始/完成/成功事实；答题内容不入此表 | CAP-203/213/219 |
| DATA-203 | `lexemes`、`user_masteries`；现有词条表承担当前词表成员关系 | CAP-208/213 |
| DATA-204 | `accounts` 资料与两个时间；旧未知学习时间保持 NULL | CAP-209 |
| DATA-205 | `platform_notices`，无账号已读关系 | CAP-210 |
| DATA-206 | `growth_settings`、`checkin_rules`、`user_checkins` | CAP-211/212/217 |
| DATA-207 | `growth_balances`、`growth_settlements`、`growth_ledger` | CAP-211–217 |
| DATA-208 | `user_growth`、`user_learning_days`、`growth_levels`、`level_awards` | CAP-213/214/217 |
| DATA-209 | `achievement_tiers`、`achievement_awards`；称号在达成时快照 | CAP-214/217 |
| DATA-210 | `item_definitions`、定义模型关系、`user_items`、发放模型关系；实际发放和退换结算 | CAP-212/215/217 |
| DATA-211 | `plan_trials`、`model_time_contributions`、`extra_credit_balances`、`generation_charges`；额度按 DB2-Q02 分基础/体验来源 | CAP-205/216 |
| DATA-212 | `presets`、`preset_versions`、版本词条关系、`preset_previews`；公开/草稿原子切换 | CAP-207/218 |
| DATA-213 | `traffic_sessions`、`analytics_events`、`analytics_daily`、复习队列匿名汇总；个人分析明细按 DB2-Q03 保留 90 天 | CAP-219 |
| DATA-214 | `preset_preview_runs` 与调用用量明细；无账号扣额或成长 | CAP-218/219 |

CAP-001/206/207 的纯导航、动效、1440px 和 toast 不额外建表；CAP-018/019 旧交互由 CAP-201–203 替代。所有 49 个能力有数据映射或明确无存储变更，不把 UI 状态持久化为新产品资产。

## 3. 公共约束与时间

- 新业务 ID 用现有 `uuidv7()`，词汇用 bigint identity；时间用 `timestamptz`，学习日用 `date`。积分/经验/累计次数用 bigint 非负整数；积分流水可正可负，经验不得负。金额只用于可取得的提供方成本，以 numeric 和币种保存；未知 NULL，不当零费用。
- 新的个人父表提供 `UNIQUE(owner_id,id)`；个人子关系尽量用复合 FK 防止错挂账号，账号 FK 为 `ON DELETE CASCADE`。平台定义 FK 为 RESTRICT；平台操作者 `updated_by` 可 `SET NULL`，不保留注销后的用户名副本。无本人权限的管理员不能借 DB 路径编辑学习内容。
- 通用文案使用 `name_zh/name_en` 或 `body_zh/body_en`，至少一种非空；缺译回退由后端/前端投影，数据库不自动翻译。标题单个 text、不唯一、不保存历史。暂不加入未获批准的全平台短文/词数最大长度。
- 长度、场景、释义语言沿用原枚举；模型原始 provider ID 不进入用户投影。数量/期限必须为正，价格、奖励、下架积分非负；启用期限与体验时长使用正整数秒，配置界面单位转换由后端明确，时长一天等于 24 小时。
- 同一事务取一次服务端时间作为业务判定时刻；学习日 `((business_at AT TIME ZONE 'Asia/Shanghai') - interval '4 hours')::date`。04:00 配置生效、补签窗口、欢迎天数用该表达式；滚动额度比较真实时间；日期范围会话用其记录的浏览器时区算 UTC 首尾边界。[时间函数](https://www.postgresql.org/docs/18/functions-datetime.html)
- `growth_settings` 单例记录 `activated_at`、首次掌握经验、当前规则修订号；启用时间由正式发布步骤写入一次，不能在每次服务器启动覆盖。任何二期成长事件必须 `occurred_at >= activated_at`，补签不得早于启用学习日或注册学习日。
- 积分/经验不使用浮点。参数溢出拒绝提交，不截断或负数回绕。跨记录规则用事务校验、唯一/FK 和必要延迟约束触发器，不依赖只在 UI 隐藏字段。

## 4. 账号、词汇、内容与消息

### 4.1 继承表扩展

| 表 | 新增/改变列、约束 | 查询与索引 |
|---|---|---|
| `accounts` | `nickname text NULL`（空白归 NULL）、`gender text NULL`（已设计 female/male，未填 NULL）、`last_login_at timestamptz NULL`、`last_learning_at timestamptz NULL`；不推测旧未知值 | 原用户名唯一及后台分页保持，不为昵称增加用户搜索 |
| `learning_batches` | `title text NOT NULL CHECK(btrim(title)<>'')`、`title_revision bigint NOT NULL DEFAULT 1 CHECK(>0)`；回填 `string_agg(source_entry_snapshot,' · ' ORDER BY input_order)` | 仍按 `(owner_id,saved_at,id)` 分页和目标词搜索；标题不建全文/唯一索引 |
| `ai_models` | `retired_at timestamptz NULL`；正式移除时置值、enabled=false、删 `group_models`；保留 id 和历史引用 | 新选择统一 `enabled AND retired_at IS NULL`；移除后的名称/provider 唯一约束改为仅未移除行唯一，允许新建同一 provider 为新身份 |
| `entitlement_groups` | `priority integer NOT NULL UNIQUE DEFERRABLE INITIALLY IMMEDIATE`；整体交换排序可事务内延迟检查，原固定 code/不创建删除限制不变 | 四行直接读取，优先级设置的初始值待运营配置；相对关系须明确不靠 code 字典序 |

正式移除是卡片“因下架失效”的事件。暂时供应商故障不改模型目录；管理台启用/停用仍不等于删除。停用期间阻止新调用，恢复启用保持原身份和计时；正式移除身份不可重新变为可调用，新建模型不迁移旧卡。这一生命周期技术表达须交 backend-alex 对照模型 UI，不能把所有 `enabled=false` 一概算作退积分。

`last_login_at` 只在明确认证成功更新；读取旧 `last_learning_at` 生成欢迎反馈后，承接成功的学习事件再按确认规则更新。学习时间单调取 max；历史未知不写注册时间或 NULL→当前时间来伪造学习。性别值若 UI 当前文件与本文不一致，优先回设计核对，不能增加必填项。

### 4.2 稳定原词与当前库成员

- `lexemes(id bigint identity PK, canonical_entry text NOT NULL UNIQUE)`，canonical 为当前词表的小写精确词条，保留内部空格、撇号和多词结构；不做 stemming、词形还原或把不同词义分裂为多个掌握身份。
- `vocabulary_entries.lexeme_id bigint NOT NULL FK lexemes RESTRICT`，新增 `(snapshot_id,lexeme_id)` 唯一。当前 13,860 条逐一映射，原 id、词条、source_order、snapshot 不变；未来词表成员仍指同一个 lexeme。此期不新增考试库、分类运营或导入界面。
- `user_masteries(owner_id,lexeme_id,mastered_at,settlement_id)`，PK `(owner_id,lexeme_id)`；账号级联，lexeme RESTRICT，结算同所有者 FK。没有 batch_id 或正文快照，不会因批次删除丢失。
- 首次掌握用 `INSERT ... ON CONFLICT DO NOTHING RETURNING lexeme_id`，只对实际插入行发经验、加累计。原词不同派生形式仍只映射一次。
- 随机查询从当前 snapshot 中排除请求已选 lexeme，再用 `NOT EXISTS` 当前 `batch_targets JOIN vocabulary_entries` 按 owner/lexeme 排除已收录；**不查 user_masteries 作为排除条件**。在当前 13,860 规模先对过滤集合 `ORDER BY random() LIMIT 1`，测 EXPLAIN 后再决定优化；不先随机再截出无候选，不泄漏其他账号库状态。

### 4.3 平台通知

`platform_notices(id PK, title_zh text NULL, title_en text NULL, body_zh text NULL, body_en text NULL, visible boolean NOT NULL DEFAULT false, remind boolean NOT NULL DEFAULT false, published_at timestamptz NOT NULL, updated_at, revision bigint, updated_by NULL)`。标题是独立纯文本，正文保存管理员输入的 Markdown；不能取正文首行代替标题。空白字段规范为 NULL，正文非空时保留原排版。DB CHECK 要求至少一套同语言非空标题和正文：`COALESCE((btrim(title_zh)<>'' AND btrim(body_zh)<>''),false) OR COALESCE((btrim(title_en)<>'' AND btrim(body_en)<>''),false)`，显式消除 NULL 导致检查放行的问题。

另一语言只有标题或只有正文时可保留编辑输入，但不能投影为可用翻译；先选当前界面语言的完整对，否则整套回退至另一语言。中标题+英正文不能满足保存约束，不在同一消息中混用两种语言。`visible=false,remind=true` 合法但不能投影给用户。

可见列表索引 `(remind DESC,published_at DESC,id ASC) WHERE visible`；末位方向与 BE-01 API-205 稳定翻页一致，提醒仍从同一条件筛 `remind=true`。published_at 在首次创建时固定，编辑内容或开关不改变发布排序时间。后台编辑整份标题/正文/开关用 revision 乐观校验，原子更新；安全 Markdown 清洗、字段大小限制、HTTP 契约归后端架构。没有 `notice_reads`、个人收信表或“本次登录已提醒”数据库状态；刷新与续期不触发弹窗由认证事件和前端会话编排完成。

## 5. 复习草稿与最小结算事实

### 5.1 表、关系与状态

| 对象 | 字段与约束 |
|---|---|
| `review_sessions` 扩展 | status 为 in_progress/completed/abandoned；原完成一致性 CHECK 改为 `in_progress AND completed_at IS NULL` 或 `completed AND completed_at IS NOT NULL` 或 `abandoned AND mode='range' AND completed_at IS NULL`；保留原模式字段 CHECK、owner FK、固定顺序关系；abandoned 不等于 completed |
| `review_session_batches` 扩展 | `first_submitted_at NULL`、`progress_status NOT NULL` 为 pending/completed；CHECK 限定 pending 且首次时间 NULL，或 completed 且首次时间非空；第一份提交确定已完成，不被“重来”撤销；单批/范围模式、固定批次序继续保留 |
| `review_attempts` 新真源 | `id PK, owner_id,session_id,batch_id,attempt_no int>0,revision bigint>0, origin='m002'或'm001', started_at NULL, submitted_at NULL, state=draft/submitted/restarted, successful NULL/bool, has_answer NULL/bool, has_unanswered NULL/bool`；`UNIQUE(session_id,batch_id,attempt_no)`、`UNIQUE(owner_id,id)`；复合 FK 指同所有者 session/batch，并以 `(session_id,batch_id)` FK 指会话批次关系，级联删除；状态列非空与一致性见下表 |
| 活跃唯一性与概况索引 | 原 active range/single 部分唯一条件仍仅 status='in_progress'，不把 abandoned 算作活跃；每个 session 最多一个 draft：部分唯一 `(session_id) WHERE state='draft'`；两个不同模式可各有草稿；`(owner_id,batch_id,submitted_at)` 支持库汇总；新增 `(session_id,batch_id,attempt_no DESC) INCLUDE(successful,has_unanswered) WHERE state='submitted'` 支持每批最新概况 |
| DATA-201 本机草稿（非数据库表） | IndexedDB 以 `(authenticated_account_id,session_id,attempt_id)` 为键，值为本地 revision、stage、word_position、word_answers、passage_answers、updated_at；不存标准答案。服务器仅保留最小 attempt 状态和固定题序，换设备只能看到未完成安排，不能恢复本机答案 |

`has_answer` 表示最终任一输入非空，`has_unanswered` 表示最终任一题仍为空，二者不互为取反；单词题及短文每个空均参加判定，以服务端完整题集及缺键补空后的输入计算，不相信客户端布尔值。不新增具体空题号、错误词、答案摘要或历史对照。

| attempt 状态 | 单行 CHECK / 非空约束 |
|---|---|
| draft / restarted | origin 必须 m002，started_at 非空；submitted_at、successful、has_answer、has_unanswered 全部 NULL；restarted 表示未提交尝试已失效，可由本人重来或范围替换产生，不能再提交或恢复 |
| submitted / m002 | started_at、submitted_at、successful、has_answer、has_unanswered 全部非空；successful=true 必须 has_answer=true 且 has_unanswered=false；has_answer=false 必须 has_unanswered=true 且 successful=false |
| submitted / m001 | submitted_at、successful、has_unanswered 非空；started_at / has_answer 保留未知 NULL；successful=true 必须 has_unanswered=false，不从旧错误数猜测答案是否非空 |

以上每个分支显式检查 `IS NULL` / `IS NOT NULL`，不依赖可为 UNKNOWN 的 CHECK 自动拒绝。会话已 completed/abandoned 时不能留 draft，属于跨表不变量，由同一账号锁下的会话/attempt 仓储事务维护并验证，不能写成引用别行的普通 CHECK。复合 FK、部分唯一及单行状态 CHECK 继续兜底。

单词答案由目标题 ID 对应输入顺序；短文答案按 occurrence ID 对应每一个空，不能同词共用一个答案。客户端使用不可逆 attempt 范围题目 ID；服务端内部映射到真实 target/occurrence，提交时检查所有键来自本次题集，缺答统一为空，不接受别人的 target。本机草稿仅容纳用户输入和导航，不保存标准答案、正确性、完整短文或副本日志；清理不依赖新增数据库任务。后端复原同一 attempt 的匿名题目映射须稳定（如已有能力密钥派生），不能把真实目标 ID 暴露给客户端。

### 5.2 提交、重试与恢复

1. 开始当前批次时，账号锁后检查会话可写/批次存在，建立唯一 draft attempt，记录真实 start；恢复同一 attempt 不记第二个开始。随机序来自 session 关系表，不能每次恢复洗牌。
2. 当前浏览器用 IndexedDB 事务比较本地 revision、替换草稿；多标签页冲突提示重新载入，不做静默覆盖。刷新/离开再回到同账号可询问恢复；清浏览器数据后不可恢复，换浏览器/设备无草稿同步。草稿写入频率、存储失败提示由 frontend-bob 明确；持久层无逐键击历史。
3. 提交使用 attempt_id 作为逻辑结算键，携带当前本机完整最终答案和服务端 attempt 状态版本；先锁账号、session、attempt，检查状态/所有权，再在服务端对原词与每个 surface 忽略首尾空白/大小写比较。全空可提交为完成但不活跃；任一空白/错误不能成功。
4. 同事务写最小 submitted 事实（包括服务端算出的 has_answer / has_unanswered）、更新首次提交进度，成功时写掌握/成长/每日成功记录，并写分析结算事实。attempt.revision 同时递增，旧提交/重来状态版本不能复用。提交确定成功后客户端删除本机草稿；若响应丢失，重入先取服务端 attempt 状态，已提交就清理本机残留且不当未提交恢复。答题原文不写入 `review_attempts`、通用幂等响应、日志或分析；当次响应由事务内已读取的输入和标准内容计算后返回，HTTP 层需禁止缓存。
5. 重复提交已 submitted 的 attempt，只返回“已完成”的最小事实及可前进状态，不再发成长，也不从历史恢复答题对照。响应丢失后，客户端仍有当次输入时可保留当次显示；页面离开/重载后不承诺恢复标准对照。不能为网络重试把整个结果塞进数据库 idempotency payload。
6. 未提交重来：服务端原 attempt 标 restarted、新建 attempt_no+1，成功后客户端删除对应本机草稿；已提交整批重来：旧最小事实保持，显式建立新 attempt。完成的 session 如需在总结页立即重来，必须先检查不存在冲突的活跃同模式 session，再同事务改为 in_progress、清 completed_at 并建立新 draft，沿用固定顺序；不允许绕过原活跃唯一约束，abandoned 不适用此重新打开分支。后端须明确总结后“重来”与会话最终完成动作的接口状态边界，DB 不默默重排下一批。
7. 批次/账号删除或旧页面提交均由所有者/FK/状态拒绝，不 upsert 重建已删 batch。提交与删除同账号串行；先提交后删除保留成长，先删除则提交失败且无成长。本人明确重来、提交确定完成、删除批次/注销成功清本机对应草稿；账号切换不能读取别人的键，退出应清可见内存与认证数据，本机未提交草稿继续隔离到原账号。恢复前先请求验证所有权和 attempt 状态，已删/重来/已提交残留立即清除。离线浏览器中已有副本无法由服务器远程即时擦除，不能宣称物理同步删除；在线再次打开时先验证再展示。无需额外 30 天 TTL，不承诺浏览器不会自行回收本地存储。

### 5.3 一期事实承接

迁移每条旧 `review_results` 为 `origin=m001` 的 submitted attempt，保留 owner、session、batch、completed_at（映射 submitted_at）、successful 和原结果 id；`attempt_no=1`，历史真实开始和 has_answer 未知则 NULL，`has_unanswered=(skip_count>0)`。不保留具体 error_count/skip_count，但必须先承接是否有未答题，不能直接丢弃 CAP-020 的跳过概况。数据库从未存逐题答案，不能在迁移说明中虚构要删除的答案列。

旧成功次数和当前至少成功一次的批次数通过迁移后的最小事实得到相同结果；不据旧成功插入 user_masteries/积分/经验/二期签到。原六项复习库统计与成长累计各用自己的来源，不因搜索过滤统计，不把一期生成中的取消算作二期有效生成。旧表停止写入、核对后在正式迁移中替换；是否移除旧汇总列不影响保留最小成功事实和用户原统计。

### 5.4 完成概况的读取边界

以本会话仍存在的 `review_session_batches` 为全集：total 为其数量；completed 来自 first_submitted_at 非空（且 progress_status=completed），首次提交时间用 COALESCE 保持，不因重来回退。每批选 `state='submitted'` 中 attempt_no 最大的一条，计算 successful、unsuccessful 和 has_unanswered=true 的 skipped 批次数；时间相同时仍由唯一 attempt_no 确定，不用提交时间排序猜测。未提交批次不进入这些计数。

必须满足 `successful+unsuccessful=completed<=total`、`skipped<=unsuccessful`；skipped 是未成功批次的子集，不额外加到总数。重来处于 draft 时仍显示该批上次最小提交事实；新提交后概况才更新。仅保留布尔事实不构成最近一次逐题结果回看。原库成功复习次数和二期累计成功复习仍各按所有适用 submitted 成功事实结算/汇总，不能用概况的最新一条取代累计。

例：4 批中 1 批未做、1 批全对、1 批全填但有错、1 批留空，概况为完成 3 / 成功 1 / 未成功 2 / 包含跳过 1。最后一批重来未交时不变；全对提交后为 3 / 2 / 1 / 0，旧提交及既有成长不被删除。读取关系与最新事实使用一个 SQL 语句快照，避免并发提交期间拼出不相等的总数。

### 5.5 确认替换未完成日期范围

按 §11 锁顺序，在同一账号锁事务中核验用户确认、旧范围所有权/in_progress 状态及后端提供的期望会话版本；读取新范围当前有效批次并固定顺序。新范围为空、版本过期或条件失效时拒绝，保留原安排。

条件成立后，旧 draft 标 restarted 并 revision+1，清理条件仅针对该旧范围；旧 session 置 abandoned，completed_at 保持 NULL，updated_at 记录本次变更，再创建新 session 及批次/题序关系。释放旧 active 唯一占位与新建属于同一事务，任一步失败全部回滚；不另增结束表、替换流水或可恢复答案。旧已提交 attempt、首次提交进度、学习/成长事实保持，单批会话不变。

abandoned 是终态，不允许 start/submit/restart，也不能恢复为 in_progress；旧页面即使仍有本机答案也须先校验，失败后清旧草稿。已提交的只读最小收据可查，不构成旧会话可继续写入。所有写入口先查 session 状态再处理 attempt 重试。并发提交与替换使用同一账号锁：提交先完成则替换的旧版本失效并要求刷新；替换先完成则旧提交拒绝，无成长结算。两次替换最多一次成功；成功响应丢失先读取当前活跃范围，不盲重放旧请求。

替换本身不写复习成功/完成分析事件、不发成长，也不把未提交批次算完成。保留原会话只为既有最小事实/统计，不增加历史会话展示产品。之后本人删除批次或注销，仍按 DB2-T12/13 清理相关关系和 attempt，不能以 abandoned 为由保留私有内容。

## 6. 成长账本、签到与手动奖励

### 6.1 个人结算与事实

| 表 | 关键字段 / 唯一性 / 生命周期 |
|---|---|
| `growth_balances` | `owner_id PK FK accounts CASCADE, points bigint>=0, experience bigint>=0, revision bigint>0`；余额是同事务投影，可对账，不允许后台直接覆盖 |
| `growth_settlements` | `id PK,owner_id,kind,source_key text,request_fingerprint bytea NULL,created_at,config_snapshot jsonb`；`UNIQUE(owner_id,kind,source_key)`；只保留奖励/消费的类型化来源和实际配置，不含短文或答案；账号删除级联 |
| `growth_ledger` | `id PK,owner_id,settlement_id,component_key,currency=points/experience,delta bigint<>0,balance_after bigint>=0,created_at`；同所有者结算 FK、`UNIQUE(settlement_id,component_key,currency)`；experience delta>0；points 负数仅 exchange，管理员 grant 只能正数 |
| `user_growth` | `owner_id PK,mastered_total,saved_total,successful_review_total,highest_checkin_streak,highest_review_streak` 均非负；`config_revision_seen` 支持配置重新判定；保留累计，不含 batch 内容/可逆源标识 |
| `user_learning_days` | PK `(owner_id,learning_day)`，`active bool,review_success bool,valid_generations int,review_submissions int,successful_reviews int,saved_count int` 非负；是成长与留存必需日事实；不存逐题/文章，可随账号删除；其分析用途受 DB2-Q03 边界约束，成长记录不是随意延长分析明细的借口 |
| `user_masteries` | §4.2 的唯一首次掌握事实；经验来自该次成功的实际插入词数 |

账本保留与删除批次解耦：结算 source_key 对个人成长只用独立随机业务事件 ID，不存被删 attempt/batch 的可恢复内容。仍在批次中的 attempt 可引用结算；删除 attempt 不反向删除结算。保存/提交服务以原领域状态先决和结算唯一键保证只执行一次；不得凭一个脱离所有者检查的裸 idempotency key 新建内容。

### 6.2 签到规则与补差

- `checkin_rules(id PK,effective_day date UNIQUE,base_points bigint>=0,step_points bigint>=0,cap_points bigint>=base_points,normal_experience bigint>=0,revision,updated_by NULL)`：生效后不可修改该历史行；管理员当天多次调整同一个未来生效日是更新尚未生效版本，按 revision 防覆盖。规则结构是当前已确认线性递增封顶的最小表达，不引入逐日任务或随机奖池。从下一学习日开始取 `max(effective_day <= target_day)`，不得回写历史。
- `user_checkins(owner_id,learning_day,kind=normal/makeup,rule_id,streak_at_last_settlement int>0,points_paid bigint>=0,normal_experience_paid bigint>=0,created_at)`，PK `(owner_id,learning_day)`；rule FK RESTRICT。补签的 normal_experience_paid 必须为 0。补签卡在其 `used_target_day` 指向该日；无需保留文章来源。
- 正常签到：有效生成完成结算中插入当日签到，冲突不再发；按 `min(base+(streak-1)*step,cap)` 算积分，经验取当日历史规则。与生成终态同事务，使重试或进程重启不产生“生成成功但奖励丢失”的半结算。
- 合格访客承接：锁 claim/run/account 后，比较生成 valid 完成的学习日与承接日，相同且启用后才认领签到；不制造第二次生成或新账号扣额。跨日仅收录/激活；游客事件与账号的关联不能重复增加全局有效生成篇数。
- 补签：确认目标在 `[today-30,today-1]`、不早于启用/注册学习日、未签到，且卡未过期；锁用户后一次插入签到并消耗一张卡。向前寻找连续段起点，向后重算直至第一个未签日或 today；不是只给目标日发积分。
- 各受影响日用各自 rule_id 算新的应得值；只发 `max(0,应得-points_paid)`，更新 paid 并记独立 ledger component（日期+本次补签结算）。历史补差不补 normal experience。并发补签串行，两次重新计算不会重复补同一差额。
- 连续签到最高纪录与当前连续长度分别算；补签不更改 user_learning_days.review_success 或成功复习连续天数。成就达成只生成待领/称号，不自动发奖励。

### 6.3 等级、成就和实际领取

| 表 | 字段与规则 |
|---|---|
| `growth_levels` | `id PK,level_no int UNIQUE,min_experience bigint NOT NULL CHECK(>=0),reward_enabled bool,points bigint>=0,item_definition_id NULL,item_count int,revision`；门槛唯一约束 `growth_levels_min_experience_unique UNIQUE(min_experience) DEFERRABLE INITIALLY IMMEDIATE`；累计门槛按 level_no 严格递增；最初等级 threshold=0，不生成升级奖励；item 引用/数量必须同时有效。等级身份及既有 level_no 不因编辑阈值改变 |
| `achievement_tiers` | `id PK,kind` 四枚举、`threshold bigint>0,enabled bool,name_zh/en,title_zh/en,description_zh text NULL,description_en text NULL,points,experience,item_definition_id NULL,item_count,revision`；`achievement_tiers_kind_threshold_unique UNIQUE(kind,threshold) DEFERRABLE INITIALLY IMMEDIATE`；名称/称号分别至少一种语言非空，说明两种均空合法；不提供任务类型扩展 |
| `level_awards` | PK `(owner_id,level_id)`，`achieved_at,claimed_at NULL,settlement_id NULL`；claimed 与 settlement 同时存在；记录首次达成和一次实际领取，不存可被 UI 直接相信的可领取布尔 |
| `achievement_awards` | PK `(owner_id,tier_id)`，`achieved_at,title_zh_snapshot,title_en_snapshot,claimed_at NULL,settlement_id NULL`；称号在达成时自动解锁，不能等积分领取才显示；已达成称号不被后续配置覆盖 |

**成就说明（DB2-R10）**：`description_zh/description_en` 是 DATA-209 的展示文案，非 Markdown、非名称、非称号，也不是新数据资产。写入统一将纯空白规范为 NULL；每列 CHECK 为 `description_zh IS NULL OR btrim(description_zh)<>''`（英文列同理），不设置“两列至少一个非空”的约束。管理读取返回实际两个语言槽，不能把中文回退值写入英文槽。学习者投影逐字段优先当前界面语言，缺译取另一语言；两列皆 NULL 返回无说明，由前端省略说明块，不生成文案或调用翻译。说明不与名称/称号要求成套语言；通知 §4.3 的标题正文整套回退仅适用通知。

说明按现行配置读取，编辑后新读取可见；达成/领取不会保存说明快照，不改既有 `title_*_snapshot`、达成时刻、积分经验和实际奖励。说明只在成就配置行保存，随既有配置权限、备份与生命周期处理；不增加搜索索引、个人说明表或历史说明库。后端需把该语义同时投影到管理读写与个人成就读取，字段长度上限/HTTP 字段名在后端契约统一明确，不由前端自行猜测。

等级当前值由当前经验+同一份现行门槛派生。改门槛可能降级，历史 award 行不删；当前级以下且启用、卡有效才能领取等级奖励。成就已达成后不因门槛提高撤销。奖品配置在**领取事务**读取并冻结到实际 settlement：积分、经验、卡全部成功或全部回滚。下架商城商品仍可发有效奖励；所有模型已不可用的模型卡则阻止整档领取。卡型、目标计划合法性按最新定义重新检查，未启用期限从实际发卡时起算。

配置更新不能等用户下次获得经验才重算：以配置 revision 标记，现有维护任务分批重算受影响账户；个人中心读取/领奖遇到旧 revision 必须同步完成该用户判定，故首次读取就看到当前等级与待领项。无新外部队列。后台批处理不自动发奖，只 upsert 唯一达成事实；跨级逐级建 award，满级经验继续累积，新增档/降低门槛按现有进度及历史最高连续记录判定。领取成就发经验引发升级，只建待领奖项，不递归自动发等级奖励。

### 6.4 成长表单的一次保存（DB2-R11）

事务单位对应 UI22 的一次确认保存：签到页五个值作为一组；等级表的多档新增/修改作为一组；当前一种成就类型的多档新增/修改作为一组。成就内容弹窗只改本次表格草稿，外层保存时与门槛、启用、奖励共同提交。不同页面或不同成就类型不拼成一个全平台事务；搜索/分页未出现的档位不视为删除。本段定义数据库用例，端点、请求 DTO、错误码与行定位字段由 backend-alex 接收，不沿用逐行调用模拟一次保存。

1. **锁与输入版本**：通过管理员鉴权后开启短事务，先对 `growth_settings` 单例 `FOR UPDATE`，在锁内比较期望的全局 revision。冲突整笔拒绝，不能取最新 revision 后自动覆盖。其他配置入口也必须遵守 §11.1；不得先锁用户再升级配置锁。拿到锁后取一次服务端业务时刻用于本次保存，后续不重复取时；等待跨过北京时间 04:00 时按拿锁后的学习日确定“下一学习日”，防止改到已经生效的签到历史行。
2. **签到五值**：在同一事务校验首次掌握经验及签到四值均为合法非负整数、cap>=base、bigint 范围。更新 `growth_settings` 的首次掌握经验，同时按 `effective_day=保存学习日+1` 新建或更新唯一 pending `checkin_rules`。该日已有未生效行则更新原行，不增加重复规则。首次掌握经验提交后用于后续首次掌握，不追补过去；签到四值仍到下一学习日生效。原生效规则、既有签到及已发经验不改；任一写入失败，两部分均回滚。
3. **多档最终集合**：锁内读取全部等级，或所选 kind 的全部成就档，将变化集合并到现有集合后一次校验。已有档必须以稳定 id 匹配；同请求重复 id、新档重复标识、未知 id、跨 kind 更新均拒绝。既有 level_no/kind 不可变，新等级接在末档之后；新增档生成新 id，未提交行保持，不能删后重建、按数组下标识别档位、隐式删除或把原 id 转成新奖励身份。支持第五档及更多，不固定四档上限。
4. **完整校验**：等级按 level_no 的累计门槛严格递增，初始门槛为 0 且无升级奖励；同类成就门槛正数且唯一。逐行校验名称/称号、可空说明、非负金额、奖励卡引用/数量及类型合法性，保留原奖励有效性规则；有效未上架卡可以引用。检查包括未修改和未显示的行，防止分页绕过门槛冲突。所有错误应在写入前汇集为能定位提交行/字段的结果；数据库约束失败仍整笔回滚。
5. **写入与约束**：只更新变化行、插入新增行，不动任何个人 award/settlement。门槛的两个命名 UNIQUE 约束可以在本事务内显式设为 DEFERRED，写完恢复 IMMEDIATE 强制验证，再提交；不延迟全部约束。例：等级门槛 `[0,100,200]→[0,200,300]` 的最终集合合法，不能因先更新中间档遇到旧 200 而失败。CHECK/NOT NULL 仍立即检查；跨行递增由配置锁内最终集合校验保证，不伪装成单行 CHECK。写已有行用主键 UPDATE、新行 INSERT，不拿这些延迟唯一约束作 `ON CONFLICT` 的冲突目标。该检查时序依据 [PostgreSQL SET CONSTRAINTS](https://www.postgresql.org/docs/18/sql-set-constraints.html)。
6. **提交与可见性**：每次接受的整组保存仅将全局 revision 加 1；变化行 revision 同步更新（已有加 1、新行为 1），未修改行不变。重算目标 revision 与游标重置按 §11.3 同事务登记，不能启动一个事务外任务后却没存配置。返回该事务内构造的完整页面配置及新 revision，确认 COMMIT 成功后才能发成功响应。批量用户重算留在提交之后，按既有机制执行，不在持锁期间扫描所有用户、发奖、调用 AI 或等待外部网络。

读配置也不能拼出半份版本：管理页面五值或多档集合与 revision 用一个 SQL 语句快照读取；确需多查询则在短事务先取得配置 `FOR SHARE` 后再读取。分页跨请求读取须由后端绑定同一 revision，变化后重读，不能让旧页覆盖新档。Read Committed 的两个普通 SELECT 即使在同一事务也不保证看到同一版本，依据 [PostgreSQL 事务隔离](https://www.postgresql.org/docs/18/transaction-iso.html)。领奖/有效生成等已有业务共享同一配置锁，因而只能使用保存前或保存后的一整份配置；04:00 的时效仍单独由规则 effective_day 判断。

任一字段错误、唯一/FK 错误、提交前断连都不产生部分配置，也不推进 revision。提交结果不明时，重新读取完整配置及 revision 供管理员核对；不得声称已回滚、静默补发逐行请求或用旧草稿覆盖新配置。成功但响应丢失的同版本重放因 revision 不匹配被拒绝，不重复新增档；即使之后另有管理员更新，重读也只声明当前状态，不冒充原保存收据。无需新增通用命令日志或个人积分补偿。后端须给出可操作的错误/重读契约，前端保留可修正草稿。

## 7. 道具定义、库存与权益来源

### 7.1 定义与实际发放

| 表 | 关键字段与约束 |
|---|---|
| `item_definitions` | `id PK,kind=makeup/extra_credit/model_trial/plan_trial,name_zh/en,description_zh/en,exchange_price bigint>=0,activation_ttl_seconds bigint>0,listed bool DEFAULT false,extra_count NULL,trial_seconds NULL,target_plan_code NULL,retirement_points NULL,ever_issued bool DEFAULT false,revision,updated_by NULL`；首次保存 kind 不可变；类型字段互斥 CHECK；计划卡只 FK 四个现有计划中允许作为账号计划的目标 |
| `item_definition_models` | PK `(definition_id,model_id)`，定义 CASCADE、模型 RESTRICT；只能 model_trial 有成员且至少一个，用延迟完整性校验与服务事务保证；增删集合不回写库存 |
| `user_items` | `id PK,owner_id,definition_id,issuance_settlement_id,issuance_component,issued_at,activation_deadline,kind_snapshot,parameters_snapshot,activated_at NULL,ended_at NULL,used_target_day NULL,refunded_at NULL,refund_eligible_at NULL`；`UNIQUE(issuance_settlement_id,issuance_component)`、`UNIQUE(owner_id,id)`；定义 RESTRICT，账号 CASCADE；snapshot 是类型化原作用/期限，不含计划权益副本或固定下架积分 |
| `user_item_models` | PK `(item_id,model_id)`，含 owner_id 与 user_items 复合 FK；保存发放时完整模型集合，模型身份 RESTRICT；用于判断整卡失效、逐模型加时与后台引用 |
| `extra_credit_balances` | `item_id PK,owner_id,initial_count>0,remaining_count>=0,expires_at`；remaining<=initial；同所有者库存 FK；启用后 expires_at 等于原 activation_deadline，不延期 |

库存清单索引 `(owner_id,issued_at DESC,id)`；未用期限索引 `(owner_id,activation_deadline,id) WHERE activated_at IS NULL AND refunded_at IS NULL`；可退索引 `(owner_id,refund_eligible_at,id) WHERE refund_eligible_at IS NOT NULL AND refunded_at IS NULL`。前端“已过期”按时钟派生，不依赖清理任务准时写状态；有退换资格的过期卡继续保留入口。

删除定义需要同事务锁定义并验证 `ever_issued=false`、无两个奖励定义表引用，再 DELETE；发卡原子将 ever_issued 置 true（单向不可回退）。账号注销删掉最后一份库存后仍不能把曾发放商品变成“从未发放”；ever_issued 不包含个人身份。商城上下架只改 listed。引用列表从两种奖励定义 FK 反查，并为 FK 建索引。

### 7.2 模型时长的逐卡来源

`model_time_contributions(id PK,owner_id,item_id,model_id,starts_at,ends_at,revoked_at NULL)`，`UNIQUE(item_id,model_id)`、同所有者库存 FK、模型 RESTRICT，`starts_at < ends_at`。索引 `(owner_id,model_id,ends_at DESC) WHERE revoked_at IS NULL` 和 `(model_id,item_id)`。不以计划的可用模型或到期时间参与模型卡续期计算。

在一次账号锁事务中，对卡内模型按 model_id 排序，分别取该用户未撤销的最大 ends_at；`new_start=max(now,old_end)`、`new_end=new_start+trial_seconds`。所有模型的贡献插入与库存 activated_at 一起提交。甲乙 3 天 + 乙丙 6 天为甲 3、乙 9、丙 6；反向也不能把乙 6 覆盖为 3。已有未来排队贡献属于已启用卡体验，不把等待前卡用完当“未使用”。

模型授权由仍未到期的卡贡献序列派生，正常序列连续；计划覆盖不更新任何 starts/ends。下架退换仅撤销本卡贡献，其他卡的起止值、计划授权不重写，不“退款顺便续期”或压缩其他卡时间。正式移除模型不会再次启用旧身份，因此失效模型的贡献不存在重新开放后的时间空洞问题；若后续产品要恢复已移除身份，须另行定义恢复时序，不能静默合并新旧模型。

正式移除时记录该模型不可逆 retired_at，清计划引用。对涉及库存，依据**库存发放快照**判所有模型均正式移除，最后一项下架时刻为资格候选时刻：未启用卡当时尚未到 activation_deadline，或已启用卡当时仍有未结束（包括已启用后的排队时段）的贡献，即记录 refund_eligible_at。资格一旦成立不因自然到期消失，先前自然结束不获资格。大规模处理可分批，但退休时间事实必须在下架事务持久；读取背包/退换同步按这些时间补判，不能因批处理延迟错过资格。并发发卡/启用由配置锁阻止拿到非法新卡。

退换事务锁定义与账号/库存，读取**当前** retirement_points；只创建一次积分 settlement，并标 refunded_at、撤销本卡全部尚存贡献。gift/exchange、已用/未用不作为排除条件；商品 listed 与退款资格无关。重复退换返回原实际结算金额，后来调价不重发。

### 7.3 计划体验

`plan_trials(id PK,owner_id,target_plan_code,started_at,ends_at,closed_at NULL,close_reason NULL)`，账号 CASCADE、计划 RESTRICT；每用户一个 `closed_at IS NULL` 行（到期行在下一启用事务显式关闭）；`plan_trial_uses(item_id PK,owner_id,trial_id,added_seconds>0,previous_ends_at NULL,result_ends_at,activated_at)` 提供逐卡来源且与库存同所有者 FK。

启用重新读基础与目标优先级：目标必须高于基础；与未结束体验同目标则延长，高于当前体验须有明确覆盖确认后关闭旧行，低于则拒绝。确认应绑定旧 trial_id/ends_at/当前配置 revision，防止用户确认后别人续期导致多作废时长。基础升高只改变当前生效判定，原体验不关闭、不暂停、不退款。生效计划相同取一份权益，跟随目标计划最新配置；卡内不复制模型、词数、长度或额度。

基础/体验额度按已确认 DB2-Q02 分开；同优先级同一计划时使用基础来源，原体验持续计时且其历史用量独立保留。具体计量与重置见 §8。

## 8. 生成扣额、退款与管理员预览

### 8.1 已确认的额度隔离

保留 `generation_runs` 用户/访客恰好一个主体、单主体活跃唯一、调用终态/累计统计契约。新增 `entry_kind=normal/preset`、`preset_version_id NULL`，请求开始固定模型和完整配置；正式授权后模型下架/卡到期不重新校验正在运行的调用。每次新调用按最新状态预检，业务调用本身在事务外。

`generation_charges(run_id PK FK generation_runs CASCADE, account_id NULL,visitor_id NULL, source_kind=plan/extra_credit/visitor,plan_code NULL,origin NULL,quota_epoch NULL,item_id NULL,units int=1,state=reserved/consumed/refunded,charged_at,settled_at NULL)`。type CHECK 保证恰好一个实际来源；额外次数用库存同所有者 FK；预设例外只放宽配置，不放宽计量。`quota_charged` 仍表示是否收取本次，而计划滚动查询必须只统计 source_kind=plan；不能把额外卡消费又计入计划。

DB2-Q02 已确认基础与体验分开：`plan_quota_states(owner_id,plan_code,origin=base/trial,reset_epoch bigint>=0,reset_at timestamptz)`，PK `(owner_id,plan_code,origin)`。charge 存 plan_code、origin、quota_epoch；FK 仅用 `(account_id,plan_code,origin)` 指状态主键，历史 quota_epoch 不参与 FK，避免重置 epoch 使旧流水失效；当次使用哪一源由生效计划及其授权来源确定，基础/体验目标相同取基础。计划剩余是当前配置 limit 减该键/epoch 且 charged_at ≥ max(now−24h,reset_at) 的仍收费 charge，最小 0；不限保留 NULL。卡续期、到期重新启用或切回同一体验使用原 trial 键/epoch，不能建新预算。管理员调整基础只将目标计划 base epoch+1、reset_at=now，旧 base 行和流水保留；trial 键、所有卡/奖励不变。换基础计划还在高档体验中时，先重置目标基础来源但当前仍使用高档 trial。全局计划配置不变 epoch。新账户按需建状态；迁移保留原 quota_reset_at 作为其当前基础 reset_at，旧有效滚动收费映射该 base epoch，历史累计次数原样保留。

对于 plan：origin 为 base/trial，plan_code 与 quota_epoch 必填、item_id 为空；extra：item_id 必填，origin/plan_code/quota_epoch 为空；visitor：只 visitor_id 非空且其他来源字段为空。账号 plan/extra 必须 account_id 非空且 visitor_id 为空。`plan_quota_states` 中 trial 的 epoch 固定为 0；base 只有管理员基础调整递增。

### 8.2 共用结算顺序

1. 账号/访客及相关配置锁下，校验普通权限或发布预设固定配置、单活跃请求、当前 plan 可用次数；有 plan 次数先选 plan，否则按 `(expires_at,item_id)` 锁并条件扣 extra。访客只有原访客滚动额度；两类都无余额拒绝，不建占用或调用供应商。
2. 同事务插 run 与 charge；extra 使用 `remaining>0 AND expires_at>now` 条件更新减一。plan 不以累加一个可漂移余额替代滚动事实，查询按最终确认的计量键和真实 24 小时窗口。无限额仍记录 plan 来源。
3. valid/user_cancelled 将 reserved→consumed；只有 valid 触发有效学习/签到。系统/供应商/流/校验失败 reserved→refunded，extra 原源 remaining+1 一次，plan 解除该次计数。若 extra 已过期，仍恢复原来源的账面余额并保持到期，不另赠新卡或延长期限。
4. 退款是 run 终态与 charge/余额同事务，重试恢复沿原失败结算机制；不能只改 quota_charged 而丢失来源。发生基础重置后，旧请求失败只结算旧 charge，不修改新 epoch/其他来源。主动取消不退款。
5. 收录与访客承接沿原 run/claim 幂等；来源键和全局事件指 run，只记一次有效生成。用户真正收录时才加 saved_total 和激活事实，删除后不返还消费。

### 8.3 管理员预览用量隔离

`preset_preview_runs(id PK,preset_id,version_id,requested_by NULL FK accounts SET NULL,status,model_id FK RESTRICT,model_name/provider_snapshot,started_at,completed_at NULL,failure_category NULL,config_hash)`；不在 generation_runs 伪造 learner、NULL quota 或取消“有效结果必须计累计”约束。预览可取消/失败但不占任何用户或访客次数，不触发签到/成长/激活。

`ai_call_usage(id PK,user_run_id NULL FK generation_runs CASCADE,preview_run_id NULL FK preset_preview_runs CASCADE,call_no int>0,provider_request_id NULL,model_snapshot,input_tokens NULL,output_tokens NULL,cost_amount numeric NULL,currency NULL,usage_status=known/partial/unknown,completed_at)`，恰好一个 run FK；对两种 run 分别唯一 `(run,call_no)`，可记录一个逻辑请求内部纠正/续写多次调用的实际成本。未知 token/cost 不填 0；供应商未报告不通过模型价目推测实际账单。其数据只对应 DATA-009/214 已有用量，不保存 Prompt 或模型回复。

## 9. 热门预设草稿、预览与发布

| 表 | 字段与约束 |
|---|---|
| `presets` | `id PK,draft_version_id,published_version_id NULL,listed bool DEFAULT false,revision,created_at,updated_at,updated_by NULL`；版本必须属于本 preset 的复合 FK，发布版本存在才能 listed |
| `preset_versions` | `id PK,preset_id FK CASCADE,version_no int>0,title text NOT NULL CHECK(btrim(title)<>''),model_id FK RESTRICT,meaning_language,scenario,length_code,configuration jsonb,config_hash,created_at`；`UNIQUE(preset_id,version_no)`、`UNIQUE(preset_id,id)`；没有 title_zh/title_en/description；配置枚举与合法词表校验 |
| `preset_version_entries` | `(version_id,vocabulary_entry_id,input_order)`，PK `(version_id,vocabulary_entry_id)`、唯一 `(version_id,input_order)`；目标词完整有序，词数不从游客计划截断 |
| `preset_previews` | `id PK,preset_id,run_id UNIQUE FK preset_preview_runs,config_hash,validated_payload jsonb,validated_at,validator_version`；仅 valid 完整结果；包含公开英文样文/释义等平台预览资源，不是用户批次 |
| 版本预览关系 | `preset_versions.preview_id NULL` 指同 preset 预览；标题变更可重用同配置的成功 preview，生成参数改变必须新 preview。配置 hash 是快速判等，发布仍比较规范化配置/词序且按最新平台可用性校验 |

版本不可原地改写已发布内容。后台每次保存建立新草稿版本/替换草稿指针；`generation_runs.preset_version_id` 只作历史来源 FK、删除版本时 SET NULL，已开始调用所需配置/词条必须完整落在原 run 和 entries，不能依赖被清理的版本；仅保留当前草稿、当前发布和进行中调用/预览所需版本，不增加用户可访问的历史版本管理。已发布版本不因新预览失败变化。保留期到达或未引用版本清理不能删除当前有效 preview 或在途配置；清理具体时机由后端结合请求终态确定。

发布事务锁 preset，检查 expected_revision、draft 指针、成功 preview、词序/模型/配置与 preview 一致，然后原子更新 published_version_id/listed；前台目录和独立台从**同一发布版本**读取 title、配置、完整样文。预设生成提交 version_id，服务器核对仍是可用发布版本；页面已过时则返回需重新载入，不默换配置或用旧版本绕过下架。已开始请求仍用开始快照。

移除模型不删除公开历史样文，目录/独立台明确不可生成；后台须可改草稿重新预览并发布。下架 preset 停新调用，不删除用户已保存批次。保存用户批次时 title 仍来自自己的目标词条连接，不复制 preset title。公开预设永不从私有学习库抽取素材。

## 10. 分析事实、归因与保留

DB2-Q03 已确认：个人访问/分析明细保留 90 天，之后仅保留无个人标识汇总。归档不保留原始标识；账号注销立即清除可识别个人记录。明细到期按 occurred_at + 90×24 小时判定（日期口径仍按 04:00），到期即不再对管理查询返回；维护随后物理分批清除，失败需要告警处理而不是视为已删除。成长与复习最小事实按自身已批准用途保留，不用它们重建超出 90 天的个人分析明细。

### 10.1 最小必要结构

- `traffic_sessions(id PK,browser_key_hash,started_at,last_event_at,ended_at NULL,pageviews int,has_key_action bool,entry_source_type,utm_source/medium/campaign NULL,referrer_host NULL)`：30 分钟不活动结束；不存 IP、完整 URL、任意 query、昵称、正文。browser_key 为第一方随机标识的 HMAC，不是假称匿名的自然人 ID；同浏览器登录前后仍同 UV。它与访客配额身份职责分开，不能延长原 30 天访客计量身份清理。
- `analytics_events(id PK,event_key UNIQUE,event_kind,occurred_at,started_at NULL,learning_day,traffic_session_id NULL,browser_key_hash NULL,owner_id NULL,event_outcome NULL,source_kind,reference_key NULL)`：服务端固定枚举/白名单；业务完成由服务端事务写，浏览器不能上报伪造的成功/奖励。业务 logical key 保证 run/attempt/收录不重复；不保存答案、短文或原始请求载荷。
- `analytics_daily(day,metric,dimension_key,numerator,denominator,value,updated_at,maturity_state)`：PK `(day,metric,dimension_key)`；维度限制为固定渠道类别和注册 cohort/时间，不含账号/浏览器/source ID、任意 UTM/campaign 原文或其他自由事件属性；可能含身份的任意文本不带入永久汇总。仅保存可解释计数；零分母 NULL，成熟状态单列。
- `review_cohort_daily(start_day,started_count,submitted_count,successful_count,updated_at)`：复习开始队列的匿名投影，迟交更新原 start_day；不能把 submitted_day 当分母。对仍未完成且超出明细保留期的 attempt，原复习最小事实继续存在，提交时从该事实得到 start_day 更新累计；其成长/复习事实不因分析过期被抹掉。
- `analytics_accounts(owner_id PK FK accounts CASCADE,registered_learning_day,first_saved_at NULL,retention_due_at)` 仅用于注册 cohort/激活判断，首个 30 日留存窗口内有定义的指定日结果结算后，最迟在注册后 90 天移除其个人分析副本；真实账号创建时间和成长累计按原用途保留。注册日与首次收录：原账号创建时间可提供真实注册日，但二期指标启用前无采集不得填 0% 或臆造首学。首次收录事实不能因删批次或重复 claim 重建。未启用前注册 cohorts 标明覆盖范围，不算新注册队列。

`traffic_session_accounts(session_id,owner_id,linked_at)` PK `(session_id,owner_id)`，两个 FK CASCADE，仅记录实际认证产生的关联，生命周期不超过对应 90 天窗口，用于注销删除路径，不是消息已读或跨设备追踪表。

索引：events `(owner_id,occurred_at)`、`(learning_day,event_kind)`、`(browser_key_hash,learning_day)`、清理 `(occurred_at,id)`；traffic `(last_event_at) WHERE ended_at IS NULL`、`(started_at,id)`；服务端提交去重事件键 UNIQUE。按用户删除用 owner 索引；与账号明确关联过的浏览器会话及事件在注销时删除关联记录/标识，不能只将 owner_id 置 NULL 后继续以原可关联标识保存。关联只来自明确注册/登录，不跨设备猜测；同浏览器多人使用时，删除该账号关联分析事件、关联行及属于该账号的分析状态，并对与其关联的共用流量会话/无主事件去除 browser_key/session 链或删除其流量副本，保留其他账号的业务事实；不得借共用浏览器保留可恢复被删身份的映射。匿名汇总保留，带标识的队列工作集删除；详情删除与已有匿名聚合口径差异须在查询来源明确。

### 10.2 口径与可重算边界

| CAP-219 指标 | 最小来源及防误算 |
|---|---|
| PV / UV / 注册率 | page_visit 唯一页面事件；日期内 distinct browser；注册分子只计当日未登录访客中成功注册的 browser，无法关联单列；跨天 UV 查询用明细 distinct，不能相加日 UV |
| 激活 / D1/D7/D30 | 注册学习日 cohort+首次真实收录+指定日有效学习；D7 是第七日而不是前七日任一活跃；当日/7 日激活分开，未成熟显示观察中 |
| WAU | 最近 7 个学习日 distinct owner 的有效生成或有答案提交；不能相加每日 DAU |
| 复习完成 / 成功率 | start_day 同队列；重复恢复不开始新分母；重来新 attempt；分母分别为 started 和 submitted；迟交更新旧开始队列 |
| 生成失败率 | run 开始队列；成功与系统类失败为分母，取消/进行中/预检拒绝各自单列；内部多次 AI 调用仅计一个 run；预览完全排除 |
| 篇数 / 收录 / 复习频次 | 完成/实际保存/提交发生时刻；访客承接不增加第二篇，关联同 run；全空提交计频次但不学习活跃 |
| 跳出 / 渠道 | 已结束 traffic_session；单页且无关键操作；30 分钟未结束不进分母；入口按 UTM→外部 host→直接/未知 |

分钟级更新在现有后端维护调度内执行；直接事实同事务写，聚合按主键幂等重算/事务增量，记录 updated_at。不能用“写完业务后尽力发送异步事件”丢关键漏斗，也不新增队列服务。04:00 做完整日结/成熟 cohort 更新。

个人明细过期前完成匿名汇总，并先确认汇总游标覆盖；清理失败告警、不静默无限积压。匿名计数可以保留日 PV、队列计数、成熟 cohort 的人数，但无法恢复过去任意区间的精确去重 UV/WAU；超过个人明细窗口的界面只展示已有可解释汇总，不能假称历史任意范围精确可重算。未定义任意历史范围查询的新功能，本限制交后台架构和设计核对。注销删除在线可识别记录；已不可关联的汇总不回填个人信息，也不作为账号恢复来源。

Clarity 仅用产品已批准公开入口范围，数据库不存第三方回放/热力图或镜像数据。CR-042 私有有界诊断记录属于独立已批准机制，不导入平台分析库，不扩大其专用账号/24 小时/容量限制。

## 11. 事务边界、并发与失败恢复

### 11.1 一致的锁顺序

沿用 Read Committed、短事务和显式锁。为防止“检查有效配置后、发奖前管理员改了配置”，`growth_settings` 单例同时充当本期配置 revision 的锁点：业务事务开始对该行 `FOR SHARE`，修改计划/模型/成长/商品/预设配置的事务先 `FOR UPDATE`。这不是所有用户互斥锁，共享读取可并行；配置写只持锁完成小规模配置事务，不包含 AI 调用或全用户重算。配置提交后新业务读到同一份版本；大范围追踪/达成重算交现有维护任务，并在用户操作时同步核对。

持锁顺序统一为：配置锁 → 涉及账号按 UUID 排序（访客请求锁 visitor）→ 生成 run/claim（按稳定 ID）→ session/attempt/batch → 奖励定义/商品 → 个人余额/库存/权益/结算。不同用例可跳过不用的节点，不能倒序获取。访客承接涉及 account 和 visitor 时固定先 account 后 visitor，再 claim/run；后台只读不拿不必要写锁。

批次/账号删除同样先锁 account；后台配置操作不得先锁用户再升级配置锁。旧学习、review、generation、maintenance 的现有锁次序须由 backend-alex 梳理后统一，不能只给新增方法正确顺序而与老入口死锁。全局配置锁如实测阻塞明显，按具体配置拆锁，不能无证据先建通用锁服务。

数据库唯一/FK 是最后防线，不能只有“先查再插”；死锁/序列化冲突只对完整数据库事务按原业务键有限重试，不能重试上游生成。网络断开导致 COMMIT 结果不明时，以业务事实/settlement/charge 再查判定，不等同回滚。[PostgreSQL 锁与死锁](https://www.postgresql.org/docs/18/explicit-locking.html)

### 11.2 用例事务表

| ID | 原子写集合与重试边界 | 失败保证 |
|---|---|---|
| DB2-T01 有效生成 | run valid + charge consumed + 当日活跃/签到 + 自动积分经验 + 等级/成就达成 + 业务分析；未收录不加 saved_total | 同一 run 终态/来源键只结算一次；持久化失败不先向用户声称全部成功；AI 调用不在事务内 |
| DB2-T02 保存/claim | 原完整批次及资源 + title + disposition/claim + 首次收录/累计 + 合格同日签到 + 分析；claim 绑定认证账号且只一次 | 任一资源/完整性约束失败全部回滚，不重复占额或重新调用；来源仍可按原规则重试 |
| DB2-T03 复习提交 | 可写 session/版本检查 + attempt submitted（含 has_unanswered）+ 首次提交进度 + masteries 实际新增 + 成功/有效学习日 + 累计成长 + 幂等结算 + 分析；所有批次完成且无 draft 时同事务置 session completed/completed_at | 任一失败均未提交，不产生部分掌握；服务端不保存逐题结果；同 attempt 重试返回最小完成状态；与 T14 串行，abandoned 拒绝新提交 |
| DB2-T04 补签 | card use + target checkin + 所有受影响日 paid 差额 + ledger/balance + 最高连续/成就达成 | 不部分消耗卡；不补签到经验；唯一日期与来源防双击、并发两卡重复补 |
| DB2-T05 手动领奖 | 当前资格/配置检查 + 实际 settlement + 积分/经验/所有库存 + claimed 状态 + 新达成 | 一张卡不可用即全笔拒绝；失败时积分经验也不能到账；已领键永不再发 |
| DB2-T06 积分兑换 | listed/最新价格 + 条件扣余额 + exchange ledger + 实际库存快照 + ever_issued | 幂等请求键绑定 owner/商品/数量；余额不足不扣不发；同键换参数拒绝 |
| DB2-T07 启用道具 | 本卡期限/类型与最新授权检查 + activated + 全部模型贡献或 plan trial/use 或 extra balance | 一张卡只用一次；高档覆盖须匹配确认的旧体验；任何模型贡献失败全回滚 |
| DB2-T08 模型退换 | 持久资格/下架因果 + 当前下架积分 + settlement/ledger + refunded + 仅本卡贡献撤销 | 后来过期仍能退；并发两次只有一次；其他卡和计划不改；已开始请求不回滚权限 |
| DB2-T09 管理积分补发 | 管理员身份 + 正数 + 来源去重键 + ledger/balance | 无负数、直接设余额、误发撤回；不影响经验或等级；不存在目标账号不能发 |
| DB2-T10 管理基础计划 | 账号基础组 + 目标 plan/base epoch+1/reset_at | 不改 trial epoch/结束时间/模型卡/extra/奖励；取消无变更；与新生成串行 |
| DB2-T11 发布预设 | 草稿 revision/preview/config/model 校验 + 发布指针与可见状态 | 前台样文和固定配置来自同一版本；失败保持旧线上版本 |
| DB2-T12 批次删除 | 对应 consumed claim 先删除 + 原批次/全部资源/会话关系/attempt 级联 + 移除空会话 | 成长累计/账本/掌握保留；无内容墓碑；本机草稿下次校验失效；重试旧 claim 不重建 |
| DB2-T13 注销账号 | 原用户会话/生成/claim/学习 + 新个人成长/卡/权益/结算 + 可识别分析及关联 | 即时在线删除，不只软删；并发操作以账号存在/锁为条件；平台配置的 actor FK 置空 |
| DB2-T14 替换日期范围 | 同账号锁校验确认/旧版本/新范围非空 + 旧 draft restarted/revision+1 + 旧范围 abandoned + 新范围及固定批次/题序 | 新建失败全回滚；单批会话与已提交事实保留；旧页面不能提交/重来；不伪造完成或成长；COMMIT 不明先读当前 active 范围 |
| DB2-T15 签到与经验保存 | 配置 FOR UPDATE + 期望 revision + 五值校验 + 当前 mastery_experience + 下一学习日 pending 规则 + 全局 revision 一次推进/重算标记 | 任一失败五值均不落库，当前/历史签到规则不变；提交未知重读整组；按 §6.4 拿锁后时间定日 |
| DB2-T16 多档成长保存 | 配置 FOR UPDATE + 期望 revision + 全集合并校验 + 原 id 更新/新 id 插入 + 指定门槛唯一约束延迟后强制检查 + 全局 revision 一次推进/重算标记 | 等级或同 kind 成就一组全成全败；不隐式删除，不改已达成/已领/称号快照；响应丢失不逐行重放 |

积分消费/手动补发的幂等键保存在对应 `growth_settlements.source_key`；请求相同键但参数不一致须拒绝，因此 settlement 的类型化 request_fingerprint 只涵盖商品/数量/奖励/正数金额等非内容参数。复习提交不持久化答案 hash：唯一 attempt 和状态足以阻止重结算，不用可猜测短单词摘要伪装最小事实。正常签到 source_key=日期；手动奖 key=稳定 level/tier ID；mastery 的用户/词主键是另一重唯一保证。

创建来源 ID 必须在原 run/attempt/保存请求事实中稳定：增加一个随机 `growth_event_id` 或复用一次实际 settlement_id 关联，不在每次网络重试重生 source_key。成长账本只保留与本人有关的随机结算身份和奖励内容；批次删除后不能从账本恢复该批次内容或历史答案。

### 11.3 进程崩溃与配置演进

- 已完成数据库事务但响应丢失，读取唯一领域事实；未提交事务全部回滚。不要把客户端是否看到 toast 当结算完成依据。
- 生成终态失败的恢复沿一期退款机制扩展为“原 charge 来源退款”；维护不能只更新 `generation_runs.quota_charged=false` 而遗漏 extra 的余额恢复。重启清理 active run 也必须走这一完整路径。
- 计时以 `ends_at`/deadline 判定，不依赖每秒 job 刷新状态。卡过期清理不得删除下架资格；商品 ever_issued 和奖励已领事实没有到期自动清理。
- 全局配置 revision 变更后的达成重算游标保存在 `growth_settings`（配置 revision、扫描至 account ID、完成状态）；任务重启可重入。对仍未重算的个人读取/领奖即时同步，不能让后台待处理成为错发奖励的理由。
- 同一用户的积分与经验写入统一走结算事务。手动奖励发卡引用多个定义时按 ID 排序锁定，definition ever_issued 与库存一并提交。DBA 不引入单独发奖队列、最终一致余额或自动补发。

## 12. 迁移、初始化与恢复

### 12.1 数据保留与变更策略

本期是保留业务数据的 schema/语义演进；原迁移 `0001–0007` 保持原字节，后续编号从实际最大版本之后递增，实施时检查冲突。本稿不生成或执行生产 SQL，后端实施依据获批方案编制迁移。

建议在一个已明确停写的维护窗口切换配套前后端，不建设 M001/M002 双写、旧接口适配或跨镜像混跑。停写不是删除数据；先等待/结算在途 run、停止后台写入和旧内存 attempt，关闭旧浏览器继续写入口的能力，新页面恢复会话最小安排。旧版兼容如确有部署需要，按 USER-COMPAT-001 显著单独提出，不能塞进迁移默认步骤。

| 顺序 | 迁移内容 | 必须核验 |
|---|---|---|
| DB2-M01 预检 | 读实际 schema/迁移账本/PG 主版本/待处理 run；记录不含敏感值的各表行数、原统计与内容摘要 | 确认目标实例、可用备份/恢复与磁盘/锁时间；不读取或输出 DSN、密码、密钥、token、正文 |
| DB2-M02 增量结构 | 新平台配置/成长/权益/预设/分析表；成就从建表起含可空 description_zh/en 及非空白 CHECK；两处门槛 UNIQUE 按 §6.3 可延迟，主键/level_no 仍保持原约束；通知含独立 title_zh/en 与完整语言对 CHECK；attempt 含 has_unanswered；review_sessions 替换 status_valid/completion_consistent 两项 CHECK，允许 §5.1 的 abandoned；原表需回填列先可空 | 空库和有一期数据的库均能进入同一最终结构；一期无成就/通知表，不从名称、称号或原型伪造说明/标题；原 active 唯一索引条件保持；检查延迟属性与初始立即状态，不能把“新增长表”误当可以给 app 全 schema 权限 |
| DB2-M03 词汇/标题 | 精确词表建立 lexemes 并回填成员；按 input_order 回填批次 title；再检查 NOT NULL/唯一 | 13,860 原词/顺序/摘要不变；全部旧 batch ID、保存时间、正文、释义、所有 occurrence 与原统计保持 |
| DB2-M04 旧复习事实 | 迁入 origin=m001 的最小 submitted attempt，has_unanswered=旧 skip_count>0；从旧结果 completed_at 回填首次提交进度；未知开始/has_answer 保持 NULL | 逐 owner/session/batch 的完成/成功/包含跳过计数一致，旧 skip_count=0 和 >0 均覆盖；0 条记录不能当全空提交；原 session 状态/固定次序保持，不批量 abandoned；无二期成长回填；旧内存答案不存在可迁移数据 |
| DB2-M05 额度来源 | 原账号/访客收费行建对应 charge；当前基础以原 quota_reset_at 过滤保持有效滚动用量；trial 无历史行 | 24 小时边界前后剩余额度与累计次数一致；原取消/失败退款分类不改；至少当前滚动窗口来源完整，历史来源不得当作新消费 |
| DB2-M06 配置准备 | 四计划身份与完整原权益保持，设置唯一优先级；运营填写签到、首次掌握经验、初始等级/奖品/商品/通知/预设 | 不用原型示例数值覆盖生产。优先级建议 visitor<registered<pro<plus，具体数值由运营确认；未配置奖励时不能假称成长已启用或发默认积分 |
| DB2-M07 原子启用边界 | 所有结构/数据检查通过，配套服务就绪后单事务记录 activated_at 及运行配置 revision | 启用前事件不计成长，启用后按服务端时刻记录；首次注册/旧账号懒初始化成长为零，均不回填；激活时刻不可随重启漂移 |

旧 `review_results` 的替代表可以先建立并对账，再在同一停写切换完成引用/读写改接和旧汇总表处理；这只是维护过程的迁移中间态，不是运行时双版本兼容承诺。不在不同迁移文件之间声称跨文件回滚：每文件已提交的结构需记录恢复点，后续失败保持服务关闭并前滚修复。

普通迁移不清空学习库、不重置四计划配置、不清密钥模型、不重建账号；M001 CR-040 的一次性本地清理权不能沿用。二期运行配置未由运营填妥时可留未启用状态，不能选择用户原本未确认的奖励值填满验收。

DB-03 接收时仓库只有 M001 的实际迁移，DB-02 是已批准设计而非已部署结构，所以本轮是在后续 M002 迁移计划中直接补齐说明列/约束，不制造一次虚假的线上 DB-02→03 迁移。实施若发现目标实例已有 M002 表，先记录实际版本再以新增迁移补可空列（原行保持 NULL），核验已有门槛无冲突后替换为命名可延迟唯一约束；不得重写已执行迁移或删除档位/award/settlement。数据验收覆盖原 id、门槛、奖励、称号快照、累计余额均不变。失败时按 §12.2 保持停写并前滚，不能删已录入说明来回退。

### 12.2 回滚和恢复边界

| 时点 | 恢复原则 |
|---|---|
| 单迁移事务失败 | 当前文件 DDL/DML/账本一起回滚，已完成文件保持；按准确版本核验，不能直接删 schema 重来 |
| 迁移提交未知 | 保持停写，查实际列/约束与迁移账本、统计对账，不仅看进程退出码；避免重复回填成长或重置额度 |
| 启用前、新版尚无业务写入 | 可按经过演练的迁移恢复方案回到输入快照；恢复不得破坏已有删除的隐私边界，不承诺直接启动旧镜像可读新表 |
| 启用后已有新积分/卡/复习 | 首选前滚修复；不能删新表回滚丢掉新增权益，也不能恢复旧备份后直接开放造成已删内容复活。回退属于新的影响/授权评估 |

备份机制沿一期现有部署策略，先核实实际部署是否具备有效备份和隔离恢复能力；源码并不证明已有生产 PITR/RPO/RTO。DBA 此轮不新增备份保留年限、不声称 SLA。迁移前备份/恢复演练需覆盖新账本、权益来源和账号删除；备份加密、密钥与 DB 凭据分开。灾难恢复后，在重新开放前核对恢复点之后的已确认删除和权益交易；若无法证明不恢复已删内容/重复奖励，保持关闭并人工处理。[PostgreSQL 备份与恢复](https://www.postgresql.org/docs/18/backup.html)

## 13. 查询、容量、权限与运维

### 13.1 查询与索引依据

| 访问路径 | 索引/策略 | 验证重点 |
|---|---|---|
| 原书架、日期范围和目标词搜索 | 原 `(owner,saved_at,id)`、参与开关复合索引、`batch_targets(owner,vocabulary,batch)`；lexeme 关系新增 `vocabulary_entries(lexeme_id,id)` | 标题编辑不改变顺序/搜索；统计不随搜索缩小 |
| 草稿恢复/当前批次 | active session 索引+draft attempt 部分唯一；题序关系原索引 | 多模式不串会话；提交后不返回历史答案；客户端残留先校验状态 |
| 会话最小概况 | session/batch 关系与 §5.1 的最新 submitted 部分索引，按 attempt_no DESC 各取一条 | 一个语句快照读取；跳过属于未成功子集；重来不清首次进度；abandoned 保留事实但不可继续 |
| 计划滚动次数 | charge `(account_id,plan_code,origin,quota_epoch,charged_at DESC) WHERE state IN ('reserved','consumed')`；visitor 同理 | 只计对应 plan 来源；额外次数不双计；索引 predicate 不用随时钟变化的 now() |
| 最早到期额外次数 | `(owner_id,expires_at,item_id) WHERE remaining_count>0`；读取再判断 expires_at>业务时刻 | 同期限 tie-breaker 稳定；过期不用；退款原来源 |
| 成长/余额/奖励 | owner PK；ledger `(owner_id,created_at DESC,id)`；awards owner+level/tier PK；definition 引用外键索引 | 显示金额与实际到账一致；不对流水全文搜索；本人和管理员限权 |
| 成长运营整组读取/保存 | 复用配置单例 PK、level_no 唯一和 kind/threshold 唯一索引；说明无新索引 | 完整集合校验、同 revision 投影、五档以上；记录配置锁持有/等待时间，不能把全用户重算放入保存事务 |
| 预设筛选和展示 | published version 的 `meaning_language` + preset 可见标识；读取固定版本/preview | 释义语言 tab 不误用 UI locale；完整样文不截断入库 |
| 后台通知/商品查找 | visible/remind/date，商品 `(kind,listed,id)`；名称先参数化 contains | 当前规模先测，无证据不安装搜索扩展 |
| 账号注销 | 所有 owner/account/credited_account 及 FK 引用列有覆盖索引 | 短事务级联耗时、死锁与遗留关系；访客承接原 run 可识别 credit 也清除 |

索引总量随实际查询证据收敛，不为每个布尔值单列加索引。产品没有约定查询 p95/SLA，不能凭文件自检宣称性能达标；实施用真实结构和合成代表规模采集 EXPLAIN (ANALYZE,BUFFERS)、行数、排序及时间，再交后端部署评估。

容量估算使用变量：词汇 13,860 固定；用户掌握最多用户×实际掌握集合；checkin/day 成长事实按活跃用户日增长；库存按实际发放量；分析明细≈每日事件×保留天数；正文/预览体积按实际分位数测量。表/索引/TOAST/WAL 都计入，不设未批准的短文词数上限，不预分区。

### 13.2 权限与删除

- 继续 `wordweave_owner` 持有结构、受控 migrator 执行 DDL、app 执行业务、ai 仅取凭据/写授权生成范围、maintenance 做已定义清理；不沿用新表自动 `GRANT ALL ON ALL TABLES` 的宽授权。应用没有模型硬删除、固定计划新增删除或 DDL 权限。
- 账本/实际结算普通 app 只 SELECT/INSERT，不 UPDATE/DELETE；余额只由结算仓储事务更新，管理员 HTTP 没有任意赋值入口；账号级联删除仍删除关联个人账本。平台配置/库存型别约束在库内兜底；一组连接持有 app 身份不等于数据库自动识别登录管理员，服务层鉴权必须测试。
- 不新增 RLS/多租户平台；以 owner 复合 FK、查询必带 owner 和拒绝越权写建立本期边界。个人后台只读投影和管理员明示运营写操作分开。
- 本机未提交答案不进入服务端 DB、分析、普通日志或异常 payload。提交过程中服务端内存有当次输入，评分后丢弃；正确答案仍只存原学习资源和当次授权响应。
- 账号注销除 CASCADE 还必须显式处理 consumed claim、visitor run 的 credited_account、浏览器分析关联；不能仅把可识别 owner FK 置空后保留关联链。原保存内容、个人称号、卡、积分经验、掌握、日事实和题目安排全部在删除验收。
- 配置/公开预设是平台资产：操作者账号去标识不删平台已发布内容；用户自己的短文从不进入公开样文。已匿名聚合不含可恢复用户或内容路径。

### 13.3 监控与清理

复用现有后台维护及基础设施指标：连接池使用、锁等待/死锁、长事务、事务失败、表/索引/WAL 增长、autovacuum、迁移版本、退款待结算、分析更新/清理滞后、配置重算 revision、备份恢复状态。账本对账检查 points/experience 与 ledger 总和、库存来源、charge/refund 一致性，异常报警不自动改余额“修复”。

清理按主键/到期索引小批量，使用现有 200 条量级作为待压测起点，`SKIP LOCKED` 用于维护抢占而非领奖/扣额的用户正确性判断。正常 expired session/draft/claim/visitor 原期限保留；新增分析明细 90 天到期清理，模型卡退换资格与商品发放历史不能因到期清除。未授权的全表清理、扩大诊断正文留存或第三方采集不进入本任务。

## 14. 验证计划与交接

本轮只做文档与源码事实核对；下表是未来实施/QA 的定向验收，不能把它们标作已执行数据库测试。

| ID | 对应验收 | 必须证明的结果 |
|---|---|---|
| DB2-V01 | AC-006/010/012/014/220 | 有旧数据迁移和空库安装结构一致；词表完整，批次 ID/正文/释义/全部位置/原统计保持，默认标题按原输入序；改标题不变 saved_at |
| DB2-V02 | AC-017/020/022/201–204 | 日期/单批会话互不覆盖，固定顺序；本机刷新/离开恢复需确认；无跨设备答案恢复；任意改答/跳过/概览最终提交，提交后无持久答案；重来新 attempt |
| DB2-V03 | AC-202/203/213 | 并发两次提交同 attempt 只一份结算；不同批次同词只一次 mastery/经验；响应丢失仅最小完成状态，旧页面不能重结算 |
| DB2-V04 | AC-209/211 | 03:59/04:00 日界；错误有答案更新学习，全空不更新；登录不改学习时间；正常有效生成未收录可签到；游客同日认领一次、跨日无签到 |
| DB2-V05 | AC-212 | 跨月 30 学习日窗口、注册/启用边界；补多个缺口按各日历史规则补后续差额；重复补签不重复耗卡/积分，不补签到经验 |
| DB2-V06 | AC-214/217 | 领取奖励卡失败全档回滚；最新配置整份结算；跨级逐档、初始无奖、满级继续经验；停用暂停；降级暂停等级奖不撤达成，恢复后只领一次；称号在达成时已有 |
| DB2-V07 | AC-215/217 | 双击兑换、余额刚好不足、并发管理员删除定义/奖励引用/发卡；无半扣发；ever_issued 在账号注销后仍禁止删配置；商城下架只阻止兑换 |
| DB2-V08 | AC-215/216 | 模型甲乙 3+乙丙 6 得 3/9/6，两种启用次序；同模型剩余加时；部分贡献故障全回滚；全部计划覆盖不消耗卡；后来覆盖不暂停 |
| DB2-V09 | AC-205/215 | 下架前已过期不获资格；下架时有效后过期仍能退；来源 gift/exchange 和已用/未用均可；读取当前下架积分，只退一次、只撤本卡贡献；模型停用/故障与正式移除区分 |
| DB2-V10 | AC-103/105/216 | DB2-Q02 的 Pro 体验已用 8→基础 Pro 重置，仅 base epoch 变；以后 trial 用量沿用；高档覆盖确认匹配旧期限；同档续期不重置，改配置不重置 |
| DB2-V11 | AC-008/009/216 | plan 优先、extra 最早到期；计划/卡用量不会双计；系统失败原来源仅退一次、取消不退；原卡过期后退款不延长；重启 active run 也恢复 extra |
| DB2-V12 | AC-218 | 草稿改参旧 preview 不能发布；仅标题可复用但须发布；发布与预览并发不混版本；访客/账号超计划配置只在锁定预设合法；仍扣本人额度；管理员预览有实际/未知用量但无学习计量 |
| DB2-V13 | AC-219 | 同浏览器登录前后 UV 一个，跨设备分开；7 日激活与 D7 分开；未成熟队列观察中；跨日迟交更新原 cohort；3 成功/1 失败/1 取消/1 在途失败率 25%；30 分钟跳出 |
| DB2-V14 | AC-005/016 | 批次删除清关联内容/attempt/claim，累计成长不回退且不可恢复正文；账号注销清所有新旧个人记录/关联分析，平台配置作者置空；在线本机残留校验后清除 |
| DB2-V15 | AC-002–005/011/021/104–107/210 | 原注册登录、语言合并、改密/重置/退出、claim 一次绑定、后台精确匹配排序/只读继承；隐藏通知不泄漏；不新增已读表；越权写拒绝 |
| DB2-V16 | 运维/可靠性 | 锁顺序与并发竞态、事务断点注入、COMMIT 不明重查、余额来源对账、迁移失败前滚/隔离恢复、分析期限清理与匿名化；不得用单线程 happy path 代替 |
| DB2-V17 | CR-003 / AC-020/203 | §5.4 的 4 批概况为 3/1/2/1；部分空与全部填错可区分，全空仍完成但不活跃；重来 draft 不变，新提交后为 3/2/1/0；时间同值按 attempt_no 取最新，累计成功仍包含全部成功尝试；M001 skip_count 的 0/>0 转换对账，非法 NULL/成功且未答组合约束拒绝，无答案/空题号/答案 hash 入库 |
| DB2-V18 | CR-003 / AC-020/204 | 替换保留旧提交/成长和单批会话，只使旧范围 draft 失效；空新范围/版本冲突/新建中途失败都保留旧 active；提交与替换两种并发先后及两次替换均正确；abandoned+completed_at 非空、single abandoned 等非法单行状态拒绝；事务结束无 abandoned draft；响应丢失可查当前安排，旧页不能写，随后删除仍清理 |
| DB2-V19 | CR-003 / AC-210 | 仅中文完整、仅英文完整、两套完整均可保存；另一语言不完整时整套回退；中标题+英正文、全空/NULL 无完整对均拒绝；独立标题与 Markdown 原文不互相改写；并发 revision 冲突不部分保存，编辑不改 published_at；同时间按 id ASC 稳定翻页，隐藏且提醒开不泄漏，无个人已读表 |
| DB2-V20 | FE2-G01 / AC-214/217 | 成就说明两列 NULL 合法且不显示空说明块；中文/英文单侧回退、双侧当前语言、纯空白归 NULL；管理读取保留原始槽、不回写回退值；正文按纯文本处理；编辑后读取更新但既有称号快照/达成/领取/余额不变；迁移空库/M001 库一致，已有成就实例补列时原记录不变 |
| DB2-V21 | FE2-G02 / AC-211/217 | 签到五值一次保存只进一个全局 revision；mastery 提交后生效，四值下一学习日生效；重复修改同未来日只一条 pending；最后一步失败五值及 revision 全不变；03:59/04:00、排队拿锁跨日不能改生效历史，已签/已发经验不变 |
| DB2-V22 | FE2-G02 / AC-214/217 | 修改多档并新增第五/第六档，原 id/award 保持；内容弹窗说明和奖励一起保存；未提交/分页/筛选外行保持且参与校验；`[0,100,200]→[0,200,300]` 可成功，同类成就合法门槛迁移亦可；最终重复门槛、非递增等级、未知/重复 id、跨 kind、非法卡引用、初始等级奖均整组拒绝；最后一行/延迟约束失败无部分写入、无 revision 推进 |
| DB2-V23 | FE2-G02 / 并发与恢复 | 两管理员同 revision 保存至多一组成功；配置保存与领奖/模型下架/卡定义编辑两种先后都遵守同锁序，领奖读完整旧或新配置；不混五值/跨页 revision；提交前故障全回滚，COMMIT 不明重读；成功响应丢失后原版本重放不重复新档/发奖；重算游标与 revision 一致、任务不在持锁事务内，V20–23 必须以真实 PostgreSQL 故障/并发测试验证 |

### 14.1 已知未决与接收条件

- DB2-Q01/02/03：纠正和确认均已落在 §1.1；无待答复的需求项。DB-02 历史批准保持，当前 DB-03 两项数据库修订待审；实际迁移、并发与性能尚未验证。
- M002-CR-003：设计接收已由 012 关闭；DB2-R07–09、DB2-T14、DB2-V17–19 继承不变，实施验证仍待执行，不重新打开旧 CR。
- M002-CR-004：DB2-R10/11、DB2-T15/16、DB2-V20–23 完成 DBA 方案部分。需批准 DB-03 后由守门交 backend-alex：FE2-G01 补管理/个人说明 DTO；FE2-G02 用单事务命令承接三个表单保存、整组降级影响预览与确认绑定、行错误/未知提交重读；FE2-G03 补管理员生成选项严格 DTO 和缺凭据/无模型分支。随后由 frontend-bob 补 schema/mock/表单编排并复核。CR 仍 OPEN，不能据本稿批准 FE-01 或进入实现。
- 运营初始数值：优先级、签到递增/封顶/经验、等级/成就门槛、商品价格与期限由后台运营填写；原型样本仅用于隔离测试。正式启用要有一份经运营确认的有效配置，DBA 不代用户决定商业数值。
- backend-alex：落实锁顺序与现有仓储整合、无答案持久化的提交/重试/重来接口、同一配置事务快照、计量来源退款、配置即时可见、下架身份与退换计算、分析关联删除；API 路径与 DTO 不由本稿越权指定。
- frontend-bob：接收 [M001→M002 差异明细](../design/frontend-delta.md)；本机 IndexedDB 草稿的恢复、账号隔离、终态清理/存储失败提示，临时总结离开即丢，服务端状态优先。CAP-209 同日欢迎分支继续待补，不因本稿认定设计原型已实现。
- 保留 CR-001/002 的应用落实，CR039-L1、CR042-L1、AI-QUALITY-90 的既有状态；本次不扩大词形/诊断范围或授权真实模型质量评测。

### 14.2 文档自检边界

输入、源码与控制面保护摘要见 [输入记录](./evidence/M002-DB-03-inputs.json)，本轮[静态检查](./evidence/M002-DB-03-check.json)、[冻结清单](./evidence/M002-DB-03-manifest.json)和[准确版本快照](./evidence/M002-DB-03.tar.gz)定位待审版本；[DBA 交接](../handoffs/database.md)是当前角色交出入口。仅修订本角色正文/交接及 CR-004 的 DBA 解决记录，保留既有 DB/BE/FE 冻结原件、上游批准稿、控制面及应用代码。新增说明对应现有 DATA-209，整组保存复用 DATA-206/208/209，没有新增产品资产。

因 32 个数据索引、49 个能力及完整一期结构继承，定向产品读取超过 8k token 软目标；已读整理协议，交接保持小入口、按节定位正文，不复制全部历史。实际 token/运行时费用未知，未声称模型切换；数据库架构按路由锁选择 frontier/high 的语义档位，实际运行配置未观测。独立新会话接收未执行；静态自检不能代替实施并发、隔离数据库迁移、压测、恢复演练或独立 QA。
