---
milestone: M001
stage: verification
role: quality/base
agent_name: qa-quinn
status: awaiting_user_review
date: 2026-09-07
verification_round: TRANSITION-M001-081
verdict: fail_rework_required
---

# QA081 需求—实现—验证覆盖

基线及原始计数见[报告](./cr037-081-report.md)，执行计划见[PLAN](./evidence/cr037-081/PLAN.md)。只声明本轮实际覆盖，不覆盖历史全部功能。

| 追踪 | 场景 | 证据 | 结论 |
| --- | --- | --- | --- |
| CAP002/003/021; PAGE002/003/007; API001/002; DATA003/004 | 原反馈认证提示顺序、首元素、role、文案、局部几何样式，中英×390/1440×Chromium/WebKit | original-retest、independent-chromium-fixed、independent-webkit-linux | PASS |
| CAP002/003/021; PAGE002/003/005/006/007/009 | 5类安全目标、往返、刷新、非法/无目标、错误/语言切换、无溢出 | 两引擎independent结果 | PASS |
| CAP002/003; API002; DATA003/004 | 真实注册/登录返回；管理员分流；账户语言优先；不自动发起复习 | flows-chromium的45项、flows-webkit | PASS |
| CAP011/021; API005/006; DATA017/018 | 有效claim优先于普通提示，往返保留，刷新丢失，token不进URL/存储 | claims-chromium、flows-webkit | PASS（仅前端HTTP契约fixture，不证明AI或服务端消费） |
| CAP004/021; PAGE009; API003; DATA003/004 | 本人改密中英十组文字、共享注销说明；字段无重叠、弹窗容纳 | 原型对照及双引擎independent结果 | PASS |
| CAP004; PAGE009; API003 | 空/不一致禁用；初始焦点、Tab、Escape/取消/成功恢复触发焦点；重开清空 | chromium-fixed、webkit-recheck | PASS |
| CAP004/021; PAGE009; API003 | 当前密码错误可感知、可继续修正 | 两引擎中英截图、modal-accessibility原生AX | FAIL，CR037-03 |
| CAP004; API003; DATA003/004 | 204成功、当前会话保留、其他会话撤销、旧密码拒绝、新密码成功、失败保持会话 | 双引擎真实UI+account-api | PASS |
| CAP004; API003; API全局§1.3/1.6 | 204空体、无Content-Type、no-store | account-api、residual-proof响应头 | 前两项PASS，no-store FAIL / CR038 |
| CAP004/005; PAGE009 | 注销共享确认说明及打开/关闭 | 双引擎independent结果 | PASS；未执行不可恢复注销 |
| 技术前端§14–16; PAGE002/003/009 | 键盘、Axe serious/critical、hydrate错误、390/1440溢出 | 双引擎independent结果 | 正常/认证错误态适用项PASS，账号错误态另列FAIL |
| 平台兼容 | macOS WebKit完整账号复验 | native-webkit-control、independent-webkit-macfull | NOT VERIFIED；简易输入控制PASS但完整流程原生异常退出 |
| 安全/边界 | 当前role/profile/审批摘要、3398文件、0真实AI、UAT不变、隔离数据销毁 | baseline、environment、cleanup、delivery-validation | PASS，以最终完整性记录为准 |
| 本轮未测 | 全站视觉、旧CR全部、真实AI、压力/Lighthouse、原生Safari设备、服务端claim消费 | 无新增证据 | NOT RUN / NOT VERIFIED，不外推PASS |

## 下一轮独立复验与人工UAT准备

以下是待修复后使用的清单，**不是本次UAT已开放**：

1. 访客Review→登录→注册：提示位于标题前，中英文正确；返回目标不丢，登录不会自动开始复习。
2. 学习者本人Account→Change password：逐字对照既有设计，手机无挤压/遮挡。
3. 错当前密码：弹窗内能清晰读到安全错误，键盘/辅助技术可感知；保留可修改字段，修正后能够成功。
4. 取消/ESC再打开：密码清空、焦点返回；没有不属于当前尝试的陈旧错误。
5. 用新的可重建合成账号验证成功改密、当前会话保留/其他会话撤销，绝不替用户改UAT真实密码。
6. 检查成功204空体、无Content-Type、no-store，并回归共享204 helper消费者；删除测试只作用合成数据。
7. 保留有效claim优先、管理员分流、共享注销文案回归。真实AI和macOS/Safari平台缺口独立列明。
8. 开发交付后qa-quinn独立复验；通过后才办理新UAT准备/部署。最终功能接受属于用户。
