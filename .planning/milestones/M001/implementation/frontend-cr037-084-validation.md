---
milestone: M001
stage: implementation
role: frontend-implementer/base
agent_name: frontend-claire
status: awaiting_user_review
date: 2026-09-07
change_request: CR-037
task: CR037-03
---

# CR037-03 前端开发验证（DEV084）

## 结论

CR037-03 的有限前端实现与开发期功能验证完成。错误当前密码返回 422 后，既有 `Problem DTO → problem mapper → AppFailure` 链路得到的安全本地化错误只进入账号 store 的 `passwordFailure`，并由当前 Change password 原生模态框内的 `AppError` 渲染。页面加载/注销继续使用原 `failure`；提交开始、成功、取消、Escape 和再次打开只清理密码错误，不清除不相干页面错误。

这是 `frontend-claire` 的开发结论，不是独立 QA PASS。CR037 保持 open；workflow、UAT6001、设计6010、API v1.4 与后端候选均未修改。

## 实现与追踪

| 追踪 | 实现 | 代码/验证 |
|---|---|---|
| PAGE-009 / CAP-004 / CAP-021 | 密码错误与页面错误独立；不渲染 Problem detail/DTO | `runtime/stores/account.ts`、状态 unit |
| DATA-003/004 / API-003 | 请求与会话事务不变；只消费规范化 `AppFailure` | 真实 422/204、双会话、旧/新密码 |
| 错误可见/可访问 | dialog body 首部使用既有 `AppError`；页面背后无重复错误 | Mock/真实 dialog 位置、Chromium CDP 原生 AX |
| 清理/重试 | 开始新尝试清错；取消/Escape/重开清错清字段；键盘纠正成功 | unit + Chromium + WebKit |

修改的产品/测试源只有：

- `frontend/app/runtime/stores/account.ts`
- `frontend/app/pages/account.vue`
- `frontend/tests/unit/account-password-error.test.ts`（新增）
- `frontend/tests/e2e/cr037-auth-account.spec.ts`

未修改全局 `AppDialog`、样式、文案、i18n、API repository/DTO、`mock-backend.mjs`、密码策略或会话语义。

## RED → GREEN 与首次失败

- RED：新增三个状态断言首次均失败，既有 196 tests 通过；分别证明密码错误覆盖页面错误、缺少 retry-start 清理、缺少取消清理。[`red-unit.log`](./evidence/cr037-084/red-unit.log)。
- GREEN：同一定点 unit 3/3 通过；固定 Node 24 Docker 内完整 22 files / 199 tests 通过。
- 候选构建首次：typecheck 通过，lint 因新测试 `deferred<void>` 违反 `no-invalid-void-type` 失败。只改为 `deferred<undefined>`，未改产品断言；第二次构建完整通过。
- 完整 Mock E2E 前两次环境失败是 tmpfs 资源终止和 dev 冷编译超时，未计作产品结论；随后使用固定生产候选 + Nginx 同源 + contract mock，断言不变。
- 原生 WebKit 首次复用了 Linux WebKit 合成用户名，注册 409；改为按 run 唯一命名后通过，失败保留。

全部失败与处置见 [`first-failures.json`](./evidence/cr037-084/first-failures.json)，命令摘要见 [`commands.json`](./evidence/cr037-084/commands.json)。

## 开发期质量检查

| 检查 | 结果 |
|---|---|
| Node 24.8.0 固定镜像 format check（4个变更源） | PASS |
| Docker Node 24.8.0 / pnpm 10.33 typecheck、lint | PASS |
| dependency boundaries | PASS；118 modules / 89 dependencies |
| 完整 unit | PASS；22 files / 199 tests |
| Nuxt client + SSR + Nitro build | PASS |
| 定点 Mock E2E | PASS；中英 × desktop/mobile 12/12 |
| 固定候选 + 同源 Mock，宿主 Chromium | PASS；122/122 |
| 固定候选 + 同源 Mock，Linux Chromium | 120/122；CR037 12/12 PASS，两个旧管理员 dialog 几何断言保留失败 |

Linux 两个失败都在未修改的管理员 Add model 弹窗：固定期望 Active→notice 23px，实际 desktop 24px、mobile 25px。同一 Linux Chromium、字体 `loaded`、相同 viewport/DPR 下，批准原型也分别为 24px/25px，完整 gaps 均为 `[20,20,16,24/25]`。没有放宽断言、改样式或自行关闭；原始 trace 在 [`linux-mock-test-results`](./evidence/cr037-084/linux-mock-test-results)，同平台实际/设计截图和数据见 [`linux-geometry-comparison.json`](./evidence/cr037-084/linux-geometry-comparison.json)，交独立 QA 判断。

## 固定候选真实关联验证

`ww-dev-084` 使用 frontend `wordweave-frontend:cr037-084` / `sha256:fd251e7439aad8e058656e2751ed84f40715fec570a872da53542688a6dd6904`，配套 backend `wordweave-backend:cr038-083` / `sha256:642ed57ad0ed6c8a13e4bba1101d8b50188e8ea636791583a6ffb5eaa6917aac`，127.0.0.1:6101 Nginx 同源 + tmpfs PostgreSQL；provider 禁用，0 credential / 0 generation run。

| 浏览器 | 结果 | 覆盖 |
|---|---:|---|
| macOS Chromium | 52/0/0 | 中英；390/1440；422；dialog内唯一错误；字段保留；CDP原生AX `ignored=false`、role=alert；Escape/焦点/重开；再次失败后纠正；204 no-store；当前/其他会话、旧/新密码 |
| Linux WebKit 1.62.1 fixed image | 48/0/0 | 同一功能链路；不冒充 Chromium 原生AX |
| macOS Playwright WebKit | 最终 48/0/0 | 同一功能链路；未复现此前系统异常；不等于 Safari 实机或独立QA完整平台认证 |

原始结果：[Chromium](./evidence/cr037-084/password-chromium-darwin-results.json)、[Linux WebKit](./evidence/cr037-084/password-webkit-linux-results.json)、[macOS WebKit](./evidence/cr037-084/password-webkit-darwin-native-results.json)。中英 390 的 Chromium/Linux WebKit 四张实际截图已人工逐张查看：错误清晰位于 dialog 顶部，字段、说明、会话 notice 和按钮完整可见，无横向溢出、裁切、遮挡或重叠；见 [`manual-visual-review.json`](./evidence/cr037-084/manual-visual-review.json)。

## 候选、清理与边界

- 固定候选及 source hashes 见 [`candidate.json`](./evidence/cr037-084/candidate.json)，包含配套 backend ID。
- 6 个合成账号只在 tmpfs；无学习批次、复习会话、credential 或 generation run。
- 核验标签后移除 7 个本轮容器、2 个网络和可重建 volume；6101 释放，候选镜像与证据保留。
- UAT6001 四容器 ID/image/startedAt 与基线相同；其数据、账号、密码、配置未读取或修改。[`cleanup.json`](./evidence/cr037-084/cleanup.json)。
- 设计6010未修改；未调用真实 AI、未读取历史密钥；无 Git commit/reset。

## 未决、下一步与模型记录

- `OPEN`：CR037、CR038 待 `qa-quinn` 独立验证；Linux既有像素断言差异交QA判断。
- `BLOCKED`：无实现阻塞。
- 建议门检接收 DEV084 后在 verification 激活 `qa-quinn`；独立通过后才能准备新本地 UAT。
- requested：`gpt-5.6-sol / high`；actual：`not_observed`；usage：`not_observed`。宿主无可验证回执，故不声称已观测实际模型/用量。
