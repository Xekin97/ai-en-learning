---
milestone: M002
stage: technical-design
role: dba/base
agent_name: dba-diana
status: awaiting_user_review
version: M002-DB-PRON-01
date: 2026-10-16
requested_model: gpt-6-astra
requested_effort: high
actual_model: unknown
---

# 单词发音数据设计交接

本轮交付 [M002-DB-PRON-01 数据方案](../technical/pronunciation/database.md)，建议复用现有卡片原词、只保留运行时音源和播放状态；无新表/字段/索引/业务写入，无迁移。方案待审，后端/前端技术设计仍待接收，发音尚未实现。

## 输入与需求确认

- [产品08](../product/pronunciation/overview.md)：DATA-401～404、CAP-401～404；[已接受设计32-R3](pronunciation-uiux-accepted.md)：CR-314 取消选词播放，仅 PAGE-402/403，裸图标与原位状态、无可见操作/状态文字、单音源无来源文本。
- 设计批准为 USER-M002-PRONUNCIATION-UI32R3-ACCEPTED-20261016；技术入口为[门禁133](../reviews/pronunciation-technical-entry-133.md)。用户后续“下一步”用于执行当前 DBA 专业工作，未预先批准新方案或跨角色迁移。
- 原项目未上线、不需要迁移；M002 未批准收尾，CR313/UAT 验收和真实模型配置保留。适用兼容/删除/QA约束在主方案第5～6节。当前消费者是后端架构角色，不是实现阶段。
- 无需再次询问的业务歧义。未知音源许可、网络与设备能力仍为 OPEN-401～403；本轮未选 provider 或替技术验证假定资源可用。

## 产物与关键接收点

- [数据方案](../technical/pronunciation/database.md)第1节列当前源码读取点，第2～5节为生命周期、存储和一致性约束，第6节为待执行验证，第7节为后续任务。
- **DB401-B1 / backend-alex**：已有 `entry` 足够，不按发音新查词库或私人文章；发音不进造文/保存/额度事务。完成 OPEN-401/402 后给出请求、资源安全、超时及成本边界；如需新增持久层，先回修数据方案。
- **DB401-F1 / frontend-bob**：完成 OPEN-403；当前词与尝试令牌独立，旧回调不能抢回播放；目标消失/页面或会话切换必须取消；真实口音和用户选择分开，音源路径不自动变成菜单选项。按 R3 接入现有卡片。
- 许可需要可见署名但与批准稿冲突时，提交有据的产品/设计反馈；不能在实现时擅加文字，也不能去除必需署名。

## 追踪、自检与文档整理

- 覆盖 DATA-401～404、CAP-401～404、PAGE-402/403及PAGE-401排除边界；AC-401～410按数据相关部分追踪。未定义新 API 或新的数据资产。
- [输入哈希](../technical/pronunciation/evidence/database-inputs.json)、[可复跑检查](../technical/pronunciation/evidence/check-database.py)、[静态结果](../technical/pronunciation/evidence/database-check.json)、[提交记录](../reviews/evidence/pronunciation-database-submission-133/submission-receipt.json)。静态检查验证链接、源哈希与流程范围；不是功能通过证据。
- 既有699份实现源、15份R3冻结源及归档、原16份发音设计源保持；未改产品或设计真源。当前入口同步至工作流、项目清单及[M002续做索引](../continuation.md)；旧CR313数据交接保留自身已接受状态。
- 未执行SQL/迁移、应用测试、浏览器/音源调用；未操作真实UAT/模型配置。DB401-V1～V6全为后续验证合同，不能将静态结果填成已验收。未进行新会话交接测试，本轮为本地读取与静态链接核验。
- 本轮由主会话按已激活 dba-diana 角色执行；没有新建 specialist runtime 或声称完成模型切换，actual_model/usage未知。锁定Profile与模型路由不变。

## 未决项与下一步

无 DBA 业务阻塞；OPEN-401（后端，音源与使用条件）、OPEN-402（后端/前端，真实网络/音频）、OPEN-403（前端，设备/手势/有限终态）仍开放，定义以[产品总览](../product/pronunciation/overview.md)为准。本数据方案本身不能证明任何第三方音源的可用性或实际成本。

建议审核本数据方案后，经既有角色门禁交 backend-alex 完成 M002-BE-PRON-01，再交 frontend-bob 完成 M002-FE-PRON-01。当前只完成 DBA 文档交付；技术阶段整体、实现、QA/UAT 尚未完成。

> 本交接不切换角色或阶段，不自动批准自身，不代表 M002 收尾。
