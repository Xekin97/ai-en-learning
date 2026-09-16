---
milestone: M001
stage: implementation
role: backend-implementer/base
agent_name: backend-ethan
status: awaiting_user_review
date: 2026-09-08
change_request: CR-039
authorization: TRANSITION-M001-097
---

# QA096-01 工作区与实施边界

## USER-CLAIM-DELETE-001 后的实施计划

执行结果：已完成单工作区修复、先红后绿的真实 PostgreSQL/HTTP 开发验证、并发等重复检查、相关回归与新标识候选构建/离线启动；详见 [097 当前交付](./backend-cr039-097-validation.md)。本轮环境按标签检查后清理，源码与证据保留，未部署 UAT 或提交代码。

用户已明确批准 [主动删除例外](../reviews/claimed-batch-delete-retention-exception.md)并请求下一步。以下旧调查保留为历史，不再阻塞实施。继续使用单工作区，不创建子代理或 worktree。

- backend-ethan 负责 learning.DeleteBatch 与新建的定向 PostgreSQL/HTTP 回归测试；不改其他角色产物或 DB schema。
- 先新增失败回归，再在同一事务中按批次及其所有者约束删除 consumed claim，之后删除批次。先取得 claim 行锁，与 ConsumeClaim 的首个锁对象保持一致；所有权由数据库条件强制，不靠客户端。
- 验证正常/重复/越权/无 CSRF 删除、承接重试、事务失败回滚、并发删除和清理、未删除 claim 的 24 小时规则与计量保留。原文映射和旧版兼容不在本次改动范围。
- 使用带本轮标签的独立内部网络和 tmpfs PostgreSQL，仅写合成测试库；固定现有 Go/PostgreSQL 镜像，沿用缓存。不连接 UAT 数据库，不追加真实 AI。
- 格式、单测/race、定向集成、vet、模块校验和新标识镜像构建后提交证据。按实际拥有标签清理本轮环境，保留候选、原始失败与成功证据。
- 修改前后核对源码/批准产物与 UAT 容器身份；不修改 workflow/agents/history。交付后停止，不自动独立验收或部署。

---

以下为专项批准前的调查计划。

## 工作区决定

保持当前单工作区，由 backend-ethan 处理。删除、承接和清理共享 claim 生命周期与锁顺序，当前没有可独立推进的代码子任务。不创建分支、worktree 或子代理。

`git status --short` 显示 backend、frontend、nginx、.planning 等均为既有未跟踪资产；当前 main 尚无提交。保护这些内容，不执行 checkout/reset、提交或清库，不把未跟踪状态当作可覆盖授权。

## 当前已执行与停止条件

只读定位 DeleteBatch 的外键置空 / consumed 非空约束冲突，并核对批准的 24 小时保留规则和 QA096 最小复现。仅新增本计划与 [097 调查报告](./backend-cr039-097-validation.md)，更新后端验证/交接索引；尚未改业务代码或运行开发检查。

097 明确规定 claim 保留变更须单独确认，schema/约束修改未授权。建议的“主动删除批次时同步删除对应已消费 claim”属于保留例外，当前等待用户决定，不自行批准或实现。

## 获批后的范围（建议，未执行）

- 负责人：backend-ethan；预计只涉及 backend/internal/learning 的删除事务、必要的关联锁处理与定向测试，以及开发证据/后端交接。
- 如采用 A：同事务处理所有者批次与其 consumed claim；不新增 migration，不调整一般 24 小时清理策略，不改变公开 DTO 或旧版本兼容范围。
- 先验证最小复现，再验证权限、原子性、删除后不可恢复、相关并发与计数不回退；仅使用获准的隔离合成环境。具体锁顺序在代码实施时核对，不把本调查当成已完成并发设计。
- 保护 DB 结构/约束、既有用户数据和凭据、模型配置、词库、前端/nginx、QA 原件与 UAT。若用户选择 B 或出现另一技术边界，先取得相应明确授权。
- 交付开发报告、原始证据与新标识候选后停止；独立 QA 和 UAT 替换不属于本次实现角色自动执行范围。

## 合并与清理

无并行合并、无临时容器/网络/worktree 可清理。历史专业产物正文原样保留，不修改正式 workflow/agents/history；保护集合摘要与 QA manifest 在文档编辑后再次核对。
