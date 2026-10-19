---
milestone: M002
stage: technical-design
role: dba/base
agent_name: dba-diana
status: awaiting_user_review
version: M002-DB-CR313-01
date: 2026-10-15
requested_model: gpt-6-astra
requested_effort: high
actual_model: unknown
---

# CR-313 数据库设计交接

原始方案：[M002-DB-CR313-01](../technical/config-portability/database.md)。本稿待用户审阅，无实现/DB验证证据，不批准自身、不切换角色。CR-313保持open；发音UI32及现UAT保持原状态。

## 输入与确认闭环

- [产品09-R1](../product/config-portability.md) DATA-501～506、CAP-501～504、AC-501～514及完整必填表；[设计33-R3](../design/config-portability/design-spec.md)、[交互](../design/config-portability/interactions.md)。批准来源为[126门禁](../reviews/cr313-technical-entry-126.md)与其明确授权，原件提交时待审措辞不影响本次接收。
- [DB313-Q01明确问答](../reviews/evidence/cr313-technical-entry-126/identity-clarification.json)：跨环境不同成就身份但同kind+threshold，整次拒绝并说明身份冲突、不自动合并、不增人工对应UI。该答复不等于整份技术批准。
- 产品已确认整类替换、每连接本包Key必填、跨类移除依赖整次阻止；无目标Key复用/补填/联动解绑。DATA-504继承目标领奖/达成历史，等级按固定序号保留目标ID；成长同身份恢复活动状态是方案中明确标PROPOSED的技术细节，保留原award、不重发，未冒称Q01批准。
- single解析通过；consumer-ai-web@1.0.0与原revision/model-routing锁未改；requested gpt-6-astra/high，actual_model/usage未知。[续做索引](../continuation.md)是当前范围；M003仅历史原件。本轮未发现需重新提问的关键业务阻塞。

## 交付和必要取舍

沿单PostgreSQL、现growth_settings配置锁/revision和模块化单体。新增仅连接/成长规则退役字段、活动门槛约束及DATA-506最终操作回执；无包仓库/映射平台/队列/自动回滚。采用准确UUID/固定业务键、完整字段解析、一次类别事务、凭据同事务写入、预览依赖/历史摘要和结果查询串行屏障。

现状核对特别指出：RemoveModel会联动删group_models，不能直接复用；现成长多档保存是merge且无退役状态，不能直接循环调用；成就threshold可变，不能当稳定身份；app无密文SELECT，含Key导出应在原配置锁下复用现CredentialStore/ai pool并证明所有writer遵守锁。源码路径与哈希见[输入证据](../technical/config-portability/evidence/source-manifest.json)。

## 后端精确接收与OPEN

- **DB501-B1 / TECH-502 OPEN**：受限凭据导出接点、所有凭据写方锁覆盖、退役连接凭据清理；完整加密文件/口令/KDF/临时材料合同由backend-alex负责。不给app全表读取、不新增service/vault。
- **DB501-B2 / TECH-501 OPEN**：完整类别repository事务、严格presence校验、准确映射、无联动依赖检查、相关历史投影、原有读写者锁序/活动过滤；给定向实现接点。
- **DB501-B3 / TECH-501 OPEN**：applied/not_applied唯一回执与结果判定屏障、提交期限/保留窗口/清理和完整API；不将“查不到回执”冒充已回滚，不盲目重放。
- **TECH-503**：frontend-bob后续接收安全逐项预览/引用错误/目标生效日/冲突/unknown等数据合同，仍以正式设计为视觉真源。

这些是后续技术角色接收事项，不是用户新增业务问答，也不是本轮已完成的后端方案。DB313-Q01已CONFIRMED/CLOSED；应用效果和DB501-V1～V8全部未验证。

## 验证、整理与保留

[静态检查](../technical/config-portability/evidence/check.json)及[可复跑检查脚本](../technical/config-portability/evidence/check.py)只检查文档链接、AC覆盖、Q01状态和两份原基线逐字保留。新入口已前置于Profile规定的[database.md](../technical/database.md)和[数据库交接](database.md)，旧正文与126 before-entry快照一致；未改其他专业原件或冻结manifest。

源码是只读输入，不是实现成果。未运行SQL/迁移/单测/应用/浏览器/provider；未读真实Key；未启动/停止服务；未commit/push/deploy。UAT3015及设计4174/4175/4176保持。静态通过不等于任何AC或并发/权限真实通过。既有CR039-L1、CR042-L1、AI-QUALITY-90、W01、QA26-MINIMAX保留，不扩测。

本轮按当前入口及必要依赖定向读到产品字段表、UI规格、旧DB相关章节和实际schema/读写路径；未递归读planning。该任务超过8k软预算是完整字段和并发/历史依赖所需，已在主方案收敛单一当前真源，不另建整理报告。已计量文件字符数见输入证据，仅表示所列文件大小，不等于实际运行输入；实际tokens/费用unknown。未做新会话交接测试。

下一步建议：用户审阅此数据方案后，按原Profile角色门禁交backend-alex完成B1～B3及TECH-502，再由frontend-bob接收。数据方案的静态完成条件已满足；技术阶段整体、实现、功能验证/UAT尚未完成。本交接不授权数据库操作或阶段迁移。
