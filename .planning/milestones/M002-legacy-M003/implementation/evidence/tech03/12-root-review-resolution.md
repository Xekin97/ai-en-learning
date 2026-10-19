# Root 实施中复核反馈对应

日期：2026-10-10  
范围：`root-in-progress-review.json` 的 12 项反馈，以及同时提出的 C07/HTTP 闭环验收点。

| ID | 修复 | 验证 |
|---|---|---|
| ROOT-BE-01 | public draft emitter 增加真实 50ms timer；刷新最长安全前缀，不因尾部半词阻塞已完整词；串行有界输出。 | `internal/ai` unit/race，完整 integration |
| ROOT-BE-02 | 原生续写切换前 flush/close 旧 emitter，新尝试使用同 V 的新 `draft_id` 并显式继承安全前缀。 | AI continuation/protocol tests |
| ROOT-BE-03 | 安全完整但 tags/targets schema 不合法的 raw candidate 携带有界 machine errors 进入 fixed editor；不可解码/未封口不伪装 valid。 | content tasks/pipeline tests，增强 HTTP 闭环 |
| ROOT-BE-04 | passage 提取改为单遍增量状态机，避免每 delta 扫描和反序列化累计全文。 | OpenRouter incremental tests/race |
| ROOT-BE-05 | raw SSE 聚合增加 event 总界；OpenAI chat/responses/Anthropic 都要求明确正常终止事实。 | 三协议 unit 与完整 integration |
| ROOT-BE-06 | 0017 当前 schema 允许 Pro/Plus 合法 N0，启用时才要求 N1–99；registered/visitor 固定 N0。 | 当前空库 schema integration，Start/终态用例 |
| ROOT-BE-07 | 移除历史升级假设；M003 schema 测试只创建空库并初始化当前完整 schema。 | `11-empty-schema-m003-final.log` |
| ROOT-BE-08 | 增加 production compose overlay：固定 digest、单副本、CPU/内存/PID 硬界、日志轮转、650s/660s 停机窗口及明确 PG 参数。 | `10-compose-static-final.log`；未部署 |
| ROOT-BE-09 | preview/probe 固定 1；多个 connection UUID 可映射到同一 capacity group，未映射项保守归入默认组。 | config/capacity tests、race |
| ROOT-BE-10 | Lease release 与 ReleaseUnknown 统一 Gate mutex 锁序，移除 once→mutex/mutex→once 反向锁序；健康重开要求 pending 清空。 | 500 次有界并发死锁回归、race |
| ROOT-BE-11 | 普通、预设、preview 的断连/心跳/写失败统一 cancel→close→join→release；有界 join 超时先标 unknown，实际退出后才释放。 | 可控滞后替身 tests、HTTP race/integration |
| ROOT-BE-12 | CompletePipeline/Preview 在同一事务锁定 run 并读取真实 `ai_call_usage`，核验 call_no、模型、prompt、invoked、Plan→generation→fixed_edit→Review/repair、预算和末审事实。 | content outcome unit/integration、增强 HTTP 闭环 |

附加验收：

- C07 最小观测接入 active global/preview/probe/preflight/connection/group、固定 busy reason、preflight duration/completed、首 plan、首正文与终态时间；增强 HTTP 用独立 metrics handler 断言释放后 active=0。
- F/C 诊断查询分别输出 normal/preset/preview 分母、F、C、交集、并集、去重 run、调用次数与 unknown 上下界，并附六阶段事实。
- 增强 Gateway+DB HTTP 闭环覆盖正常四阶段 V2、N2 到上限 V4、第二次返修无效回退 V3、增强 preview V2 且不扣用户次数。
