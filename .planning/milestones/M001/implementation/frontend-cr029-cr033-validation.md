---
milestone: M001
stage: implementation
role: frontend-implementer/base
agent_name: frontend-claire
status: awaiting_user_review
date: 2026-09-05
contract_version: v1.4
change_requests: [CR-029, CR-030, CR-031, CR-032, CR-033]
---

# CR-029–033 前端开发验证

## 结论与授权

本轮按 [TRANSITION-M001-064](../reviews/implementation-backend-cr033-approval.md) 完成批准的前端修订，开发自检 PASS，提交实现评审。CR-029–033 仍 open；没有切换 verification，没有代替独立 QA 或用户 UAT。

采用 [frontend-cr029-cr033-worktree-plan.md](./frontend-cr029-cr033-worktree-plan.md) 的单工作区顺序实现。保留全部既有未跟踪文件，没有 Git 提交、工作树重置、后端/设计/API 改写或依赖升级。

输入：[CR-029–032 前端方案](../technical/frontend-cr029-cr032.md)、[CR-033 前端方案](../technical/frontend-cr033.md)、[批准交互](../design/cr031-cr032-interaction-contract.md)、API v1.4 §12、后端 raw fixtures 与 [后端验证](./backend-cr033-validation.md)。

## 实现与追踪

| 变更 | 实现落点与结果 |
| --- | --- |
| CR-029 / 首页、Review、Account | From/To 均 44px，消除局部第二字段 margin；英文首页 Review；注销副标题/正文逐字来自批准稿，副标题使用中性高对比度颜色，保留二次确认 |
| CR-030 / 用户详情 | 可提交的搜索表单保留；Back to results、ISO 日期、View only、View 文案；父结果集合、q、精确滚动与焦点恢复继续有效 |
| CR-031 / 只读阅读弹窗 | 当前用户下真实 batch 参数读取；配置/主题/正文/词条分区；固定首尾与单一 body 滚动；加载、失败重试、不可用状态；ESC/按钮/外部遮罩关闭、内部空白不关闭、Tab 循环与焦点恢复 |
| CR-031 / 路由 | `/admin/users/:userId?batch=:batchId&q=...`；query 改变不重建父详情；旧批次路径 replace 到新寻址；直链刷新与无历史安全回退；无学习资料写操作 |
| CR-032 / 认证门与返回 | Review 两种路径统一 review 目标；Library、单篇、Account 各用完整双语句子；bootstrap 失败/加载不伪装访客；原地址展示门，不请求私有内容；认证往返、错误、语言与刷新保留安全目标 |
| CR-032 / 优先级与私密状态 | 账号语言先应用；管理员优先；claim 必须存在内存 capability，URL 单独 claim=1 不成立；不自动新建复习；身份切换清除注册的私有状态，迟到请求不写回新会话 |
| CR-033 / 严格额度链路 | GET/PUT 同一严格 quota 联合；limited 保留 0，unlimited 与 admin 不适用分开；非法数据拒绝整个 user；严格校验返回 id、角色与请求组 |
| CR-033 / 换组一致性 | 完整返回 user 原子替换；重复提交阻断；旧 GET/离页/身份变化不覆盖；不确定 PUT 只 GET 对账，不重放 PUT，也不将对账结果伪装为本次提交成功 |

数据继续遵循 API raw → strict schema → mapper → application state → presenter → Vue。页面不导入 DTO；只读正文以文本渲染，段落转换可逐字符还原，不改写材料、释义、短语或标签语言。AbortController、DOM 焦点引用、导航位置与复习 attempt 不进入 SSR 序列化状态。

主要新增：`application/admin/user-detail.ts`、`runtime/stores/admin-user-detail.ts`、`presentation/controllers/admin-user-detail.ts`、详情/认证 presenter、AdminUserSearchForm、AdminBatchReaderDialog、LearnerPageBoundary、按 Nuxt app 隔离的 private-state 注册表。

## 原始契约与 FQ 证据

等价单一清单为 [frontend/tests/contracts/v1.4/manifest.json](../../../../frontend/tests/contracts/v1.4/manifest.json)，不是技术草案中尚不存在的 raw/manifest.yaml。7 份 JSON + manifest 共 8 文件，与 backend/testdata/contracts/v1.4 逐字节一致；本轮同步检查 mismatch=0，单测另校验 SHA-256。构建不跨 frontend context 读取 backend。

| 矩阵 | 本轮开发证据 |
| --- | --- |
| FQ01–04 | raw schema/mapper、0/正整数/大数/无限/admin；负数、小数、字符串、缺键、多余键、错误 null/角色/返回 id/组等拒绝；双语 presenter；summary 不增加 quota |
| FQ05–07 | action 测试覆盖换组全量结果、A→B、同 batch 不同用户、关闭重开、身份变化、重复确认、明确拒绝、丢响应/500/对账失败；浏览器 route.fetch 后丢弃 PUT 响应，仅一次 PUT、GET 恢复 0 |
| FQ08 | 五种访客页面 SSR 不含资料/DTO/CSRF；真实管理员 SSR GET/刷新/客户端一致；私有状态按 app 隔离；迟到 401 不清除新身份；reader 权限/不可用状态与生命周期 |
| FQ09 | 真实 PostgreSQL + 后端 + 生产 Nuxt + Nginx：注册返回、无自动复习、GET 有限与 admin null、换组 0→无限→有限、无需刷新与 SSR 刷新一致；无模型/凭证配置仍可看额度 |
| FQ10 | 双语 × 320/390/720/1280/1440 设计 computed-style 对照、长文溢出/固定关闭区/焦点、Axe；200% 等效重排补充检查，见限制 |
| FQ11 | 真实新新配套 PASS；旧前新后、新前旧后均 SSR/客户端严格失败且无额度值；旧旧配套回退详情可读，恢复新新后完整冒烟再次 PASS |

FQ09 的计费、退款、24h 边界、降额/claim/删除 SQL 证据引用后端本轮报告，不声称前端重新执行全部 Q01–Q16；前端不复制其额度计算。

## 开发命令与结果

| 命令/检查 | 结果 |
| --- | --- |
| `pnpm format:check` | PASS |
| `pnpm typecheck`、`pnpm lint` | PASS；固定 Node 24 构建内再次执行 |
| `pnpm lint:boundaries` | PASS；106 modules / 80 dependencies |
| `pnpm test` | 16 files / 105 tests PASS |
| `pnpm exec playwright test --workers=1 --timeout=90000` | desktop/mobile 66/66 PASS；最终源码再跑一轮仍 66/66 |
| CR-029–033 专项 | 20/20 PASS，包含在完整 66 项中，不重复计总数 |
| `docker build -t wordweave-frontend:cr029-cr033-check frontend` | PASS；固定 Node 24.8.0 内 typecheck/lint/boundaries/105 unit/SSR production build |
| `tests/integration/cr033-paired-smoke.mjs` | PASS；真实配套与回退恢复后重复执行；每次 3 次换组，0 次生成调用 |
| 设计对照 | reader 10 组 + Review 认证门 10 组 PASS，见下方 JSON/截图 |
| fixture 同步 | 8/8 字节相同 |

本机直接命令使用 Node 22.23.2，出现 engine warning；最终生产运行时与质量基准为锁定 Docker Node 24.8.0 / pnpm 10.33.0，不更改锁文件或声明已升级依赖。

开发过程修复了新增认证编排的 SSR Nuxt context、阅读弹窗焦点循环及一次 CSS 提取误带的桌面布局覆盖。收尾还修复了既有搜索 controller 在异步加载后注册 onMounted 的问题，改为 await 前注册；冷启动完整回归核对该警告不再出现。第一次完整 E2E 为 62/66，四个失败均来自两个旧测试在双视口查找已废弃的 Back to search results；更新为本次批准的 Back to results，保留全部位置/焦点断言后完整通过。真实冒烟中修正了新账号应进入空态、桌面退出入口在 Account、应等待退出完成再跳转等测试前提；未以 mock 修改真实返回来通过测试。

## 设计证据与复现

- [Reader 对照结果](./evidence/cr029-cr033/reader-comparison.json)：同管理员/语言/短文状态/视口；宽度、圆角、首尾 padding、metadata 间距、正文 font-family/18px/1.9/68ch、词条与分区间距、关闭文案。
- [Review 认证门对照结果](./evidence/cr029-cr033/guest-comparison.json)：同访客/语言/视口；全文、卡片 x/y/width、padding、圆角、背景、标题字体与描述色一致。
- [手机 Reader](./evidence/cr029-cr033/reader-app-en-US-390.png) / [对应原型](./evidence/cr029-cr033/reader-design-en-US-390.png)。
- [手机认证门](./evidence/cr029-cr033/guest-app-en-US-390.png) / [对应原型](./evidence/cr029-cr033/guest-design-en-US-390.png)。
- [版本结果](./evidence/cr029-cr033/version-results.json)；其余 zh/en × 390/1440 原型/实现截图同目录。长文与按钮焦点截图在 frontend/test-results/。
- 比较脚本保存在同 evidence 目录；从 frontend cwd 以 `node < ../.planning/milestones/M001/implementation/evidence/cr029-cr033/compare-reader.cjs` 或 compare-guest.cjs 执行，需先启动 3300/38080 contract mock 与 3310 设计静态服务。
- 原型保存账号语言会覆盖 URL locale，比较使用新浏览器存储，避免把中文原型误当英文。原型与 mock 的用户名、材料、模型名和条目数量不同；没有做像素全图相等断言，也没有把正文高度差当布局缺陷。

## 配套版本与环境

待独立验证的固定镜像：

- frontend：`sha256:1c9b43c803ceeefd0e0b261fc027413416948acf585b1db5c1829f6e50029cec`
- backend：`sha256:e8c4ee91a7c3265cda8c496ccc8fb485328d95b6c1662eaf2502011ce5d005a5`

混版与回退矩阵在候选 frontend 084b473bf1cc… 上执行；最终镜像另修复搜索生命周期注册顺序（契约/mapper 未变化），重新完整回归和真实配套 smoke。回退实验使用旧 frontend `68470b6ea1e9…`、旧 backend `b704e386cafd…`；旧版兼容不代表 CR-033 已修复。上线与回滚均须双端配套，旧管理页需要刷新；没有自动版本探测或强制刷新功能。

隔离栈只绑定 127.0.0.1:6101，独立 Docker network、tmpfs PostgreSQL 18.6，专用合成管理员/学习者。首轮清理时库中 7 个合成账号、0 generation_runs、0 provider credentials；最终构建复核另建空库，仅保留 1 个合成管理员与 1 个学习者，同样无生成调用或凭证。临时容器/网络与临时服务均清理；合成数据随 tmpfs 删除不可恢复。没有读取历史 OpenRouter key，没有修改 6001 UAT 镜像、数据库或其他既有服务。

前后源码 hash 检查覆盖 231 个既有文件：本轮变化均在 frontend；backend 与批准 design/technical 快照无变化。README 补充 v1.4 fixture、配套发布与本地真实 smoke 边界。

## 明确限制与移交

- 这是实现角色开发验证，不是独立 QA。保持 CR-029–033 open，等待 qa-quinn 复验后关闭；本轮没有更新 UAT。
- 自动浏览器为 Chromium 的 desktop/mobile 仿真。200% 证据为 1440×1000 物理范围对应 720×500 CSS / DPR2 的等效重排，双语首尾可见且无横溢；未操作真实桌面浏览器菜单缩放。另做 CSS zoom:2 诊断会将 dvh 弹窗超出物理视口，不能冒充浏览器缩放验收；截图仅保留为诊断。独立 QA 仍需真实缩放、移动浏览器/键盘与长驻旧标签刷新。
- UI 精确对照重点是本轮 reader、认证门、日期与注销局部；既有其他页以全量回归与 Axe 检查覆盖，不把既往设计自检 1781 项计为本次生产通过。
- 无真实 AI 质量/性能/供应商验证；不得把合成长文压力数据当模型效果结论。
- 无新增需求、设计或契约决策。下一步为用户审阅实现交付后，由守门器交独立测试，不自行变更角色或阶段。
