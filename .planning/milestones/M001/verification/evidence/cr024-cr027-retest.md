---
milestone: M001
stage: verification
role: quality/base
agent_name: qa-quinn
date: 2026-09-04
verdict: fail_cr024_only
---

# CR-024～027 独立复验证据

## 结论

固定生产前端镜像的独立矩阵共执行 **324 项**：**312 PASS / 12 FAIL**。12 个失败全部归属于 CR-024 的 3 个静态 UI 根因；CR-025、CR-026、CR-027 以及交叠的 CR-020～023 回归均通过。

| 范围 | 通过 | 失败 | 判定 |
| --- | ---: | ---: | --- |
| CR-024 管理端 | 85 | 12 | FAIL，继续 open |
| CR-025 访客门/登录错误 | 72 | 0 | PASS，resolved |
| CR-026 Library 三态 | 48 | 0 | PASS，resolved |
| CR-027 Review summary 四态/重启 | 89 | 0 | PASS，resolved |
| PAGE-008 cloze 交叠回归 | 18 | 0 | PASS |

原始机器结果：[cr024-cr027-retest-results.json](./cr024-cr027-retest-results.json)；可复跑脚本：[cr024-cr027-retest.mjs](./cr024-cr027-retest.mjs)。

## 环境与方法

- 前端镜像：`sha256:5cb3e2954fbf6ab501fb54626a8ff8c352607a5e3394581dfea1d7dd7fc11424`。
- QA 链路：独立 Nginx → 固定生产 Nuxt 镜像 → 合同控制后端，端口 6020；测试后已清理临时容器和网络。
- 真实链路补充：`http://localhost:6001` 上使用真实管理员账号验证 `plan_code=null` 显示 `—`，不会伪装成 Guest。
- 设计基线：批准的 `design/prototype/index.html`、`app.js`、`i18n.js` 与 `theme.css`，端口 6010。
- 矩阵：`zh-CN/en-US × 390×844/1440×1000`；完整可见文案、关键 DOM、computed style、互斥状态、请求体、横向溢出、Axe serious/critical 和全页截图。
- 本地受控链路页面 ready 观察值为 74–184ms，平均值不作为产品门槛；产品未批准响应时间阈值。

## CR-024 残余失败

### 1. 英文后台侧栏分区文案

- 运行页：`System settings`（桌面 CSS 投影为 `SYSTEM SETTINGS`）。
- 批准原型：`System`（桌面投影为 `SYSTEM`）。
- 复现：PAGE-101，en-US，390px 与 1440px 均失败。

### 2. Add/Edit model 的 OpenRouter model ID 输入表面

- 运行页：第三个输入框为 `rgb(238, 232, 220)`，且继承 `.code-value` 的紧凑 padding。
- 批准原型：三个文本输入框均为 `rgb(255, 255, 255)`。
- 复现：Add/Edit × zh-CN/en-US × 390/1440px，共 8 个失败。
- 对照截图：[实际 Add model](./screenshots/cr024-cr027-retest/actual-model-add-en-US-1440.png)、[批准 Add model](./screenshots/cr024-cr027-retest/prototype-model-add-en-US-1440.png)。

### 3. Plans 英文额度字段

- 运行页：`Creations in 24 hours`。
- 批准原型：`Creations per 24 hours`。
- 复现：PAGE-102，en-US，390px 与 1440px 均失败。
- 对照截图：[实际 Plans](./screenshots/cr024-cr027-retest/actual-plans-en-US-1440.png)、[批准 Plans](./screenshots/cr024-cr027-retest/prototype-plans-en-US-1440.png)。

上述三项均已有批准基线，不需要产品、UI/UX、API 或技术决策；责任仍是 `implementation / frontend-implementer/base`。

## 已通过范围

### CR-025

- `/review`、`/library` 均保留原路由，访客引导卡的宽度、padding、圆角、文案层级和双操作通过双语/双视口对照。
- invalid credentials 使用图标 + 内容容器的 danger notice；用户名保留、可立即重试，不显示 request id。
- 代表截图：[Library 访客门](./screenshots/cr024-cr027-retest/actual-gate-library-en-US-1440.png)、[登录错误移动端](./screenshots/cr024-cr027-retest/actual-login-error-en-US-390.png)。

### CR-026

- 正常 Library 六项统计顺序与文案通过。
- 首次空库隐藏统计、搜索和日期复习入口；搜索无结果保留上述上下文，三态互不混用。
- 代表截图：[首次空库](./screenshots/cr024-cr027-retest/actual-library-first-empty-en-US-1440.png)、[搜索无结果](./screenshots/cr024-cr027-retest/actual-library-search-empty-en-US-1440.png)。

### CR-027

- single/range × 全部完成/待加强四种总结的标题、说明、统计和按钮全部通过。
- 两类主操作实际发出新建会话请求：single 保留原 `batch_id`，range 保留原日期与时区，并进入新 session。
- 完成页不渲染 active review context、答案或原始 group key。
- 代表截图：[本篇完成](./screenshots/cr024-cr027-retest/actual-summary-singleComplete-en-US-1440.png)、[日期待加强](./screenshots/cr024-cr027-retest/actual-summary-rangeIncomplete-en-US-1440.png)。

### 管理端其余项与交叠回归

- Models heading/subtitle、Active/Inactive、Edit、方案引用、dialog labels/helpers/notices/buttons 和 Replace key 纯白输入面通过。
- Plans subtitle、Guest/Basic/Pro/Plus、Available models 8px 间距和 Save changes 通过。
- Users 日期稳定为 `YYYY-MM-DD`，Plan/Basic、Active、View 和结果行层级通过；真实管理员 null plan 为 `—`。API v1.3 的用户联合只允许 learner+plan 或 admin+null，不存在可持久化的 visitor user 行；Guest 是 PAGE-102 的方案身份。
- PAGE-008 同词分组在 390/1440px 均为同源同色/纹理、异源不同组，语言切换后稳定；输入框碰撞 0，DOM 与可访问名称不泄露答案或 raw group key。
- 全矩阵横向溢出失败 0；Axe serious/critical 失败 0。

## 路由结论

- CR-025、CR-026、CR-027：独立验证闭合，改为 `resolved`。
- CR-024：继续 `open`，阻塞再次用户 UAT和里程碑完成。
- 推荐用户批准返回 `implementation / frontend-implementer/base / frontend-claire`，只修复上述三个残余点后再做定向独立复验。
