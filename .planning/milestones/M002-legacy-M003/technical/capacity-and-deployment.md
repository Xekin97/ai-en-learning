---
id: BE6-CAPACITY
milestone: M003
version: M003-BE-06-R1
role: backend-architect/base
agent_name: backend-alex
status: awaiting_user_review
date: 2026-10-10
---

# 初创部署、容量准入与演进

`CONFIRMED`：USER-M003-STARTUP-CAPACITY授权低成本起步及后续升级设计，常规参数由后端提出。以下数值均为**设计初值/待验证目标**，不是实测容量、云商报价或SLA。继承PRODUCT07、DB03、UI09-R2、BE05-R1内容链路与规划保留；关联CAP-302/304/305、DATA-302/304、API-302/304、PAGE-204/212/216。只增进程准入和错误合同，不改数据表/业务计次/已受理权益。

R1依据USER-M003-CAPACITY-RECALIBRATION撤下“生产默认2/仅2→4验证”。**2绝不是已知并发极限，真实安全上限未知；上一版默认2过于保守且没有测量依据。** 本机负责I/O等待、编排和校验，模型推理在远端；2核不等于只能挂2个请求，CPU只在实际处理片段/校验等工作时消耗。20是本版提出的正常短文首个容量评估目标，不是用户已确认指标或支持承诺。

## BE6-C01 单机起步与资源账

选择Linux **2 vCPU / 4GiB RAM / 40GiB SSD**，Go一个进程/副本，现有PostgreSQL 18、Nuxt Nitro、Nginx同机Compose；镜像预先在开发机或CI构建，生产只拉取固定digest并替换，禁止在线npm/Go构建、质量批次或压测挤占服务。Compose单服务器是可行部署方式，生产需单独配置环境/重启策略，不能把现开发compose直接当容量配置。[Docker生产Compose](https://docs.docker.com/compose/how-tos/production/)

| 项目 | 容器内存硬界设计初值 | CPU最大配额初值 | 说明 |
|---|---:|---:|---|
| Go | 1536MiB | 1.0核 | 包含嵌入词典、实际受理的并发流、解码/校验和短事务；不是每连接分配1.5GiB |
| PostgreSQL及受控备份子进程 | 1024MiB | 0.5核 | 数据/WAL持久卷；后台维护与备份在该预算内、低峰串行 |
| Nuxt Nitro | 512MiB | 0.3核 | 单生产进程，不运行dev/build；静态资源由原代理缓存规则处理 |
| Nginx | 128MiB | 0.1核 | 保留控制接口流量和SSE转发 |
| 宿主/Docker/可用余量 | 896MiB | 剩余0.1核及空闲调度时间 | 不分配为另一服务；CPU配额是最大值不是性能保证 |
| 合计 | 4096MiB | 2.0核 | 四容器硬界合计3200MiB，宿主余量21.9% |

生产overlay拟用各服务`mem_limit`/`cpus`；具体Compose版本部署前核验生效。Docker默认无资源硬界，reservation是软提示，不可拿它当上限；OOM仍可能杀容器，限制并不替代测量。[Docker资源约束](https://docs.docker.com/engine/containers/resource_constraints/)

Go词典/RSS当前未测。**正常E≤10、100–400词候选**与**病理16MiB raw/200万rune正文**分开量测：BE3-09的80–160MiB甚至更高只描述后者，不能直接乘20作为日常内存，也不能假设短文每请求零内存。保留空载RSS≤512MiB及负载峰值≤Go硬界80%（1228.8MiB）的拟测门槛，不再用512+2×160推生产槽数。

容量估算输入必须来自固定构建/词典/资源限制实测：I=空载稳态RSS，M(C)=C个实际活跃正常流的进程峰值，Δ(C)=(M(C)−I)/C作为该档平均增量诊断（共享GC/缓存使其不是每请求精确归因），H=实测额外峰值余量。仅在相邻档增量近似稳定时，用`C_mem=floor((1228.8−I−H)/Δ)`辅助选下一档，随后实测确认；Δ未知、≤0或非线性时不外推。CPU使用率/GC、控制API P95、池等待与写阻塞也须同时通过，内存公式单独不能给安全上限。当前I、Δ、H及CPU上限均unknown。

正常目标20并不证明20个同时最大输出安全。安全界不缩小、不删已受理步骤；单大输入及大输入与普通混合、同档同时大输入分别验证原解析/队列界。未来边界实验逐级、接近资源阈值即停止增加offered负载，不以OOM作为成功边界。若正常档通过而允许输入的并发边界未通过，该档只能记“正常负载通过”，不能直接作为全输入生产容量；先修既定缓冲复制/资源预算或选合格较低档/扩内存，不在本轮新增内存调度平台或承诺大输入已安全。

PG运行参数候选：shared_buffers=256MiB、work_mem=4MiB、maintenance_work_mem=64MiB、autovacuum_work_mem=32MiB、max_connections=20；属于部署参数，DBA在实施时核对词表/查询/备份峰值后落配置，非改DB03数据设计。work_mem是每个排序/哈希操作预算，多个操作/连接可倍增，不能按4MiB×连接数推总内存。[PostgreSQL 18资源参数](https://www.postgresql.org/docs/18/runtime-config-resource.html)

沿用现代码APP_DB_MAX_CONNS=4、AI_DB_MAX_CONNS=4、MinConns=0，总应用最多8连接；20中留12给维护/诊断/恢复及PG保留连接，不能都给普通请求。`platform/postgres/postgres.go`当前statement15s、lock5s、idle-in-transaction30s、connect5s保持；生成预检另用2s上下文（包含等待池/锁），模型等待不持有事务/连接，不把数据库池按SSE连接数扩张。2s超时是既有temporarily_unavailable，不伪报成功或已退款。

磁盘预算：系统/固定镜像10GiB＋PG数据/索引/WAL12GiB＋已有授权备份暂存8GiB＋轮转日志2GiB＋空闲8GiB=40GiB。是分配账不是预计实际用量；不删业务数据/WAL来满足表格。日志stdout轮转每容器20MiB×3（四容器240MiB），系统日志另限512MiB，余量用于轮转短时峰值；诊断正文默认关闭，令牌/模型正文不进入普通日志。PG/WAL>12GiB或空闲<20%即清理可删除旧镜像/无正文轮转日志并安排扩盘，不能等盘满。

## BE6-C02 并发口径、配置与原子准入

| 口径 | 具体定义/配置策略 |
|---|---|
| 在线人数 | 最近5分钟发生页面/API交互的主体数（已有统计可估，未观测不填0）；不是服务器连接数。仅阅读不占生成槽 |
| 全局容量槽 | `GENERATION_MAX_IN_FLIGHT=C_prod`，生产值尚未测定，无静默数值默认；global数=普通/用户预设/后台preview租约＋真实模型probe租约。生成租约从预检完成准备受理持有至本地pipeline、writer、上游连接与有界结算清理结束；active_generation指标只计前三类，不含probe |
| 预览子上限 | `PREVIEW_MAX_IN_FLIGHT=1`，是总槽内子集，不额外加1；无预留专用槽，用户run可占满总槽 |
| 连接级上限 | `AI_CONNECTION_MAX_IN_FLIGHT=L_i`须按每个真实账号/group的已核并发及RPM/TPM核定，不默认2、不把未知当无限；多个model复用同connection共享此限。与总槽取交集，连接/模型切换不能增总额度 |
| 模型并行调用 | 每个受理run各阶段串行，因此本地实际provider流（含probe）≤global租约≤C_prod；阶段数增加的是占用时长/调用量，不是每run同时开启4个模型 |
| 预检护栏 | `GENERATION_PREFLIGHT_MAX=P`仅限制短预检（不同于模型并发）；替身每档P=C_test，生产P取控制接口与预检压测通过的配置，不能隐藏硬编码2。Try进入、零等待；不属于长生成槽，也不是持久任务 |

区分四个数：拟测正常目标20（设计愿景）、C_safe（实测合格档，并非证明绝对物理极限）、C_prod（部署人为准入）、L_i及供应商RPM/TPM（外部限制）。正常候选阶梯10→20→50→100，先验证10再20；更高档只在前档通过后探索，2仅故障排查/实验基线。生产`C_prod≤C_safe`且连接L_i不越已知额度，总能力取实际连接分布与RPM/TPM较紧条件；供应商资料/应用测量未完成前不填写“已支持20”。部署配置显式必填，缺失或未核准不开放生成ready，不自动回退2；代码实现/上线前完成这些验收，不阻塞当前FE02设计。

上述新配置均部署环境参数，不进入用户计划/管理N或HTTP输入，不新增可配置后台页面。启动严格校验正整数及preview/connection有效值≤global；修改需受控排空后重启，避免降低上限时中断已受理服务。零等待表示不排FIFO、不hold用户请求等下一空槽；DB正常短事务仍会有有界锁/连接等待。

**具体接入顺序**（普通、用户预设、后台preview共用一个CapacityGate实例）：

1. 沿HTTP鉴权/角色/CSRF、64KiB严格body与已有认证限流。先尝试短预检guard；不可用直接API-302 generation_busy，无事务/业务run/charge/provider。鉴权仍优先于资源存在性；护栏可先于昂贵业务错误拒绝，不承诺满载时仍揭示额度/输入细节。
2. 2s预检ctx内沿现`Service.start/startPreview`：配置共享锁→主体/管理员及预设版本核验→有效计划/输入/词表/模型授权→BindSpec不可变连接→额度/同主体active检查。绑定仅从AI池读凭据，不发provider。普通原SQL唯一active约束仍兜底；后台仍按版本/mode规则。
3. **在第一次INSERT run/Reserve charge/开始事实前**，一个进程mutex中`TryAcquire(kind, capacity_connection_key)`同时检查draining/settlement_health、global、preview子限、连接子限/已知冷却；全满足才一次加所有相关计数并返回不可复制Lease，否则一个都不加、事务回滚、guard释放、503。mutex内不做DB/I/O、不等待其他许可；不先占global再等待preview/connection。本设计不要求数据库锁序变更，持事务的TryAcquire只做常数时间判定。
4. lease取得后原受理事务一次写run/charge/entries/快照；rollback或确定未提交则release once。COMMIT未知立即依第6步在Gate锁内关闭新准入，再按原5s核对，不得改发generation_busy或声称零扣次；provider尚不调用。确定受理后lease移交run handler，guard释放；started flush成功才首个模型任务。
5. 所有正常完成、失败、取消、断流、started写失败、Open失败走同一个once清理。**数据库cancel CAS成功不立即释放租约**：先停止后续任务、取消/关闭上游body，join本地pipeline/writer及完成必要有界结算后释放；否则短时间可越过实际并行上限。外部提供方可能继续计费，不等它给“停止收费”证明才释放本地资源；这部分费用保持事实/unknown。
6. DB无法确认终态时不伪造退款或Q02。受理COMMIT未知与终态结算未知均纳入健康栅栏：在同一个Gate锁内先置settlement_health=false，再允许该lease的once释放，禁止释放与关栅栏间穿插新准入。先停止本地调用/join清理后才释放该lease和大缓冲；原registry必须保留run ID、namespace、已知提交/发送/待核对结果等最小pending事实，不能因释放容量而丢失。沿现维护逐个核对已知pending，确认DB可用且无受理或终态未决记录后，才在同一Gate锁内重新开放；只读核对失败保持关闭，不影响status/cancel尝试核对。无新增任务表/后台重跑AI。

同主体最多一个业务active仍由原事务/唯一约束保证；容量lease不是业务锁也不是可恢复租约。进程崩溃内存计数归零，仅在原启动恢复完成后开放；不得因为计数为0略过DB active恢复。

**关键接口保留服务**：登录/浏览/保存/取消/status/健康检查均不经过生成容量Gate，不排在模型等待后。APP池仍4、AI池仍4，P不是数据库连接数；P=C_test时短预检可在2s上下文内等池，不能把模型整个流绑住DB连接。没有物理保留连接，需量测突发预检与控制接口的竞争；通过2s预检界、无跨模型事务及BE6-C04混合负载验收控制，沿既有认证限流防重试洪峰，不另建连接池/网关平台。

## BE6-C03 上游约束与忙碌行为

新错误只在API-302定义，API-304继承：503 generation_busy、Retry-After秒数；不存在run/token/退款，因为尚未受理。无自动重POST、无排队位置、不自动恢复生成；UI保留输入，使用已批准布局内现有错误反馈区域。容量不足不进入Q02，不换更快/更便宜模型，不缩词/缩长或跳过增强任务。

连接上限由`GenerationSpec.connection.connection.ID`派生不透明内部key，不用URL/明文key做标签、不公开provider身份。多个Connection实际使用同一供应商账户时，部署映射到同一capacity group（配置文件映射现有UUID，无DB列）；未映射不意味着它们拥有独立RPM/TPM。管理探测若会真实调模型，也经过同一global/connection即时gate，最多一个探测；global/connection/probe≤1在同锁all-or-none申请、同样once清理后释放，不占preview子槽；不写生成run/charge，原探测错误封套下503沿相同忙碌code。只读/保存模型配置不占槽。

并发上限**不能保证**提供方RPM/TPM额度：同run有planning/generation/fixed_edit/technical_repair/content_review/content_repair多次串行调用，未知输出token不能精确预留。上线前按目标账号公布的并发/RPM/TPM与实际各stage用量核对；未获额度信息不声称已匹配。观测滚动60s调用/token，持续逼近公开限额80%时降低新请求容量/人工限制入口，而不砍已受理链路。只有提供方真实429触发原rate_limited/Q02映射（有lastValid等条件）；同连接对**新受理**设冷却，Retry-After可解析时沿其时长，否则30s，内部冷却上界600s。已受理run保留原快照/预算且不因本地新请求Gate返回busy；它发生真实429时不自动网络重试。调低槽数解决不了低TPM则先处理提供方额度/计费，与加CPU无关。

内部冷却不是持久队列，重启丢失该短期提示不重发旧任务；同一连接只保留一个截止时间。故障或网络可能消耗token，不能把取消或refund当供应商免费。

## BE6-C04 速度目标及有限验收

T0=Go生成路由handler进入、读取body前的单调时钟；Taccept=受理COMMIT确认；浏览器点击到显示另记包含客户端网络/DOM的时间，不能冒充后端计时。首规划=第一个真实plan_item flush成功；首正文=第一个真实provider edit flush成功；完成=DB valid后完整validated写出（status恢复另列），不能用最后token/内存lastValid算完成。

**服务可控P95目标**：参考负载下预检到started≤500ms；已知忙碌响应≤200ms（连接级核验受DB影响，仍记实际值）；safe片段到flush≤100ms；status≤300ms、cancel确认≤500ms、普通保存≤500ms、登录≤750ms。全是目标，不是硬超时；15s心跳不是内容，50ms合并不是首字时延。

**依赖真实模型的体验P95目标**（从T0起，代表E≤10；所选zh/en/ja按样本分层；其他E仍支持但未覆盖这组目标）：

| 内容组 | 首规划 | 首正文 | 正常完整交付（t=0、k=0） |
|---|---:|---:|---:|
| 普通/N0，medium≥100词 | 8s | 20s | 60s |
| 增强/N1，medium≥100词 | 8s | 20s | 120s |
| 普通/N0，xlong≥400词 | 12s | 35s | 120s |
| 增强/N1，xlong≥400词 | 12s | 35s | 210s |

增强另单列条件返修：medium完成1轮目标180s/2轮240s，xlong1轮330s/2轮450s；基础恢复次数t、内容k及Q02分别报告。不能为追上目标跳步骤，也不因此降低N。原每模型180s/总执行600s和独立完成ctx仍是保护截止，不是速度目标；超过体验目标继续真实状态，达到真实deadline才原故障处理。

**分母防止掩盖失败**：每个预定采样窗口记录所有合法尝试A、未受理busy B、已受理R（分模式/长度/模型连接/真实t,k）、取消、断流、failed、pending和valid/Q02。端到端窗口必须等待受理 cohort 满600s＋有界结算窗口再封账；尚未成熟的样本报pending不丢弃。对首内容目标，目标时刻前失败/取消/断流/无内容均为未达标；对完成目标，未valid、超时、取消/断流均未达标，Q02可算“交付及时”但不能算增强服务完成。报告`按时且完成增强流程/R`、`按时交付/R`、busy/A以及成功样本P50/P95，不能只报成功P95。

全受理P95用未达终点样本记+∞的达成分位/累计达成曲线，≥5%未达时不得写有限P95掩盖失败。t/k分层只用于诊断，不把“没有成功进入k0”移出全受理主分母；额外列用户主动取消影响，不从主分母悄悄删除。每格至少200已受理、每个目标至少两个独立窗口才用于调参，不足时只给n/分布/未达数，标样本不足。真实模型测速没有本轮授权，以上仍待验证。

**后续替身验收（本轮不执行）**：同2核4GiB资源限制，用既有provider stub执行正常E≤10、100/400词的普通/增强链路，先10再20个admitted并发；20是首个有意义的日常短文评估目标，用来观察共享服务在数十个I/O等待流下的成本，不是从CPU核数推得。前档通过才探索50、100，首次失败停止升档；2仅诊断基线。每档`global=C_test、connection=C_test、preflight=C_test、preview=1、probe=1`，替身账号无真实RPM/TPM且延迟/分片率固定记录；不拿这个配置套真实provider。50浏览会话/总10个非生成请求每秒保持，累计普通/增强各≥200受理并达到既定窗口门槛；诊断失败档可提前停止并标样本不足。

offered是同时到达意图，admitted是拿到lease且真实活跃的run。用不同主体逐步填充并保持C_test活跃，避免同主体active规则或短预检突发把20档测成只有2个运行；记录实际活跃高水位/持续时间、预检拒绝与池等待。另在已满C_test时送短突发20个意图核对即时busy，不将拒绝测试说成更高执行并发；P=C_test也不保证同时提交C_test个一定全部受理，2s池超时必须计失败。控制API不达目标则该档不合格，不能通过隐藏预检瓶颈宣布目标已达。

常规量测与C01的大输入边界报告分离。原fixture只需有限k0/1/2、cancel/EOF/pending、429/SIGTERM验证，不扩检查矩阵、不执行3–99轮；99仅配置/公式静态。快速503单列busy延迟，绝不进入生成P95；未首内容/未完成的受理请求仍按前述分母计未达。替身证明的是后端处理/资源边界，不能证明真实模型8s/20s/完成目标或外部并发额度。

## BE6-C05 背压、停机与恢复

沿BE3-09：串行writer，普通队列≤8事件/64KiB，满即背压上游hook、无丢seq、无忙轮询；write10s失败cancel上游并走原stream_failed，资源清理后release。三种生成POST（普通、用户预设、后台preview）都必须代理禁buffer/cache/gzip，并保留15s注释心跳及75s空闲读取界；现Nginx只对普通stream独立配置，实施补齐另两路，不能把心跳当正文进度。Nginx关闭buffer后尽快转发上游响应，这仍不保证客户端显示延迟。[Nginx proxy_buffering](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_buffering)

发布时先停新生成准入再排空，仍保留HTTP listener供status/cancel/save。拟总SHUTDOWN_TIMEOUT=650s、Compose stop_grace_period=660s：SIGTERM先原子置draining/ready=false，已有run最多剩600s；待lease归零可提前结束，610s仍有任务则取消/关闭上游，20s有界结算/核对，最后≤10s HTTP shutdown，余量10s。强制终止不是用户cancel，不伪称Q02；既有valid不回滚，其余沿server_failed/stream_failed与DB未知规则。并非每次发布都固定等650秒，通常活跃run结束即退出。

`cmd/wordweave/main.go`当前SIGTERM立即调用HTTP Shutdown（默认30s），启动`maintenance.SettleActiveGenerations`扫描全部active；`generation/registry.go`取消为进程内。因此需实施排空顺序/650s参数/容器grace一致性；现代码尚未完成BE06。新进程必须等旧进程真正退出，再迁移/启动恢复并ready，禁止重叠蓝绿或`compose replicas=2`。粘性路由也无法阻止新进程把另一进程active误结算；单副本约束来自已确认[DEC-027](../../M001/decisions/DEC-027.md)。

最低数据安全继续DB03/M002及一期已有恢复政策：加密备份与密钥分离、至少一份已验证可恢复副本在故障主机之外，备份/WAL是否可用必须在开放真实写入前核实；不把同机卷或Docker restart当备份。沿既有每日逻辑备份/原恢复窗口与删除补救，不新增保留期限或默默取消已有PITR目标。原RPO15分钟/RTO4小时仍是待演练工程目标；只有daily dump不能证明15分钟RPO，需沿已有WAL归档能力验证。外部备份容量按压缩数据×既有份数＋实际WAL日增长×既有窗口核算，40GiB本机8GiB暂存不能替代外部空间，费用unknown。来源：[DB03恢复约束](database.md#db3-08-保留数据的迁移恢复与验证)、[一期备份基线](../../M001/technical/database.md#12-备份与恢复)、[PG备份方式](https://www.postgresql.org/docs/18/backup.html)。尚无可验证恢复/删除补救时不开放写入，不在本轮擅自新建备份资产。

恢复先核账号/批次删除、原charge/claim和迁移版本，不能复活已删数据/重复扣退；未知模型发送不重放。回退优先前滚；旧二进制若不能理解DB03/v5事实不能直接上线。备份与恢复部署尚未执行，无可用性承诺。

## BE6-C06 何时升级、为什么现在不加MQ

正常吞吐粗估为`60×C/平均lease占用秒数`请求/分钟（饱和、不含拒绝/故障与供应商限额）：例如假设C20且平均60秒≈20篇/分钟、平均120秒≈10篇/分钟；两者均未测，不是生产承诺。生成槽数不是在线人数；在读文章/复习的会话不占它。P95不能代入平均数当吞吐预测，模型串行慢时加CPU也不会令token更快。

| 触发证据（初始告警/评估值） | 最小动作/完成条件 |
|---|---|
| 两个独立≥30分钟窗口，合法生成busy/A>5%且R≥200/窗口；CPU<60%、宿主内存<75%、Go峰值<80%硬界，控制API目标通过、无上游429 | 先同机试当前合格档的下一阶（10/20/50/100，不强制跳满），不默认买机器；两窗口满足目标/无OOM/无未决增加且C01边界核验通过后才受控调配置，preview仍1，connection额度独立核验。失败回最近合格部署档，不固定回2；正常平均增量与病理边界分别报告 |
| CPU>70%或RSS>80%界持续15分钟、GC/控制API延迟越目标 | 先查累计全文扫描/复制、池等待/慢客户端；修局部瓶颈或调资源。仍不满足才评估4核8GiB，单副本保留 |
| PG CPU/I/O/连接等待主导，池等待P95>100ms持续15分钟，生成准入之外控制请求变慢 | 先查慢SQL/索引/长事务，禁止盲涨池；必要时分离PG（或复用已有托管方案）并由DBA接收延迟/备份/网络变化 |
| Nuxt持续挤占预算、静态/SSR请求主导 | 优先复用静态缓存与预构建；有测量后把前端迁出，API仍同源代理/会话规则，不擅改产品为纯静态 |
| 上游429或RPM/TPM>已知限额80% | 降新请求并发/处理供应商额度和费用，不以买主机解决；已受理服务不静默减配 |
| 多机容灾/无中断滚动发布或离线任务成为明确需求，单机纵向仍不能满足经确认目标 | 单独设计owner/lease/fencing、跨进程cancel、局部启动恢复、全局准入/唯一结算/流路由；完成审计后才谈多worker/持久任务/MQ，不是改replicas |

上述窗口同时满足时间与样本门槛：低流量时需延长窗口直到至少200已受理，不能把30分钟等同200样本或为了凑样本发付费请求。

当前请求必须与浏览器连接同生共死，没有离线交付/跨刷新恢复要求；外部MQ会引入排队状态、取消竞态、任务重投递和新的持久化生命周期。RabbitMQ工作队列提供任务分发、ACK及连接失效重投递，但不替代本业务的配额幂等/取消/结果结算；重复执行收费模型尤其需独立设计。当前采用进程内零等待准入，不部署MQ/Redis/Kubernetes，不预建通用worker接口。[RabbitMQ工作队列](https://www.rabbitmq.com/tutorials/tutorial-two-go)

## BE6-C07 最小观测、成本与交接边界

复用已有observability metrics、generationtrace和ai_call_usage：新增有限的active lease/global-preview-connection计数、busy原因计数（标签不带用户/秘密）、预检guard占用/耗时、入站/首plan/首body/终态时间；外加现有HTTP延迟、PG池等待、进程CPU/RSS/GC、SSE字节/写阻塞。一次请求内累加，结束汇总，不逐token落DB、不另建监控或成本平台。价格未给云商/地域，金额全部unknown。

月成本账分固定主机/磁盘＋按既有保留策略的外部备份/WAL空间与请求/流量＋实际网络出口＋模型六stage的known/partial/unknown用量费用；正常普通2次、增强4次，加真实t/k不能按一次业务quota算一次模型费。连接秒不是CPU秒；用替身固定负载比较进程基线差异/完成请求均值，不能把Go共享GC/RSS算为逐请求精确账单。修复流协议不等于模型质量或延迟改善。

实现owner接点：config/compose生产overlay、httpapi三个入口及Problem、generation.Service共享CapacityGate/Lease、ai连接身份/冷却、main停机顺序、nginx三路SSE。无DB schema变化；DBA仅核运行参数/备份能力，DB03的v5枚举/版本实施依赖仍保留。FE02接API-302忙碌错误，保留输入/显式再试且不造run/队列/退款；UI09-R2已确认视觉、BE05-R1规划保留与v5 reducer不改。当前只提交设计和静态证据；没有部署/购买/迁移/应用或真实模型压测授权。
