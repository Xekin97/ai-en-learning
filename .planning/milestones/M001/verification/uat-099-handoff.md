---
milestone: M001
stage: verification
role: quality/base
agent_name: qa-quinn
status: awaiting_user_review
date: 2026-09-08
uat_id: UAT-M001-099
verdict: environment_ready_real_quality_pending
---

# UAT099 交接：已更新，可进入造文质量验收

入口：[http://localhost:6001](http://localhost:6001)。已部署通过QA098的后端097，前端保持原已验收版本。请刷新旧标签；原账号、密码和学习资料不变，不必重测已通过的全站UI。

本轮部署与有限冒烟通过，真实模型调用为0。新映射协议的真实造文质量尚未测试，不应将环境就绪视为造文质量通过。

## 使用的输入与产物

[099授权](../reviews/verification-cr039-099-uat-preparation-approval.md)、[QA098](./cr039-098-report.md)、[097实现](../implementation/backend-cr039-097-validation.md)、[USER-COMPAT-001](../reviews/first-release-compatibility-policy.md)。产物为[完整报告](./uat-099-report.md)、[覆盖](./uat-099-coverage.md)、[证据目录](./evidence/uat-099/delivery-manifest.json)、[最终保持校验](./evidence/uat-099/delivery-validation.json)。

## 现在可检查

- 用原学习者账号登录造文工作台，可看到DeepSeek与GPT-oss；管理员可只读查看原配置。访客无可选模型是保留的原组配置，真实样本请使用basic学习者账号。
- 只浏览页面不会提交造文。本次QA没有自动点击生成、启用模型探针或替用户新增收费权限。
- 原功能验收保持接受；当前候选与真实质量仍等待用户评价。现无新的实现返工项，不返回需求或设计。

## 建议下一轮只测这两组

| 样本 | 单词 | 保持可比较的配置 |
| --- | --- | --- |
| S1 | Alleviate, Undermine, Facilitate, Deteriorate, Perceive | GPT-oss；中文释义、讨论、中篇 |
| S2 | Sustainable, Prevalent, Vulnerable, Ambiguous, Coherent | GPT-oss；英文释义、新闻、长篇 |

建议预算2次真实生成，不自动重试、probe或替换模型，最多观察300秒；这是待确认建议，本轮未获授权、未执行。重点看短文是否自然、各目标词及允许变形是否正确映射、短语是否恰当、释义和短文标签是否准确，而非要求生成内容的每个词都在输入词库里。保留原文和映射供用户查看；若授权保存新测试资源，再用专用测试账号检查相应复习挖空，不动既有资料。

## 未决与风险

- OPEN：v3真实样本与预算、当前候选用户接受、CR-039收口。
- BLOCKED：发布，直到所需质量/验收条件完成；本轮不替用户批准。
- 原测试key未改，生产使用前仍需轮换。私有备份与旧镜像保留，位置与限制见报告；没有新增旧版兼容方案。
- 搜索首轮有一个测试时序误报，已仅定向复查通过；首次记录未删，详见报告，不隐瞒为零失败历史。

qa-quinn继续作为质量责任人。按`agt-verify-milestone`本轮交付后停止；建议守门器接收部署事实，再由用户明确是否执行上述两次真实调用。此交接不能切阶段，未修改workflow/registry/history。
