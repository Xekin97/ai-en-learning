---
milestone: M001
stage: verification
role: quality/base
agent_name: qa-quinn
status: milestone_complete_with_retained_limitations
date: 2026-09-16
verification_round: M001-CLOSEOUT-137
---

# 当前有效覆盖与按任务回归

M001 已由 138 关闭。本文件按能力保留适用结果；本次整理无新增应用测试。[报告](./report.md)为当前入口；行为结果复用[QA132](./evidence/closeout-132/qa.json)，本轮新增[部署差量接收](./evidence/frontend-sync-134.json)与 USER-UAT-ACCEPTANCE-134，不重跑历史全站 UAT。下表原8条业务场景均指QA132，非本轮新测试。

| 验收项 | 关联 | 方法与结论 |
| --- | --- | --- |
| 首轮成功、保存 | CAP-008/010，PAGE-004，API-005/006，DATA-009/011/012/013 | 隔离浏览器→Nuxt→Go→PG PASS；3 个成功场景均实际保存 |
| 纠正/续写共享最多 2 次 | CAP-008/009，API-005，用户 r10 授权 | 两种纠正串联 3 次上游、续写 2 次、耗尽 3 次；单 run / 单计量 PASS |
| 公开流不泄漏内部标注、不重复正文 | PAGE-004，API-005，CR-039 | reader 实际收到事件；纠正 1 次正文 delta、续写 2 次；最终/预览摘要一致 PASS |
| 取消与离开 | CAP-009，API-005 | 纠正中的取消扣次/断连退款、无后续调用 PASS；第 3 次调用竞争等复用开发 r10 49 场景证据 |
| 退款真实性和恢复 | CAP-009，API-005/006，CR-041 | 失败确认 true、结算未确认 false；故障移除后维护任务恢复 PASS |
| 解析前失败也有证据 | CR-042，G03/G04/G08/G09/G13 | malformed 记录原始片段、candidate_decode/json_invalid、后续 not_run、结算事实 PASS |
| 多次回复可辨认 | CR-042，G02/G04/G09/G13 | 每个 run 的 model_end 数=上游调用数；既有真实失败 3 份回复可核对 PASS |
| 隐私与容量 | CR-042 | 当前合成日志完整、<1 MiB、普通日志未见指定私密字段 PASS；身份排除、TTL/满额/损坏等复用开发专项，不机械重跑 |
| 原词释义 | CAP-008，API-005/007/008，CR-040 | 既有 Luna 5 份定向人工评阅：未见文章作用提示；旧 CR-040 定向证据继续有效，非全词条语义保证 |
| 实际候选同步 | PAGE-004，API-005/006，CR-041 | **Q132-01 PASS / 已解决**：运行镜像/公开资源匹配受测生产产物；独立审阅既有成功保存、退款true/false三条冒烟，未重跑 |
| 当前候选用户验收 | USER-UAT-ACCEPTANCE-134 | 用户明确“验收完毕”，已接受；未提供逐项用例，不虚构其覆盖 |
| 已确认 ≥90% 目标 | USER-GENERATION-QUALITY-129 | 沿用 r10 两模型 9/10、另 Luna 5/5；样本小、模型不同，不声明稳定达标 |
| 超大结果 | Q127-01 | 用户已撤销当前阻断；原件保留，不扩容、不新增大体积用例 |

本轮再次核对QA132的28项来源及部署前340项源码摘要，均一致。更广合同/并发验证复用[后端 r10](../implementation/evidence/corrections-r10-20260912/verification.json)和[前端 consumer-126](../implementation/evidence/ai-consumer-126/developer.json)；本轮独立浏览器结果不是那些开发检查的重命名。

本轮未新增：模型采样、浏览器/业务测试或全站视觉/多端无障碍检查；生产构建集成消费沿133开发冒烟接收，用户最终候选已接受。技术说明同步已由136接收；safe派生、精确纠正反馈和长期成功率分别保留 CR039-L1、CR042-L1、AI-QUALITY-90，见[报告](./report.md)。旧QA132正文保存在本轮证据 prior_documents；更早 OBS-129 与 G01–G15 仍在[前一版快照](./evidence/closeout-132/previous-qa.json)，原始红例不变。

137收尾核对：28项QA来源和340项交付源码摘要一致，R10-ARCHITECTURE-SYNC文档与既有行为边界一致；本轮无新增应用测试。原文快照与结果见[收尾证据](../reviews/evidence/m001-closeout-138.json)。

## 历史能力与后续回归选择

以下较早结果保留各自测试版本，不能将最终 UAT 或近期 AI 测试扩大为对这些能力的新一轮全面验证。实施变更后先检查受影响源码/依赖，再选择对应回归；完整源码基线可从 133 的 source_hashes 和 Git 交付提交追溯。

| 能力 / 稳定 ID | 最近相关专题结论入口 | 当前可用回归入口 |
| --- | --- | --- |
| PAGE-103 / CR029–033 管理用户、配额、只读 reader | [QA072](./cr029-cr034-072-report.md)、[QA076](./cr030-cr035-076-report.md) | frontend/tests/unit/admin-*；tests/e2e/cr029-cr033.spec.ts、cr030-cr035-075.spec.ts；两端 v1.4 fixture manifest |
| PAGE-007/008 / CR034–036 日期、匿名组与复习 | [QA078](./cr036-078-report.md)及其上游 QA076 | review-range-*、review-setup-presenter、passage-cloze-presenter；[设计入口](../handoffs/uiux.md) |
| PAGE-002/003/009 / CR037–038 认证与账号 | [QA085](./cr037-cr038-085-report.md)、[UAT086](./uat-086-handoff.md) | frontend/tests/e2e/cr037-auth-account.spec.ts；后端身份/密码定向测试；不宣称真机 Safari 认证 |
| CR039 / claim 保存、重启读取、删除 | [QA098](./cr039-098-report.md)、[UAT099](./uat-099-report.md) | 后端当前快照/HTTP/claim 集成测试；USER-COMPAT-001 取消的旧版兼容不作为回归要求 |
| CR040 / 原词释义与字段迁移 | [QA107 manifest](./evidence/cr040/manifest.json)、[前端开发](../implementation/evidence/cr040/frontend-developer.json) | backend/internal/ai/cr040_test.go；frontend/tests/unit/entry-meaning-contract.test.ts；DB40 隔离测试 |
| 生成 SSE、取消、退款 / CR041 | QA132、consumer-126、133/134（上表） | [后端命令与条件](../implementation/backend-validation.md#执行与回归入口)、[前端命令与条件](../implementation/frontend-validation.md#执行与回归入口) |
| CR042 / 诊断隔离、TTL、容量、取证 | QA132 及其引用的开发专项 | internal/generationevidence、generationtrace、diagnostics；普通日志不含私有内容 |
| 产品模型概率质量 | [AI 评测](./ai-evaluation.md) | 冻结样本/模型/预算后另行评估；不使用单测通过代替 |
| 开发 agent 接续 | CTX-M001-01，[整理检查](../reviews/evidence/m001-agent-context-001.json) | 新会话只读接续测试尚未执行；不与产品样本或静态检查合并 |

初始全站检查、历次视觉截图、失败与中间实验按[历史索引](../handoffs/archive.md)查询；本表保留检索价值，不重复拼接旧报告全文。任何缺少版本匹配或未覆盖场景都继续标为未验证。
