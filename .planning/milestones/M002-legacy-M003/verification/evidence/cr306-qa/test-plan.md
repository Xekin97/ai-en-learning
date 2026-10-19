# CR-306 独立 QA 最短充分矩阵

- 验收范围：`AC-317–322`；输入版本 `M003-TECH-04 / BE07 / DB04 / API-306 / AI7 / FE03 / UI10-R1.1`。
- 模式：需求验收 + 原故障定向复验。CR-304/305 与 QA02 只作已解决基线，不重跑、不复活。
- 实现接收：复用后端 unit/integration/race 与前端 422 unit/lint/typecheck/build；本轮只独立观察正式隔离 API、DB、SSE、页面与有界真实供应商链路。
- 环境：新 PostgreSQL 18 空库初始化当前全部 schema（含未发布 0017）；正式 dirty backend binary；独立 frontend 源副本/build。现有 `3013/54673/54672/54674/54675` 只读且不停止、不改配置。
- 证据预算：结构化 JSON/DB 事实优先；桌面/移动/失败代表截图软上限 4；真实完整业务请求初始 1、总上限 3；内容返修流程 `N<=2`，`99` 只校验配置边界。

| QA ID | AC | 最短场景与判定信号 | 证据策略 |
|---|---|---|---|
| CR306-QA-D1 | 317 | 管理员在两个模型分别保存对象与 `{}`，重读隔离；取消、非法保存、整组失败与 409 不改 DB；非管理员 403；所有保存/启停供应商调用为 0 | 独立正式 HTTP + DB 前后快照 + synthetic provider counter |
| CR306-QA-D2 | 318 | 非法/重复键、非对象/null、保护键、受控字段、URL/header、U+0000、深度 8/9、单模型 16384/16385 与整表单 413；合法对象实际浅合入且业务键保留；上游 400/422 明确拒绝且不删参重试 | API problem/pointer；共享 compact-byte 向量复用开发证据；独立抽样跨层与 provider capture |
| CR306-QA-D3 | 319 | run 受理后把模型参数从 A 改 B；原 run 的 Plan/Writer/增强阶段仍全用 A，新 run 才用 B；普通 N0 与增强 N2 阶段/一次扣次/预算保持，99 不实跑 | slow synthetic provider 调用日志 + started snapshot + DB `ai_call_usage/generation_runs/charges` |
| CR306-QA-D4 | 320 | reasoning-only/心跳无假 plan 且可取消；fenced/malformed plan 不进 writer；无有效稿失败不可保存且退款已确认；Q02、主动取消与 pending 保持各自语义 | 正式 SSE/API + provider stage counter + DB 终态；只执行最少代表分支 |
| CR306-QA-D5 | 322 | 正式 AppDialog 桌面/390：top layer、背景隔离、内部滚动固定头尾、四关闭入口、dirty confirm、焦点约束/恢复、错误保留 raw 草稿、晚 probe stale、保存 0 自动 probe；字段/说明/错误及 413 归属正确 | 实际 DOM/几何/键盘 + 最多 4 张必要截图；设计一致与可用性分别判断 |
| CR306-QA-R1 | 321 | 原游客 5 词、中文释义、Story、Brief，以保存的 OpenRouter DeepSeek V4 Flash 0731 和有效配置执行正式 Plan→Writer→基础校验→DB 终态；记录首完整 plan 项、首正文、总耗时、calls/stages/snapshot、完整正文/学习字段、配额、保存资格、usage/cost 可得性及用词/逻辑/体裁简评 | 先完成 D1–D5；凭据仅进进程，不输出或归档；完整公开 SSE + 安全 DB 事实 + 最终内容 |
| CR306-QA-R2 | 319/321 | 若 R1 成功且额度/时间允许，以对应权益或现有 enhanced preview 核对 fixed edit→review→条件 repair，最多 N2；失败则优先定向分析，不能盲目耗尽调用 | 第二个完整业务请求；需要第三次只用于有明确缺陷原因的定向复测 |

停止条件：每条 AC 已有充分证据或明确 `FAIL/UNVERIFIED`；真实单样本结果不外推 90% 成功率、生产容量或固定 SLA。费用/usage 无字段时记 `unknown`，不填 0。

## 执行收口

- D1/D2：21/21 PASS；首次depth边界方法错误保留。
- D3/D4：10/10 PASS；两次旧fixture方法失败保留。
- D5：首次发现CR-307；修后双视口焦点5/5 PASS，建议resolved。
- R1：技术链PASS；R2：技术链PASS但独立内容质量FAIL，建立CR-308。真实完整请求2次，第三次停止。
- 总体：AC-317–320、322 PASS；AC-321因语义漏判FAIL；`AI-QUALITY-90` UNVERIFIED。
