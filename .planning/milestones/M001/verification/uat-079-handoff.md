---
milestone: M001
stage: verification
role: quality/base
agent_name: qa-quinn
status: awaiting_user_review
date: 2026-09-06
verification_round: TRANSITION-M001-078
uat_handoff: UAT-M001-079
verdict: passed_for_functional_uat
functional_uat: awaiting_user_acceptance
release_readiness: blocked
---

# WordWeave / 词涟：本地功能 UAT

当前测试入口：[http://localhost:6001](http://localhost:6001)。建议先用 **Cmd + Shift + R** 强制刷新已有标签，避免加载升级前的管理员页面。请使用 localhost，不要混用 127.0.0.1；认证与 CSRF 按该本地域名配置。

只读设计稿：[http://localhost:6010](http://localhost:6010)。未更改其文件或进程。

## 测试账号

以下是已有的本地专用测试账号，本轮已通过真实登录表单验证；没有重置密码、换组或重建账号。请勿复用到线上。

| 身份 | 用户名 | 密码 |
| --- | --- | --- |
| 管理员 | `uat_admin` | `UatAdminPass6000!` |
| 学习者 | `uat_learner` | `UatLearnerPass6000!` |

访客场景请使用未登录窗口；管理员与学习者可用不同浏览器配置或无痕窗口，避免会话互相覆盖。

## 建议验收路径

| 场景 | 操作与预期 |
| --- | --- |
| 首页、访客和登录 | 在中/英文及窄屏访问首页、Review、Library。品牌随语言变化；Review/Library 在原路径显示统一的登录/注册引导，认证后回到正确位置；错误信息不破坏布局。 |
| Plans | 逐组切换，确认模型/篇幅标题间距及保存文案。清空模型或篇幅后显示恢复提示；仅额度为 0 时显示暂停标题，不错误要求重新选已有模型；有效配置或不限额度恢复后提示消失。保存并刷新确认状态。**修改前记下原值，验收后恢复，以免阻止其他账号造文。** |
| Users | 搜索前/无结果/有结果、多页及长用户名；进入详情仍保留搜索，返回恢复结果。日期、Current plan、实际剩余额度准确；资料以正确归属的只读弹窗打开，关闭回到当前详情。 |
| Models | 标题/副标题、列表状态、Edit、方案引用文案及 Add/Edit/Replace key 弹窗对照设计稿。只检查弹窗可直接取消；不要覆盖现有 API Key。 |
| Library | 六项统计、空态、搜索、参与复习 checkbox、直接打开单个批次复习，确认不再出现含义不明的继续/暂停开关。 |
| Review | From/To 高度一致；只有旧记录或范围无记录时仍可调整日期。默写短语中目标词全部挖空；短文同一词原型用一致颜色分组、不透露拼写，输入框不重叠。范围复习和本篇复习完成后分别显示对应总结/按钮。 |
| Account | 检查 Delete account 说明与颜色；仅检查布局时不要执行注销，注销属于不可恢复操作。 |

复习现有测试材料时可选择包含 **2026-09-04** 的日期范围，或在 Library 直接进入本篇复习。现有专用测试资料包含确定性合成内容，用于功能与 UI 验收，不代表真实供应商的英语内容质量。

## 已完成的验证

- 开发固定候选：174 单元测试、110 桌面/移动端完整 Mock E2E，以及 560 条真实后端浏览器检查通过；详见[开发报告](../implementation/frontend-cr036-077-validation.md)。
- [独立 QA078](./cr036-078-report.md)：19 份结果文件均 PASS；针对 CR029–036 的接口、真实数据库、Chromium/WebKit、中英文、布局/交互与回归已完成。不同文件含重复状态断言，不当作独立需求数量。
- [本地 UAT 冒烟](./evidence/uat-079/smoke-final-results.json)：102 PASS，0 FAIL/ERROR。真实登录、两种宽度、访客双语、四方案只读核对、真实额度/资料弹窗、Library 六统计和等高日期输入，以及四服务健康/镜像/数据检查均通过。
- 冒烟首次的 2 个 FAIL 均为清理脚本 logout 未提交契约要求的空 JSON，服务返回 400。前端本身已有 `body: "{}"`；只修正测试请求为 `data: {}`，未改生产代码、断言或鉴权规则。保留[首次原始结果](./evidence/uat-079/smoke-results.json)，最终完整复跑 102 PASS。首次关闭浏览器上下文但未成功撤销的两个专用测试会话按既有会话期限失效，未全局注销其他用户。
- 最终轮测试会话正常 logout 204。没有保存组策略、编辑模型、创建复习会话、生成内容或调用真实 AI；无页面运行错误。
- 本轮修复保留业务/展示分层：方案可生成状态在 application 层判定，经 presenter 生成界面提示，页面只绑定状态；未直接拿原始 DTO 渲染。

截图：[访客390](./evidence/uat-079/guest-library-390.png)、[Plans1440](./evidence/uat-079/admin-plans-1440.png)、[资料弹窗1440](./evidence/uat-079/admin-reader-1440.png)、[Library390](./evidence/uat-079/learner-library-390.png)。

## 已部署版本与数据保护

固定配套镜像：

- frontend: `sha256:8fe04108b523cce73820017069ba0509e7bee03589b0fdc9218a4397770274c0`
- backend: `sha256:e8c4ee91a7c3265cda8c496ccc8fb485328d95b6c1662eaf2502011ce5d005a5`

[部署记录](./evidence/uat-079/deployment.json)：只定向替换前后端并重载既有 Nginx。PostgreSQL/Nginx 容器与持久卷未重建；589 个账号、16 个批次、1 个模型、78 条生成调用记录前后相同。数据库已有 6 项迁移，本轮未运行迁移。没有删除现有 UAT 数据。

运行中的数据库/会话参数与 `backend/.env` 部分不同。本次按现有运行值在内存中解析并逐项核对后部署，未把旧配置覆盖到运行环境，也未将机密写进仓库。后续不要不经核对直接用旧 `.env` 重建这些服务。

私有回滚备份位于：
`/var/folders/z9/99ckxr957v901zwwc8jdk8640000gn/T/wordweave-uat-079-ylgI52`

目录权限 700，数据库备份和运行参数文件权限 600；文件含敏感信息，不应上传或展示内容。临时目录可能被系统清理，不能当长期备份。旧镜像仍保留：

- frontend: `sha256:68470b6ea1e94dd7e83ed6028e28116bb0ef3abbe2d84a3a67f862f341e29804`
- backend: `sha256:b704e386cafdf7be1f973e792c08a9726d544a267dc9d75622cee0987284a7ba`

需要回滚时应成对切回旧镜像并保留上述实际运行参数，核验健康后重载 Nginx；不要用恢复数据库覆盖验收期间产生的新数据。本次没有执行回滚或数据库恢复。

独立验证临时栈已删除，其可重建的合成测试数据随 tmpfs 清理；6001 UAT 数据不受影响。3300/38080/6101 未留测试服务；6010 原设计稿服务保留。

## 验收边界与反馈

当前是**功能 UAT 可验收**，不是用户已通过或允许发布。真实 OpenRouter/其他供应商兼容性和概率内容质量仍为 **NOT VERIFIED**，发布门仍 **BLOCKED**；本轮没有外部 AI 调用或新增费用。真实设备、系统级 200% 缩放、VoiceOver、Firefox、生产负载等未补称通过，详见独立报告。

已知非阻断差异：设计稿英文界面的语言选项使用“Chinese”，实现按既定“语言本地名称”规则显示“中文”。该差异单独记录，未擅自修改全局规则。

请反馈页面路径、界面语言、视口/浏览器、操作步骤、实际与期望，附截图即可。收到你的 UAT 结果后再决定通过或按归属返工；不会自动完成里程碑或继续发布。

