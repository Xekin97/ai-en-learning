---
milestone: M001
stage: technical-design
role: frontend-architect/base
agent_name: frontend-bob
status: accepted_m001_baseline
date: 2026-09-09
revision: CR-040
decisions: [DEC-019, DEC-020, DEC-021, DEC-022, DEC-023, DEC-024, DEC-027, DEC-028, DEC-029, DEC-030, DEC-031, DEC-032, DEC-033, DEC-034, DEC-035]
open_change_requests: []
confirmed_scope: [CR040-NAMING, CR040-DATA-CUTOVER]
open_questions: []
maintenance: M001-AGENT-CONTEXT-001
---

# M001 前端技术设计

> 当前效力：本文为 M001 已交付契约；正式完成状态、遗留事项和下一步见[当前交接](../handoffs/verification.md)。历史修订段中的“待实现/待审阅”仅表示当时步骤，后续接收与替代关系见[历史索引](../handoffs/archive.md)。本次只同步状态与检索入口，未新增业务批准。

<a id="cr040-frontend"></a>
## 当前修订：CR-040 原词释义链路

依据 [104 前端同步授权](../reviews/backend-cr040-frontend-sync-approval.md)、[API v1.5 §1.7](./api/index.md#cr040-entry-meaning)、[后端配套切换](./backend.md#cr040-rollout)及 [DBA 清理合同](./database.md#cr040-data-cutover)。释义只针对用户原先选中的词条；文章、场景、短语和词形映射不决定词义。批次的 meaning_language 不因 UI locale 切换而改变。本轮不改变 UI、文案、布局、提示开关、匿名分组、全部出现位置或现有复习交互。

### 契约到渲染的唯一链路

| 入口 | strict DTO | 应用模型与显示出口 |
| --- | --- | --- |
| API-005 generation.validated | result.targets[].entry_meaning | 显式 mapper → target.entryMeaning → generation 状态 → 原生成结果展示 |
| API-007 批次详情（API-006 save/claim 后复用） | data.batch.targets[].entry_meaning | 显式 mapper → target.entryMeaning → library 状态 → 原批次详情 |
| API-008 初始 attempt 与 action 的下一题 | spelling item.entry_meaning | 同一联合 schema/mapper → item.entryMeaning → review 状态 → 原单词复习提示 |
| API-103 管理员只读批次 | 与 API-007 共用 BatchDetailDto | 共用 mapper → target.entryMeaning → admin 状态 → 原 reader presenter 的 meaning 显示属性 |

- API/数据库字段为 `entry_meaning`，应用字段为 `entryMeaning`；Go 使用 `EntryMeaning`。必填、非 null、1–500 个 Unicode code point、无首尾空白。schema 验证而不 trim/截断/补空；JavaScript 用 code point 计数，不能误用 UTF-16 code unit 上限。
- 三处 target/spelling strict schema 共用该值约束。旧键、旧新双键、缺失键、null、错误类型或边界非法均走既有 contract violation 路径；不得添加 alias、fallback、版本协商或旧缓存转换。
- SSR 与浏览器复用 schema/mapper；DTO 不进入 useState、payload 或模板。应用状态显式持有 entryMeaning，presenter 可保留既有显示属性名 meaning；页面只消费应用展示投影，不能读取 snake_case 或从文章推断释义。
- passage.delta、文章填空、作答请求、完成总结、列表/统计不新增释义、原词或答案字段。API-008 两个返回入口必须都校验，不能只改首题。
- 同一字符串经 mapper 原值传递；不补“文中作用”、词形说明，不根据文章重新释义，不触发额外模型请求。

### 实现落点与状态边界

- `frontend/app/infrastructure/http/schemas/{common,generation,learning,review}.ts`：共用值约束及三处严格字段；`mappers/index.ts`：生成、批次、复习的逐字段映射。
- `frontend/app/application/shared/models.ts`：三处应用模型字段；既有 repository、SSR loader、store/reducer 消费这些模型，不能并存旧新两份释义状态。
- `frontend/app/presentation/admin/admin-user-detail-presenter.ts` 与 create/library/review 的既有展示绑定：替换应用字段读取，不改已批准 i18n、CSS、布局、页面结构。
- 沿现有 session coordinator 的 epoch/private-state reset 处理失效登录，清理私有状态与内存令牌；不得保留清理前批次或把过期异步响应重新写回。用户另行清浏览器缓存，不新增 durable cache、旧 payload reader 或自动数据迁移。
- 客户端 POST SSE 仍直连同源 Go；不改 Nitro 为 BFF，不升级依赖或改部署目录。

### 定向验证与交接

复用 [C40 定向验收](./ai-integration.md#cr040-verification)，补充前端责任，不重跑无关全站 UI：

1. 更新 raw mock/fixture 到 v1.5；验证合法 entry_meaning、code point 边界、空值/空白/超长/错误类型，以及旧键/双键/缺失键拒绝。
2. 分别覆盖生成 validated、用户批次、管理员 reader、spelling 初始及下一题的 schema → mapper → 应用模型；检验原值不变和应用层无原始 DTO 键。
3. 沿既有应用/呈现测试确认显示属性变更、locale 不改释义、文章复习/完成结果仍无答案泄漏、会话失效清理不受影响；执行 typecheck、lint/boundaries 和受影响单测。
4. Mock 不代替真实模型释义质量证据。代码、开发检查、独立 QA、实际数据操作、模型质量与用户 UAT 分开记录。

发布时要求新 backend/API、迁移后 schema、新 Nuxt SSR 与浏览器资源同一候选版本；现有旧 tab 刷新，不提供混版兼容。数据库前态、停写、一次性事务、重跑拒绝和提交不明处理以 DBA/后端原文为准；本轮不执行清理、迁移、部署或模型调用，不承诺清理后恢复已删学习数据。

本次整合取代旧主文档顶部的多轮“当前/待审”说明和旧交接堆叠。[原文快照](./archive/pre-cr040-frontend.json)保留两份 071 获批原件、路径与摘要；历史 [CR-029–032](./frontend-cr029-cr032.md)、[CR-033](./frontend-cr033.md)、[CR-034](./frontend-cr034.md)和[断点确认](./frontend-cr034-breakpoint-confirmation.md)仍是未被本次改变的交互/状态依据。下方基础方案继续有效，依赖版本为既有设计记录，不发起新选型。

## 1. 设计结论

M001 前端采用 Nuxt 4 当前稳定补丁线、Vue 3、严格 TypeScript、Vite builder 与 Nitro `node-server` preset，保持运行期 SSR。设计复核时 Nuxt 官方 4.x 文档显示稳定版本 `4.5.2`；基座实现必须把当时的最新稳定 4.x 精确写入 `package.json` 与 `pnpm-lock.yaml`，不得使用浮动 `latest` 运行生产构建，也不使用 nightly、Nuxt 5 预览兼容模式或实验性 SSR streaming。Node 采用当前 LTS 24 并固定补丁版本与镜像 digest；Nuxt 官方要求 Node 22+ 且推荐 active LTS，Node 官方当前将 v24 标为 LTS。[Nuxt Installation](https://nuxt.com/docs/4.x/getting-started/installation) [Nuxt Deployment](https://nuxt.com/docs/4.x/getting-started/deployment) [Node.js Releases](https://nodejs.org/en/about/previous-releases)

SSR 状态可通过 `useState` 随 payload 安全 hydrate；`useAsyncData` 的服务端结果也会进入 payload，因此任何服务端取数都必须先完成安全转换。[Nuxt State Management](https://nuxt.com/docs/4.x/getting-started/state-management) [Nuxt useAsyncData](https://nuxt.com/docs/4.x/api/composables/use-async-data)

本版设计以 DEC-031 为最高前端数据约束。所有远端数据只允许沿两条链路进入界面：

```text
SSR 首访：接口 DTO -> 运行时校验 -> SSR 聚合/转换 -> 应用状态 -> selector/presenter -> 界面

客户端：接口 DTO / SSE DTO -> 运行时校验 -> 数据转换层 -> 应用 action/reducer
        -> 应用状态 -> selector/presenter -> 界面
```

以下做法一律禁止：

- page、layout 或 Vue component 直接调用业务 API、`$fetch`、`useFetch`；
- page 或 component 导入 DTO、DTO schema、API response、原始 SSE event；
- 把原始响应、响应解构结果或 `{ ...dto }` 写入 `useState`；
- 模板根据后端枚举、空值、snake_case 字段、分页结构或 Problem JSON 做业务判断；
- 为赶进度以 `any`、双重类型断言或“临时字段兼容”绕过 mapper。

前端只实现已批准的 PAGE-001 至 PAGE-009、PAGE-101 至 PAGE-103。批准的 HTML/CSS/JS 是视觉与交互合同，不作为生产代码复制。

## 2. 系统边界与运行拓扑

Go 仍是认证、CSRF、额度、生成、学习库、复习和管理员数据的唯一业务真源。Nuxt 提供 SSR、路由、应用状态和 Vue 渲染，不新增第二套业务 API。

```text
浏览器
  └─ HTTPS 同源入口
       ├─ /api/v1/** ──────────────────> Go 单副本应用 ──> PostgreSQL / 模型平台
       ├─ /health/* ───────────────────> Go 单副本应用
       ├─ /_nuxt/** 与静态资源 ────────> Nuxt Nitro
       └─ 页面路由 ────────────────────> Nuxt Nitro SSR
                                           └─ 只读请求 -> Go 内部地址
```

- `/api/v1/**` 在入口层直接转发给 Go；浏览器凭同源 Cookie 与 CSRF 访问。
- POST SSE 生成流不经过 Nuxt BFF、Nitro route 或二次缓冲，取消与断连语义继续由 Go 负责。
- Nuxt 不维护用户、额度、复习、模型或批次的服务端副本，不实现业务写路由。
- SSR 只发起页面首屏所需的只读请求；所有按用户变化的 HTML 与 payload 均为 `private, no-store`，不得进入跨请求 Nitro/CDN 缓存。
- SSR 内部 Go 基址只存在于私有 runtime config；浏览器永远只看同源 `/api/v1`。

## 3. 技术基线

| 类别 | 选择 | 约束 |
| --- | --- | --- |
| 框架 | Nuxt 4 稳定线 | 默认 SSR；精确 lockfile；不使用预览通道 |
| 视图 | Vue 3 Composition API + `<script setup lang="ts">` | props/emits 有类型；组件不承载远端数据转换 |
| 语言 | TypeScript strict | `strict`、`noUncheckedIndexedAccess`、`exactOptionalPropertyTypes`；禁止业务代码 `any` |
| 构建 | Nuxt Vite builder | 路由级拆包；生产 sourcemap 不公开 |
| 服务运行时 | Nitro `node-server` + Node 24 LTS | 构建与运行固定同一 Node 补丁线和镜像 digest；生产入口为 `node .output/server/index.mjs` |
| 应用状态 | feature store composable + Nuxt `useState` | M001 不引入 Pinia；store 对界面只暴露只读状态、selector 与 intent |
| SSR 初始化 | page controller + `callOnce`/受控 loader + store action | 只序列化应用快照；避免 hydrate 重复请求；页面不接触返回值 |
| DTO 校验 | Zod 4 | Markdown API v1.5 契约为真源；strict schema 与 mapper 成对，类型从 schema 推导 |
| SSE | 原生 `fetch` + `ReadableStream` + `eventsource-parser` | 仅客户端加载；原始 event 不得离开 stream adapter |
| 国际化 | `@nuxtjs/i18n` | `zh-CN`、`en-US`；无语言前缀；静态词典懒加载 |
| 样式 | 原生 CSS + Vue SFC | 不引入外部 UI 主题；设计 token 为视觉真源 |
| 依赖边界 | ESLint 受限导入 + dependency-cruiser | CI 阻止 page/component -> transport、application -> Vue/Nuxt 等反向依赖 |
| 测试 | Vitest、Nuxt Test Utils、Vue Testing Library | mapper、reducer、selector、SSR 与组件分层测试 |
| E2E | Playwright + axe-core | 使用合同 Mock Go 服务和真实同源代理拓扑 |

依赖只保留一个包管理器与 lockfile，命令示例使用 pnpm。未经新架构决策不得加入认证框架、第二套状态库、第二套 i18n、持久化状态插件、富文本/Markdown 渲染器或通用 UI 套件。

## 4. 分层模型与依赖方向

### 4.1 层次职责

| 层 | 负责 | 不负责 |
| --- | --- | --- |
| transport | URL、method、header、Cookie/CSRF 注入、JSON/SSE 解码、DTO schema、Problem DTO | 页面状态、翻译、显示格式、业务分支 |
| adapter | DTO -> application model、Problem -> AppFailure、SSE DTO -> application event；实现 application port | Vue 响应式、DOM、路由、toast |
| application | port、query/command、业务 action、纯 reducer、可序列化状态 | HTTP 字段、Nuxt 组件、CSS、显示文案 |
| runtime | 依赖注入、`useState` store adapter、SSR loader、客户端请求生命周期、内存令牌容器 | 解释 DTO、拼装模板 |
| presentation | selector、presenter、page controller、Vue components | 调接口、读 DTO、持久化 token、修改原始 state |
| page/layout | 路由参数、meta、layout 装配，调用 page controller | 远端取数、数据转换、业务算法 |

依赖只向内：

```text
page/layout -> presentation -> runtime/application -> domain
                                      ^
transport -> adapter -> application port

application/domain 不依赖 Vue、Nuxt、Zod、ofetch、i18n 或浏览器 API。
```

### 4.2 数据转换规则

每一个 response/event 都按以下规则处理：

1. transport 使用精确 schema 校验 envelope、DTO、枚举、可空性和联合类型；失败转为 `contract_violation`，不把半合法对象传下去。
2. mapper 显式逐字段构造 application model，不使用对象展开透传。
3. mapper 统一字段命名、枚举、缺省/空值、ISO 时间、分页和错误语义；游标保持 opaque，不由组件解析。
4. adapter 返回 application port 声明的模型或结果；调用方看不到 response、header 和 DTO。
5. action/reducer 以 application model 更新 store；store 不保存 transport 对象或不可序列化资源。
6. selector/presenter 把稳定 code、日期、数字、请求状态和权限投影为 view model；本地化只发生在 presentation。
7. component 只接收 view model 和 intent callback，不以 API 字段命名 props。

转换层不得自行补造契约未定义的业务数据。若 UI 需要的稳定 code、可空性或联合分支不在 API 契约中，必须提交 change request。当前 v1.5 按本页 CR-040 同步释义字段；历史 v1.4 在原 v1.3 的复数 `hint_blanks` 与 passage blank 匿名 `group_key` 基础上，补齐用户详情 `generation_quota`；后续实现不得重新引入显示字符串反推、nullable 万能对象、单数 `hint_blank`、缺失 `group_key` 或额度缺失时默认 Unlimited 等页面临时兼容。

### 4.3 三种数据对象

| 对象 | 命名 | 生命周期 | 可进入渲染/状态 |
| --- | --- | --- | --- |
| 传输 DTO | `*Dto`、`*EventDto`、`ProblemDto` | 单次 HTTP/SSE 解析 | 否 |
| 应用模型/事件 | `*Model`、`*Snapshot`、`*Event` | query、command、reducer、store | 可以进入状态；不直接负责文案 |
| 视图模型 | `*ViewModel`、`*ItemVM` | selector/presenter 计算 | 是，组件唯一远端数据显示输入 |

同一个字符串即使内容未改变，也必须经过显式 mapper 归属到应用模型；“字段值看起来能直接用”不是跳层理由。

## 5. SSR 聚合、hydrate 与客户端取数

### 5.1 SSR 链路

```text
Go response
 -> server transport（白名单转发 Cookie / locale / request id）
 -> DTO schema
 -> server repository adapter（复用纯 mapper）
 -> page SSR assembler（可组合多个 application query）
 -> feature store.replace(AppSnapshot)
 -> selector/presenter
 -> SSR HTML
 -> Nuxt 只序列化 AppSnapshot
 -> hydrate 后继续使用同一 store
```

实现约束：

- server/client 通过两个 Nuxt plugin 向 application 注入同一组 port；服务端使用内部 Go transport，客户端使用同源 browser transport。
- SSR assembler 只能组合 application query，不能解析 DTO，也不能返回 response 对象。
- 初始加载由 page controller 调用受控 loader/store action。模板不持有 `AsyncData<Dto>`；若内部使用 `useAsyncData`，handler 只能返回转换后的 `AppSnapshot`，结果必须由 loader 写入 store 后才可展示。
- 优先用 Nuxt `useState` 承接 SSR 应用快照，并通过 `callOnce` 避免 hydrate 二次执行。`callOnce` 仅由 loader/controller 使用，不在展示组件中出现。
- bootstrap SSR 只写入 actor、有效 locale、可公开方案信息等安全应用投影。CSRF、生成能力、访客承接和复习 attempt token 不进入 SSR payload。
- hydrate 后由 session coordinator 客户端刷新 bootstrap，把 CSRF 放入内存命令上下文；它不进入 `useState`、DOM、URL、日志或 Web Storage。
- SSR 收到的 `Set-Cookie` 只按白名单附加到当前页面响应；其他意外 Cookie 视为合同错误。
- 日期范围默认值在一次 SSR 页面初始化中确定并随应用快照 hydrate，避免服务端/浏览器各算一次造成文本不一致。

### 5.2 客户端链路

客户端导航、筛选、mutation 与刷新由 presentation controller 发出 intent：

```text
component intent
 -> page/feature controller
 -> application command/query
 -> injected port
 -> browser transport -> DTO schema -> mapper
 -> application result/event -> reducer/store
 -> selector/presenter -> component
```

- 搜词、筛选与预览由 controller 管理 AbortSignal；每次请求带 request sequence，迟到结果不得覆盖新状态。
- mutation 的 response 即使只有成功确认，也要转换为 application outcome 后再修改状态。
- `204`、空结果、无限额度、零额度和可恢复时间不能靠 truthy/falsy 猜测；必须由 API 契约和 mapper 明确。
- API client 只返回已校验 DTO 给 adapter，不允许返回 `unknown` 给 application；缺少契约时保持功能 blocked。
- page/component 不允许导入 `useApi`。通用 `$fetch` 仅能出现在 transport 实现中。

### 5.3 SSR 页面数据策略

| PAGE | SSR 应用快照 | hydrate 后行为 |
| --- | --- | --- |
| PAGE-001 | bootstrap 安全投影、静态首页 | 语言/会话变化刷新对应状态 |
| PAGE-002/003 | bootstrap 安全投影 | 注册/登录 command；成功后受控跳转与 claim consume |
| PAGE-004 | bootstrap + generation options 应用投影 | 搜词、生成、取消、加入学习库全部走客户端 action |
| PAGE-005 | bootstrap + 首屏学习库投影 | 精确词条搜索、分页、参与复习切换、删除、打开单批次复习 |
| PAGE-006 | bootstrap + 安全批次详情投影 | 状态切换、删除、进入单批次复习 |
| PAGE-007 | bootstrap + 独立恢复安全投影；未知浏览器时区时仅日期/计数加载壳，不以服务器日期预览 | 浏览器初始化本地最近7个日历日后首次预览；更改日期、创建或恢复范围会话，按 CR-034 做代次隔离 |
| PAGE-008 | bootstrap + 安全会话进度投影 | attempt 与答题只在客户端创建/提交 |
| PAGE-009 | bootstrap + 账号应用投影 | locale、密码、注销 command |
| PAGE-101 | bootstrap + 模型配置列表投影 | 创建、编辑、启停后由 outcome 更新/刷新 store |
| PAGE-102 | bootstrap + 固定组策略投影 | 保存后用服务端确认结果替换状态 |
| PAGE-103 | bootstrap + 用户/只读批次投影 | 搜索、换组、查看详情与只读批次 |

上述 SSR 数据均以 API v1.5 的命名投影为输入。PAGE-103 详情只在管理员请求上下文中加入已转换的 generationQuota 三分支，搜索 summary 不加额度；具体白名单见 CR-033 补充方案。PAGE-008 的 SSR 只允许读取 `ReviewSessionDto` 的安全进度；题目、`group_key` 与 `attempt_token` 必须在 hydrate 后通过客户端 attempt command 取得，不得出现在 SSR payload。

## 6. 应用状态、selector 与视图模型

### 6.1 store 规则

每个 feature store 由以下部分组成：

- serializable state factory：只含应用模型、请求状态、业务状态和 opaque cursor；
- action：调用 application query/command，接收 application result；
- reducer：纯函数更新状态，禁止 I/O、i18n、路由和 toast；
- selector：只读派生数据，不修改 state；
- presenter：把 selector 结果与当前 locale 组合为 view model；
- intent facade：供 component 调用的最小动作集合。

统一请求状态使用内部稳定语义 `idle / loading / ready / empty / failed`。错误保存 `AppFailure`，由 presenter 选择简洁、友好的本地文案；组件不展示后端 message 或内部 code。

### 6.2 feature 数据投影

| Feature | transport 输入 | application 状态 | presentation 输出 |
| --- | --- | --- | --- |
| bootstrap/session | API-001 DTO | actor、权限、有效 locale、安全方案投影 | header/nav/account capability VM |
| generation options | API-004 DTO | 可选模型、语言、场景、长度、输入/额度策略 | 紧凑配置表单 VM |
| word search | API-004 DTO | 当前查询、候选、选择、请求序号 | overlay suggestion VM |
| generation stream / disposal | API-005 SSE DTO、API-006 DTO | 生成阶段、文章、词条释义/短语、文章 tag、保存/承接状态 | 流式结果与操作 VM |
| library | API-007 DTO | oldest-first 批次、筛选、分页、参与复习状态 | batch card/list VM |
| review setup | API-008 preview / active-range / create DTO | 独立日期草稿、绑定 query 的预览联合、恢复状态和创建状态；见 CR-034 增量 | 稳定日期表单/计数/反馈/恢复 VM，不能直接用 DTO 或旧预览启用操作 |
| review | API-008 DTO | 单批次/日期范围会话、阶段、已去除 transport key 的同源题目、尝试进度 | 带随机色彩/纹理和匿名可访问名称的 review question/progress VM |
| account | API-003 DTO | 账号资料与可执行能力 | account form VM |
| admin | API-101/102/103 DTO | 模型、固定组策略、用户及只读批次应用模型 | admin tables/forms/detail VM |
| errors | Problem DTO / network failure | AppFailure + retry intent | inline notice/dialog/toast VM |

文章 tag 属于整个生成批次/短文，不属于单词；word target 模型不得出现 tag 字段。学习库默认从旧到新，进入复习后由服务端固定并打乱题序，前端不根据列表顺序推断复习顺序。

### 6.3 临时内存资源

以下资源不可序列化，放在 client-only session registry 或 controller `shallowRef`，不属于渲染 store：

- AbortController、ReadableStream reader、SSE parser；
- generation capability token、claim token、CSRF token、review attempt token；
- dialog element、focus restore target、timer handle。

界面需要的“正在生成、可取消、正在提交”等状态由 controller 映射为安全 application event 后写入 store；令牌本身永远不进入 view model。

### 6.4 PAGE-103 搜索与追加状态机

PAGE-103 不得继续用管理员 feature 的单个全局 `status` 同时表达模型、组别、用户详情、首次搜索和追加加载。实现至少拆出独立的 `AdminUserSearchState`：

```text
submittedQuery: string
resultStatus: idle | loading | ready | empty | failed
appendStatus: idle | loading | failed
items: AdminUserSummaryModel[]
pageInfo: { nextCursor: string | null; hasMore: boolean }
resultFailure: AppFailure | null
appendFailure: AppFailure | null
requestEpoch: number
```

- 搜索框草稿属于 page controller 的表单状态；只有 trim 后已提交的查询进入 application state。每次新搜索递增 `requestEpoch`、清空旧页和 cursor，再以首屏 skeleton 进入 `resultStatus=loading`。
- 首屏成功只按 adapter 给出的顺序替换 `items`；空页进入 `empty`。首屏失败进入 `failed`，不能残留上一查询的结果或 cursor。
- “加载更多”捕获当前 `submittedQuery + nextCursor + requestEpoch`，只把 `appendStatus` 设为 `loading`；既有 `items`、结果标题、滚动位置和 DOM key 必须保留。成功后按响应顺序追加，不计算 exact tier、不对单页或合并结果排序。
- 迟到响应只有在查询、cursor 和 epoch 仍匹配时才能提交。新增页若与已有页出现重复 ID，或 `hasMore` 与 `nextCursor` 不一致，按 `contract_violation` 处理并保留旧行，不以去重掩盖服务端分页错误。
- 非 cursor 的追加失败只更新 `appendFailure`，保留旧行和原 cursor，允许用户重试。错误提示位于列表 footer 邻近区域，不能把整个结果区替换成首屏错误态。
- 追加请求收到 `validation_failed` 且 `fields.cursor=invalid` 时，执行一次受控恢复：保留已提交查询，废弃该 cursor、旧结果和所有迟到追加响应，然后无 cursor 请求第一页。恢复成功后以第一页替换结果；恢复失败进入首屏可重试错误态。不得解析 cursor、补造 tier、再次自动发送同一 cursor，或形成自动重试循环。
- port、schema 和成功 DTO 继续使用 API v1.3 既有 `PageModel<AdminUserSummaryModel>`；排序 tier 和 cursor v2 内部字段不进入 DTO、application model、view model、URL、日志或本地持久化。

PAGE-103 presenter 只接收上述应用状态，输出 `AdminUserSearchViewModel` 和语义 intent。页面组件不得读取 `AppFailure.fields` 判断 cursor；该恢复分支由 application action 处理，组件只观察“正在刷新结果 / 已恢复 / 可重试”的友好视图状态。

## 7. 路由、布局与权限

| PAGE | 路由 | layout / middleware |
| --- | --- | --- |
| PAGE-001 | `/` | `public` |
| PAGE-002 | `/register` | `auth`，仅访客 |
| PAGE-003 | `/login` | `auth`，仅访客 |
| PAGE-004 | `/create` | `public`，访客/学习者 |
| PAGE-005 | `/library` | `public` 壳层；学习者内容控制器 / 访客认证引导 |
| PAGE-006 | `/library/:batchId` | `public` 壳层；学习者详情 / 访客 story 引导 |
| PAGE-007 | `/review` | `public` 壳层；学习者内容控制器 / 访客认证引导 |
| PAGE-008 | `/review/:sessionId` | `public` 壳层；学习者会话 / 访客 review 引导 |
| PAGE-009 | `/account` | `public` 壳层；学习者账号 / 访客 account 引导 |
| PAGE-101 | `/admin/models` | `admin` |
| PAGE-102 | `/admin/plans` | `admin` |
| PAGE-103 | `/admin/users` | `admin` |
| PAGE-103 状态 | `/admin/users/:userId?q=…` | `admin`；保留可用搜索和结果恢复上下文 |
| PAGE-103 只读弹窗 | `/admin/users/:userId?q=…&batch=…` | `admin`；父详情不卸载；非独立内容页 |
| PAGE-103 旧地址兼容 | `/admin/users/:userId/batches/:batchId` | `admin`；replace 到同一详情弹窗 |

- page 只声明 `pageId`、layout、middleware、route params，并创建对应 page controller。
- middleware 只做体验层导航，Go 授权仍是最终边界。
- PAGE-005–009 均不使用“访客立即跳登录”的 learner middleware。page controller 先消费已转换且已确认的 bootstrap actor：学习者才启动私有 loader/attempt，访客按 review/library/story/account 生成原地 `AuthGateViewModel`；bootstrap loading/failed 不能当成 visitor。详情、会话与账号同样禁止认证前取私有数据。
- 登录/注册先同步账号语言，按管理员默认区、学习者有效 claim、合法原意图、既有默认去向的优先级导航。普通认证不得自动新建复习或保存内容；登录页不得从 query 直接赋值 href。安全路径、query.batch、意图清理和失效会话详见补充方案第 6 节；前端分流不代替 Go 授权。
- return intent 只接受 router 可解析的站内相对路径，不能携带 scheme、host、双斜线或越权管理员路径。
- claim、generation、CSRF 与 attempt token 不进入 URL。
- URL 只保存可分享且无敏感信息的筛选，例如学习库完整词条和复习日期；cursor、答案、生成配置、密码与 toast 不进入 URL。
- 不存在与无权访问的批次使用相同安全页面状态，避免对象枚举。

## 8. 目录结构

```text
project/
└── frontend/                    # 独立 Nuxt package、构建上下文与发布单元
    ├── app/
    │   ├── app.vue
    │   ├── assets/css/
    │   │   ├── tokens.css
    │   │   ├── base.css
    │   │   └── utilities.css
    │   ├── pages/               # 路由装配；不取数、不解释业务数据
    │   ├── layouts/
    │   ├── middleware/
    │   ├── presentation/
    │   │   ├── components/
    │   │   │   ├── app/
    │   │   │   ├── ui/
    │   │   │   ├── create/
    │   │   │   ├── library/
    │   │   │   ├── review/
    │   │   │   ├── account/
    │   │   │   └── admin/
    │   │   ├── controllers/    # page/feature intents 与 loader 调度
    │   │   └── presenters/     # application state -> localized VM
    │   ├── runtime/
    │   │   ├── stores/         # useState adapter；对外 readonly
    │   │   ├── loaders/        # SSR 初始化、client refresh、request sequencing
    │   │   ├── session/        # client-only token/stream registry
    │   │   └── injection/      # application port 解析
    │   ├── application/
    │   │   ├── shared/
    │   │   ├── session/
    │   │   ├── generation/
    │   │   ├── library/
    │   │   ├── review/
    │   │   ├── account/
    │   │   └── admin/          # feature 内含 model/port/query/command/reducer/selector
    │   ├── domain/             # 与框架无关的稳定值对象与纯规则
    │   ├── infrastructure/
    │   │   ├── http/
    │   │   │   ├── transports/
    │   │   │   │   ├── go.server.ts
    │   │   │   │   └── go.client.ts
    │   │   │   ├── dto/
    │   │   │   ├── schemas/
    │   │   │   ├── mappers/
    │   │   │   ├── repositories/
    │   │   │   └── problem-mapper.ts
    │   │   └── stream/
    │   │       ├── generation-stream.client.ts
    │   │       ├── event-dto/
    │   │       └── event-mappers/
    │   ├── plugins/
    │   │   ├── application-ports.server.ts
    │   │   └── application-ports.client.ts
    │   └── i18n/locales/
    │       ├── zh-CN.json
    │       └── en-US.json
    ├── server/                  # 不创建业务 BFF；只放 Nitro 必需设施
    ├── tests/
    │   ├── contracts/fixtures/raw/
    │   ├── unit/mappers/
    │   ├── unit/reducers/
    │   ├── unit/selectors/
    │   ├── component/
    │   ├── nuxt/ssr/
    │   └── e2e/
    ├── package.json
    ├── pnpm-lock.yaml
    ├── nuxt.config.ts
    ├── tsconfig.json
    ├── eslint.config.mjs
    ├── dependency-cruiser.cjs
    ├── Dockerfile
    ├── .dockerignore
    ├── .env.example
    └── README.md
```

- `frontend/` 是唯一 package root、pnpm workspace root 和 Docker build context；所有前端命令从该目录运行，不读取根级或 `backend/` 源码。
- `Dockerfile` 只能 `COPY` `frontend/` context 内文件；`.planning/`、`backend/`、`nginx/` 和根级 Compose 不进入前端镜像。
- Nuxt 4 的 `app/`、`server/` 与共享类型边界保持清晰；本项目不建立根级 JavaScript workspace，也不通过跨目录软链接共享 DTO。
- 禁止使用 Nuxt 全局 auto-import 隐藏跨层依赖。application、transport、adapter 与 presenter 使用显式 import 和固定 alias；只有纯 UI composable 可以保留常规 auto-import。

## 9. 静态边界守门

CI 的 `lint:boundaries` 至少执行以下规则：

1. `pages/**`、`layouts/**`、`presentation/**` 禁止导入 `infrastructure/**`、任何 `*Dto`、Zod schema、`$fetch`/`useFetch` wrapper。
2. `runtime/stores/**` 禁止导入 transport、DTO 与 Vue component；它只依赖 application 和 Nuxt state adapter。
3. `application/**`、`domain/**` 禁止依赖 Vue、Nuxt、Zod、ofetch、i18n、DOM 与 infrastructure。
4. mapper 禁止依赖 Vue/Nuxt/i18n/store；它必须是纯 TypeScript。
5. transport 禁止依赖 store、presenter 与 component。
6. `.server.ts` 不得进入 client graph；`.client.ts` 不得在 SSR 路径执行。
7. component 测试不得 import raw contract fixture；contract fixture 必须经过 schema + mapper + reducer。

ESLint 用 `no-restricted-imports` 提供快速反馈，dependency-cruiser 校验完整依赖图。任何例外都需要新的确认决策，不能使用局部 disable 注释静默绕过。

## 10. JSON API 与错误适配

### 10.1 transport

- `go.server.ts` 只转发白名单 Cookie、Accept-Language 与 request correlation header；不转发客户端 Host、Forwarded、Content-Length 或任意自定义头。
- `go.client.ts` 使用同源 `/api/v1`，`credentials: same-origin`；mutation 从 client-only session context 读取 CSRF。
- transport 负责 HTTP status、content type、body 上限、timeout/abort 和 JSON decode，不决定页面行为。
- success envelope 与 Problem JSON 分别校验；服务端 request ID 映射进可记录的 failure metadata，但不展示给普通用户，除非故障支持场景明确需要。

### 10.2 mapper

- 每个 API 投影至少有一个 `mapXDtoToXModel`；分页、详情与 action outcome 不共用含糊的万能 mapper。
- stable enum 使用 exhaustive switch；未知值产生 contract failure，不落到“其他”掩盖。
- 时间在应用状态中保持已校验的 canonical ISO 字符串；时区与友好格式由 presenter 处理，避免 Date 对象 SSR 序列化差异。
- 后端显示文案不作为业务 code。`plan_code` / `group.code` 是唯一方案语义来源，由 presenter 本地化为“基础版 / Pro / Plus”等界面文案。
- mapper 只选择页面批准需要的安全字段；未知额外字段不会通过对象展开进入 payload。

### 10.3 API v1.5 DTO、schema 与 mapper 清单

传输类型不手写一套与运行时校验分离的 interface。每个 `*Dto` 都由对应 Zod schema 推导；所有对象使用 strict object，联合使用可判别 union，数组、整数、RFC 3339、日期、IANA 时区和非空字符串分别使用可复用原子 schema。普通 JSON 成功响应统一经过 `SuccessEnvelopeDtoSchema<T>`，keyset 列表经过 `KeysetEnvelopeDtoSchema<T>`；`204` 使用独立 no-content transport 分支，不能伪造成 `{data:{}}`。

| 契约 | transport schema / DTO | 纯 mapper 与 application 结果 | 必须裁剪或隔离 |
| --- | --- | --- | --- |
| API-001 / API-002 | `ActorDtoSchema`、`BootstrapDtoSchema`、`AuthSessionDtoSchema` | `mapActorDto`、`mapBootstrapDto`、`mapAuthSessionDto` → `SessionSnapshot` / `AuthSessionResult` | `csrf_token` 只注册到 client session registry；SSR mapper 明确丢弃它 |
| API-003 | `AccountDtoSchema` | `mapAccountDto` → `AccountModel` | `plan_code` 保持稳定 code；不保存后端显示文案 |
| API-004 搜词 | `VocabularySearchDtoSchema` | `mapVocabularySearchDto` → `VocabularyResultModel` | `vocabulary_version` 只供缓存/诊断，不进入词条组件 VM |
| API-004 选项 | `GenerationOptionsDtoSchema`，内含 `GenerationQuotaDtoSchema` 与 availability 严格分支 | `mapGenerationOptionsDto` → `GenerationOptionsModel` | `limited/unlimited`、`limit=0`、`refreshes_at=null` 分别建模，不用 truthy/falsy 合并 |
| API-005 SSE | `GenerationStartedEventDtoSchema`、`PassageDeltaEventDtoSchema`、`GenerationValidatedEventDtoSchema`、`GenerationFailedEventDtoSchema`、`GenerationCancelledEventDtoSchema` | `mapGenerationEventDto` → `GenerationEvent`，再由 reducer 推进 `GenerationState` | validated target 只接受非空复数 `hint_blanks`；`generation_token` 只进 registry；raw chunk、EventDto、request ID 不进入 store |
| API-005 取消 | `GenerationCancelOutcomeDtoSchema` | `mapGenerationCancelOutcomeDto` → `GenerationTerminalModel` | `cancelled/valid/failed` exhaustive switch，不能默认都当取消成功 |
| API-006 | `BatchCreatedDtoSchema`、`VisitorClaimDtoSchema`、`ClaimConsumedDtoSchema` | `mapBatchCreatedDto`、`mapClaimLeaseDto`、`mapClaimConsumedDto` | `claim_token` 只进 registry；页面状态仅保存过期时间和是否可继续认证，不保存 token |
| API-007 统计/列表 | `LearningSummaryDtoSchema`、`BatchSummaryDtoSchema`、`LearnerBatchSummaryDtoSchema`、keyset envelope | `mapLearningSummaryDto`、`mapBatchSummaryDto`、`mapBatchPageDto` → `LibrarySnapshot` | learner 的 `single_batch_review` 与管理员只读 summary 使用不同 schema；cursor 仅 opaque 保存 |
| API-007 详情/操作 | `BatchDetailDtoSchema`、`BatchParticipationDtoSchema` | `mapBatchDetailDto`、`mapBatchParticipationDto` → `BatchDetailModel` / `ParticipationOutcome` | `hint_blanks[]` 与 passage occurrences 在 mapper 转为安全片段；组件不得读取 code point offset 或兼容旧单数字段 |
| API-008 范围/会话 | `ReviewRangePreviewDtoSchema`、`ActiveRangeDtoSchema`、`ReviewSessionDtoSchema`、`ReviewSessionStartDtoSchema` | `mapReviewRangePreviewDto`、`mapReviewSessionDto` → 独立 `RangeReviewModel` / `SingleBatchReviewModel` | `session=null` 是显式空态；mode/status/dateRange/currentBatch/summary 组合在 schema 层校验 |
| API-008 attempt | `ReviewItemDtoSchema`、`ReviewAttemptDtoSchema`；passage blank 严格要求 `blank_id + group_key` | `mapReviewItemDto` 扫描 passage segments，把每个本题 `group_key` 映射为本地 `ClozeGroupRef` 后立即丢弃 transport key，产出 `SpellingQuestionModel | PassageClozeQuestionModel` | spelling 可含多个 blank segment，但模型只有一个 answer input；`attempt_token` 与 raw `group_key` 只在各自转换边界短暂存在，禁止 entry、surface、answer、offset、完整未挖空内容 |
| API-008 action | `ReviewActionOutcomeDtoSchema` 的 `retry/advanced/batch_completed/session_completed` 四分支 | `mapReviewActionOutcomeDto` → `ReviewActionOutcome`，reducer exhaustive 处理 | `incorrect_blank_ids` 只在 passage retry 非空；任何额外答案相关字段使 schema 失败 |
| API-101 | `OpenRouterCredentialDtoSchema`、`AdminModelDtoSchema`、model keyset envelope | `mapCredentialDto`、`mapAdminModelDto` → `CredentialStatusModel` / `AdminModelModel` | 密钥原文永不进入响应；`openrouter_model_id` 只存在管理员 feature，不可被用户 feature 导入 |
| API-102 | `GroupAdminDtoSchema` | `mapGroupAdminDto` → `GroupPolicyModel` | `group.code` 与长度顺序使用稳定枚举；显示名称只在 admin presenter 本地化 |
| API-103 | 现有 `adminUserSummarySchema` 不变；`adminUserDetailSchema` 严格增加 generation_quota，GET/PUT 共用；只读 batch schema 不变 | `mapAdminUserDetailDto` / `mapUserGroupChangeDto` → `AdminUserDetailModel.generationQuota` 三分支；summary mapper 不扩展；page info 只保存 opaque cursor | 只传必要剩余投影，无上限、计量事件、会话、密码或 token；admin/null 映射 not_applicable，不能默认无限；不解析 cursor、不计算 exact tier、不在客户端重排 |
| 全局错误 | `ProblemDtoSchema` | `mapProblemDto` → `AppFailure` | `detail` 不直接显示；字段错误只按批准表单字段白名单映射 |

DTO schema 文件按契约能力拆分，而不是按页面复制；`BatchDetailDtoSchema` 等明确共享投影只定义一次。application model 可以被多个页面复用，但 presentation presenter 必须按页面和角色分别投影，防止管理员只读数据意外获得学习者 intent。

### 10.4 SSR 安全快照白名单

SSR assembler 逐页面构造具名 snapshot，禁止把 repository 返回对象整体赋值给 `useState`：

| snapshot | 可序列化字段 | 明确禁止 |
| --- | --- | --- |
| `PublicShellSnapshot` | actor kind、username、role、plan code、有效 locale、支持 locale | CSRF、Cookie、request/response、原始 bootstrap DTO |
| `CreatePageSnapshot` | generation options application model、availability、quota | CSRF、generation/claim token、SSE event、供应商/原始模型 ID |
| `LibraryPageSnapshot` | 六项统计、oldest-first batch model、opaque page info | owner、DTO envelope、管理员字段、复习答案 |
| `BatchDetailSnapshot` | 详情 application model、已转换 passage/hint segments、复习汇总 | 原始 code point span、transport target、attempt/token |
| `ReviewSetupSnapshot` | range preview、nullable active range session | 单批次会话、题目、正文、词条、attempt/token |
| `ReviewSessionSnapshot` | mode/status/date range、安全 current batch、progress/summary | attempt item、提示、passage segments、任何答案或 token |
| `AccountSnapshot` | username、plan code、locale | 密码、session、CSRF |
| `AdminModels/Groups/UsersSnapshot` | 对应管理员 application model 与 opaque page info；用户详情可含 generationQuota 的 limited/remaining、unlimited 或 not_applicable，summary 不含 | 凭证原文、用户会话/密码、learner intent、DTO envelope、generation_quota、quota_reset、计量事件 |

SSR payload 测试对每个 snapshot 做 allowlist 结构断言，再做 token/答案/`snake_case` transport 键负向扫描。扫描只是纵深防御；真正边界仍由专用 snapshot 类型和显式 mapper 保证。

### 10.5 Unicode 区间转换

API-005 validated result 与 API-007 `BatchDetailDto` 的 `hint_blanks[]`、passage `occurrences[]` 都使用 Unicode code point 的 0-based 半开区间，而 JavaScript 字符串索引是 UTF-16 code unit。`mapGenerationResultDto` / `mapBatchDetailDto` 必须调用唯一的纯函数 `mapCodePointSpansToSegments`：

1. 以 code point 序列验证 `0 <= start < end <= length`；
2. 对 passage occurrence 校验 `surface` 与对应 code point 切片完全一致；`hint_blanks` 按契约不含 surface，不能由前端反推或补造；
3. 分别验证两个数组非空、升序、内部不重叠且位于对应原文内；构造整篇 passage 时还要校验不同 target 的 occurrence 彼此不碰撞；
4. 提示短语将每个 `hint_blanks` 区间转换为一个 `target` 片段，保证同一目标出现多次时全部进入应用模型；短文同理将每个 occurrence 转为独立 target 片段；
5. 一次性构造 `text | target` 应用片段并立即丢弃原始 offset；任一失败转为 `contract_violation`，不渲染部分详情或把错误 offset 交给组件。

测试样本必须包含 ASCII、多词词条、单个/多个 hint blank、相同/不同合法词形的重复 occurrence、中文/日文释义、emoji 与其他代理对字符、相邻区间、越界、数组内部重叠和跨 target 碰撞。PAGE-008 不复用该转换：复习接口已经直接提供不含答案的安全 segments。

### 10.6 合同 fixture 清单

拟建 `frontend/tests/contracts/fixtures/raw/manifest.yaml` 固定 `contract_version: v1.5` 并列出来源 API、HTTP 状态、content type、预期 schema 与后端来源摘要。当前测试使用内嵌 raw 对象及 mock backend，实施时集中命名并同步，不能视为该清单已经存在。至少覆盖：

- bootstrap 的 visitor / learner / admin；认证语言合并；account；有限、无限、零额度及每个 availability reason；
- 搜词空/非空；SSE started/delta/validated/failed/cancelled、单个/多个 `hint_blanks`、任意网络分块与心跳；保存、claim 创建/消费；
- 学习统计、空页/中间页/末页、start/resume summary、含多个提示位置的完整 batch detail、participation outcome；
- range preview、active range null/non-null、range/single × active/completed session；一个或多个 blank 但单输入的 spelling item；passage item 覆盖单组单空、同组多次相同词形、同组多次不同词形、多个组交错、retry key 稳定与新 attempt 可换 key；四种 action outcome；
- credential 未配置/已配置、admin model CRUD/启停、四个 group、learner/admin user 与管理员只读 batch；
- API-103 同一查询下的精确项首位、普通项至少三页、末页，以及 cursor invalid Problem；raw fixture 的 item 顺序必须被 mapper/reducer 原样保留，cursor 只能用于下一请求或失效恢复；
- API-103 GET 详情的有限/0/无限/admin 不适用与 PUT learner 有限/无限完整返回；generation_quota 缺失/多余键/非法 null/角色关系、换组迟到响应及不确定提交 GET 对账；细项见 [CR-033 FQ01–FQ11](./frontend-cr033.md)；
- 所有 Problem code，以及缺字段、额外字段、错误 null、非法 enum、分页不变量失败、旧 `hint_blank` 注入、passage blank 缺失/非法/多余位置 `group_key`、重复 `blank_id` 和复习答案字段注入的负向 fixture。

后端 contract test 与前端 raw fixture 必须引用同一份已命名 JSON/SSE 内容或执行字节级同步校验；展示组件 fixture 仍只能是独立 `ViewModel`，不能冒充接口契约覆盖。

### 10.7 error

Problem DTO 与网络/取消错误统一映射为 `AppFailure` 类别：认证失效、权限不足、校验、额度、冲突、服务不可用、网络中断、主动取消、被动断连、合同违反。具体 code 以 API 契约为准，不在本文新增。

presenter 再根据 failure 类别、页面上下文与 locale 选择：字段错误、inline notice、可重试空态、dialog 或 toast。原始 `detail`、堆栈、请求体和内部模型错误不得直接显示或记录。

### 10.8 管理员模型弹窗的命令编排

批准设计在 Add/Edit model 弹窗中包含启用控制，但 API-101 把资料写入与 enable/disable 定义为独立命令。前端不得虚构一个原子接口：

- Add：先 `createModel`，服务端必返回 disabled；用户选择启用时再以新 model ID 调用 `enableModel`。兼容性检查失败时保留已创建且 disabled 的模型，用明确的页面状态说明“模型已保存，但尚未启用”，不能回滚成“什么都没发生”或重复创建。
- Edit：先提交字段变化；若 `openrouter_model_id` 改变，服务端会自动 disable。资料成功后再按用户最终选择执行 enable/disable；第二步失败时用首次成功 DTO 替换列表状态，再显示可重试启用失败。
- controller/application command 负责两步编排与部分成功状态；dialog component 只发出 `saveModelDraft` intent，不直接连续调用两个 API。重复点击由提交中状态阻止，retry 只重试尚未成功的 enable/disable 步骤。
- warning/说明块由 presenter 根据“新增/编辑、凭证状态、最终启用意图、部分成功”生成本地化 view model，不展示 provider 响应或内部兼容性诊断。

## 11. 生成流数据链路

生成是同一分层规则的流式版本：

```text
POST SSE byte chunks
 -> SSE parser
 -> strict EventDto schema
 -> mapEventDtoToGenerationEvent
 -> generation reducer
 -> GenerationState
 -> GenerationPresenter
 -> 文章/词义/短语/文章 tags 界面
```

- 原始 chunk 与 EventDto 只在 `generation-stream.client.ts` 内存在。
- parser 支持任意网络分块、注释心跳、事件大小/累计缓冲上限和 AbortSignal。
- mapper 校验事件次序与 payload 形态；reducer 承担幂等、阶段推进和完成态，component 不拼协议。
- 文章 delta 先成为 application event 再进入 state；禁止组件直接 append 原始 event 字段。
- `generation.validated` 中每个 target 的全部 `hint_blanks[]` 与 `occurrences[]` 必须先经 v1.3 schema 和 code point mapper 转成应用片段；单数 `hint_blank`、空数组、越界或重叠使整个完成事件进入 `contract_violation`，不能开放保存。
- 用户主动取消调用已批准的 cancel 语义并消耗额度；仅关闭页面/断连不得伪装成主动取消。
- generation capability 与 claim token 仅在 client session registry；刷新后不恢复，不能写 localStorage/sessionStorage/IndexedDB。
- 切换界面语言只重新计算 presenter，不重建 stream controller，不中止生成。
- 全部用户输入词必须由服务端完整性判定；前端只展示已转换的完成/失败 outcome，不自行做词形覆盖最终裁决。

## 12. 复习安全与状态机

### 12.1 会话与答案边界

- single-batch 与 range session 具有独立 application identity；恢复卡和进度不能互相覆盖。
- PAGE-005/PAGE-006 通过 API-008 的 `single_batch` 创建/复用语义直接发起单批次复习；PAGE-007 只通过 `active-range` 发现和恢复未完成日期范围会话。
- session DTO 与 action DTO 必须是按 stage 区分的严格联合，先 schema 校验再映射为不含答案的 `ReviewItemModel`。
- application state、Nuxt payload、view model、DOM、fixture、日志和错误对象都不得包含正确答案、完整隐藏词或可还原答案的旁路字段。
- 拼写阶段可选短语提示由安全 segments 表示；一个 item 可以有一个或多个 blank segment，但全部空只关联一个输入框和一次原词 answer action。前端不得按 blank 数量创建多个输入、拼接多个答案或从 `length_hint` 推导答案长度。文章挖空阶段只保存服务端给出的安全 segments。
- “始终不显示答案、允许跳过”是 reducer/presenter 的不可变行为；错误重试也不能把答案写入状态。
- attempt token 只在当前 PAGE-008 client session；刷新或失效后按 API 安全恢复语义重新建立，不持久化。
- 复习库列表从旧到新；进入复习后的题目顺序由服务端固定随机化，前端只消费已映射序列。

### 12.2 v1.3 同源分组转换

`group_key` 是 transport 层用来表达当前 passage item 内等价关系的匿名值，不是展示文案、CSS token、DOM id 或业务标识。数据链路固定为：

```text
passage_segments DTO（blank_id + group_key）
 -> strict schema + item 不变量
 -> mapPassageItemDto（按片段首次出现建立本地 groupRef）
 -> PassageClozeQuestionModel（blankId + groupRef；无 group_key）
 -> ReviewState（client-only attempt）
 -> ClozeGroupStyleRegistry（一次性随机视觉分配）
 -> PassageClozeViewModel（样式、匿名名称、active/muted/incorrect）
 -> 纯渲染组件
```

- schema 对 passage blank 强制 `blank_id` 与符合 `^grp_[A-Za-z0-9_-]{22}$` 的 `group_key`；text segment 和 spelling blank 使用各自 strict union，出现 `group_key` 即拒绝。
- `mapPassageItemDto` 按服务端 segment 顺序扫描：第一次遇到某个 raw key 时建立题目内 `ClozeGroupRef`，后续相同 key 复用；每个 blank 保留 occurrence 专属 `blankId`。mapper 返回前立即丢弃 raw key，application、presenter、DOM 和日志均不得保存或输出它。
- `ClozeGroupRef` 只在当前 attempt/item 内有意义，不能由原词、target ID、答案长度或用户选词顺序计算；不同 item/attempt 不比较该值。前端无法也不尝试从匿名投影反推“不同 target 必须不同 key”，该不变量由服务端负责。
- retry outcome 若仍为同一 `attemptId + itemId`，reducer 必须校验 blank 顺序、`blankId -> groupRef` 等价关系与首次 item 一致；不一致视为 `contract_violation`，不能静默重新着色。切换 locale、输入和普通重渲染不替换 item identity。
- action assembler 只从当前 question 读取 `blankId` 和本地输入值，形成 API v1.3 已批准的 `answers[]`；`groupRef`、raw `group_key`、颜色、纹理和匿名名称在 TypeScript 类型与请求负向测试中都禁止进入 action body。

### 12.3 随机视觉投影与状态归属

- `ClozeGroupStyleRegistry` 位于 client-only presentation/runtime 边界，以 `attemptId + itemId` 为生命周期键；它不属于 SSR `useState`、Web Storage、URL、日志或分析数据。进入新的 passage item 时创建，retry 复用，item/attempt 结束或 route leave 时清理。
- 首次建立本题视图时，通过可注入 `RandomSource` 分别洗牌批准的 6 个 AA 色调和 4 种纹理，再按纹理轮次遍历色调：前 6 组保证颜色互异，前 24 组保证“颜色 × 纹理”组合不重复。超过 24 组时允许组合循环，但匿名可访问名称与焦点联动仍唯一。生产默认使用 `crypto.getRandomValues`，测试注入固定序列；不得在 computed、render 或 locale watcher 中调用随机源。
- 每个本地 groupRef 获得一个 `ClozeGroupStyleModel`：`toneToken`、`patternToken`、仅辅助技术读取的 base-26 匿名名称（A…Z、AA…）以及非语义的本题 DOM handle。所有值都由前端生成，不进入领域状态或 API。
- 当前焦点 groupRef 是临时 presentation state。任一空 focus/click/touch 后，同组 VM 标记 active、其余标记 muted；blur 到题外时清空。错误状态按 `incorrectBlankIds` 独立叠加，不覆盖组样式。
- 组件只接收 `PassageClozeViewModel` 并发出 `answerChanged(blankId, value)`、`blankFocused(blankId)`、`blankBlurred` 等 intent；它不读取 `group_key/groupRef`，不做随机分配，也不从 CSS class 反推业务关系。

## 13. 国际化与品牌

- 支持 `zh-CN` 与 `en-US`，没有语言路径前缀；切换后立即更新当前 UI，并通过已批准接口持久化有效 locale。
- `zh-CN` 品牌只显示“词涟”；所有非中文 locale 统一显示 `WordWeave`，任何位置都不并列中英文品牌。
- UI 文案来自静态 i18n key 与 presenter 参数；业务 code、API message 和管理员内部组名不能直接作为用户文案。
- AI 生成的目标语言内容、专有名词、用户输入和模型名称不经 i18n 翻译。
- 文案保持简洁友好，不把产品规则原文暴露成帮助文本；不得显示“访客组”“完整性校验通过”“至少 xx 词”“必选”等内部需求措辞。
- locale 改变只能影响 presentation，不改写 application model；这样不会因为翻译长度变化而触发数据重取或重置生成状态。

## 14. 组件、样式与响应式

组件分三类：

- `ui`：纯视觉与可访问交互，只接收通用 props/slots/emits；
- feature component：只接收 feature view model，发出语义 intent；
- page controller：连接 route、store、presenter 与 intent，template 仍不接触 DTO。

视觉实现遵守批准设计：

- CSS token 从 `design/theme.css` 提取为生产 token，不复制原型脚本；
- 造文工作台桌面为紧凑双栏，移动端单栏；表单间距和控件宽度不因语言切换溢出；
- 模型选项文本允许换行/省略并保持容器 `min-width: 0`，不能把横向宽度撑破；
- 搜词建议使用锚定 overlay/listbox，脱离普通文档流，不占据工作台内容高度；
- 管理员侧栏底部账号与退出动作使用清晰的垂直层级和独立点击区；
- checkbox 表达“参与复习”，不再使用含义不明的继续/暂停开关；
- dialog/popover/listbox 使用 Teleport 或顶层 overlay host，避免控制器改变主布局宽高。
- PAGE-008 阶段二使用固定宽度内联输入；正文行高至少 `3.1`，输入采用正常 inline flow 与正 margin，320/390/720/桌面和 200% 缩放下不得以负 margin、绝对定位或固定单行高度造成重叠。组视觉只消费 `toneToken/patternToken` 白名单映射到 CSS class/custom property，不接受 transport 字符串成为 class 或 style 值。
- PAGE-101/102 按 `CR-018` 复现批准原型的 modal input surface、Add/Edit model 字段/启用控制/提醒层级、Available models 间距与本地化保存文案；管理员壳层英文 eyebrow 固定由 i18n key 渲染为 `ADMIN WORKSPACE`。组件不得硬编码另一套近似文案或以浏览器默认 input/button/a 样式替代 token。
- PAGE-103 的响应顺序完全来自服务端。结果 row 只用稳定用户 ID 作为 Vue key；追加时不得以 skeleton、空态或全局 loading 卸载已显示 row。
- PAGE-103 在 `max-width: 720px` 切换为批准的三段式结果布局：身份独占首行，方案与状态位于次行，“查看”占满末行；搜索表单与分页操作纵向排列。不能把该关键断点缩到 560px，也不能使用 JavaScript 视口判断补救。`721–900px` 保留语义顺序并允许用户名列收缩/换行，全部宽度禁止页面级横向滚动。
- `CR-020` 的 New API Key input 必须直接消费 raised/input surface token，computed background 为 `rgb(255, 255, 255)`；不得由 `.admin-key-input` 等局部选择器覆盖成页面暖白 surface。

断点延续已批准响应式合同：桌面、平板、移动端由 token/media query 控制，组件不得通过读取 `window.innerWidth` 决定首屏结构。SSR 输出确定性布局，CSS 完成断点切换。

## 15. 可访问性

- 所有控件键盘可达并具有可见 focus；图标按钮有本地化 accessible name。
- 搜词 overlay 使用 combobox/listbox 语义，支持方向键、Enter、Escape、点击外部关闭与焦点恢复。
- dialog 具备 focus trap、初始焦点、Escape、返回触发点；破坏性删除必须二次确认。
- 生成 delta 不逐 token 触发 screen reader；使用节流的 polite live region 汇报阶段，完成/失败单次播报。
- 复习错误、字段错误和状态不能只靠颜色表达；DOM 顺序与视觉顺序一致。
- passage cloze 每个输入的 accessible name 只含本地化“短文空白”和当前题内匿名组名；同组复用名称，不同组不复用。名称、`aria-describedby`、`title`、autocomplete、隐藏节点与复制内容都不得包含 raw key、拼写、词形或长度。
- 聚焦任一 passage blank 时通过 view model 同步强化同组并降低其他组饱和度；颜色之外始终叠加纹理。高对比模式可移除填充图案，但必须保留可辨边框、焦点联动和匿名 accessible name。
- 支持 `prefers-reduced-motion`，关闭非必要动画；触控目标、对比度和 200% 缩放按批准设计验收。
- 路由切换更新 title、主标题焦点/announcement，保留合理返回焦点。
- PAGE-103 首次搜索完成后聚焦结果标题；追加期间结果容器使用 `aria-busy=true`，加载按钮保留可感知进度且既有行保持可读。若成功后仍有下一页，焦点留在同一加载按钮；若最后一页使按钮消失，焦点移到本次首个新增 row 的“查看”按钮，无新增项时回退到结果标题。追加失败时按钮仍是稳定重试目标。
- PAGE-103 的 DOM 引用、滚动位置和返回详情焦点属于 presentation controller/client-only navigation registry，不进入 SSR/application state。详情返回在同一次客户端导航链中复用已加载集合并恢复对应“查看”按钮；直接刷新或无可恢复集合时，以保留的安全查询重新加载第一页并聚焦结果标题。

## 16. 性能与稳定性

- 公开首页/auth 只加载基础壳层；create、review、admin feature 按路由拆包，SSE parser 仅 PAGE-004 客户端异步加载。
- locale 词典按需加载；不预取管理员路由给普通用户。
- 流式文章按 animation frame 或短时间片批量提交 reducer，避免每个 chunk 引发整页重渲染。
- 大列表保持 keyset 分页，cursor 只在 store 内部；M001 不在缺乏数据规模证据时引入虚拟列表。
- selector 使用稳定引用和最小计算范围；组件不对完整 response 建深度 watch。
- 每个 client query 支持取消与 request sequence；route leave 清理 reader、timer 与监听器。
- SSR 失败呈现可恢复应用状态；不得将内部 Go 地址、原始错误或空白页交给用户。
- 生产发布保留旧 hashed assets 至超过最长 HTML 缓存窗口，避免滚动发布期间旧页面 chunk 404。

产品未规定外部响应时间 SLA，因此本阶段以功能成功、无重复请求、无 hydrate 警告、无泄漏和可恢复状态作为验收，不承诺未经批准的业务时限。

## 17. Mock 与测试策略

### 17.1 两类 fixture

1. 合同 fixture：存放 API 原始 envelope/DTO/SSE event，只能由 transport/schema 测试读取，并必须走真实 mapper、reducer 与 selector。
2. 展示 fixture：直接构造 `ViewModel`，仅用于纯组件视觉、键盘和可访问性测试；不得宣称覆盖 API，也不得复用为接口 Mock。

禁止创建一套“前端友好 API 假数据”直接喂给页面。E2E Mock Go 服务返回合同 fixture，让 SSR 与浏览器都经过生产数据链路。

### 17.2 测试矩阵

| 层 | 必测内容 |
| --- | --- |
| schema | envelope、null/缺失、枚举、严格联合、分页、Problem、恶意额外字段；passage blank 的 `group_key` 必填/格式/位置和 blank ID 唯一性 |
| mapper | DTO 到 application model 逐字段映射、时间/枚举/错误归一、安全字段裁剪、无对象透传；raw key 等价关系变为本地 groupRef 后完全消失 |
| reducer | 竞态、迟到响应、空态、失败恢复、生成事件次序、single/range 独立状态；同 item retry 拓扑稳定和新 attempt 重建；PAGE-103 首搜/追加独立状态、追加保留旧行、重复 ID 拒绝与 cursor invalid 单次首屏恢复 |
| selector/presenter | locale 切换、品牌规则、日期数字、权限动作、无内部术语；随机样式只分配一次、24 组后回退、焦点联动和错误样式叠加 |
| boundary | 禁止 page/component 导入 DTO/transport；禁止 application 依赖框架；server/client graph 隔离 |
| SSR | 每请求 state 隔离、Cookie 白名单、`no-store`、payload 无 DTO/令牌/答案、hydrate 无二次请求/警告 |
| component | VM 渲染、intent、键盘、focus、overlay 不占布局、长文案不溢出；cloze 在四档宽度/200% 缩放零重叠且 DOM 无 raw key/答案；PAGE-103 延迟追加时旧行不卸载、`aria-busy` 正确、末页焦点转移 |
| SSE | 任意分块、心跳、畸形/超大事件、取消、断连、完成、语言切换不断流 |
| review security | fixture/state/payload/DOM/log 均无答案；跳过和错误重试不泄漏；action body 不含 groupRef/key/样式，语言切换不重配 |
| E2E | 访客生成与注册 claim；访客停留 `/library`、`/review` 的双动作认证引导及安全 return intent；学习库、单批次/范围复习；账号；管理员模型 modal、组别间距/保存文案、用户主流程；API-103 精确项首位且响应顺序原样呈现、至少三页无重复遗漏、旧 cursor 422 后仅一次无 cursor 恢复、320/390/720/1440px 几何与焦点回归 |

额外守门：SSR snapshot 测试扫描 transport 字段命名、令牌键、答案键和未知对象；这只是纵深防御，不能替代显式 mapper 与类型边界。

## 18. 安全设计

- 认证 Cookie 为 HttpOnly/Secure/SameSite，前端不读取；CSRF 只存 client session memory，并仅注入同源 mutation。
- 用户输入和 AI 内容一律按纯文本渲染；不使用 `v-html`，不执行 Markdown/HTML。
- CSP 由 Nitro 页面头和同源入口共同配置；nonce 只用于必要脚本，禁止宽泛 `unsafe-inline`。
- runtime config 只公开浏览器必须知道的非敏感值；Go 内部地址、模型平台密钥和服务凭据不进入 public config/bundle。
- 日志不记录正文、目标词、密码、token、答案、原始请求/响应或管理员密钥；只记录稳定错误类别、状态、request ID 和必要上下文。
- 管理员查看学习内容为只读 projection；组件没有审核、编辑或运营动作。
- 账号注销使用明确确认与重新验证语义；成功后清空所有 application state 与 client session registry，再导航到公共页。

## 19. 部署与可观测性

### 19.1 独立前端镜像

- `frontend/Dockerfile` 使用 `frontend/` 为唯一 build context。builder 固定 Node 24 LTS 镜像 digest、精确 pnpm 版本和 `pnpm-lock.yaml`，执行 frozen install、质量检查与 `pnpm build`；runtime 只复制 Nuxt 生成的 `.output/`，不复制源码、dev dependency、`.planning/` 或其他应用目录。Nuxt 官方把 `.output/` 定义为可部署生产产物，禁止手工修改其内容。[Nuxt `.output`](https://nuxt.com/docs/4.x/directory-structure/output)
- runtime 使用非 root 用户、只读根文件系统和可写临时目录，设置 `NODE_ENV=production`、`HOST=0.0.0.0`、`PORT=3000`，唯一入口为 `node .output/server/index.mjs`。
- 前端镜像不包含 Go、Nginx、数据库工具、OpenRouter 密钥或根级 Compose。镜像以不可变 Git SHA 标记并可独立扫描、签名、发布和回滚。
- 容器 liveness/readiness 使用本地 TCP 3000 探测，避免新增公开业务路由，也避免把后端/OpenRouter 健康错误地变成 Nuxt 进程重启条件；页面、SSR 与后端集成另由组合 smoke 验证。

### 19.2 运行配置与 SSR 私网上游

- `nuxt.config.ts` 定义私有 `runtimeConfig.backendInternalOrigin`，生产容器只通过 `NUXT_BACKEND_INTERNAL_ORIGIN` 覆盖；Compose 可把根级语义变量 `BACKEND_INTERNAL_ORIGIN` 映射为该 Nuxt 环境变量。该值不得位于 `runtimeConfig.public`、app config、SSR payload、HTML、浏览器 bundle 或日志。Nuxt 官方明确只有 `runtimeConfig.public`/`app` 会暴露给客户端，并建议用结构匹配的 `NUXT_` 环境变量覆盖运行配置。[Nuxt Runtime Config](https://nuxt.com/docs/4.x/guide/going-further/runtime-config)
- 浏览器 transport 永远使用相对 `/api/v1`；server transport 使用 `backendInternalOrigin`。两者共享相同 schema、mapper 和 application port，不因 URL 不同形成两套数据模型。
- server transport 只为 SSR GET 转发批准的 Cookie、locale 与 request correlation；不代理 mutation 或 POST SSE，不信任浏览器伪造的 forwarded headers，也不把内部 origin 写入错误页面。
- 每请求创建 repository/assembler 上下文；不得把用户 Cookie、actor、store、pending promise 或错误缓存在模块级单例中。

### 19.3 Nginx、Compose 与 Ingress 合同

- 根级 `compose.yaml` 以 `./frontend` 构建 `wordweave-frontend:<git-sha>`；frontend 只加入 edge 网络，只能访问 backend HTTP，不能连接 PostgreSQL。默认只有 Nginx 发布端口。
- Nginx 把页面与 `/_nuxt/**` 交给 Nitro，把 `/api/v1/**`、`/health/live`、`/health/ready` 直接交给 Go；尤其 `POST /api/v1/generations/stream` 必须关闭请求/响应 buffering、proxy cache 与 gzip 聚合，并传播浏览器断连。Nitro 不建立 `/api/v1` BFF。
- 用户相关 HTML、payload 与 JSON 均为 `private, no-store`；只有带内容哈希的 `/_nuxt/**` 资产可 `public, immutable` 长缓存。缺失资产必须返回真实 404，不能回退页面 HTML。
- 未来 Kubernetes Ingress 替换仓库内 Nginx 时保持完全相同的 path、Cookie、Host/scheme、request ID、SSE 与缓存合同；不同时叠加 Nginx 和 Ingress 两层公开代理。

### 19.4 CI、发布与回滚

- 前端独立流水线工作目录固定为 `frontend/`：`pnpm install --frozen-lockfile -> typecheck -> lint -> lint:boundaries -> unit -> nuxt test -> build -> image scan -> container smoke`。
- 根级组合验证在真实 Nginx/Compose 拓扑执行：首页 SSR、认证引导、私有页 no-store、浏览器同源 API、Cookie/CSRF、直接路由刷新、hashed asset、API v1.5 fixture（包括释义及 GET/换组额度）和 POST SSE 首段/心跳/abort。
- path filter：`frontend/**` 必跑前端流水线；`nginx/**`、根级 Compose、API/部署共享契约变化时同时跑 frontend build、backend contract 和 edge E2E。
- 当前配套切换以本页 CR-040、[后端发布入口](./backend.md#cr040-rollout)及 [DBA 恢复边界](./database.md#cr040-recovery)为准；API v1.5 不支持单端混版、旧字段降级或历史数据转换。实际数据操作/部署须核对独立授权，不能从技术交接推导。

### 19.5 可观测性

前端只采集 route/pageId、SSR/CSR、请求类别、稳定 failure kind、耗时、取消/断连分类、hydrate/boundary 错误、镜像版本和 request correlation。不得采集学习正文、目标词、用户答案、token、密码、Cookie、内部 backend origin 或 API 原始 body。SSR 日志中的 upstream 错误必须归一为低基数类别。

## 20. 追踪与阶段门

| 需求/决策 | 前端落点 |
| --- | --- |
| DEC-030 | Nuxt 4 SSR、Vite、Nitro Node、同源 Go API |
| DEC-031 | DTO/SSR 转换/状态/presenter 硬边界与自动化守门 |
| DEC-019/020/023 | locale、品牌、简洁文案与长文案响应式 |
| DEC-021/022 | 文章 tags、模型选项容器安全布局 |
| DEC-024 | 学习记录直接进入批次复习、参与复习 checkbox |
| DEC-027/028 | POST SSE、同源 Cookie/CSRF、临时令牌内存边界 |
| DEC-029 | 安全输出、输入参数固定、无自由 prompt |
| DEC-032 | `hint_blanks[]` 与 spelling 多 blank/单输入映射、答案负向边界 |
| DEC-035 | passage `group_key` 严格 schema、本地 groupRef、一次性随机色彩/纹理、焦点联动、匿名可访问名称与 action 负向边界 |
| DEC-033/034 | `frontend/` 独立应用与 Docker context、独立 Nitro 镜像、根级 Compose、Nginx/Ingress 等价路由 |
| CR-005（已解决） | 精确 DTO、统一分页、复习严格联合、管理员投影、稳定方案 code 与 active range discovery；对应 schema/mapper/fixture 已在第 10 节落位 |
| CR-007（已解决） | API v1.2 多提示位置、独立前端目录/镜像、SSR 私网上游、CI、组合发布与回滚已同步；当前合同基线已继续升级为 v1.5 |
| CR-017（实现阶段） | `/library`、`/review` 身份感知 page controller、无私有取数的 `AuthGateViewModel`、双认证动作、安全 return intent 与回归 |
| CR-018（实现阶段） | 管理员 eyebrow、model modal、key input surface、plans 间距/保存文案的 token/i18n/view model 落点与视觉回归 |
| CR-020（实现阶段） | Replace key 输入框直接使用 raised/input surface token，并对中英文、桌面/移动 computed style 做精确回归 |
| CR-021（实现阶段） | API-103 成功 DTO/app model 不变；opaque cursor 原样传回，服务端顺序原样追加；cursor invalid 触发一次无 cursor 首屏恢复 |
| CR-022（实现阶段） | PAGE-103 首搜/追加双状态、旧行与焦点保留、footer 错误恢复，以及 `max-width: 720px` 三段式列表布局 |
| CR-033（既有批准与实现，整项仍 open） | API v1.4 GET/PUT 同一详情映射、generationQuota、配套发布继续有效；本轮不重做，保留后续独立复验责任 |
| CR-034 / CR-032（历史批准基线） | 独立 setup 状态、query/revision/epoch/lease 隔离、本地日期初始化、常驻表单、准确文案/颜色；FR01–FR18，另承接 CR-031 专用 retry |

### 20.1 历史技术修订清单（DEC-035 / CR-020–022）

以下保留此前 DEC-035 / CR-020–022 的技术责任与验收基线，不表示这些差距仍全部存在。2026-09-05 的现状/责任快照见 CR-029–032 补充方案第 2/8/9 节及 CR-033 补充方案第 6/7 节；当前2026-09-06的有限修订以 CR-034 增量第2/9/10节为准。

| 当前落点 | 实现修订 |
| --- | --- |
| `app/infrastructure/http/schemas/review.ts` | passage blank 增加严格格式 `group_key`；拒绝缺失、非法格式和在错误 segment 上出现；保留 blank ID 唯一检查 |
| `app/infrastructure/http/mappers/index.ts` | `mapReviewItemDto` 显式建立本地 groupRef 并裁剪 raw key；retry 拓扑由 reducer 校验 |
| `app/application/shared/models.ts` | `SafePassageSegmentModel` 的 blank 分支增加题目内 `groupRef`，但 `ReviewAnswerModel` 保持只有 blankId/answer |
| `app/runtime/stores/review.ts` | 分离可序列化会话进度与 client-only attempt/presentation registry；同 item retry 保留映射，新 attempt/离页清理；不得记录 raw key |
| `app/presentation/controllers|presenters|components/review/**` | 建立 style registry、`PassageClozeViewModel` 和 intent；把 `pages/review/[sessionId].vue` 的直接 store 字段渲染/答案组装迁出 page |
| `app/middleware/learner.ts`、`pages/library/index.vue`、`pages/review/index.vue` | 移除两个入口的访客立即重定向；以 bootstrap application model 分流认证引导与学习者 loader |
| `layouts/admin.vue`、`pages/admin/models.vue`、`pages/admin/plans.vue`、i18n/CSS | 落实 CR-018 的批准文案、modal 结构与 token 间距，不用局部默认样式覆盖 |
| `app/runtime/stores/admin.ts` 或拆分后的 admin-users store | 将用户首搜、追加、详情和其他管理员请求状态解耦；落实 epoch、opaque page info、追加失败与 cursor invalid 单次恢复，不在前端排序 |
| `pages/admin/users/index.vue` 与 admin users controller/presenter | 页面只消费 VM/intent；延迟追加保留 row，完成/失败恢复焦点；移除模板对通用 `status`、原始 failure 和应用模型字段的业务判断 |
| `app/assets/css/application.css` | 增加与批准原型一致的 720px PAGE-103 分组断点；修复 `.admin-key-input` surface 覆盖，不改变全局输入 token |
| `tests/**`、mock backend | raw contract fixture 升至 v1.3，新增分组转换/稳定性/action 负向测试、认证引导和管理员视觉回归 |

前端技术设计完成的验收条件：

- 两条数据链路均有目录、依赖、状态、Mock 与测试落点；
- 页面/组件不能在编译与 CI 中越层读取原始接口数据；
- SSR payload 只包含应用快照，且不含 token、复习答案和 transport 对象；
- 生成、学习库、两类复习、账号与管理员页面均能映射到 feature store 与 presenter；
- UI/UX 的品牌、国际化、overlay、紧凑布局和可访问性合同全部保留；
- API v1.5 的精确 DTO、entry_meaning、复数 `hint_blanks`、passage `group_key`、用户详情 generation_quota、schema/mapper、SSR 安全快照和 raw fixture 设计完整；旧单数字段、缺失/非法分组及错误额度分支不能通过 schema；
- 同源分组只通过 DTO mapper 进入本地关系模型，再由 client-only style registry 变为 view model；组件、SSR、action、URL、日志和持久化均不接触 raw key；
- `frontend/` 能在不读取仓库其他目录的情况下独立 install、test、build、构建镜像、运行和 TCP 探活；
- 真实 Nginx/Compose 拓扑下页面、API、Cookie、SSR 与 POST SSE 合同通过；CR-020/021/022 后续实现与验收见[覆盖索引](../verification/coverage-matrix.md)，不再作为待执行的旧阶段阻塞。

CR-040 有限同步已由后续 gate 接收、实施并定向验证，M001 已由 138 关闭；不再沿历史 USER-HANDOFF-CONTINUOUS-001 重复交接。当前开放项与正式状态见[当前前端交接](../handoffs/frontend-architecture.md)和[报告](../verification/report.md)，生产发布仍未批准。
