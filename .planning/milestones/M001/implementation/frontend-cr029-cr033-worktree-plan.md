---
milestone: M001
stage: implementation
role: frontend-implementer/base
agent_name: frontend-claire
date: 2026-09-05
status: awaiting_user_review
---

# CR-029–033 前端工作区计划

- 授权：[TRANSITION-M001-064](../reviews/implementation-backend-cr033-approval.md)。仅 frontend/ 与本角色实施、验证、交接和 CR 进度；不得改写批准设计/API 或 backend。
- 单工作区，无子角色/worktree。仓库无初始提交且全部源码未跟踪；共享认证、admin 状态、locale/CSS/测试存在依赖，保留所有既有改动，不创建提交或清理工作树。
- 责任 frontend-claire：先 strict DTO/mapper 与详情/reader 状态，再详情搜索与 query modal、typed auth intent/受限页、精确 CSS/文案，最后单位/浏览器/SSR/构建验证。
- 保留 backend 原始 v1.4 fixtures 字节及摘要，复制进 frontend 独立目录；不跨 build context 依赖 backend。
- 使用锁定依赖；测试在独立本地端口/测试替身环境，不改动 6001 UAT，不使用历史模型密钥。开发自检不代表独立 QA。
- 合并检查：类型、lint、依赖边界、格式、单元、SSR/build 与专项浏览器检查通过；核对批准原型文案/几何/状态。若有上游设计/API 冲突，记录并停在实际责任边界。
- 本轮无 worktree 清理；临时服务只清理本轮创建且已确认的进程/容器，保留已有环境与数据。

- 收尾：按计划完成单工作区实现与验证；无 worktree 或提交需要合并，详情见 frontend-cr029-cr033-validation.md。CR 不关闭，阶段不迁移。
