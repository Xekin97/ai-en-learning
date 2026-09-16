---
milestone: M001
agent_name: qa-quinn
date: 2026-09-05
verdict: fail_user_uat
---

# 用户 UAT：日期、首页、账号及用户详情复核

## 环境与方法

- 前端：sha256:68470b6ea1e94dd7e83ed6028e28116bb0ef3abbe2d84a3a67f862f341e29804；本地 6001 真实 Go/Postgres/Nuxt 链路。
- 设计：批准原型 6010；en-US/zh-CN × 1440×1000/390×844。
- [脚本](./uat-detail-regressions-2026-09-05.mjs)、[机器结果](./uat-detail-regressions-2026-09-05-results.json)：48 项对照，14 PASS / 34 FAIL；没有执行失败或跳过。
- 测试只登录既有专用账号、读取页面和资料、切换并恢复测试账号语言；没有删除账号、改密、换组、生成资料、调用真实 AI 或替换部署。
- 密度设计是否合格以用户本次拒绝为准，不把“有截图”视为批准；34 个失败是跨语言/视口的重复断言，不是 34 个独立产品根因。

## 逐项复核

| 用户反馈 | 实际与基线 | 责任 |
| --- | --- | --- |
| 1 日期大小 | 桌面 From 379×54px / To 379×44px，To 顶部比 From 低 10px；原型均 379×44px、顶边一致。第二 field 多出的 20px margin 是根因；手机端也多此间距 | CR-029 实现 |
| 2 首页 Review | 英文 learner 为 Start review，原型 Review；中文相同 | CR-029 实现 |
| 3 注销文案 | actual This action cannot be undone. / 原型 This can’t be undone.；正文 reviews/account information 与原型 review history/account 不同 | CR-029 实现 |
| 3 注销颜色 | actual #873232 / 原型 #6d7f7e；14px 字号与 21.7px 行高相同。actual 来自 CR-010 可读性修复，原型未同步 | CR-031 设计统一 |
| 4.1 详情搜索 | actual 0 个 search form / 原型 1 个可用表单 | CR-030 实现 |
| 4.2 返回文案 | actual ← Back to search results / 原型 ← Back to results | CR-030 实现 |
| 4.3 日期 | actual Sep 3, 2026 或 2026年9月3日 / 原型 YYYY-MM-DD；比较格式，不比较测试账号的真实创建日 | CR-030 实现 |
| 4.4 Library 副标题 | actual For viewing only / 原型 View only | CR-030 实现 |
| 4.5 资料按钮 | actual View only / 原型 View | CR-030 实现 |
| 4.6 打开方式 | actual 跳 batches/:batchId 页面，无打开 dialog / 原型当前详情上打开 modal | CR-030 实现，依赖新设计 |
| 4.7 资料弹窗密度 | 用户拒绝旧设计；原型 notice→tags 间距 0px，需重新设计内容分区与阅读空间 | CR-031 设计 |

## 代表性截图

- Review：[实际](./screenshots/uat-detail-regressions-2026-09-05/actual-PAGE-007-en-US-1440.png) / [原型](./screenshots/uat-detail-regressions-2026-09-05/prototype-PAGE-007-en-US-1440.png)
- Account：[实际](./screenshots/uat-detail-regressions-2026-09-05/actual-PAGE-009-en-US-1440.png) / [原型](./screenshots/uat-detail-regressions-2026-09-05/prototype-PAGE-009-en-US-1440.png)
- 用户详情：[实际](./screenshots/uat-detail-regressions-2026-09-05/actual-user-detail-en-US-1440.png) / [原型](./screenshots/uat-detail-regressions-2026-09-05/prototype-user-detail-en-US-1440.png)
- 资料查看：[实际独立页](./screenshots/uat-detail-regressions-2026-09-05/actual-user-batch-en-US-1440.png) / [用户已否决的原型弹窗](./screenshots/uat-detail-regressions-2026-09-05/prototype-user-batch-en-US-1440.png)
- [手机原型弹窗](./screenshots/uat-detail-regressions-2026-09-05/prototype-user-batch-en-US-390.png)

## 测试覆盖失误

上一轮 446 项执行结果真实，但不足以推出所有 UI 状态均还原。最新矩阵覆盖 Users 列表，不覆盖详情 copy 和资料打开方式；PAGE-007 主要覆盖访客引导，未覆盖登录态日期几何；PAGE-009 危险区不在该次精确对照矩阵；首页主操作区只检查过部分导航/角色。

后续覆盖矩阵必须细到“页面 × 身份 × 状态 × 语言 × 视口”，至少包含详情搜索可操作、同页面弹窗、选中资料正确、关闭恢复、长内容滚动，以及几何/逐字文案/颜色与可访问性联合检查。不能再次以列表、截图存在、元素存在、通过项总数代替这些验收。

## 当前结论

UAT FAIL，重新阻塞交付；创建 CR-029/030/031。旧通过结果作为历史保留，不修改或伪造；本轮没有修复产品代码或重写批准原型。
