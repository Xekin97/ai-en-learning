---
milestone: M001
stage: uiux-design
role: uiux/base
agent_name: designer-tony
date: 2026-09-05
status: awaiting_user_review
---

# CR-031 / CR-032 设计自检

## 结果与边界

**1781 PASS / 0 FAIL，0 浏览器未捕获错误。** 这是本轮 HTML/CSS/JS 原型的设计自检，不是正式前端、后端、独立测试或 UAT 的通过结论。CR-029/030/031/032 仍 open，workflow 仍为 uiux-design，等待用户审阅新稿。

- 原型：`http://127.0.0.1:6010/prototype/`。
- [可复跑脚本](./evidence/cr031-cr032-validation.mjs)，[逐项结果与尺寸](./evidence/cr031-cr032-results.json)。
- 命令：在产品根目录运行 `node .planning/milestones/M001/design/evidence/cr031-cr032-validation.mjs`（6010 的 design 静态服务须在运行）。依赖项目现有 Playwright / axe，无真实账号、无模型调用、无生产写入。
- `node --check` 检查 app.js / i18n.js / reader-fixtures.js 全部通过；CSS 花括号平衡；6010 本地服务可访问。

## 覆盖

| 范围 | 已执行检查 |
| --- | --- |
| 视口 / 语言 | 320、390、720、1280、1440px；zh-CN / en-US |
| 访客 Review / Library | 直接 URL、首页按钮、桌面 Header 或手机菜单、原型页面选择；逐字比较标题和全部引导内容；无私有内容、目标页面不变、无横向溢出 |
| 原型状态 | 从 PAGE-006 切到 PAGE-007/005，再切遍对应状态；不能沿用“批次详情”或把 Review 切成另一目标 |
| 认证意图 | 登录→注册→刷新→错误状态→成功返回；两条主目标均保留；成功不自动开始复习；语言切换不改目标；离开认证流程清旧意图；Story 深链接保留 batch-002 |
| 只读弹窗 | 常规、长、特长、加载、失败、不可用六种状态；18px / 1.9 正文、24px 标签/段落间距、桌面/手机内边距、单一滚动、无横向溢出、固定标题/关闭、无写控件 |
| 特长内容 | 超过 800 词、9 个目标词条、3 个长标签；不截断、资源可到达 |
| 上下文与键盘 | 非首用户与非首批次内容核对；关闭恢复查询和触发按钮；Escape 同步关闭并恢复页面滚动；Tab 循环留在弹窗；错误重试成功 |
| 可访问性 | 13 组作用域 axe serious/critical 均为 0：中英文 × 390/1440 下弹窗成功/错误与危险区，另含 Review 引导；其余既有页不在本轮 axe 结论内 |
| 注销颜色 | 副标题 rgb(64,88,90)，背景 rgb(250,233,231)，对比度 6.47:1；保留原文案 |

首轮自检暴露主题/引导说明文字对比度不足、Escape 后清理时序和 Tab 到末尾焦点落到文档的问题；已在原型中修正，并完整复跑以上矩阵。没有把失败隐藏为环境波动，也没有改动生产代码来绕过设计检查。

## 视觉证据

- [手机只读短文](./evidence/cr031-cr032-screenshots/reader-short-390-en-US.png)
- [桌面只读短文](./evidence/cr031-cr032-screenshots/reader-short-1440-en-US.png)
- [手机特长短文与长标签](./evidence/cr031-cr032-screenshots/reader-xlong-390-zh-CN.png)
- [英文访客 Review](./evidence/cr031-cr032-screenshots/gate-PAGE-007-390-en-US.png)
- [英文访客 Library](./evidence/cr031-cr032-screenshots/gate-PAGE-005-1440-en-US.png)
- [加载失败](./evidence/cr031-cr032-screenshots/reader-error-1440-en-US.png)
- [注销区域](./evidence/cr031-cr032-screenshots/account-1440-en-US.png)

已人工查看手机/桌面只读阅读、手机 Review 引导截图。示例释义和 Tag 仍为生成时中文，不属于英文界面漏译。

## 仍需下游验证

真实 API 鉴权与管理员角色分流、请求取消与迟到结果、删除/无权返回、正式 Nuxt 路由历史/后退恢复、200% 浏览器缩放和 VoiceOver/NVDA、真实无限长数据性能，不能由静态设计原型证明。前端实现后需按本轮[交互交付](./cr031-cr032-interaction-contract.md)独立复核，再交用户 UAT。
