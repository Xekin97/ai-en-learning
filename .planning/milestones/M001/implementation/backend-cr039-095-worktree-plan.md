---
milestone: M001
stage: implementation
role: backend-implementer/base
agent_name: backend-ethan
date: 2026-09-08
status: awaiting_user_review
change_request: CR-039
authorization: TRANSITION-M001-095
---

# QA094-01 工作区与实施边界

## USER-COMPAT-001 后的执行计划

执行结果：已按本节完成单工作区修复、定向开发验证和候选构建。两项临时容器和内部网络已清理，候选与证据保留；详见 [本轮开发报告](./backend-cr039-095-validation.md)。未合并分支、未修改正式控制文件、未部署 UAT。

用户已取消全部首版旧版本兼容要求并请求继续；以下旧调查计划仅留作历史。本轮维持单工作区，无子代理或 worktree。

- 责任范围：backend/internal/generation 的令牌签发/验证，learning 的保存/放弃/承接，maintenance 的关联锁顺序，以及相关单元、PostgreSQL/HTTP 测试。
- 具体修法：原随机令牌增加绑定 run_id 与主体的 HMAC；公开字段仍是不透明字符串。DB 中原 token 摘要仍校验，保存后依靠签名及持久化所有权/终态进行安全幂等重试，无新表/列，无 payload 保留变更。终态重试沿用原 registry 一小时清理窗口，未处置草稿沿用自身 TTL。
- 先锁运行行再读 disposition/草稿，串行化并发保存/放弃；清理任务使用相同锁顺序。错误主体/令牌、未完成/失败、过期、已放弃、删除后保存不能创建资源。
- 验证当前版本空 registry、实际独立进程重启、重复和并发保存、visitor-claim、过期及清理竞争；不创建/运行旧版兼容候选，不修改 UAT。
- 隔离 PostgreSQL 和工具容器只用于合成开发检查；完成后清理确切本轮对象，保留证据和当前修复候选。正常格式化、单测/race、相关集成/vet、构建，不重跑全站 UI。
- 保持公开 API v1.4、DB schema、模型/词库和上游技术原件不变；源码基线及 UAT 容器身份记录于 evidence/cr039-095/baseline.json。

---

## 以下为用户取消兼容前的调查计划

## 是否需要并行

- 草稿保存、放弃、访客承接和重复请求共用运行鉴权及事务状态，不能按接口独立修改而不核对生命周期。
- `git status --short` 显示 backend、frontend、nginx 和 .planning 等为已有未跟踪资产。不能当成空项目，也不能通过 checkout/reset 或创建不完整基线覆盖它们。
- 结论：单工作区，backend-ethan 顺序处理；未创建分支、worktree 或子代理。

## 工作树分配

| 任务 | 分支 / 路径 | 责任边界 | 依赖 | 负责人 |
| --- | --- | --- | --- | --- |
| 本轮原因与边界调查 | 当前工作区，无新分支 | 只读相关 backend 代码与批准输入；写本轮 implementation 报告及后端交接 | 095、QA094-01 | backend-ethan |
| 后续修复 | 尚未启动 | 原授权 backend 范围；历史镜像、技术文件和 DB schema 不在写入授权内 | 回滚候选及持久鉴权方案的技术确认 | backend-ethan（建议） |

## 当前停止条件

指定历史 v2 镜像与当前版本都在读草稿前依赖进程内 registry；只修改新版本不能让指定旧二进制支持跨进程保存。原 T4 又要求保存后删草稿，需要明确随后重试的 token 校验依据。详见 [095 调查报告](./backend-cr039-095-validation.md)。

根据 agt-backend-implement 的上游冲突规则和 095 的显式停止边界，当前仅提交技术确认请求，不实施半套修复、不换回滚候选、不降低 C39-15。

## 后续实施及检查顺序（建议，未执行）

1. 有限确认回滚候选和保存、放弃、承接、幂等鉴权生命周期；涉及数据结构时明确申请 DBA 边界，不由开发自行增加迁移。
2. 按确认方案修改当前候选；若获准，再从可追踪的 v2 基线构建单独的修复回滚候选，原镜像与 tag 保留。
3. 用独立进程、相同合成 DB/密钥和原客户端 token 检查重启、双向切换、重复/并发保存及拒绝矩阵；不能用预先 Register 的测试替代生命周期验证。
4. 完成开发期格式化、单测、相关集成与构建，提交原始证据；独立 QA 仍需后续门禁。本轮上述实现和测试均未开始。

## 合并与清理

无并行合并、无临时环境或 worktree 可清理。当前只增加两份本轮文档并更新后端报告/交接索引；历史专业报告、QA 证据与正式控制文件不改写。
