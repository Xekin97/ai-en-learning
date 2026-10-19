---
milestone: M002
stage: technical-design
role: backend-architect/base
agent_name: backend-alex
version: M002-BE-CR313-01
status: awaiting_user_review
date: 2026-10-15
requested_model: gpt-6-astra
requested_effort: high
actual_model: unknown
---

# CR313 后端设计交接

本轮交付[后端方案](../technical/config-portability/backend.md)与[文件/API合同](../technical/config-portability/api.md)，状态为awaiting_user_review。未实现、未运行数据库/迁移/provider或应用测试，未变更服务。CR313保持open；发音UI32待审、M002未收尾。此交接不自行批准或激活下一角色。

## 输入与确认闭环

- [产品09-R1](../product/config-portability.md)完整字段、DATA-501～506/CAP-501～504/AC-501～514；[设计33-R3](../design/config-portability/design-spec.md)及[交互](../design/config-portability/interactions.md)。沿正式设计四类现有入口，不新增迁移中心/人工身份映射。
- [DB01](../technical/config-portability/database.md)与[DB交接](config-portability-database.md)已由[127授权](../reviews/evidence/cr313-backend-entry-127/authorization.json)接收并激活backend-alex；其中冻结“待审”不是当前未接收。DB313-Q01用户A保留，所有schema/生命周期建议按本次已接收DB01作为输入。
- CONFIRMED边界：整类替换、每连接本包Key必填（含停用）、跨类依赖整次拒绝、保留本地身份/用户历史、不provider探测、不迁移历史库。普通模型无Key包可查看，任何有连接的导入均须含加密Key；空类别依法检查依赖。
- 新API/加密/资源/恢复期限是PROPOSED实现选择，待本稿审阅，不冒称上游已确认技术参数。无新增改变范围的关键歧义，BLOCKED无；技术运行效果全部未验证。

## 接收结果与下游输入

| 原接收项 | 本轮结果 / 精确接续入口 |
|---|---|
| DB501-B1 / TECH-502 | BE501-03 + FILE501：复用app配置锁/ai pool受限批量读，现写方锁清单与窄函数加固、退役删除、全内包AES-GCM+Argon2id、短内存生命周期；普通不读Key |
| DB501-B2 / TECH-501 | BE501-02/04/06 + FILE502：单tx整类repository、presence及双语适配、准确映射、相关历史单语句投影、全读写路径退役过滤及唯一键交换 |
| DB501-B3 / TECH-501 | BE501-05 + API-503/504：服务端唯一ID/指纹、5分钟提交/24小时结果窗口、终态原子回执、查询串行屏障、维护清理；无回执不等于未应用 |
| TECH-503待frontend-bob | API-501～505：现JSON+CSRF、base64文件上传、原File/口令仅内存、逐项Change/DependencyBlock、固定effects、sessionStorage只留恢复token；明确unknown/expired/取消行为 |

后端设计接收完成不表示TECH条目已经实现或CR可关闭。frontend-bob应据合同接收正式UI，映射现application/admin/configuration.ts与HTTP repository/mappers，不重画设计。对新增12字符口令/文件限制/时间窗口作明确而简短的操作反馈；确认页移出组优先，提交成功检查status而非只看HTTP200；unknown只能resolve/读当前，不盲重发。

## 追踪、验证与文档维护

覆盖所有DATA-501～506、CAP-501～504、PAGE-501～504、API-501～505、AC-501～514；逐项映射见BE501-07和FILE502。未来BE-V1～V8/DB501-V1～V8必须隔离验证权限、字段、密码互通、完整替换、并发发放/领奖、commit丢响应与清理。QA仅功能/实现，不评价文章质量或模型漏判。

[静态检查及六文件hash](../technical/config-portability/evidence/backend/check.json)、[可复跑检查](../technical/config-portability/evidence/backend/check.py)、[输入hash与官方来源](../technical/config-portability/evidence/backend/source-manifest.json)只证明文档范围、链接与AC标识/旧正文保留；不证明加密、DB权限、事务或功能实际通过。未做新会话交接测试，未跑全量test/build或密码实验；无必要把文档任务扩大成实现验证。

Profile canonical入口为[backend.md](../technical/backend.md)、[api/index.md](../technical/api/index.md)、[backend-architecture.md](backend-architecture.md)，仅前置本轮入口。旧正文与127 before-entry.tar.gz逐字相同、各旧正文hash保存在check.json；没有归档/重写旧审批，也没有把旧批准套给本稿。三份scoped文档是当前CR313内容真源；旧M003原件、产品/UI/DB及控制面未由本角色修改。

本轮定向读完整Skill/契约、锁定输入和相关源文件，未递归加载planning。产品字段、DB并发约束及实现接点导致超8k软读取预算，已把技术当前内容收敛在两份主稿，不另建管理报告。source-manifest字符计量仅所列文件静态大小，不是实际模型输入tokens；实际tokens/费用unknown。

## 未决和下一步

- **OPEN：本稿审阅**。API、KDF/资源上限/结果窗口等PROPOSED选择随本稿批准；没有额外已知业务问答阻塞。
- **OPEN：TECH-503**。用户接受后，按门禁交frontend-bob完成生产页面状态、HTTP DTO适配、恢复与前端验证计划。必须输入本API和UI33-R3，不可拿原型演示行为当生产API。
- **未验证：BE-V1～V8**。实现角色后续按当前未发布schema编排，隔离空库验证，不对现UAT升级/回填；不能提前宣称上线、并发或安全通过。
- **保留事项**：CR039-L1/CR042-L1/AI-QUALITY-90/W01/QA26-MINIMAX不扩大评判，CR313不关闭，UI32仍待审。

已知限度：正常签名key轮换须排空24小时5分钟票据，紧急轮换可能不能验证旧恢复token；超过结果窗口只读当前，不能证明旧操作；GC不能保证秘密物理零残留；容量/KDF延时与退役过滤需未来定向测试。没有新增平台来掩盖这些边界。
