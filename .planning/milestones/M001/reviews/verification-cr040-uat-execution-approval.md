---
milestone: M001
stage: verification
review_status: approved_scoped_execution
date: 2026-09-09
transition_id: TRANSITION-M001-108
gatekeeper: gatekeeper-owen
operation: remain-in-current-stage
---

# CR-040 本地 UAT 执行授权

当前和下一责任均为 verification / quality/base / qa-quinn / active，不切换阶段或专业角色。

用户在明确询问“允许按已确认保留范围清理本地 UAT 数据，并更新 6001 前后端；不包含收费模型调用”后回复“允许”。记录 USER-CR040-UAT-EXECUTION-001，覆盖一次本地切换及有限冒烟，不再重复申请相同操作。普通交接连续授权保留。

## 条件检查

- PASS：锁定 Profile、唯一活动角色、107 历史/状态一致，名称合法；五项必需原件存在；260 项两端来源与开发摘要一致。
- PASS：[报告](../verification/report.md)、[覆盖](../verification/coverage-matrix.md)、[AI 评估](../verification/ai-evaluation.md)、[UAT](../verification/uat.md)、[交接](../handoffs/verification.md)及 [manifest](../verification/evidence/cr040/manifest.json)限定自动验证通过；不重跑开发检查。
- PASS：用户此次解决 [执行前置检查](./verification-cr040-uat-readiness.md)中的实际操作权限缺口。清理白名单与 [DBA 方案](../technical/database.md#cr040-data-cutover)不变，运行前的实例/恢复/停写条件仍必须实测。
- OPEN：真实模型质量、CR-039/040、当前用户 UAT 接受和发布，不由本门关闭。

## 获准与禁止

仅针对既有 wordweave_uat 本地项目；核准确切实例、数据库、角色和表集合后停止写入，按获批离线入口单事务清理/迁移，构建并更新配套后端/前端，完成 readiness 后开放6001，进行无AI有限冒烟。不得波及其他本地项目或重建数据库/卷。

按批准恢复政策核实保障；不默建待删内容的长期副本。发现前置不符、未知对象/写入者、COMMIT不明或恢复条件不足即停止并按已批准边界处理，不强杀未知会话或修改源码绕过。模型/凭据/管理员完整行保留，组模型分配清空，不擅自重新分配或探针。没有真实模型请求、费用、旧版兼容、再次清库、新需求或发布授权。

## 接收摘要

| 原件 | SHA-256 |
| --- | --- |
| verification/coverage-matrix.md | 67201b984fe9f5f30b5a7631d95fde53bf1deb9f7abed31576f58d85fceb0144 |
| verification/report.md | 08624ad015140befb7a36234ca2fe212e058eb83838269beea7756d5485b06c1 |
| verification/ai-evaluation.md | 3fcd63811df1f03c1e5bdb007de2a54440c8cc0442466b110109c05cc519c09b |
| verification/uat.md | c1cb23b47db9fbdc17a8ed3fe19db8586c55c54f50ae3fb8a78070b4558aecc4 |
| handoffs/verification.md | 4fc2e7de1f880b7d7fd5fb73422497699885933b3d4a7e81e4ccfbb90517c96b |
| verification/evidence/cr040/manifest.json | e9d481e85405fcd6c9966052c0a8a9eb64869aa55726bb2c5bc1afee019fe639 |

本门仅写控制状态、追加108历史和此批准；注册表角色不变，不改专业产物。
