---
milestone: M001
stage: verification
role: quality/base
agent_name: qa-quinn
date: 2026-09-03
verdict: fail_one_ui_regression
---

# API v1.3 与最终 UAT 返工独立复测证据

> 2026-09-03 复核更正：本文中的 PAGE-103 PASS 只覆盖最终行数、普通排序、单/空/错和详情返回，不足以证明完整列表设计。后续 [PAGE-103 专项审计](./page103-list-audit.md) 发现精确匹配、加载更多过程/焦点及 720px 布局失败；PAGE-103 总体结论以该专项为准。

## 环境

- 入口：`http://localhost:6001`
- 批准原型：`http://localhost:6010/prototype/index.html`
- Compose project：`wordweave_uat`
- backend、frontend、nginx、PostgreSQL 均为 healthy；`/health/live` 与 `/health/ready` 均返回 `ok`。
- 使用全新专用测试数据库及本地确定性 OpenRouter 协议替身；未复用聊天中曾暴露的 API Key。

## 独立回归汇总

| 证据集 | 结果 | 覆盖重点 |
| --- | --- | --- |
| `live-e2e.mjs` | 20/20 PASS | 健康、权限、48/48 AI 配置矩阵、多目标、保存、统计、复习 API v1.3、隔离、额度、SSR/SSE、Axe 与性能 |
| `revision-e2e.mjs` | 16/16 PASS | auth gate、配置显式选择、未保存离开、单篇/日期复习、密码与账号生命周期、删除、取消/失败计量、13 路由 Axe/响应式 |
| `v13-final-retest.mjs` | 4/5 PASS | CR-017、CR-018 精细 DOM/style、PAGE-103 全状态、真实 cloze 分组、多视口/Axe |

`revision-e2e.mjs` 首次运行暴露了旧脚本对访客跳转和语言保存的过期预期/竞态；校正验证夹具后稳定为 16/16 PASS，没有据此修改产品代码。

## 最终专项结果

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| CR-017 访客 Library/Review 引导 | PASS | 两条路由保持原地址，均显示完整 auth gate、登录/注册链接保留安全返回意图，且不发私有数据请求 |
| CR-018 后台精细对照 | FAIL | heading、Add/Edit model、Plans 间距/文案通过；New API Key 实际 `rgb(255,253,248)`，原型 `rgb(255,255,255)` |
| PAGE-103 用户搜索生命周期（有限范围） | PASS / SUPERSEDED | 初始不预载；初次 loading；20+3 最终分页；普通排序；单/空/错误；详情返回保留查询并恢复焦点；未覆盖项见后续专项 |
| API v1.3 cloze 分组 | PASS | 9 blanks / 3 groups；DOM、action 不泄漏 raw group key；同组一致、异组不同；聚焦、本地化、错误重试稳定；1 正确 + 8 独立错误 |
| 响应式与无障碍 | PASS | 22 个专项响应式场景；12 次 Axe 页面扫描，无页面溢出、serious 或 critical 告警 |

## Cloze 定量与目视结果

- 320、390、640、720、1440px 的 passage line-height / font-size 均为 `3.10`。
- 所有视口的行内输入框碰撞数为 0；移动端输入宽度受控。
- 同一原词条的空使用相同颜色与纹理，不同原词条不同；正常视觉界面不显示数字组号或拼写。
- 切换 `en-US` / `zh-CN` 及错误重试后投影不变；action request 不含 group 字段。
- 目视截图：`screenshots/v13-final-retest/cloze-mobile-error.png`，未发现重叠、截断或页面级横向溢出。

## 唯一阻塞项

PAGE-101 Replace key 的输入表面仍与批准原型相差一个 token，登记为 [CR-020](../../changes/CR-020.md)。由于它正是用户上一轮 UAT 明确指出的项目，不能降级为可接受偏差。

## 边界

确定性链路验证通过不代表真实 `m001-v2` 模型的自然度与敏感场景质量已经验证。生产模型启用仍需轮换后的安全凭据和独立 AI 发布门。
