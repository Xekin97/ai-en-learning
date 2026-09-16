---
milestone: M001
stage: technical-design
role: frontend-architect/base
agent_name: frontend-bob
status: awaiting_user_review
date: 2026-09-05
change_requests: [CR-033]
contract_version: v1.4
upstream_approval: TRANSITION-M001-062
---

# CR-033 前端额度契约同步

## 1. 基线与边界

依据 [TRANSITION-M001-062](../reviews/technical-backend-cr033-approval.md) 已批准的 [API v1.4 §12](./api/index.md) 与[后端增量方案](./backend-cr033.md)，补齐 PAGE-103 用户详情“可用次数”的前端映射、状态、验证和配套交付。本文件为待审方案，不代表生产实现或测试通过。

- [CR-029–032 方案](./frontend-cr029-cr032.md) 已由 [TRANSITION-M001-061](../reviews/technical-frontend-cr029-cr032-approval.md) 批准。其 query-modal、父搜索恢复、typed auth intent、精确文案与状态隔离继续实施；本文件仅替代其中 CR-033“未获范围授权/尚无契约”的历史阻塞说明。
- 保留 DEC-030/031 的 Nuxt SSR、TypeScript、Vite、feature composable + useState 及现有锁文件。不重新选框架、状态库、渲染方式或依赖版本。
- 保留批准的详情信息网格、换组确认框和错误反馈；不新增额度卡片、刷新按钮、定时器、独立请求、写能力或报表。不修改 API-004 的生成权限判断。
- 追踪：PAGE-103 / CAP-104（读取）/ CAP-105（换组）/ CAP-021（语言）/ DATA-003/006/009/018 → API-103 GET detail、PUT group → admin detail 状态与 presenter。组策略/计量事实仍在后端，不传输事件明细。

## 2. 取舍与代码依据

| 方案 | 影响 | 结论 |
| --- | --- | --- |
| 在完整用户详情模型中携带额度 | GET 与换组共用转换，可一次更新方案和次数 | 采用；符合批准的完整投影 |
| 独立额度 store 或前端拼组上限 | 容易产生两份用户状态，且上限不能代表剩余 | 不采用；不新造 quota 端点 |
| 缺字段时兼容成不限 | 页面看似可用但业务结论错误，掩盖版本不匹配 | 禁止；维持严格契约失败 |

当前 `frontend/app/infrastructure/http/schemas/admin.ts` 的 `adminUserDetailSchema` 是严格 learner/admin 联合，由 GET 与 PUT envelope 共用；`mapAdminUserDetailDto` 和 `mapUserGroupChangeDto` 也已有共用链路。当前详情没有额度字段，页面直接渲染 `common.unlimited`，store 尚无详情请求代次保护。本方案扩展既有边界，不在 Vue 模板中补 transport 分支。

## 3. DTO → 应用模型 → 视图

### 3.1 严格输入

只扩展 `AdminUserDetailDto`；`adminUserSummarySchema`、搜索分页/cursor、批次 DTO、生成选项 DTO 全部保持原形。GET `/api/v1/admin/users/{user_id}` 的 `data.user` 和 PUT `/api/v1/admin/users/{user_id}/group` 的 `data.user` 使用同一个严格详情 schema。

| 合法目标/DTO | 应用字段 generationQuota | 详情显示 |
| --- | --- | --- |
| learner；`generation_quota:{kind:"limited",remaining:N}`，N 为非负整数 | `{kind:"limited",remaining:N}` | 完整整数，包括 0 |
| learner；`generation_quota:{kind:"unlimited",remaining:null}` | `{kind:"unlimited"}` | 不限 / Unlimited |
| admin；`generation_quota:null`，plan_code=null | `{kind:"not_applicable"}` | 既有 `admin.notApplicable`：— |

额度对象只接受必填 `kind`、`remaining` 两个键。缺失、负数、小数、数字字符串、未知 kind、多余属性、limited/null、unlimited/数值、learner/null、admin/对象均为 `contract_violation`，不能局部渲染 user。前端无法从该 DTO 验证 N 是否超过当前上限：上限未传输，此业务约束归后端 Q01–Q10；不能借机增加 limit 查询或字段。

现有用户 ID、plan_code、ui_locale、created_at、learning_batch_count 和 envelope 校验不放宽。PUT 的 `quota_reset:true` 仍必填；命令成功用户必须为 learner、ID 匹配目标、planCode 匹配请求组，不能仅因共用详情 schema 接受了 admin 分支就确认换组成功。搜索 summary 不得因为复用 detail schema 而被迫增加额度；API-004 的 quota 有其他字段，不能复用它来接收本次精简对象。

### 3.2 显式转换与呈现

- 新增应用级 `AdminGenerationQuotaModel` 三分支联合，并使 `AdminUserDetailModel.generationQuota` 必填。DTO 类型从 schema 推导；mapper exhaustive 转换，不以 `remaining || …`、nullish fallback 或 planCode 推断无限。
- `mapAdminUserDetailDto` 显式选取字段，`mapUserGroupChangeDto` 复用它并映射 `quotaReset`。port 的方法/请求参数不变，返回扩展后的应用模型；不返回 raw envelope。
- 扩展 CR-030 已规划的 `AdminUserDetailViewModel`，通过纯 presenter 输出信息行的 label/value。组件只读 VM、发用户意图，不读 snake_case、判额度联合、查询组上限或计算滚动窗口。
- 有限值以 controller 注入的整数 formatter 格式化：使用当前界面 locale、普通整数表示，不使用 compact、截断或科学计数法。SSR 与客户端使用同一已解析 locale。当前 `use-display-formatters.ts` 尚无 number 方法，实现时可加受测的整数方法；不能在模板临时计算。
- `admin.availableQuota` 精确为中文“可用次数”、英文 `Available`，不是现有 `Available creations`。详情专用 `admin.quotaUnlimited` 建议值为中文“不限”、英文 `Unlimited`；不改全局 `common.unlimited`（中文当前为“不限次数”）。管理员不适用复用 `admin.notApplicable` 的 —，不是 Unlimited、Guest 或 0。文案依据[批准原型](../design/prototype/app.js)和[原型翻译](../design/prototype/i18n.js)。
- 同一信息网格、字体、间距与断点继续使用批准 token；不增加“24 小时”、重置时间或可生成承诺。切换语言只重新投影 VM，不重取用户、清空表单/搜索或改变数值。两种品牌规则不变。

## 4. 状态、换组与请求顺序

沿用 CR-029–032 已批准的搜索 / userDetail / userLibrary / reader 分离。额度是 `userDetail.user` 的组成部分，不另建可独立成功的 quota 状态；批次列表失败不应伪造额度或反向清空已成功的详情。

详情应用状态应包含当前 userId、可空完整 user、读取状态/安全 failure、读取代次、换组状态/代次。它们是前端生命周期元数据，不是 API 新字段。SSR 只序列化安全快照；AbortController、promise、DOM 和监听放客户端 registry。

1. 读取：捕获 sessionEpoch + userId + detailRevision。返回先校验/转换，再核对响应 user.id 与请求目标、当前会话/路由/代次；不一致时丢弃，不把 A 用户的剩余额度显示到 B。合法新读替换完整 user，不从搜索 summary 回填 detail。
2. 换组开始：保留已确认快照供当前表单上下文，锁定重复提交；使早于本次操作的详情读取代次失效并尽力取消。期间不启动普通详情重载来竞争写回，也不把选中的方案/组上限提前写入详情。
3. 换组成功：同样校验目标、会话和 mutation 代次，原子替换完整返回 user（包括 planCode 和 generationQuota），然后确认成功/关闭换组框。不能先改方案再异步计算次数。`quotaReset` 是已确认 outcome，不是前端重置计算的指令。
4. 迟到结果：换组前 GET 即使晚于 PUT 返回也不得覆盖新快照；切换用户、退出再登录、离页或重复导航后，旧 action 不更新当前用户、弹窗或成功提示。Abort 只是节省资源，代次检查才是正确性边界。再访问旧目标时重新 GET。
5. 搜索和 Library：换组不清空父搜索的 q、分页、顺序、滚动、焦点或只读材料。若同步已缓存的同 ID 搜索行，只投影 summary 允许的身份/方案字段，不把 generationQuota 扩散进 summary，亦不以搜索响应覆盖 detail；仍遵守搜索的请求代次。
6. 完成后的数值是服务端读取时快照，不预留额度。无自动扣减、倒计时、轮询或新“刷新额度”入口。用户重新进入详情或按既有失败恢复重试 GET 时得到新快照；切语言和开关 reader 不触发详情重取。

### 4.1 失败与不确定结果

- GET 失败沿用详情安全错误/重试态；本次详情不进入 ready，不把旧额度或默认不限作为成功值。401 清理私有状态与所有代次；403/404 不自动重试为其他身份；500 可重试 GET。remaining=0 是 200 的正常值，不走 quota-exceeded 提示。
- 明确拒绝的换组（例如校验错误）不改已确认 user；表单保留所需输入，呈现既有字段/安全错误。页面不能仅因 Promise 结束就报告成功。
- 网络断开、提交结果不明或 PUT 成功响应不符合 schema 时，不自动重放 PUT；既有 HTTP retry/CSRF 恢复包装也不能重放结果不明的此命令。先令详情不可作为当前成功快照，进行一次同目标、同会话保护下的 GET 对账；后续 GET 失败只允许重试 GET。
- 对账恢复的是“当前用户快照”，不是该 PUT 的提交证明：即使 planCode 恰好等于所选方案，也不伪造成功、重置事件或自动关框为成功。沿既有错误反馈结束本次命令，释放状态后，用户若仍要换组需重新确认一次新意图；不得后台再次重置。
- action 返回可判别 `applied | failed | ignored`（失败可另带已对账标记）的应用 outcome，或等价受测机制。controller 只有 applied 才使用成功路径；不直接显示原始 Problem/detail/堆栈。

## 5. SSR、权限、安全与性能

SSR 继续按当前管理员会话加载详情、校验和映射，按 allowlist 将安全 `generationQuota` 写入该请求的 AdminUsersSnapshot；hydrate 使用同一应用联合。payload 不含 `generation_quota`、原 envelope、quota_reset、额度事件、上限/重置时间、Cookie、CSRF 或内部地址。搜索快照仍只有 summary，不含额度。

- visitor/learner 不发管理详情请求、不生成目标用户 payload；鉴权失败清理私有状态，服务端权限是最终边界。初始管理员 ui_locale=null 按现有 UI locale 解析规则处理，不推断为学习者。
- 保留私有 HTML/payload/API 的 no-store 与每 SSR 请求上下文；不将用户快照放模块全局缓存、URL、localStorage、分析事件或日志。日志只记稳定错误类别、接口类别和既有 request correlation，不记用户额度/响应体。
- 不增加正常 GET/换组的网络往返；成功 PUT 直接用返回投影，避免“保存完再全页重取”。不确定 PUT 后的一次 GET 是恢复例外，不是轮询。
- 只读额度与供应商是否可用无关，不调用 OpenRouter、生成选项接口或管理员自身额度接口；无模型/密钥配置时仍可查看。

## 6. 实现责任与文件

以下为批准后的工作，不是本轮已修改文件。后端由 backend-ethan 按批准方案先交付双响应和原始 fixtures；前端由 frontend-claire 承接 CR-029–033 的整合实现。

| 责任 | 现有文件或明确拟新增落点（相对 frontend/） |
| --- | --- |
| 严格 DTO / mapper | `app/infrastructure/http/schemas/admin.ts`；`app/infrastructure/http/mappers/index.ts` |
| 应用类型 / port | `app/application/shared/models.ts`；`app/application/shared/ports.ts`（返回类型扩展，方法不新增） |
| GET/PUT / 失败分类 | `app/infrastructure/http/repositories/api-repository.ts`；保留 shared failure/HTTP 边界 |
| 详情状态与生命周期 | `app/runtime/stores/admin.ts` 及 CR-030 已规划的独立详情状态/controller；纯转换/代次规则可落 `app/application/admin/user-detail.ts`（拟新增） |
| 呈现 / locale | CR-030 已规划的 `app/presentation/admin/admin-user-detail-presenter.ts`（拟新增）；`app/composables/use-display-formatters.ts`；`i18n/locales/{zh-CN,en-US}.json` |
| 页面装配 | `app/pages/admin/users/[userId]/index.vue` 只连接 VM 与 intent；SSR 页面 loader/快照同步，保留 CR-031 reader |
| 验证 | `tests/unit/strict-contracts.test.ts`、拟新增详情 mapper/state/presenter 测试；`tests/e2e/mock-backend.mjs`、`tests/e2e/application-smoke.spec.ts`；SSR/payload 与边界检查 |

现有测试主要使用内嵌 raw 对象和 mock backend；`tests/contracts/fixtures/raw/manifest.yaml` 是主方案的拟建路径，当前不存在。实现时建立 API v1.4 的该清单及命名 raw JSON（或在交接中明确等价的单一清单），记录 API/HTTP/content-type/schema/后端来源摘要；不要声称已有 fixture 文件或完整版本校验。

后端提供的原始 envelope 由前端以相同字节/摘要复制进自身可独立构建的 fixture 目录，双向做同步检查，不跨 backend build context 读取文件。mock backend 的 GET 与 PUT 同时复用相同命名输入，不按 plan 名臆造无限；summary helper 不得新增额度。展示测试另用 VM，不代替 raw 契约测试。

## 7. 验证矩阵（待执行）

| ID / 层 | 场景与必须成立的结果 | 后端关联 |
| --- | --- | --- |
| FQ01 / schema+mapper | GET 三分支；PUT learner 有限/无限；0、普通正整数、大整数、nullable locale；两响应复用映射，0 不变 Unlimited | Q01–Q05、Q13 |
| FQ02 / 负向契约 | 缺额度/剩余、错误 null、负数/小数/字符串、未知枚举、extra limit/used/token、角色错误、PUT 缺 quota_reset/返回 admin 或非请求组、响应 user.id 不符；安全 contract failure | Q13–Q14 |
| FQ03 / 非回归 | search summary 无新字段且拒绝误注入；cursor/批次/API-004/review/SSE 原 fixtures 不改形；无新额度端点调用 | Q15–Q16 |
| FQ04 / presenter | 中文可用次数/不限、英文 Available/Unlimited、admin —、有限 0；大数完整显示、locale 切换不改模型/重取；页面只读 VM | Q01–Q05 |
| FQ05 / mutation | 有限→无限、无限→有限、有限→0，Basic/Pro/Plus 与额度不固定绑定；只用完整返回 user 更新；库与累计统计不本地重算，父搜索/reader 保留 | Q09 |
| FQ06 / 并发 | GET A 慢/PUT 快；快速 A→B；logout/login；离页后 PUT 返回；同用户重开；重复确认；旧快照/提示不覆盖当前状态，最多一个受控换组请求 | Q10、Q16 |
| FQ07 / 恢复 | 明确拒绝不改快照；PUT 已执行但响应丢失、响应非法、500/断网后一次 GET；对账失败重试 GET；绝不自动多次 PUT/第二次重置或推断提交成功 | Q11 |
| FQ08 / SSR+权限 | 管理员直链刷新和 hydrate 三分支一致；visitor/learner 无管理数据；两管理员请求隔离；401 清理、403/404/500 安全失败；allowlist 无 DTO/token | Q12–Q14 |
| FQ09 / 真实集成 | 后端固定数据覆盖计费/退款/24h 边界/换组/降额/删除与 claim；前端只显示对应快照、不复制算法；无模型配置仍正常；mock 不替代 SQL 证据 | Q01–Q12、Q15 |
| FQ10 / UI+可访问性 | zh/en × 320/390/720/1280/1440px，200% 缩放；额度/方案行不挤出网格，精确文案/字体/间距及 dd/dt 关系；换组错误可感知、焦点和 reader 无退化 | Q16 |
| FQ11 / 版本 | 新新组合 GET/PUT/SSR/browser 成功；新旧/旧新组合严格失败且不显示不限；旧管理 tab 刷新后恢复；成对回滚 smoke | Q16 |

开发阶段记录 schema/mapper、状态/VM、SSR、Playwright 与 import-boundary 证据；qa-quinn 独立运行 API+真实浏览器验收，并回归 CR-029–032 全部文案/交互。视觉证据必须与批准原型同身份/语言/状态/视口逐项核对，含截图、computed style、几何、焦点；原型无限样例不能用于推翻有限/admin 测试数据。QA 通过后再交用户 UAT，不用开发单测或原型断言冒充独立通过。

## 8. 配套发布与移交

- API 修订号为 v1.4，公开路径仍是 `/api/v1`。旧 strict 客户端拒绝新字段，新 strict 客户端拒绝旧缺字段；SSR 与浏览器一起升级，GET 与 PUT 一起交付。本地 UAT 同样要求配套版本。
- 按既有独立 backend/frontend 镜像、Nginx 同源路由与受控维护窗口配套发布；先隔离验证再切换，不支持单端先上线。更新源文件顺序不等于授权混版运行，不新增环境变量、代理路由或部署控制面。
- 发布交接明确要求旧管理页面刷新后继续；不能声称本轮已实现自动刷新/版本探测。回滚也必须配套，且保留既有 v1.3 的复数 hint 和匿名分组能力；回到缺额度版本意味着 CR-033 再现，不是验收版本。
- 无新增产品/UI/数据库选择；上游契约缺口已由批准文件解除。本方案仍待用户审批；CR-029–033 保持 open 至实现与独立验证，不以文档完成关闭。
- 建议批准本同步方案并请求进入 implementation，先 backend-ethan、再 frontend-claire，随后独立测试。阶段/角色迁移交守门器处理；本轮不自行激活下一角色、不改生产代码。
