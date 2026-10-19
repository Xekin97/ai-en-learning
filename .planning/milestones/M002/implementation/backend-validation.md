> **CR313 / M002-BI-CR313-01 后端验证入口（2026-10-16，接收修正R2）**：四类别 portability、0018、BE501-06 runtime、model_trial附属读取、空growth 422、resolve unknown及KDF准入的隔离PG/HTTP实际结果见 [config-portability/backend-validation.md](config-portability/backend-validation.md)，命令、实际stdout与失败修复见 [test-log.md](config-portability/evidence/backend/test-log.md)。状态 `awaiting_user_review`；下方旧正文保留。

> **M002续做索引124**：本里程碑包含原M003全部需求。[较新同类原件](../../M002-legacy-M003/implementation/backend-validation.md)及其已记录的逐项接收/验证均归M002；旧编号只是历史标识。当前工作与未完成项见[续做索引](../continuation.md)，下方前期记录保留，不能据旧完成态关闭当前M002。

---
milestone: M002
stage: implementation
role: backend-implementer/base
agent_name: backend-ethan
version: M002-CR029-BE08
status: ready_for_verification
---

# CR029-F05 服务商聚合实现

CAP101/102、DATA007/008、PAGE208。当前契约 technical/api/model-connections.md：GET服务商聚合完整模型，POST创建整组，PATCH原位更新服务商与模型。事务持有配置锁/CAS，模型归属与完整集合校验、稳定UUID和引用、密钥目的地保护，修改/新增一次提交。省略不是下架。0016新增凭据upsert窄权限函数，并将名称唯一从全平台改为服务商内，允许不同服务商同名模型；不改业务行。

Go AI/admin/httpapi单元及vet通过，admin整包集成通过（9.402s）。新增隔离真实DB与HTTP验证：25→26个模型完整读取、ID互换与模型/服务商身份稳定、计划引用、单次revision、保留Key及换址拒绝、另一服务商Key隔离、未完成请求快照、完整成员/外部UUID/过期CAS拒绝、晚期SQL错误回滚连接/密钥/所有模型、应用角色不能读密文、AI角色不能更新凭据。HTTP权限/CSRF/保存/读取/CAS与原三协议探测通过；0015→0016及旧数据升级检查通过。

初次集成发现旧全平台名称唯一导致跨服务商同名模型冲突；按当前聚合归属调整索引后复验通过，初始证据保留。0真实付费模型调用。原UI30流式严格验证未改，复用对应证据。当前日志和源码见[evidence/provider-workspace31](evidence/provider-workspace31)。3302部署须先私有备份、隔离恢复迁移演练，再应用0016；旧二进制严格校验账本，不能带0016直接回退，切换失败且无新业务写入才结构回退。用户新UI验收待QA交付后反馈。

旧实现记录可由[上一当前文快照](evidence/provider-workspace31/before-validation.tar.gz)及原evidence/provider-batch30、generic-models29按ID追溯；既有开放质量项未关闭。
