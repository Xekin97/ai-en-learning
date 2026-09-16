---
milestone: M001
stage: implementation
role: frontend-implementer/base
agent_name: frontend-claire
status: awaiting_user_review
date: 2026-09-06
contract_version: v1.4
implementation_round: TRANSITION-M001-080
change_requests: [CR-037]
browser_validation: partial_native_webkit_input_blocked
---

# CR037 有限前端修复与开发交付

依据[080批准](../reviews/verification-cr037-rework-approval.md)、[CR037](../changes/CR-037.md)、[质量原始要求](../verification/uat-079-feedback.md)、[工作区计划](./frontend-cr037-080-worktree-plan.md)。PAGE-003/002/009，关联 PAGE-007/005/006；CAP-002/003/004/021；DATA-003/004/018；API-002/003、v1.4 不变。

## 实现结果

1. 登录、注册的返回提示移为认证卡片首元素，位于标题前，恢复 `role=status`。沿用既有安全返回解析、语言、样式；有效 claim 优先使用自身提示，过期 claim 不抑制正常返回提示。
2. 本人账号 Change password 的三个英文键按原型逐字对齐：`Confirm it’s you`；`Your current session will stay open. Other sessions will be signed out.`；`Update password`。中文和其他已一致字段不变；共享本人确认说明同步作用于注销弹窗。
3. 扩展回归发现取消改密后焦点落到 body。按原批准交互要求，仅在 account.vue 保存触发按钮引用并在关闭后 nextTick 返回焦点；清空三个密码输入。不改全站 AppDialog、密码规则或会话接口。

四个既有生产文件：login.vue、register.vue、account.vue、en-US.json；新增两个测试文件：auth-card-design.test.ts、cr037-auth-account.spec.ts。没有改CSS、产品/设计、数据库、后端、依赖或DTO转换链。单工作区无并行/合并/commit，保留既有未跟踪基座。

## 开发验证结果

| 检查 | 结果 | 原始证据 |
| --- | --- | --- |
| 格式 | PASS | [最终命令](./evidence/cr037-080/quality-commands-final.json) |
| Node24容器 typecheck / lint / boundary / Nuxt build | PASS，边界118模块89依赖 | [完整日志](./evidence/cr037-080/build-final.log) |
| 单元测试 | 21文件196项PASS，新增22项 | 同上 |
| 全量桌面/移动契约Mock E2E | 122 PASS，0失败/跳过/flaky | [结果](./evidence/cr037-080/e2e-full-final.json)、[命令](./evidence/cr037-080/e2e-command-final.json) |
| Chromium真实后端完整场景 | 85局部断言PASS | [独立完整开发运行](./evidence/cr037-080/browser-chromium-complete-results.json) |
| macOS WebKit位置/文案/取消焦点 | 55局部断言PASS | [限定范围完整运行](./evidence/cr037-080/browser-webkit-visual-results.json) |
| macOS WebKit完整改密输入与会话 | **NOT VERIFIED：原生浏览器崩溃** | [诊断](./evidence/cr037-080/browser-environment-diagnostic.json)、[原始日志](./evidence/cr037-080/browser-final2.log) |
| Linux WebKit替代运行 | **NOT RUN** | [镜像下载中止记录](./evidence/cr037-080/linux-fallback-status.json) |

这不是“全部双引擎测试通过”，也不是独立QA或UAT通过。完整Mock E2E使用Chromium桌面/移动项目，不冒称其覆盖WebKit。

认证测试覆盖中英、390/1440、登录/注册往返、Review及其会话/Library及批次/Account目标、无目标和不安全目标、claim优先/过期、语言与错误状态、DOM首元素/状态语义/间距和无溢出。真实设计对照使用6010原型和固定生产镜像。

Chromium真实改密覆盖双语完整文案、空值/不匹配禁用、取消无PUT及焦点、重开清空、错误当前密码422/弹窗保留/不撤销其他会话、成功204/精确三字段、成功提示、当前会话200/其他会话401、旧密码401/新密码200、原账号语言和本人退出。注销弹窗只检查共享说明并关闭，不做真实删除。WebKit完成双语双宽度文案/字段范围/位置及取消焦点；密码输入后的整条流程仍有环境缺口。

已目视复核[英文登录实际](./evidence/cr037-080/chromium-complete-Chromium-en-US-1440-login-actual.png)与[设计](./evidence/cr037-080/chromium-complete-Chromium-en-US-1440-login-design.png)、[中文移动改密实际](./evidence/cr037-080/webkit-visual-WebKit-zh-CN-390-password-actual.png)与[设计](./evidence/cr037-080/webkit-visual-WebKit-zh-CN-390-password-design.png)。不将局部对照称为全站像素验收；初次Chromium设计截图有surface绘制残缺，保留但不作为字段视觉通过证据，后续WebKit截图字段完整。

## 首次失败与环境边界

- 新22项单测在修复前11 PASS / 11 FAIL，保留[红灯结果](./evidence/cr037-080/unit-before.json)。源修复后全部通过。
- [首次122 E2E](./evidence/cr037-080/e2e-full.json)：115 PASS / 7 FAIL。四项暴露取消焦点缺陷；三项在SPA跳转完成前读取URL。新增测试改为等待同一预期URL，未放宽目标/提示断言。[首轮trace与错误上下文](./evidence/cr037-080/e2e-first-artifacts.tar.gz)保留。
- [首次真实浏览器](./evidence/cr037-080/browser-results.json)：79 PASS / 2 ERROR，两个引擎均在取消焦点断言失败。补齐账号页局部恢复后相关断言通过。
- 固定最终源的两次双引擎运行分别126 PASS / 1 ERROR、129 PASS / 2 ERROR；Chromium完成，但WebKit被原生异常中断。串行执行、改用逐键输入仍复现 `NSTextInputContext textInputClientDidUpdateSelection` 未识别方法及exit134。没有产品JS异常，准确的系统/库兼容根因未进一步证明，不能把中断解释成测试成功。
- 同版本官方Linux镜像清单可读，但约960MB下载进展缓慢；仅停止本轮明确PID的pull，没有启动Linux浏览器容器。备用脚本保留供QA使用，未运行的脚本及计划汇总脚本均不是结果证据；没有改系统设置、浏览器安装或项目依赖。

## 固定候选与保护

前端 `sha256:170b8f2c58a2792b21cfe71244f80f263beb825a55fb84d5c2c0dec72adb0e3b`；后端沿用 `sha256:e8c4ee91a7c3265cda8c496ccc8fb485328d95b6c1662eaf2502011ce5d005a5`。

[候选与六文件摘要](./evidence/cr037-080/candidate.json)明确标注浏览器验证缺口，不宣称全绿。[清理](./evidence/cr037-080/cleanup.json)限定wordweave.dev=080的4容器/2网络和14个合成账号的tmpfs库；0批次/模型/凭据/生成。临时数据不可原样恢复，可由setup和各运行脚本等效重建。保留镜像/证据及下载缓存，不做全局prune。6101及Mock3300/38080释放，6010原型保留，6001四容器ID/镜像/启动时间与基线一致；未访问或改写既有UAT账号密码/学习内容。0真实AI调用。

## 交接与未决

CR037保持open，已关闭CR029–036不重开；QA079原始失败结论不修改。代码修复已提交专业产物，但原生WebKit完整改密仍未验证，不能提前接受UAT或发布。

按080已批准的后续独立复测意图，交守门器检查实际开发交付及这个明确缺口；本回合不修改workflow/registry/history、不自行激活qa-quinn。独立QA应在可用WebKit环境补齐改密输入/完整会话语义，并独立复验原始两项和关联认证/claim/注销说明。无需重开产品、设计或API决策，不机械重跑已通过的开发单测/构建；独立结果形成前不更新6001，真实AI兼容与自然度仍NOT VERIFIED。

