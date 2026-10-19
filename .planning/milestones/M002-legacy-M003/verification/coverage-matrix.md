---
milestone: M003
stage: verification
role: quality/base
agent_name: qa-quinn
status: completed
version: M003-QA-08-CR311-312-UAT-ACCEPTED
result: pass
user_uat: accepted
date: 2026-10-15
---

# M003 CR-311/312 独立 QA 覆盖矩阵

## 结论与边界

CR-311/312 当前增量 **PASS**。本轮验证 AC-323–328、UIA-M003-427–438 与 FE4-V01–08；独立 QA 执行时不刷新受保护的 UAT3015、不调用真实 provider；随后授权的非生成 readiness 已刷新同一 QA07 版本。全程不评文章质量或模型语义审稿准确率，也不证明历史数据库迁移、生产容量、真机或人工读屏。

旧 M003-QA-06 与 `USER-M003-UAT-ACCEPTED-20261013` 仅证明 CR-311/312 之前版本。当前增量由 `USER-M003-CR311312-UAT-ACCEPTED-20261015` 整体接受，原件见 [`user-acceptance.json`](../reviews/evidence/uat-acceptance-105/user-acceptance.json)。该记录不扩大为逐项场景、Q02/repair 自然发生或模型质量证明。历史原件继续冻结在 [`cr311-312-qa-entry-103/before.tar.gz`](../reviews/evidence/cr311-312-qa-entry-103/before.tar.gz)。

## 覆盖结果

| QA ID | 验收追踪 | 独立结果 | 证据与限制 |
|---|---|---|---|
| QA07-CANDIDATES | AC-323/324；UIA427；FE4-V01；API004 | **PASS** | 当前 Go+新 PG 的实际 API：41 项及大写查询均排除 exact match；`art/go/theater/another` 保留；`q=the` 保留 substring；40 次 Random 无禁词；旧 selected `the` 可继续请求。开发方全矩阵与生产 SQL证据作为补充复用。见 [`api-results.json`](evidence/cr311-312-qa/api-results.json)。 |
| QA07-WIRE | AC-325/327/328；UIA428–432；FE4-V02/03；API302/304 | **PASS** | 实际 v6 ordinary 流与 Q02 流证明 initial、replace、paragraph/body complete、discard/restore 和完整 Result；DB 仍为 `m003-content-v5` / policy1。shorter/longer、continuation、preview 和非法序列复用同交付版本的后端确定性证据。 |
| QA07-ACTIVITY | AC-326/328；UIA428/430/437；FE4-V02/08 | **PASS** | 实际流出现 writing/improving，provider ledger 正好 8 次预期调用，无额外 Review 公共事件；Plan 到完整 Result 前持续存在。正文无百分比、ETA、轮次或上限文案。 |
| QA07-TYPING | AC-326/327；UIA438；FE4-V04/06 | **PASS** | 实际浏览器首 DOM mutation 为 `T`，随后两个时间点正文增长；hidden、36 grapheme/s、650ms deadline、combining/ZWJ 和 epoch 边界复用冻结 scheduler 单测。受控 fixture 只证明表现机制，不作为文章或代表文案证据。 |
| QA07-CONTINUITY | AC-325–327；UIA429/433/435/436；FE4-V05/06 | **PASS** | 浏览器实际观察 180ms entry、220ms replacement、180ms tail，unchanged paragraph、passage/status/action 节点与 selection 保持；240ms Plan、160ms status 与完整高度采样复用开发冻结证据。自然点击焦点专测 5/5 在 draft/final 均保持同一按钮；disabled 瞬间 focusout 后约 5ms 恢复。 |
| QA07-TERMINALS | AC-327/328；UIA431/432/436；FE4-V03/06 | **PASS** | 实际 Q02 旧禁词目标 `the/art` 完成 discard→restore 并以 `service_incomplete` valid；cancel/pending/EOF/protocol/new epoch 复用对应冻结单测与浏览器证据。 |
| QA07-UI12 | UIA434/435；FE4-V07 | **PASS** | 独立浏览器观察取消零新 POST、成功 discard 后恰一条新 stream、discard 失败零新 stream 且旧结果保留；其余 save/claim/leave/pending 边界复用 CR310 5/5 开发浏览器证据。 |
| QA07-PREVIEW | AC-325–328；UIA432/433/436；FE4-V02/05/06 | **PASS** | 390px 英文 PAGE212：live Plan/draft、取消、关联完成后的 GET/readiness、publish enable 与 stale Plan 清除均通过；无 Random 控件、无横向溢出。PAGE216 共享 presenter 风险由同组件单测覆盖，无新增独立页面扩测。 |
| QA07-ACCESSIBILITY | UIA430/433/436/438；FE4-V05/08 | **PASS** | `zh-CN`/`en-US`、单一 stream polite region、正文零 per-token aria-live、ghost inert/aria-hidden、44px action、reduced motion 0s、1440/390 无横溢通过；目视对照 UI13-R4 代表书店 sample 未见结构或主题偏差。 |
| QA07-PERSISTENCE | AC-327/328；API006/API304 | **PASS** | 两条 canonical 实际 run 仅 terminal validated 后可用完整 Result；body_complete 状态仍 active、`can_save=false`。DB 两条均 valid、pipeline v5、policy1；后续五词捕获仅用于匹配 replay。 |

## 证据分层

- **实际 Go/API/DB**：[`api-results.json`](evidence/cr311-312-qa/api-results.json) 100/100 PASS；新 PG18、当前 Go、确定性本地 provider。六词 ordinary 与旧目标 Q02 均为实际 SSE；无外部模型调用。
- **实际捕获线重放**：[`actual-replay-results.json`](evidence/cr311-312-qa/actual-replay-results.json) 将当前 Go 捕获的 38 个 v6 事件以完全匹配的五词/model/locale/scenario/length 请求重放给当前 Nuxt；这是 client-consumption replay，不称作第二条 Go E2E。
- **受控浏览器**：[`browser-summary.json`](evidence/cr311-312-qa/browser-summary.json) 13/13 PASS，用 synthetic `adapt` fixture 验证 motion、race、失败、UI12 与 preview；不把其内容当批准书店文案。
- **焦点专测**：[`focus-probe-results.json`](evidence/cr311-312-qa/focus-probe-results.json) 5/5 PASS，取代组合 harness 在 disabled 过渡内主动 `.focus()` 导致的间歇方法失败；原失败均保留。
- **复用**：`implementation/backend-validation.md`、`frontend-validation.md` 及其冻结证据用于全矩阵、scheduler、shorter/longer/continuation/非法序列、plan/status 完整时序、PAGE216 与未受影响 UI12 边界，不冒充独立执行。
- **用户 UAT 接受**：[`user-acceptance.json`](../reviews/evidence/uat-acceptance-105/user-acceptance.json) 记录当前版本整体 UAT ACCEPTED；没有逐项执行、自然模型分支、调用量或质量分数推断。

## 排除与停止条件

达到最短充分覆盖后停止扩测。生产部署、历史迁移、真实 provider 生成、费用/质量成功率、文章自然度、语义审稿、真机和人工读屏未验证。真实 UAT3015 已刷新并通过无生成 readiness，且用户已整体接受当前版本。QA 未关闭 CR 或迁移状态；gate105 通过后由 root/gatekeeper 机械结项。当前 readiness 见 [`readiness-receipt.json`](evidence/cr311-312-uat/readiness-receipt.json)，接受原件见 [`user-acceptance.json`](../reviews/evidence/uat-acceptance-105/user-acceptance.json)。现有非阻塞保留项与模型质量边界不变。
