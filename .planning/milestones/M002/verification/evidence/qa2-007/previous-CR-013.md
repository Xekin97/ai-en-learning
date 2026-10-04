---
id: M002-CR-013
status: open
milestone: M002
raised_by: qa-quinn
owner_stage: implementation
owner_role: backend-implementer/base
finding: QA2-F09
severity: P2
date: 2026-09-22
---

# 本人非有效或已放弃生成的收录请求返回404，违反409状态冲突契约

## 发现的问题与批准来源

[API-006 收录/放弃](../technical/api/generation-presets.md#3-收录放弃及访客承接)明确“运行非valid或已放弃409”；[公共错误](../technical/api/index.md#2-公共传输与类型)区分不存在/他人/已删除404与状态冲突409。涉及 CAP-008/009/010、DATA-009/011/012、PAGE-204/216。本次针对有效认证本人、原有效 generation token、记录仍在且未过期的请求，不改变他人资源或显式删除的404边界。

backend-cr011 中，生成取消、内容校验失败、连接中断以及成功后放弃四种状态，POST `/api/v1/generations/{run_id}/save` 均返回404 not_found，期望409 state_conflict。无效内容确实未收录；没有发现误扣或重复退款，本缺陷为服务端生命周期错误协议偏差。

## 复现与证据

使用同一真实注册学习者，经实际生成API及本地provider分别产生四种终态；保留每次 generation.started 返回的原 token，仅在内存使用，随后本人请求save。取消/失败/放弃后立即请求，未跨有效期。

| 记录仍存在的实际状态 | disposition | save实际 | save期望 |
|---|---|---|---|
| user_cancelled | pending | 404 not_found | 409 state_conflict |
| validation_failed | pending | 404 not_found | 409 state_conflict |
| stream_failed | pending | 404 not_found | 409 state_conflict |
| valid，已成功discard | abandoned | 404 not_found | 409 state_conflict |

[首轮实际失败](../verification/evidence/qa2-006/generation-results.json)、[第二个独立账号重复 G07](../verification/evidence/qa2-006/generation-v2-results.json)、[数据库存在性与响应对照](../verification/evidence/qa2-006/save-state-evidence.json)、[复现脚本](../verification/evidence/qa2-006/generation-v2.mjs)。前后两轮失败均保留；第二轮把计量断言和错误码断言分别记录，G07仍FAIL，未把接受404作为修正测试的办法。

G01–06另证实：预检不扣、主动取消计次不签到、提供方/校验/断流失败退次、有效后放弃计次且已签到、额外次数退款回原卡及取消扣卡一次。这些通过不抵消本API契约失败。

## 定向定位与建议修复

backend/internal/learning/service.go 的 lockOwnedValidRun 对状态非valid返回 ErrNotFound；Save 对 disposition非pending（且非已保存重试）也返回 ErrNotFound。与本次四种真实HTTP结果一致。交 backend-ethan 按当前契约调整已鉴权本人记录的状态冲突分类，保留错误token、他人、不存在、明确删除后不可重建和过期语义；不得通过放宽保存条件来获得409。

共享辅助函数的影响由后端评估并做相关开发回归；本问题实际独立验证范围是save接口，不声称其他命令已测出同样缺陷。无需改数据库或新产品规则。P2，阻塞API-006这项协议验收；由守门登记后实施，再交QA独立复验。需要用户决定的问题：无。

## 解决记录

OPEN；尚未修复。QA不修改实现、API或控制面。
