---
milestone: M001
stage: verification
role: quality/base
agent_name: qa-quinn
status: awaiting_user_review
date: 2026-09-07
verification_round: TRANSITION-M001-086
uat_handoff: UAT-M001-086
verdict: passed_for_functional_uat
functional_uat: awaiting_user_acceptance
release_readiness: blocked
---

# UAT086 本地功能验收交接

固定 QA085 配套候选已经更新至本地 UAT，部署与非破坏性冒烟均通过。请使用 [http://localhost:6001](http://localhost:6001)（不要改用 `127.0.0.1`），并在旧标签页强制刷新。批准原型仍在 [http://localhost:6010](http://localhost:6010)。这只是可供用户执行的功能 UAT，不代表用户已经接受，也不代表发布就绪。

## 账号

- 管理员：`uat_admin` / `UatAdminPass6000!`
- 学习者：`uat_learner` / `UatLearnerPass6000!`

两名既有账号均以原密码成功登录。本次部署和 QA 冒烟没有重置或修改任何现有 UAT 密码、模型、组、资料或学习数据；错误当前密码检查返回 422 后，密码与原会话保持不变。冒烟仅注销了本轮新建的登录会话，并将会话集合恢复至执行前摘要。

## 部署与冒烟结论

- 前端：`sha256:fd251e7439aad8e058656e2751ed84f40715fec570a872da53542688a6dd6904`
- 后端：`sha256:642ed57ad0ed6c8a13e4bba1101d8b50188e8ea636791583a6ffb5eaa6917aac`
- 前后端配套更新并保持 healthy；既有 Nginx、Postgres 容器和 `wordweave_uat_wordweave-pg` 卷未替换，更新后仅 reload 既有 Nginx。
- 未 build、pull、migrate、重建数据库/Nginx、调用真实 AI 或读取历史密钥。实际 runtime 参数仅在内存中核对并用于更新；旧 `.env` 未作为可信输入。
- [部署原始记录](./evidence/uat-086/deployment.json) PASS；[预检](./evidence/uat-086/preflight.json)与[真实命令轨迹](./evidence/uat-086/commands.json)保留。更新前后账号 589、会话 597、批次 17、模型 1、生成运行 79、active generation 0、迁移 6（最新 `0006_hint_occurrences_enforce.sql`），受保护数据摘要和内部密码/凭据密文摘要一致。报告没有输出密码哈希。
- [有效冒烟](./evidence/uat-086/smoke-recheck-results.json) 100 PASS / 0 FAIL / 0 ERROR；覆盖 Nginx 路由、双语 390/1440 认证提示、两类现有账号登录、管理员只读页面、学习者页面、改密弹窗错误/关闭/重开/焦点、422 安全错误与字段保留、注销 204，以及最终容器/数据状态。
- [首轮原始冒烟](./evidence/uat-086/smoke-results.json) 79 PASS / 0 FAIL / 1 ERROR 原样保留。唯一 ERROR 是 `.stat-label` 正确匹配六项后，测试错误地使用单元素可见断言；改为精确断言六项后的完整新运行通过，未弱化产品断言，详见[首次失败归因](./evidence/uat-086/first-failures.json)。

中文账号弹窗检查只在浏览器切换语言后拦截并本地响应 `PUT /api/v1/me/ui-locale`，目的是保持既有学习者的 UAT 个人偏好不变。因此该检查证明的是已部署候选的中文展示，不是 6001 后端 locale 持久化证明；该关联功能已有独立 QA 覆盖。[人工截图复核](./evidence/uat-086/manual-visual-review.json)确认英文 Review 提示、中文 Library 提示、英文 390 错误态及中文 390 改密弹窗均清晰、无裁切或重叠。

## 建议用户验收

1. 访客分别从 Review 与 Library 进入登录/注册，确认返回意图是卡片首项、位于标题之前，登录后回到原目标。
2. 使用学习者账号打开 Account → Change password，核对中英文标题、字段、帮助文字、会话说明与按钮；输入错误当前密码，确认安全错误只在 dialog 内可见、输入保留，关闭/Escape/重开及焦点正确。
3. 实际修改密码是用户可选验收动作，不是 QA086 自动步骤；QA086 没有修改任何现有密码。如果用户选择执行，须自行决定是否授权改变该专用账号，并同时检查当前会话/其他会话及旧/新密码行为。
4. 使用管理员账号只读检查 Models、Plans、Users；使用学习者账号浏览 Library、Review、Account。不要在本轮改模型、组、资料或其他保留数据。

既有更广的功能清单仍可参照 [UAT079 交接](./uat-079-handoff.md)，本轮重点是 CR037/038 修复后的重新验收。真实 AI 输出质量、真机 Safari/VoiceOver、公网性能及发布门不在本次范围，继续 BLOCKED / NOT VERIFIED。

## 回滚准备

私有备份目录：`/var/folders/z9/99ckxr957v901zwwc8jdk8640000gn/T/wordweave-uat-086-eudPWJ`（目录 0700；`runtime-private.json`、`wordweave.dump`、`rollback-compose.yaml` 均 0600）。旧镜像仍保留并标记为：

- `wordweave-uat-frontend:rollback-uat086` → `sha256:8fe04108b523cce73820017069ba0509e7bee03589b0fdc9218a4397770274c0`
- `wordweave-uat-backend:rollback-uat086` → `sha256:e8c4ee91a7c3265cda8c496ccc8fb485328d95b6c1662eaf2502011ce5d005a5`

如需回滚，应以前后端旧镜像成对更新，复用实际 runtime 参数，健康后 reload 既有 Nginx。不要用部署前数据库备份覆盖用户随后新增的 UAT 数据；备份只作为故障恢复材料。当前无需回滚，6001 保持可用。

[交付只读校验](./evidence/uat-086/delivery-validation.json)为 PASS。执行模型请求为 `gpt-5.6-sol/high`；`actual_model` 与 `usage` 无运行时回执，记为 `not_observed`。
