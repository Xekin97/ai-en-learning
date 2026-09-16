---
milestone: M001
stage: implementation
role: frontend-implementer/base
agent_name: frontend-claire
status: active
date: 2026-09-06
implementation_round: TRANSITION-M001-080
---

# CR037 单工作区实施计划

依据[080批准](../reviews/verification-cr037-rework-approval.md)、[CR037](../changes/CR-037.md)、[质量原始要求](../verification/uat-079-feedback.md)。已有产品/设计/API v1.4不变。

## 是否并行

不并行；三个生产文件共享认证状态和词典，改动很小，拆分无收益。当前仓库为已有未跟踪基座，全部保留；不建立worktree、不spawn子代理、不commit/reset/clean。

| 任务 | 工作区/分支 | 文件责任边界 | 负责人 |
| --- | --- | --- | --- |
| 认证DOM与状态语义 | 当前单工作区，无新分支 | frontend/app/pages/login.vue、register.vue | frontend-claire |
| 英文文案 | 同上 | frontend/i18n/locales/en-US.json 三个既有键 | frontend-claire |
| 改密关闭焦点 | 同上 | frontend/app/pages/account.vue，仅保存触发按钮引用并在关闭后返回焦点 | frontend-claire |
| 开发测试 | 同上 | frontend/tests/unit 与 tests/e2e 新CR037用例；本轮实施证据 | frontend-claire |
| 专业交付 | 同上 | implementation/frontend-validation.md、handoffs/frontend-implementation.md、CR037进展；旧正文保留 | frontend-claire |

## 追踪和执行顺序

1. PAGE-007/005/006/009 → PAGE-003/002，CAP-002/003/021，API-002；提示移至标题前且role=status，按原型保留有效claim优先。不重写安全返回解析。
2. PAGE-009，CAP-004/021，API-003；三处英文按原型逐字对齐，共享本人确认键还影响注销弹窗。中文、字段标签/长度/确认提示不变。
3. 先新增回归用例确认旧实现失败；修复后跑格式、类型、lint、依赖边界、单测、构建、桌面/移动E2E。保持DTO→mapper→应用状态→视图，不新增业务或原始DTO渲染。
4. 固定新前端镜像，在新建ww-dev-080隔离后端/数据库中对照6010原型验证中英/两宽度/双引擎；真实密码测试只操作本轮合成账号。供应商禁用、无真实凭据、0真实AI。6001 UAT及账号密码/数据不动。
5. 形成候选摘要、完整命令/失败与最终结果、截图、开发交接。开发通过不等于独立QA或UAT通过；不修改workflow或质量原始结论。

## 清理

实施偏差记录：新增批准范围内的“取消与焦点”断言，在Mock E2E与隔离真实后端的双引擎均发现改密弹窗关闭后焦点落到body。依据technical/frontend.md的对话框“返回触发点”规范，仅在account.vue的closePassword补齐呈现层焦点恢复，不改全站AppDialog、业务/API或其他弹窗。另将新增认证E2E的即时URL取值断言改成等待同一预期URL；原型/生产的跳转本身正确，保留首次失败结果。初始“仅三个生产文件”计划因此扩展为四个既有前端文件，未跨出CR037指定取消/焦点回归。

逐项核验wordweave.dev=080标签后清理专用容器/网络及tmpfs合成数据；保留证据/镜像供独立QA。3300/38080由本轮E2E生命周期关闭，6101释放，6010原型服务保留。禁止清理其他服务、用户未跟踪文件或既有UAT数据。
