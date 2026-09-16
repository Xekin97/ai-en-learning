---
milestone: M001
stage: uiux-design
role: uiux/base
agent_name: designer-tony
status: awaiting_user_review
date: 2026-09-05
change_requests: [CR-034, CR-032]
verdict: prototype_self_check_pass
---

# 第 066 轮设计自检

## 结论与范围

本次可运行原型修订完成，等待用户审阅。主矩阵 **1163 PASS / 0 FAIL**；入口/本地化补充 **48 PASS / 0 FAIL**。两组有重复覆盖，不相加宣称新的独立测试总数。它们只证明设计原型，不解除生产 QA 的 FAIL、开放 CR、UAT 或真实模型发布门。

[准确交互](./cr034-interaction-contract.md)、[原型](./prototype/index.html)、[原始主结果](./evidence/cr034-final/results.json)、[补充结果及源摘要](./evidence/cr034-final/navigation-final-results.json)。

## 方法与运行

- 使用既有 127.0.0.1:6010 静态设计服务；未重启、替换或终止该用户既有进程。
- 使用项目已有 Playwright 与 axe，无依赖安装、真实账号或模型调用。
- 主矩阵：Chromium × 320/390/720/1280/1440 × zh-CN/en-US × 10 个范围状态；另外 WebKit × 390 × 两语言连续恢复操作。
- 浏览器时间固定 2026-09-05T04:00:00Z，时区 Asia/Shanghai；仅冻结日期，350ms 演示计时仍正常执行。原型本身默认使用实际浏览器本地日期。
- 102 组几何采集；16 组作用域 Axe serious/critical 检查通过。不据此宣称全站、所有辅助技术或真实设备通过。
- 使用真实 input.fill、键盘、语言选择、角色/状态控制器、导航点击；没有通过隐藏输入或绕过逻辑伪造成功。另用程序触发禁用动作验证无命中时仍有动作保护。
- 命令（在产品根目录，先确保上述静态服务可访问）：

```sh
node .planning/milestones/M001/design/evidence/cr034-validation.mjs
node .planning/milestones/M001/design/evidence/cr034-navigation-validation.mjs
```

主脚本：[cr034-validation.mjs](./evidence/cr034-validation.mjs)；补充脚本：[cr034-navigation-validation.mjs](./evidence/cr034-navigation-validation.mjs)。当前脚本默认写各自 final 结果，复测前应为旧证据另存轮次，不用覆盖历史来隐藏失败。

## 验收映射

| 对象 | 已运行检查 | 结论 |
| --- | --- | --- |
| CR-034 / CAP-017 | 只有早期记录：初始无命中 → 编辑日期 → 找到 2 篇；有 → 无 → 有；两边界与同日 | PASS |
| 真实空库 / 全部未参与 | 各自独立夹具，扩大全年范围仍为 0；不误报全库结论 | PASS |
| 无效日期 | 缺失、反向、同日允许；错误与字段关联，未知非 0，动作禁用 | PASS |
| 加载 / 失败 / 重试 | 加载不沿用旧命中，失败不当空库；重试保留草稿和合理焦点 | PASS |
| 状态连续性 | 日期 DOM 节点不被替换；输入焦点保持；快速输入只采纳最新范围 | PASS（本地模拟） |
| CAP-020 | 空/无效新范围仍有既有 2/5 恢复入口；编辑不改已有进度文字 | PASS（原型） |
| CAP-021 | 中英切换保留范围、结果与单一品牌；新状态选择项双语 | PASS |
| 访客边界 / CR-032 | 五类受限页不含日期/批次；各 PAGE-007 演示状态同一引导；迟到预览不替换访客页 | PASS（无真实权限数据） |
| 入口/认证导航 | Review/Library 直接、首页、Header/移动导航一致；注册互切保留目标，完成不自动开始复习 | PASS（模拟认证） |
| 颜色基线 | 引导 h1=#596c6b，模型说明/统计/复习进度等抽查一致，注销 ink-soft 保持 | PASS |
| 布局 | 输入均 44px、等宽、无额外 field margin；紧凑结果条、手机全宽按钮、无页面横向溢出 | PASS |
| JavaScript 静态检查 | app.js / i18n.js / review-range.js 与两份验证脚本 node --check | PASS |
| 工作边界 | frontend/backend/nginx、product/technical、workflow/registry 与 verification 扫描源摘要未变 | PASS |

## 修订过程与原始失败保留

1. [初轮结果](./evidence/cr034/results.json) 为 1059 PASS / 0 FAIL，但人工查看 [初轮手机图](./evidence/cr034/empty-320-en-US.png) 发现新结果条规则被旧 count-card 样式覆盖，仍高 240px；自动化当时没有紧凑高度断言，不能用全绿掩盖设计缺口。
2. 提高范围内选择器优先级、让手机空态按钮全宽，增加高度/方向/宽度断言后，主矩阵重跑为 1163 PASS / 0 FAIL，最终结果位于 cr034-final，不覆盖初轮文件。
3. [首轮入口补充](./evidence/cr034-final/navigation-results.json) 为 46 PASS / 2 FAIL：原型 PAGE-007 状态下拉仍显示中文。已在 PAGE-007 的状态渲染中应用本地化，并补齐对应词典；此修改只针对审阅控制器，不改变用户入口/文案。
4. 控制器本地化最终补充复测为 48 PASS / 0 FAIL，并固定当前 HTML/CSS/JS 摘要。主矩阵早于最后这处控制器标签修改，故最终补充单独覆盖该差异；未声称最后一次完整主矩阵重新执行。

不将上述重复轮次合并为“全部检查量”。用户可查看每次原始结果及对应截图。

## 人工视觉检查

已实际查看：

- [320 英文空态](./evidence/cr034-final/empty-320-en-US.png)：日期、紧凑计数、下方反馈与全宽按钮。
- [1440 中文空态](./evidence/cr034-final/empty-1440-zh-CN.png)：同排日期与稳定卡片/反馈间距。
- [320 中文日期错误](./evidence/cr034-final/date-error-320-zh-CN.png)：就地错误、两字段与未知计数可见。
- [1440 英文访客引导](./evidence/cr034-final/guest-1440-en-US.png)：既有布局和完整消息不变。
- [WebKit 手机英文](./evidence/cr034-final/webkit-empty-en-US.png)：原生日期显示格式不同，但容器、44px 控件与内容布局一致。

没有用截图编辑工具修改这些证据。浏览器原生日期格式/日历图标由引擎与系统决定，前端应对齐外围几何，而不是要求各引擎日期内部像素完全相同。

## 限制与下一步

- 没有调用真实 API、验证真实会话事务/归属/随机排序或跨刷新恢复；PAGE-008 仍为既有固定样例，不能将其进度/总结当成 PAGE-007 合成预览的真实结果。
- 未测试本轮页面的真实 200% 浏览器缩放、Firefox、物理 iOS/Android 软键盘或 VoiceOver/NVDA。窄视口、WebKit 和 Axe 不等于这些已完成。
- 全局 faint 的已知背景对比度采用静态 sRGB 计算；只在指定页面做作用域 Axe 和 computed color 抽查，不宣称所有组合皆已验收。
- 没有构建/部署前后端，没有更新 6001 UAT，也没有写入独立质量报告。受保护源摘要见 [边界记录](./evidence/cr034-final/scope-integrity.json)。
- 全部浏览器测试进程正常结束；既有 6010 设计服务继续提供新原型。没有新增容器、删除数据或使用真实凭据。
- 建议用户审阅后交 frontend-bob 做最小前端状态/渲染映射，再由 frontend-claire 实现并修正 CR-031 中文“重试”，最后独立复验。新设计审批不能替代上述步骤。
