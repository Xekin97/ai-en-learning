---
milestone: M003
stage: technical-design
role: dba/base
agent_name: dba-diana
status: awaiting_user_review
version: M003-DB-04
date: 2026-10-12
input_version: M003-PRODUCT-09 / M003-BE-07 / CR-306
---

# CR-306 DBA交接：模型自定义参数与受理快照

[DB04原件](../technical/database.md#db4-cr306)已完成定向设计，待独立接收；未实施、未执行数据库操作，不自批阶段或关闭CR-306。当前授权只处理持久化差异，下一建议为designer-tony完整页面/M002正式视觉及用户评审。

## 输入与确认闭环

- [070独立门禁](../reviews/cr306-backend-gate-070.md)、[state](../../../workflow/state.yaml)与registry已核实technical-design / dba/base / dba-diana正式激活。[锁定Profile1.0.0](../reviews/evidence/start/locked-profile.yaml)及路由v1保持；requested gpt-6-astra/high，actual_model、运行usage unknown。
- [PRODUCT09](product.md)、[BE07交接](backend-architecture.md)、[BE7-DB](../technical/backend.md#be7-db)、[API-306](../technical/api/administration.md#api-306)、[AI7](../technical/ai-integration.md#ai7-reasoning)、DATA-306/CAP-306与AC-317–322为当前输入。
- [USER-M003-CUSTOM-PARAMETERS](../reviews/requirements-feedback.md#cr-306-自定义请求参数简化user-m003-custom-parameters)及USER-M003-CR306-REPAIR已确认每模型JSON、{}、安全边界、保存0调用与同请求快照；具体列/CHECK和分工由本角色在授权内定稿，不重复逐字段请示。USER-M003-NO-DATA-MIGRATION覆盖旧DB03升级建议，当前只允许未发布schema和可丢弃空库验证；本轮仅交文档。
- 已完整读取agt-database-design、共同/工作流/DBA/模型路由/文档维护契约与决策/CR/交接模板。新业务选择及当前阻塞无；backend-alex已在API-306明确全树U+0000入库前安全422拒绝，并提供[7项定向静态证据](../technical/evidence/cr306/u0000-check.json)，DB已接收；禁止静默替换或误称往返已验证。

## 本次原件与实施边界

| 原件入口 | 接收结论 |
|---|---|
| [DB4-01–02](../technical/database.md#db4-cr306) | 仅ai_models.custom_parameters JSONB默认{}，两run各一份无默认、非空完整版本包；对象/组合CHECK与更新守卫归DB，严格解析/16KiB/深度8/重复键/敏感名单归API统一服务；JSONB值等价，不保排版 |
| DB4-03 | 原配置排他锁/CAS/一次revision；共享锁受理参数与连接/权益一起固定，run/entries/charge原子提交；预览仍无用户charge；运行不回读/重放，读取权限/删除保留原关系 |
| DB3-08 / DB4-04 | 精确未发布0017、启动Verify、模型scan/write、BindSpec、两受理INSERT接点；本阶段不实改DDL/应用。所有SQL/事务验证留后续可丢弃空库，不升级/回填/重置现3013 UAT |

保留v5、同模型Plan→Writer/付费固定编辑与审稿、基础2和内容N0–99、180/600、Q02/退款/取消/DB未知、公开wire与预览手动发布。没有新增usage列、表、索引、目录、MQ、正文/推理/凭据副本或监控平台。完整字段规则唯一来源仍API-306，未代改BE/API/产品/UI原件。

## 文档维护与有限检查

DB03两原件与[冻结manifest](../reviews/evidence/cr306-design-baselines/database-before-manifest.json)、[tar.gz](../reviews/evidence/cr306-design-baselines/database-before-cr306.tar.gz)在写入前逐字核验；冻结包/摘要未改。DB3-01/08/09清除早期v2源码和旧库升级活动描述，DB3-02–07业务合同及DB3-V01–06有效验证保留；新入口DB4不复制API保护表。CR的DB处理段记录当前进度，其他owner段不改。

证据：[静态脚本](../technical/evidence/cr306-db/check.py)、[结果](../technical/evidence/cr306-db/check.json)、[源文件清单](../technical/evidence/cr306-db/source-manifest.json)。核对版本/稳定ID/链接、原包hash、当前源接点、限定写入与保留业务；同口径两DB文件前后Unicode字符数见结果，字符不是token或实际累计输入。运行token/总输入unknown，新会话交接测试未执行。

未运行Go/API/SQL/DDL、空库、浏览器、真实模型；静态PASS不证明CHECK/触发器/字节边界/并发已生效，也不证明AC-317–322或原真实超时已修复。原db03静态证据只覆盖旧版；未提交或部署，未读改现UAT数据库/配置/服务。

## 未决与下一步

- CR-306仍open；DB04本步完成条件为数据合同和实施接点可审阅。API的U+0000存储边界已由backend-alex明确并接收，实施须验证UTF-8/数字语义往返；无需新增业务/架构决定。若出现其他API允许但JSONB不能表示的值，交原owner定向协调，不以默认/丢值绕过。
- 建议独立接收后交designer-tony，消费BE07 [完整fixtures](../technical/fixtures/cr306/index.json)，制作PAGE208高级JSON编辑/保存冲突/测试及PAGE204/216/212等待失败的完整页面，沿M002正式视觉并提交用户新视觉评审。DB接收不等于视觉批准。
- 用户接受视觉后frontend-bob接收；backend-ethan/前端实施各经门禁，后续qa-quinn按BE7-V/DB4-04给确定性证据及有界完整真实复验，最后由用户UAT确认。此交接不激活角色或迁移状态。
- CR-302、CR039-L1、CR042-L1、AI-QUALITY-90、W01、QA26-MINIMAX及DB3-V01–06未验证范围保留；原真实质量、速度和费用未知，不以存储设计推出效果。
