---
milestone: M001
stage: verification
role: quality/base
agent_name: qa-quinn
status: awaiting_user_review
date: 2026-09-06
verification_round: UAT-M001-079-FEEDBACK
verdict: fail_rework_required
functional_uat: changes_requested
release_readiness: blocked
---

# UAT079 反馈：两项已有设计的前端实现偏差

## 用户输入与结论

CONFIRMED：用户报告 Review 引导进入登录后的 “Continue to …” 提示位置与设计稿不同；用户详情的 Change password 内文案不一致；本次没有发现其他不一致问题。原话中的 “when you're down” 按实际界面对应到 “when you’re done”，不是另外创建文字拼写缺陷。

qa-quinn 在当前 verification 阶段完成定向复现，两个问题均成立，登记 [CR-037](../changes/CR-037.md)。第二项按实际按钮和三密码字段对应到 **PAGE-009 /account 本人改密弹窗**，不是 PAGE-103 管理员 Reset password。无需新增需求或重新设计，建议仅返回 implementation / frontend-claire，之后独立复验。

其他已闭合 CR029–036 保持 resolved；用户“没有发现其他不一致”原样记录，不推定真实 AI、发布或所有未执行测试已经通过。

## 输入与版本

- [已交付 UAT079](./uat-079-handoff.md)、[质量交接](../handoffs/verification.md)。
- [原始设计](../design/prototype/app.js) renderAuth / showPasswordDialog、[设计翻译](../design/prototype/i18n.js)、[主题](../design/theme.css)。
- [CR031/032 已批准设计](../reviews/uiux-design-cr031-cr032-revision.md)、[交互约定](../design/cr031-cr032-interaction-contract.md)、[页面追踪](../design/traceability.md)。
- [产品能力](../product/abilities.md) CAP-002/003/004/021；[前端技术约定](../technical/frontend.md)、[认证/账号 API-002/003](../technical/api/index.md)；无契约变更。
- [开发候选和验证](../implementation/frontend-cr036-077-validation.md)、[QA078](./cr036-078-report.md)、[UAT 配套镜像](./evidence/uat-079/deployment.json)。
- 实际前端 8fe04108、后端 e8c4ee91；6001 应用和 6010 原型均可用，镜像/容器/启动时间在诊断前后不变。

## 复现与明确差异

### CR037-01：认证提示顺序和状态语义

1. 未登录访问 /review，点击 Sign in and continue。
2. 在 /login?redirect=%2Freview 查看认证卡片。
3. 点击去注册，检查 /register 保留同一返回目标。

设计：提示是 .auth-card 的首个元素，在 Welcome back / Create account 标题之前，并带 role=status。实际：标题 → 副标题 → 提示，且缺少 role=status。注册页存在相同偏差。

提示文本、背景、颜色、内边距、外边距和圆角实测一致；本次是 DOM 位置与语义缺口，不是 CSS 色彩问题。应移动真实内容顺序，不用绝对定位、负 margin 或 CSS order 掩盖阅读顺序；不得破坏已有安全返回意图。

证据：[实际登录1440](./evidence/uat-079-feedback/Chromium-en-US-1440-login-actual.png)、[设计登录1440](./evidence/uat-079-feedback/Chromium-en-US-1440-login-design.png)、[实际注册390](./evidence/uat-079-feedback/Chromium-en-US-390-register-actual.png)、[设计注册390](./evidence/uat-079-feedback/Chromium-en-US-390-register-design.png)。

### CR037-02：本人改密弹窗三处英文不一致

登录专用学习者，在 /account 点击 Change password，只打开弹窗，不提交。

| 文案位置 | 实际 | 设计稿 |
| --- | --- | --- |
| 当前密码的辅助说明 | This confirms it’s really you | Confirm it’s you |
| 会话说明 | Your current session stays active. All other sessions will sign out. | Your current session will stay open. Other sessions will be signed out. |
| 主提交按钮 | Change password | Update password |

弹窗标题、三个字段标签、密码长度提示、确认密码提示与 Cancel 实测一致，因此不是所有文字都不同。中文相关字典静态对照与原型一致；本次没有修改现有账号语言去跑中文改密弹窗，中文浏览器逐项验证留作独立复验必测项。

证据：[实际改密390](./evidence/uat-079-feedback/Chromium-en-US-390-password-actual.png)、[设计改密390](./evidence/uat-079-feedback/Chromium-en-US-390-password-design.png)。

account.confirmPasswordCopy 同时用于本人注销对话框，修正文案时须对照该共享消费者；不应顺手改共享确认密码提示、管理员 Reset password 或账号安全规则。

## 诊断覆盖与原始结果

[执行脚本](./evidence/uat-079-feedback/capture.mjs)、[原始结果](./evidence/uat-079-feedback/results.json)。

| 范围 | 实际执行 | 结果 |
| --- | --- | --- |
| Review → 登录 → 注册，提示文字/顺序/状态语义/样式/返回参数 | Chromium、WebKit × en-US、zh-CN × 390、1440 | 位置与 role=status 均复现；文字/样式/安全返回参数通过 |
| 本人改密弹窗逐组文案 | Chromium、WebKit × en-US × 390、1440 | 三组差异均复现；标题/字段标签通过 |
| 环境和诊断副作用 | 12 个源/设计/控制文件摘要，四个 UAT 容器身份/镜像/启动时间，真实账号登录/退出 | 全部保持；无页面运行错误 |
| 密码/数据操作 | 只打开/关闭弹窗，两个新建的专用诊断会话分别退出204 | 0改密、0账号偏好更新、0内容写入、0真实AI |

共 65 PASS / 60 FAIL / 0 ERROR；60 个失败是两个问题在矩阵和关联字段上的重复断言，**不是 60 个缺陷**。失败原样保留，未修源码或弱化测试。截图原型仅在当前浏览器隐藏控制器，不改设计文件。

## 此前测试缺口

- QA078 flows.mjs 对 .auth-intent 检查文案、可见性和跳转，未对照其相对标题的 DOM 顺序、卡片位置、role=status。文字正确不能证明位置正确。
- QA078 的本人账号覆盖集中在注销说明；管理员改密功能的既有通过不能替代 PAGE-009 本人改密弹窗的逐项文案对照。
- UAT079 的 102 项部署后冒烟用于健康/主要路径，不包含这两项完整设计对照。上述原始 PASS 保留为历史，不再外推为当前 UAT 无偏差。

## 下一轮必须验证

1. 首先按原脚本重测明确差异至 PASS，保留本次失败证据；不以只截一张首页或只校对文字替代。
2. 认证矩阵：Review、Library、批次详情、Account 的安全返回；登录/注册互跳；无返回目标不显示提示；中英文、390/1440、Chromium/WebKit；错误态、claim 已有优先级、管理员分流不得回归。检查首元素/标题前顺序、局部几何、role=status、无溢出。
3. 改密：中英文，标题/三标签/三辅助说明/会话说明/两个按钮逐项对照原型；密码为空/不一致禁用、错误提示、取消和焦点、正常成功行为保持。
4. 如果改动共享辅助说明键，同时检查注销对话框的本人确认文字。无需执行不可恢复注销；改密成功及会话失效行为使用独立合成账号，不改变 UAT 现有账号密码。
5. 保留现有 application → state → presenter/view 分层，无原始 DTO 直出；不改 API、密码策略、会话规则、数据库、供应商设置。
6. 其他已验功能仅按共享组件影响回归，不重开需求、设计或扩大为全站改版。

## 交接与授权边界

PROPOSED：有限返回前端实现修复 CR037，随后 qa-quinn 独立复验。上一轮“所有交接均批准，直到给我 UAT”已在079交付时到达终点，不自动延伸为本次新返工授权。

本回合只提交验证产物/CR，保持 workflow 的阶段、角色与 001–079 历史不变。当前控制面 open_change_requests 尚为空，这是待守门器接收时同步的 **CR037 索引待办**，不表示没有已报告缺陷；本反馈、CR 和质量交接是当前质量结论。等待用户批准后再由守门器同步控制面和明确目标，不自行启动实现、重新部署或宣布完成。真实 AI 质量仍 NOT VERIFIED，发布门 BLOCKED。

