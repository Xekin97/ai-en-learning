---
milestone: M001
role: quality/base
agent_name: qa-quinn
date: 2026-09-07
status: open
change_request: CR-039
---

# QA094-01：已验证草稿依赖进程内鉴权，跨镜像或重启后无法保存

- 严重级别：P1 / 阻塞本次 C39-15 验收及候选继续交付；不是已保存学习库的数据丢失。
- 责任建议：implementation / backend-ethan；涉及指定历史镜像能力与回滚策略的约束由 backend-alex 确认，不能未经批准缩减兼容承诺。
- 追踪：CR-039，technical/backend-cr039.md §6、§8、C39-15；API-006，CAP-010，DATA-011/012。

## 期望与实际

批准方案要求已经验证的 v2 草稿由 v3 按不可变快照保存，不重校验、不重调用模型；v3 草稿与已保存内容应兼容当前支持复数 occurrences 的 v2 镜像。

使用相同合成数据库、鉴权密钥、账号与仍有效 generation token 的实际镜像：

| 生成 / 保存进程 | 实际 |
| --- | --- |
| v2 → 原 v2 进程 | 201；重复保存 200；批次在 v3 可读、可复习 |
| v2 → v3 进程 | 404；草稿 payload 为 m001-v2，尚未过期 |
| v3 → 原 v3 进程 | 201；重复保存 200；批次在实际旧 v2 镜像可读、可复习 |
| v3 → v2 进程 | 404 |
| v3 → 同镜像重启后的 v3 | 404；重启前后草稿仍一条、payload 摘要和 expires_at 完全一致，无新模型调用 |

最后一项排除了“只是双实例不在部署范围”的解释：即使只有同一镜像单实例重启，保持已验证资源及浏览器内 token 也无法完成保存。

## 可复现步骤

在 [setup.mjs](./evidence/cr039-094/setup.mjs) 创建的独立环境使用合成提供方：

1. 正常登录，生成合法 v3 响应，等待 `generation.validated`，在测试客户端内保留 run_id/token，不刷新或退出。
2. 确认数据库存在未过期的 `generation_drafts`，没有 active run。
3. 仅重启 `ww-qa-cr039-094-backend`，不改镜像、密钥、账号或数据库，等待就绪。
4. 使用原账号会话、CSRF 和 generation token 调用 `/api/v1/generations/{run_id}/save`。
5. 返回 404；原 draft 内容与到期时间仍在。重复请求不会恢复。

[最小重启脚本](./evidence/cr039-094/restart.mjs)、[重启观测](./evidence/cr039-094/restart-observation.json)、[重启断言](./evidence/cr039-094/restart-results.json)、[双向镜像补测](./evidence/cr039-094/supplement-results.json)。未记录 generation token 明文。

## 有界原因核对

`backend/internal/learning/service.go` 的 `Save` 在读取并验证持久化草稿 token hash/所有权之前，先调用 `service.registry.Authenticate`；`backend/internal/generation/registry.go` 仅从进程内 `runs` map 读取，缺项就返回 ErrRunNotFound。新进程不会从草稿恢复该条目，因此 HTTP 层返回 404，尚未走到快照读取/保存。

这解释了为何开发静态快照兼容测试与真实进程生命周期结果不同。属于已有鉴权机制与本轮明确批准的兼容承诺之间的实现缺口，不能宣称是 WordNet 新增引起的数据损坏。

## 修复验收边界（建议，未实施）

- 正确主体、有效原 token、未过期的已验证草稿跨进程/兼容切换后能够原子保存或按获批策略处理，且不重复生成/计数。
- 不得仅删除 registry 检查而放松鉴权：错误主体/token、过期、取消/失败、已放弃草稿仍不可保存；重复保存、并发和删除边界需定向复验。
- 原已保存批次的新旧读取和复习保持。指定旧镜像本身无持久化鉴权回退能力，若需替换回滚候选或改变部署处理策略，先取得相应技术确认。
- QA 未修改实现、批准方案或旧镜像，问题保持 open；由后续门禁接收，不自动返工。
