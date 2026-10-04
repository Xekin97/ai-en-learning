---
milestone: M002
stage: verification
role: quality/base
agent_name: qa-quinn
status: awaiting_user_review
result: failed_requires_implementation_rework
version: M002-QA-02
date: 2026-09-21
---

# 二期独立验收第二轮

**CR-005 与 CR-006 的修复已通过独立复验；本轮仍为 FAIL，新增两项实现缺陷。** 领取过游客短文的账号无法注销；后台编辑已有下架模型卡时，浏览器校验阻止保存。尚不具备最终 UAT 或里程碑关闭条件。

## 输入与方法

授权 TRANSITION-M002-021，当前 verification / qa-quinn；PRODUCT-03、UI22/H01、DB-03、BE-03、FE-02 不变。使用 [frontend-cr005](../implementation/evidence/frontend-cr005/manifest.json) 的 273 个源码文件与 [backend-cr006](../implementation/evidence/backend-cr006/manifest.json) 的 284 个源码文件，逐文件匹配，不仅依靠 Git HEAD。运行已交付的 CR-005 生产构建，新建隔离 PostgreSQL 18 与真实 Go 服务；浏览器访问专用 3301 代理、3331 前端及 38081 API。旧 3300 契约预览未作为本轮真实集成结果。

复用开发已完成的单测、lint、类型检查与构建证据，没有机械重跑。供应商全部为 loopback，共 4 次本地调用，新增真实 AI 调用为 0。存储故障通过真实页面注入拒绝、事务失败、未知版本及两个标签页，提交和结果读取走真实后端。隔离账号、运营配置与受控种子只写一次性测试库。

## 已修复项与新阻塞

| ID | 本轮结论 | 证据及责任 |
|---|---|---|
| QA2-F01 / CR-005 | **复验通过**：存储不可用仍可编辑、概览修改并提交最新答案；恢复需确认，未知版本不覆盖，双标签保护和提交后清理通过 | R01–05，[CR-005](../changes/CR-005.md)；正式关闭待守门同步 |
| QA2-F02 / CR-006 | **接口修复复验通过**：保留已有下架引用可改积分；旧预览失效；已用/未用卡按新价格退一次，已退卡不追补；新增下架引用仍拒绝 | R09/R10，[CR-006](../changes/CR-006.md)；完整后台操作仍受 F04 阻塞 |
| QA2-F03 / CR-007 | **P2，阻塞**：访客生成后注册并领取短文，正确密码确认注销返回 500；数据库回滚，账号和批次仍存在。无领取记录的新账号对照返回 204 | R07 与独立重复复现，[CR-007](../changes/CR-007.md)，backend-ethan |
| QA2-F04 / CR-008 | **P2，阻塞**：后台模型卡仅剩已下架模型时，编辑下架积分后点保存，空模型必选框阻断提交；0 次 PUT，旧金额未变 | R08，[CR-008](../changes/CR-008.md)，frontend-claire |

两项新缺陷均违反既有批准规则，无需新产品选择。F03 的 claim 删除范围已有 CAP-005 / DB2-T13 定义；F04 与 F02 的失败层不同：后端 API 已修复，前端表单尚不能提交，不能把 API 通过扩大为用户端完整流程通过。

## 本轮独立结果

| 检查 | 实测范围与边界 | 原件 |
|---|---|---|
| R01 | 首次拒绝 IDB 仍出现 5 个字母槽；编辑、填写短文、概览再改、提交均保留最新值；存储恢复后重试清理，刷新只得最小完成收据 | [review-reverify.json](evidence/qa2-002/review-reverify.json)、[脚本](evidence/qa2-002/review-reverify.mjs)、[提交截图](evidence/qa2-002/R01-denied-submitted.png) |
| R02 | 已存旧值后注入写事务失败；提交使用新内存值；解除故障再清理移除旧答案 | 同上 |
| R03–05 | 存储读取恢复前保护已有答案，确认后恢复；未知 schema 重试不覆盖、显式重来后开新 attempt；两标签更新要求确认 | 同上及[恢复确认截图](evidence/qa2-002/R03-recovery-confirmation.png) |
| R06 | 4 次随机候选排除当前库 learn 与已选项，达到 5 词上限返回 limit_reached，学习统计未变 | 同上。未直接读取额度账本，脚本名称中的“不计费”不能单独证明全部计量边界；无候选与其他用户隔离仍待覆盖 |
| R07 | 错密码改密 422；正确改密保留当前会话、撤销第二会话；旧密码拒绝、新密码有效；错密码注销不删批次；正确注销失败 | 同上。前置改密断言已执行，但整项为 FAIL，不累计为独立通过项 |
| R07-repro | 相同有 claim 账号再次注销 500，claim 仍为 1、批次 ID 不变；新账号注销 204，后续读取 401。PostgreSQL 明确报 visitor_claims_state_consistent | [additional-audit.json](evidence/qa2-002/additional-audit.json)、[脚本](evidence/qa2-002/additional-audit.mjs)。只保存脱敏 ERROR/CONTEXT，不复制 token/hash 明细 |
| C01–05/07 | 重验兑换幂等、同模型 6+3 天精确累加、禁止负数补分及模型卡次数字段、基础调整不变更体验到期与用量、已用卡下架可退、真实背包 DTO 展示 | [cards-audit.json](evidence/qa2-002/cards-audit.json)、[脚本](evidence/qa2-002/cards-reverify.mjs)、[背包截图](evidence/qa2-002/cards-real.png)；这是上一轮场景的回归，不累计为新业务覆盖 |
| R08 | 实际后台表单编辑；唯一无效控件为 required 的空模型 SELECT；没有发出 PUT，金额仍为 20 | [DOM/请求记录](evidence/qa2-002/admin-retired-card-ui.json)、[截图](evidence/qa2-002/admin-retired-card-ui.png) |
| R09 | 真实管理员 API 从 20 改 35；旧预览 409 preview_stale；已用卡退 35。再改 50，已退卡重试仍返回原 35 收据；未用卡退 50。最终积分 275=200−10+35+50 | [additional-audit.json](evidence/qa2-002/additional-audit.json)；同幂等键与新幂等键重试均未再加积分 |
| R10 | 新建卡引用已下架模型仍为 422，字段 /effect/model_ids，invalid_reference | 同上 |

有效检查 **14 项通过**（R01–06、C01–05/07、R09/R10），**2 项独立缺陷**（R07/R08）；R07 重复复现、准备步骤和截图不重复计数。第一轮的 20 项通过证据继续作为历史来源，不声称本轮全量重验。

## 测试方法修正与还原边界

本轮 cards-audit/C06 的失败来自 QA 脚本误读 `body.error.code`；契约 Problem 的 `code` 在根级。此项无效，不计产品缺陷。原脚本、日志和结果保留；另建 R09/R10，使用新模型、账号和两张卡从头完整复验，无需修改产品迎合测试。R07 初次日志的 undefined 同样来自错误格式化路径；HTTP 500 已由独立复现、根级 Problem 和数据库约束日志确认，不是据 undefined 判定。

UI22 原型的 itemForm、批准 copy 和实施组件已定向读取；R08 截图及实际控件证实保存流程偏差，不将局部观察宣称为整页视觉还原通过。第一轮首页、认证、200% 缩放的还原结果沿[历史报告](evidence/qa2-002/previous-report.md)和 [qa2-001 原件](evidence/qa2-001/manifest.json)保留。本轮为第二次独立提交，CR-005 经 1 次实现返工后通过；CR-006 后端修复通过，但补验发现前端遗漏。没有新设计要求或完整视觉重验。

## 未验证与交接

[覆盖矩阵](coverage-matrix.md)仍索引 49 CAP、25 PAGE、28 视图及 119 UIA。本轮补充账号/随机/草稿/卡退款场景，并纠正 CAP-220 已有 Q01/Q02 却标 DEV_ONLY 的索引错误；PARTIAL 不表示整项通过。完整多批范围、随机无候选与其他用户边界、手动成就/等级奖励、补签、部分重叠模型/跨 04:00 组合、更多后台并发、指标独立核算及全部 UIA 状态仍待验证。

真机输入法/软键盘、人工读屏、确证 BFCache、生产 Linux/Nginx/CSP/回滚、实际历史留存和容量尚未验证。≥90% AI 质量仍未证明，见 [AI 评估](ai-evaluation.md)。存储损坏和清理失败的本轮指定场景已覆盖，不扩大为全部组合。

先由 backend-ethan 处理 CR-007，再由 frontend-claire 处理 CR-008；提交定向开发证据后，由 qa-quinn 复验并接续矩阵。[交接单](../handoffs/verification.md)与 [UAT 准备](uat.md)已更新。CR001/002 仍开放；CR039-L1、CR042-L1、AI-QUALITY-90 保留。CR005/006 的正式关闭与 CR007/008 的状态索引由守门器处理；QA 未修改控制面。

## 原件保护与环境

第一轮原始证据未覆盖。旧的当前报告、矩阵、UAT、AI 评估、交接和 CR005/006 原文均封存在 [before-owned.tar.gz](evidence/qa2-002/before-owned.tar.gz)，对应哈希在 [inputs.json](evidence/qa2-002/inputs.json)。第一轮 manifest 中这些可变文档的哈希指其旧版本，现可从该快照恢复；本轮当前版本与原件由[新 manifest](evidence/qa2-002/manifest.json)记录。

专用 API/PG、3331 前端及临时代理/provider 已停止；原 3300/3330/38080/4186 服务保留，见[停止记录](evidence/qa2-002/environment-stop.json)。未修改应用、上游批准或控制面，未部署或提交。新会话独立交接测试未执行，无额外委派授权；静态链接与摘要检查不冒充独立接续。输入/token 计量 unknown。
