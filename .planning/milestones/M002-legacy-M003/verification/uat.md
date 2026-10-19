---
milestone: M003
stage: verification
role: quality/base
agent_name: qa-quinn
status: accepted
version: M003-UAT-CR311-312-ACCEPTED
result: accepted
qa_result: pass
readiness_result: pass
user_uat: accepted_current_version
date: 2026-10-15
---

# M003 CR-311/312 用户增量验收清单

## 当前状态

CR-311/312 独立 QA 与真实 UAT3015 readiness 均已 PASS。用户随后对 gate104 已核对的当前版本明确回复“UAT 验收通过，还有下一步吗？”，因此本轮 CR-311/312 整体 UAT 记为 **ACCEPTED**。接受原文与精确版本见 [`USER-M003-CR311312-UAT-ACCEPTED-20261015`](../reviews/evidence/uat-acceptance-105/user-acceptance.json)。

该整体接受不反推用户逐项执行了下列全部清单，也不证明 Q02、repair、恢复或失败路径自然发生；不补造真实请求次数、时间、费用或文章质量评分。`USER-M003-UAT-ACCEPTED-20261013` 继续作为 CR-311/312 之前版本的历史接受记录。

直接入口：<http://127.0.0.1:3015/create>；管理员模型页：<http://127.0.0.1:3015/admin/models>；本机账号文件：`/tmp/wordweave-m003-uat-real-003/uat-accounts.json`。当前 readiness 回执见 [`readiness-receipt.json`](evidence/cr311-312-uat/readiness-receipt.json)，操作说明见 [`guide.md`](evidence/cr311-312-uat/guide.md)。用户可在 3015 执行以下最短增量清单。最终本地 UAT 必须使用环境中已经保存的真实模型和真实 API，不接入 mock、代理拦截、合成 provider 或故障注入。只有用户实际点击生成或预览时才会产生真实外部请求和可能费用；本清单修订本身没有发起任何调用。本文不包含账号或真实密钥。

## 验收前提供的检查清单（不回填逐项结果）

1. **候选过滤**
   - 在 Search 依次输入常见功能词的大小写形式，如 `the/THE`、`and/AND`、`you/YOU`；exact 词不得出现。
   - 输入 `the` 时仍应看到合法 substring 候选（例如 `theater`）；`art`、`go` 等合法短词仍可选择。
   - 连续使用 Random，结果不得是 CR-311 的 41 个排除词。

2. **旧内容兼容（有安全现成数据时）**
   - 如果刷新后环境已经安全保留了含旧 `the` 或 `art` 的 selected/preset/history 内容，可直接打开验证；页面应能显示并继续使用，不应因为新候选规则追溯拒绝旧目标。
   - 如果没有现成 legacy 内容，本项记为 **条件未触发**，不得为 UAT 临时 seed、篡改历史数据或接入 mock。该兼容边界已由独立 QA 的真实 API 请求覆盖。

3. **普通生成与正文演进**
   - 选择 3015 中已经保存并经 readiness 核对的真实模型，通过真实 API 完成一次普通生成；不替换 provider、不拦截 SSE、不注入预制响应。
   - Plan 先出现并持续保留；正文首字立即出现并连续增长，不显示假 token、百分比、ETA、轮次或审稿上限。
   - 如果真实模型自然触发返修，变化段应平滑替换，未变化段、滚动位置、selection 和操作按钮焦点应稳定；未自然触发时不得为了制造返修而修改服务或注入结果。
   - 完整 Result 出现前不能保存。
   - 最终只显示完整正文、tags 与学习字段，状态为完成；正文无逐 token 读屏播报。

4. **增强审校与恢复（自然发生时观察）**
   - 如最终 UAT 包含增强模式，仍使用同一已保存真实模型和真实 API；不使用 Q02 synthetic 模型，也不要求真实模型必须判定 reject、触发 repair 或发生服务故障。
   - 若真实运行自然发生返修，按步骤3观察段落替换与最终完整 Result。若自然发生审校服务不完整，最后有效稿应恢复并显示明确提示，且不得公开审稿 payload 或丢失整篇正文。
   - 未自然触发 Q02/repair 时记录 **条件未触发**；这些故障与恢复边界已由 QA-only fault injection 覆盖，不在用户 UAT 中人为复现。

5. **下一次生成确认**
   - 完成一篇后修改模型/词/场景/长度/释义语言；旧结果保持不变。
   - 点击 Generate 后才出现放弃确认。取消应保留旧结果和新输入；确认应只发起一条新生成。
   - 若执行确认路径，第二次生成也必须使用已保存真实模型和真实 API，并明确会产生另一条真实外部请求；不得用代理或 mock 代替。
   - 不在用户 UAT 中人为制造 discard failure。失败保留/零新 POST 已由 QA-only fault injection 覆盖；只有真实 API 自然失败时才记录实际表现。

6. **管理员预览与窄屏**
   - 在 390px 英文 PAGE212 使用已保存真实模型和真实 API 执行本次授权包含的 preview 模式；不拦截请求或注入 fixture。每次 preview 都可能产生真实外部请求。
   - validated 后仍应等待关联 preview GET 才允许发布；取消、stale 配置与上次完整 preview 保持正确。
   - 如在系统 reduced-motion 设置下执行，同一真实流程应直接发布变化，无 180/220/240ms 可见动画残留；未启用该系统设置时不要求额外生成专门复现。

## 验收记录

- 当前版本用户反馈：**整体 UAT 验收通过**
- 当前版本用户接受：**ACCEPTED**（`USER-M003-CR311312-UAT-ACCEPTED-20261015`）
- 当前环境 readiness：**PASS**；真实生成/preview：**准备阶段未执行**；provider 新调用：**0（账本 23→23）**
- 最终环境要求：3015 已保存真实模型 + 真实 API；**禁止 mock/proxy/synthetic provider/fault injection**
- 当前接受原件：[`uat-acceptance-105/user-acceptance.json`](../reviews/evidence/uat-acceptance-105/user-acceptance.json)
- 历史接受：`USER-M003-UAT-ACCEPTED-20261013`，仅适用于 CR-311/312 之前版本，原件见 [`user-acceptance.json`](../reviews/evidence/uat-acceptance-096/user-acceptance.json)
- 功能 QA：[`report.md`](report.md) 与 [`coverage-matrix.md`](coverage-matrix.md)
- 范围排除：文章质量、自然用词、语义审稿准确率、生产容量/性能、长期费用、历史迁移、真机与人工读屏。

本次只记录用户明确给出的整体接受，不回填逐项 PASS/FAIL、浏览器/视口、自然模型路径或调用明细。QA 不代用户扩写验收事实。
