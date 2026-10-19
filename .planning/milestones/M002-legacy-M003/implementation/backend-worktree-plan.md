# TECH04 / CR306 后端实施工作区记录

## CR306 实施增量（2026-10-12）

- 授权与门禁：`TRANSITION-M003-077`、`USER-M003-CR306-IMPLEMENT-NEXT`；Profile 继续锁定 `consumer-ai-web@1.0.0`，请求路由 `strong/gpt-5.6-sol/high`，actual serving metadata unknown。
- 共享工作树仍含 TECH03 与其他角色的大量 dirty 依赖，因此原位限定修改；没有 reset/revert、commit/push、部署或创建会漏掉依赖的 worktree。
- 实施顺序：严格原文 JSON 与管理写入口 → BindSpec/Gateway/运行快照 → 未发布 0017/Verify → 单元、隔离 PostgreSQL 18、HTTP/全量 integration 回归 → 当前交接与证据。
- 后端源码范围限定为 `backend/internal/{admin,ai,generation,httpapi,platform/postgres}`、必要相关测试和 `backend/db/migrations/0017_m003_content_review.sql`；没有修改 frontend、架构/UI真源、控制面、UAT或真实配置。
- 独占测试资源：`wordweave-cr306-postgres`（`127.0.0.1:65432`），只承载测试框架创建的可丢弃空库；明确未连接、停止或修改 UAT3013/PG54672 及其服务。
- CR306 仍 open；本记录只提交开发实现供独立接收，不自批 QA 或切换阶段。

日期：2026-10-12  
owner：backend-ethan  
建议状态：`awaiting_review`（控制面仍由 root 执行状态切换）

## 历史记录：TECH03 授权与边界

以下内容保留共享 dirty 基线的 TECH03 实施记录，不是当前 CR306 的授权或待办。当前 CR306 只以上述 TECH04/077 范围与新证据为准。

- 实施依据：`TRANSITION-M003-055`、`USER-M003-BACKEND-IMPLEMENT-NEXT`、`USER-M003-CONTENT-20261009`、`USER-M003-NO-DATA-MIGRATION`。
- 技术真源：TECH03 的 BE06-R1、AI BE06、API BE06（`m003-stream-v5`）、DB03、PRODUCT07，以及 FE02/UI09-R3 的后端依赖。
- Profile 保持 `consumer-ai-web@1.0.0`；请求路由为 `strong/gpt-5.6-sol/high`，实际 serving metadata 未提供，仍记为 unknown。
- 项目未部署上线。本轮直接修订未发布的 `0017_m003_content_review.sql` 和当前 schema 校验；未新增 0018、旧库升级、回填或旧生成协议兼容。
- 未提交、推送、部署、购买或调用真实收费模型；未读取真实密钥；未对任何现有共享数据库执行 schema 变更。

## 工作方式与所有权

共享工作树已有大量未提交后端修改，因此没有创建会遗漏 dirty 依赖的 worktree，也没有 Git commit。所有修改均在授权路径内增量完成。

| 负责人 | 文件责任 | 整合结果 |
|---|---|---|
| backend-ethan | `backend/internal/{capacity,generation,httpapi,observability,platform}`、0017 当前 schema、测试与总集成 | 完成主链、事务事实校验、HTTP/DB闭环与最终回归 |
| backend-ethan/ai_tasks_v5 | `backend/internal/ai` 的 v5 task、增量解析及协议测试 | 已整合；未改 generation/http 所有权文件 |
| backend-ethan/deploy_sse_config | `nginx/**`、`compose*.yaml`、环境变量示例 | 已整合；生产 overlay 仅静态验证，未部署 |

## 实施顺序与结果

1. 修订 0017 当前 schema：v5 六阶段、七类 stop reason、N0/1–99、最大 V101、preview 最大 V3、完整 `IS TRUE` 组合约束。
2. 落实所有模式独立 Plan→Writer；增强固定编辑、Review、条件整稿返修、共享最多两次原生恢复及 lastValid 整包回退。
3. 落实 `m003-stream-v5`：严格命名事件、全事件 seq、全 stream rev、draft_id、Unicode 码点 splice、安全前缀定时刷新和有界背压。
4. 接入共享 CapacityGate：preflight/global/preview/connection/probe 原子准入、连接组映射、429 冷却、排空、未知结算健康栅栏与 join-before-release。
5. 对齐管理配置、impact、status、preview、publish、终态并发、usage 与 F/C 频率诊断；终态事务验证实际调用顺序、模型、prompt、调用三态和 Review/repair 事实。
6. 补齐三路 Nginx SSE、单副本生产 overlay、资源/日志/停机参数和最小观测；从空库初始化隔离 PostgreSQL 并完成全量回归。

## 完成状态

| 项目 | 状态 | 主要证据 |
|---|---|---|
| 当前空库 schema 与约束 | 完成 | `11-empty-schema-m003-final.log` |
| AI/pipeline 与三协议 | 完成 | unit、race、完整 integration |
| 用户生成/预设/后台 preview HTTP | 完成 | `04-enhanced-http-final-pass.log`、完整 integration |
| 容量、取消、未知栅栏与排空 | 完成 | capacity/httpapi 单元与 race；完整 integration |
| 管理/统计/观测 | 完成 | 完整 integration、observability 单元/race |
| 部署静态产物 | 完成 | `10-compose-static-final.log` |
| 真实模型质量、费用、生产容量 | 未验证且不在本轮授权 | 保留给独立 QA/上线前验证 |

## 清理

- 本轮仅创建一个可丢弃本地 PostgreSQL 测试容器及其内部临时测试库；所有 integration 用例从空库初始化当前 schema。
- 已停止并删除该容器；清理复核确认容器不存在，且未清理或修改任何其他本地容器、卷或用户数据。
- 原始失败、复测、最终通过日志均保留在 `implementation/evidence/tech03/`，没有删除失败证据或降低断言。
