---
milestone: M001
stage: verification
role: quality/base
agent_name: qa-quinn
status: awaiting_user_review
date: 2026-09-06
verification_round: TRANSITION-M001-076
verdict: fail_rework_required
functional_uat: not_reissued
release_readiness: blocked
---

# 第076轮覆盖矩阵

[报告](./cr030-cr035-076-report.md)为本轮结论；粒度为指定身份、状态、语言、视口和行为，不是全页面无条件通过。总体FAIL源于CR036。

| 追踪 | 本轮独立场景 | 原始证据 | 结果与边界 |
| --- | --- | --- | --- |
| CR030-R074-01；PAGE-103；CAP-104/107/021；DATA-003/012/013；API-103 | 合法32字符、32个w、短名；双引擎双语；320/390/720/721/900/901/1280/1440；完整名/徽章/搜索→详情→返回 | [focus](./evidence/cr030-cr035-076/focus-results.json)、[几何](./evidence/cr030-cr035-076/focus-observations.json)、[确认截图检查](./evidence/cr030-cr035-076/detail-capture-results.json) | PASS；旧末尾截图有捕获时序问题，已补拍，不用旧截图作证明 |
| CR030；PAGE-103；CAP-104/021；DATA-003/018；API-103 | 搜索前/空/加载/失败，双引擎双语8宽度×800/1000高度实时原型对照 | [users-matrix](./evidence/cr030-cr035-076/users-matrix-neutral-results.json) | PASS；仅指定局部几何/文案/状态 |
| CR030；PAGE-103；CAP-104；API-103 | 45行三页、追加失败重试/终页、精确匹配置顶、trim/大小写SQL、篡改/跨查询/跨管理员游标、401/403/404与no-store | [api](./evidence/cr030-cr035-076/api-results.json)、[api-edge](./evidence/cr030-cr035-076/api-edge-results.json)、[supplemental](./evidence/cr030-cr035-076/users-supplemental-results.json) | PASS；无分页并发写入/完整旧游标类型枚举重测 |
| CR030/031；PAGE-103；CAP-104/107/021；DATA-012/013 | 正确账号/两篇短长内容，40行返回焦点/滚动、未提交查询、只读modal、深链/旧URL/历史/迟到/500/404/关闭/键盘 | [flows](./evidence/cr030-cr035-076/flows-results.json)、[visual](./evidence/cr030-cr035-076/visual-results.json)、[long-reader](./evidence/cr030-cr035-076/long-reader-results.json)、[supplemental](./evidence/cr030-cr035-076/users-supplemental-results.json) | PASS；长名reader额外覆盖双引擎双语320/390/900/1440 |
| CR033；PAGE-103；CAP-105/106；DATA-003/004/006/009；API-103 | 真额度有限/零/无限/admin null；窗口/active/退款/降额归零、换组确认、非法字段拒绝、改密204/两会话401/旧密码401新密码200 | [api](./evidence/cr030-cr035-076/api-results.json)、[supplemental](./evidence/cr030-cr035-076/users-supplemental-results.json) | PASS；6计量为手工夹具，不是AI调用 |
| CR033；PAGE-103；CAP-105；API-103 | PUT提交成功但响应丢失，GET对账且不重放写操作 | [lost-response](./evidence/cr030-cr035-076/lost-response-results.json) | PASS；完整混合版本矩阵仅历史，不算本轮 |
| CR035；PAGE-102；CAP-103/021；DATA-006/008/018；API-102 | 四组空/3模型、两引擎双语6宽度；实际8px gap/0文字偏移，选择/取消/键盘、0/7/不限、清空恢复真实保存/重载 | [plans](./evidence/cr030-cr035-076/plans-results.json)、[观察](./evidence/cr030-cr035-076/plans-observations.json) | 字段布局和指定保存PASS；不代表下行状态提示PASS |
| CR036；PAGE-102；CAP-103/021；DATA-006/008/018；API-102 | Guest全部模型/篇幅为空，额度0及5保存/刷新；双引擎双语390/1440；与批准invalid原型对照 | [零额度](./evidence/cr030-cr035-076/plans-warning-results.json)、[有限额度](./evidence/cr030-cr035-076/plans-warning-finite-results.json) | FAIL；16局部失败属于一个缺陷；其他空组合未独立确认 |
| CR029/032；PAGE-001/002/003/005/006/007/008/009；CAP-001–005/021；DATA-003/004/018；API-001/003 | 首页Review、品牌、44px日期、注销文案色；五类原地访客引导、SSR/浏览器私有请求隔离、认证返回/错误/账户语言优先/退出 | [visual](./evidence/cr030-cr035-076/visual-results.json)、[flows](./evidence/cr030-cr035-076/flows-results.json) | PASS；未真实注销账号 |
| CR034；PAGE-007；CAP-017/020/021；DATA-012/014/015；API-008 | 旧库/空/暂停仍可选日期、上海单日3批6词；空有切换/错误重试/迟到/422、创建201/范围复用/单篇并存、跨刷新随机顺序、时区初始范围 | [range-flows](./evidence/cr030-cr035-076/range-flows-results.json) | PASS；均真实合成库与API |
| CR034；PAGE-007；CAP-017/021 | 空/非法/失败实时原型对照；Chromium390/901/1080/1081/1440、WebKit901/1080/1081，双语 | [range-matrix](./evidence/cr030-cr035-076/range-matrix-results.json) | PASS；本轮未真实200%缩放 |
| PAGE-008；CAP-018–022；DATA-013–016；API-008 | learn/learned/learning独立填写、重复提示全隐藏、同源匿名颜色稳定、错误纠正、不重叠、日期/单篇成功总结 | [review-regression](./evidence/cr030-cr035-076/review-regression-results.json) | PASS；合成内容不验证真实模型输出质量 |
| PAGE-101；CAP-101/102/021；API-101 | 标题/副标题、停用状态/引用计划数/编辑文案、Add/Edit/Replace key局部样式 | [regression](./evidence/cr030-cr035-076/regression-final-results.json)、[models](./evidence/cr030-cr035-076/models-list-corrected-results.json) | PASS；不调用模型、不提交真实密钥 |
| PAGE-005；CAP-012/020/021/022 | 六统计标签、空态与批准原型 | [regression](./evidence/cr030-cr035-076/regression-final-results.json) | PASS限文案/空态；全统计生命周期未重测 |
| PAGE-103/007/008；跨页非功能 | 定向键盘/焦点/作用域Axe；列表/详情各20次本地GET计时 | [supplemental](./evidence/cr030-cr035-076/users-supplemental-results.json)、[api-edge观察](./evidence/cr030-cr035-076/api-edge-observations.json) | 局部PASS；真机、VoiceOver、Firefox、公网负载NOT RUN |
| PAGE-004；CAP-006–011；真实AI | 本轮不使用历史密钥、无启用模型、无真实供应商请求 | [环境](./evidence/cr030-cr035-076/environment.json)、[清理前数据](./evidence/cr030-cr035-076/pre-cleanup-data.json) | NOT VERIFIED；发布门BLOCKED |

不重跑开发unit/lint/type/build，不累计历史轮次断言数。批准Profile和全部上游设计/API未修改。当前CR029–036均open；旧7项进展通过不等于关闭，新增CR036待守门器同步。6001没有更新，UAT清单为后续待执行。
