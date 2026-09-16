---
milestone: M001
stage: verification
role: quality/base
agent_name: qa-quinn
status: awaiting_user_review
date: 2026-09-06
verification_round: TRANSITION-M001-078
verdict: passed_for_functional_uat
functional_uat: ready_for_local_preparation
release_readiness: blocked
---

# QA078需求—验证覆盖

[报告](./cr036-078-report.md)及原始结果为本轮结论，不沿用旧轮数字。全部指定行为PASS，真实AI发布边界保留。

| 追踪 | 独立范围 | 证据 |
| --- | --- | --- |
| CR036；PAGE102；CAP103/021；DATA006/008/018；API102 | 原双空0/5，两引擎双语390/1440；四组仅无模型/仅无篇幅/仅零/有效/不限/双空不限、编辑保存重载、live locale、500/恢复、原型样式/Axe | plans-warning、plans-warning-finite、plans-expanded |
| CR035；PAGE102；CAP103/021；API102 | 两fieldset gap8/offset0；空/3模型，四组，双引擎双语6宽度，键盘、0/7/不限保存 | plans |
| CR030；PAGE103；CAP104/021；DATA003/018；API103 | 搜索前/空/加载/失败双引擎双语8宽度2高度；长/短名详情完整/徽章/无溢出/返回 | users-matrix-neutral、focus、detail-capture |
| CR030/031；PAGE103；CAP104/107/021；DATA012/013；API103 | 45行三页/追加错误/精确置顶/游标scope/SQL权限；40行返回/焦点/滚动、正确批次只读modal/深链/历史/迟到/长短文/关闭键盘 | api、api-edge、flows、users-supplemental、long-reader、visual |
| CR033；PAGE103；CAP105/106；DATA003/004/006/009；API103 | 真实额度各联合分支/计量退款/换组、改密204旧会话401、丢响应对账不重放 | api、users-supplemental、lost-response |
| CR029/032；PAGE001–003/005–009；CAP001–005/021；DATA003/004/018；API001/003 | 首页Review/44px日期/注销、五类访客原地引导、认证返回/语言/隐私隔离 | visual、flows |
| CR034；PAGE007；CAP017/020/021；DATA012/014/015；API008 | 旧库空库暂停日期、同日边界、失败/迟到/422、创建/复用/恢复/随机顺序、时区；关键1080断点空/非法/失败原型对照 | range-flows、range-matrix |
| PAGE008；CAP018–022；DATA013–016；API008 | 重复短语、多词形独立填写、匿名同源颜色、错误纠正/不重叠、单篇/范围成功总结 | review-regression |
| PAGE101；CAP101/102/021；API101 | Models标题/列表状态/引用/编辑、Add/Edit/Replace key局部样式 | regression-final、models-list-corrected |
| PAGE005；CAP012/020/021/022 | 六统计标签和空态；非完整统计生命周期 | regression-final |
| 非功能 | 定向键盘/Axe/焦点和本地20次API采样；非真机/读屏/真实200%/公网压测 | 各脚本，范围见报告 |
| PAGE004；CAP006–011；真实AI | 未调用供应商、未使用凭证、仅合成批次 | NOT VERIFIED；不阻塞本轮修复的功能UAT准备，发布门BLOCKED |

每个脚本的可点击原始结果见[报告索引](./cr036-078-report.md)。前端固定8fe04108、后端e8c4ee91，不复跑开发unit/lint/type/build。
