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

# M003 CR-311/312 独立 QA 报告

## 结论

CR-311/312 独立功能 QA **PASS**。AC-323–328、UIA-M003-427–438 与 FE4-V01–08 在实际 API/DB、匹配捕获线重放、受控浏览器和冻结开发证据的组合下均有充分覆盖；未发现需交回实现角色的产品缺陷。

本结论不包含文章质量或模型语义审稿准确率，不证明历史迁移、生产容量、真机或人工读屏。独立 QA 执行时没有调用真实 provider 或刷新 UAT3015；后续授权 readiness 已将3015刷新到同一 QA07 版本且没有发起真实生成。用户已于 2026-10-15 明确接受 gate104 核对的当前 CR-311/312 真实3015版本；接受原件见 [`user-acceptance.json`](../reviews/evidence/uat-acceptance-105/user-acceptance.json)。该接受是整体流程结论，不扩写为逐场景执行记录或模型质量结论。

## 独立执行结果

| 层 | 结果 | 核心事实 |
|---|---|---|
| 当前 Go + 新 PG18 + local provider | **100/100 PASS** | 41 exact/case-insensitive 排除、合法 substring/短词、40 Random、旧 selected `the`、v6 ordinary/Q02、body_complete 非 final、provider ledger、DB v5/policy1。 |
| 五词实际捕获 | **PASS** | 当前 Go 产生 38-event v6 validated 流，随后以同 model/locale/scenario/length/5 targets 精确请求重放给当前 Nuxt。 |
| 浏览器聚合 | **13/13 PASS** | 1440 中文 typing/motion/continuity/a11y、reduced motion、UI12 cancel/success/failure、390 英文 preview/readiness、实际捕获线消费。 |
| 焦点专测 | **5/5 PASS** | 自然点击后 action 在 draft/final 保持同节点与焦点；terminal disabled 的 focusout 均由 enabled 后约 5ms 自动恢复；每轮仅一条 options 请求。 |
| 人工目视 | **PASS** | 最终 1440 与 live 390 截图无横溢、重叠或截断；布局、暖中性色、绿色状态和阅读层级与 UI13-R4 书店代表图一致。synthetic `adapt` 不作批准文案或文章质量判断。 |

## 方法修正与原始失败

所有首败均保留，未降低预期：

- `api-run-attempt1-method.log` 是 zsh 只读变量名导致的 wrapper 错误；测试本身已执行。
- API attempt1–3 是 QA fixture 的搜索排序假设、长度不足及中文意义配英文 tag；后端 trace 最终明确 `tag_content_or_language_invalid`。将同一 synthetic fixture 的 meaning locale 校准为英文后，canonical 100/100 通过。
- browser attempt1–5 包含全页 aria-live 误计、错误确认按钮文案、reduced-motion 瞬时 0s class 被当作视觉动画、basic max5 与六词 replay 不匹配、以及在 action disabled 窗口主动设焦点的组合 harness 竞态。修正 selector/fixture 后，受影响功能分别由 canonical browser、匹配五词 replay 与 5轮自然点击焦点专测通过。

这些均为测试方法或 fixture 问题；没有形成可复现产品缺陷。

## 复用证据

未机械重跑开发方已经完整执行的 full unit 449、最终补充 46、全 race/build/lint/format/typecheck。冻结版本相符的全 41 矩阵、scheduler 虚拟时钟、shorter/longer/continuation、非法序列、Plan/status 完整时序、PAGE216 和 UI12 未受影响边界按 [`coverage-matrix.md`](coverage-matrix.md) 明确复用。前端冻结包 SHA-256 `98b0b793a994d8eddc99157a27b13cc3c926a00fc6ec83c2f22e34110d85c506`，35 路径 manifest。

## 环境与清理

QA 只使用自有临时端口/目录。[`local-stack-cleanup.json`](evidence/cr311-312-qa/local-stack-cleanup.json) 证明新 PG、Go backend、metrics、local provider 和 Nuxt 端口全部关闭；[`browser-stack-cleanup.json`](evidence/cr311-312-qa/browser-stack-cleanup.json) 证明受控 mock/Nuxt 端口关闭。该独立 QA 原执行阶段未接触受保护 3015、54882–54885、4174 或其私有账号/环境；后续仅在104授权下执行下述 app-only refresh。未修改生产源码、状态、CR 或控制文件。

## 后续真实 UAT readiness

在 `USER-M003-CR311312-UAT-NEXT-20261014` 授权下，当前3015已完成 app-only 刷新并保持运行。accepted source manifests 0 mismatch；PostgreSQL/nginx pid 未变，schema、关键数据/账号/3个模型配置与 provider ledger 23→23 完全保持。实际3015 API 6/6、browser 6/6 PASS，含41 exact过滤、30 Random、Basic/Pro/Admin真实密码登录、管理员模型只读、mobile与reduced-motion。没有 mock、拦截、provider probe、Generate/preview 或质量评分。详见 [`readiness-receipt.json`](evidence/cr311-312-uat/readiness-receipt.json)。

## 用户 UAT 接受

`USER-M003-CR311312-UAT-ACCEPTED-20261015` 记录用户原话“UAT 验收通过，还有下一步吗？”，适用版本为 `QA07 tested CR311/312 refreshed by104`。这为当前增量提供用户接受依据；不推断全部清单逐项执行，不声称 Q02/repair/失败恢复自然触发，也不新增调用次数、费用、时延或质量评分。gate104 前的 QA/readiness 原始证据与 NOT RUN 记录保持冻结，105 只增加接受记录和当前结论文档。

现有 `CR039-L1`、`CR042-L1`、`AI-QUALITY-90`、`W01`、`QA26-MINIMAX` 及 QA 模型质量边界保持原状态，均不因本次功能 UAT 接受被解释为已解决。

## 结项建议

独立 gate105 可核对用户接受原件、104 source/runtime 一致性预检、QA07 PASS 与本次文档哈希；若门禁通过，建议由 root/gatekeeper 机械关闭 CR-311/312 并完成 M003 有界 verification 结项。QA 不自行修改 CR 状态、workflow/state/history/project/registry，也不启动新里程碑。
