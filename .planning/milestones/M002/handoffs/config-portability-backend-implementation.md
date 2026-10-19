---
milestone: M002
stage: implementation
role: backend-implementer/base
agent_name: backend-ethan
version: M002-BI-CR313-01
status: awaiting_user_review
date: 2026-10-16
---

# CR313 配置可移植性后端实施交接

已实现 models/plans/items/growth 四类别完整 export/current/strict preview/atomic import/resolve。文件层支持严格大小写白名单、presence/null/0/false/空集合、重复键/深度/NUL/非法UTF-16 surrogate，模型凭据包使用固定 Argon2id v19 + AES-256-GCM；普通导出不读取或输出Key。外层HTTP DTO同样拒绝大小写别名及显式null口令。

预览提供真实逐字段安全diff、跨类阻断、完整批准notice、单SQL有序流的域分隔历史HMAC与同快照计数。提交在配置排他锁和锁后管理员/session复验下完成CAS、影响复验、四类全量事务替换与不可变终态回执；同ID幂等、异指纹冲突、resolve先到屏障、期限和≤200清理均已接入。响应和导出先完整序列化再发header，超限不返回半预览/token。

0018增加provider/growth退役、活动唯一交换、receipt约束/权限/清理和窄凭据函数。BE501-06的admin、AI、entitlement、generation/preset、growth达成/领取/恢复、admin个人投影、startup pending URL和敏感panic日志均闭环；逐接点见 [backend-validation.md](../implementation/config-portability/backend-validation.md#be501-06-逐接点闭环)。

开发验证在单独Docker PG的随机空库完成；全 unit、vet、build、platform/postgres、portability、admin、generation、growth、entitlement、HTTP集成通过，0真实provider调用。接收修正另验证四kind道具附属读取、空growth 422、KDF并发/速率恢复、同Key重建resolve及DB不可用unknown/Retry-After。准确命令、实际stdout、首次失败和修复见 [test-log.md](../implementation/config-portability/evidence/backend/test-log.md)，BE-V1～V8 / DB501-V1～V8映射和未故障注入边界见 [backend-validation.md](../implementation/config-portability/backend-validation.md)。

状态建议保持 `awaiting_user_review`。未部署UAT/生产、未迁移历史数据、未commit/push；后续由root做接收与阶段控制，不应把开发自验当成用户UAT或自动关闭CR313/M002。

