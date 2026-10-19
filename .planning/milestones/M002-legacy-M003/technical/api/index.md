---
id: API-M003
version: M003-BE-08
status: awaiting_user_review
milestone: M003
agent_name: backend-alex
---

# M003 Markdown API 增量

继承 [M002 公共传输/鉴权/错误](../../../M002/technical/api/index.md) 与 [多提供方契约](../../../M002/technical/api/model-connections.md)。统一前缀 `/api/v1`；JSON严格字段、重复键/未知键/类型/null/尾随校验；成功JSON仍 `{data,meta:{request_id}}`，SSE data没有封套。本文类型中未标nullable的字段均必填非null；所有数组即使为空也不可null。所有副作用和只读POST需要原CSRF，cookie身份不变。USER-COMPAT-001：前后端配套切换，移除旧passage.delta以及BE02 stage/snapshot/candidate公开消费分支，不做旧客户端兼容层，不建OpenAPI。

| 契约 | 能力/数据/页面 | 对原API的增量 |
|---|---|---|
| [API-301/302](generation.md) | CAP-301/302/305；DATA-301–303；PAGE-204/215/216 | API-004选项、API-005生成/终态、API-006保存资格 |
| [API-303](administration.md) | CAP-303；DATA-301；PAGE-208 | API-103计划完整字段、impact/revision/优先级 |
| [API-304](presets.md) | CAP-304/305；DATA-302–304；PAGE-212/216/217 | API-202公开预设和管理员mode/预览/发布 |

接口只暴露调用方所需权益和安全状态；不公开私有review、prompt、provider ID、connection或内部审稿意见。公开终态枚举与completion_notice只说明交付/审校过程，不是独立质量评测。后台usage继承获授权的数值投影。数据库 [DB03](../database.md) 已接收六stage/七stop reasons/版本约束设计，TECH03已有实施及合成QA，CR306已由096历史接收，新CR311/312未实施；pipeline与review以 [AI3](../ai-integration.md) 为真源。示例仅展示schema，不是达标文章、产品种子或真实使用数据。

历史BE05流版本为`m003-stream-v5`：共同实际规划的完整场景/用词条目投影plan_item，完整Plan输入writer；增强新增必经固定编辑。保留v4的真实版本化edit splice/Q02 retained与全部结算规则，业务V独立于N。完整样例：[stream-v5/index.json](../fixtures/stream-v5/index.json)，限定检查：[check_stream_v5.py](../evidence/check_stream_v5.py)。普通/后台basic也有规划，后台enhanced固定编辑后最多1条件返修；无旧协议兼容/恢复平台。v3/v4原件留存。

历史BE05-R1仅按USER-M003-PLAN-RETAIN把初始规划显示延长至权威valid完整结果，协议仍m003-stream-v5；原v5样例/检查冻结保留，其“首片隐藏规划”断言为历史，不是当前显示规则。当前规则与定向静态证据见 [R1显示政策](../evidence/be05-r1-display-policy.json)及 [R1检查](../evidence/be05-r1-check.json)。

BE06新增受理前HTTP503 generation_busy＋Retry-After，唯一结构见 [API-302](generation.md#api-302-受理前忙碌拒绝be06)，普通/用户预设/后台preview共用；API-304不另定义同义错误。已有真实模型连接探测也须经同一进程容量保护，受理前拒绝复用此Problem，不为探测新增生成run或额度。容量与升级初值见 [BE6-CAPACITY](../capacity-and-deployment.md)；BE06当时SSE字段为m003-stream-v5（当前v6见下），不新增queue事件。

<a id="api-306-index"></a>
## CR-306 / BE07 已接收基线入口

[API-306模型自定义参数](administration.md#api-306)为CAP-306/DATA-306/PAGE-208的DTO、校验/保护名单、合并、原子保存及probe错误唯一真源；[生成](generation.md#api-306-generation)、[预设预览](presets.md#api-306-preview)、[三协议快照/期限](../ai-integration.md#ai7-reasoning)分别接续。没有新能力目录端点；旧typed候选不属当前合同。BE07当时公开wire为m003-stream-v5（当前v6见下），管理员模型DTO新增必填custom_parameters、原端点配套切换。

完整管理/错误/流输入：[cr306/index.json](../fixtures/cr306/index.json)，附expected/internal_evidence不属于API、不能驱动产品显示。历史stream-v5原件保持，当前规划保留规则沿BE05-R1。有限静态证据：[check.json](../evidence/cr306/check.json)。TECH03已有实施与合成QA不等于本增量或真实故障已通过；BE07历史下游接收见096，不作为当前待办。


<a id="cr311-312-index"></a>
## BE08 / CR-311/312 当前入口

当前公开协议为[API302 m003-stream-v6](generation.md#cr312-wire)，替换上文v5的稿件首片删尾/生命周期；原v5 fixtures仅历史，不覆盖新union。新增activity与draft begin/paragraph_complete/body_complete/discard，继续使用splice，不新增公开审稿细节。API304 preview同步同一union，status版本同步v6，持久pipeline/policy与数据库保持v5/v1，理由见[BE8-DB](../backend.md#be8-cr311-312)。[API004候选资格](generation.md#cr311-candidates)只为新搜索/随机排除DATA307，DTO/hash/原目标有效性不变。

[当前有限fixtures](../fixtures/cr311-312/index.json)、[本轮静态检查](../evidence/cr311-312/check.json)、[当前交接](../../handoffs/backend-architecture.md)为下游接收入口；未实现、未独立QA、未批准正式UI，不沿用096声明新验收通过。CR306模型配置契约继续有效。
