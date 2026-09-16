---
milestone: M001
stage: verification
role: quality/base
agent_name: qa-quinn
date: 2026-09-02
status: reproduced
---

# 最终 UAT 问题复现证据

## 结论

用户报告的 9 项原始问题均成立，并按共同责任与修复路径归并为 5 个变更请求。前一轮自动 UI 审计没有覆盖认证引导中间态、模型弹窗完整结构、精确 admin 固定文案/间距以及用户列表设计完整性，先前 UI PASS 结论已撤销。

## 复现结果

| 项目 | 实际 | 期望/真源 | 结论 |
| --- | --- | --- | --- |
| 同词空位分组 | 正文空位只含 `kind`、`blank_id` | 同一词原型空位应有不泄漏拼写的匿名分组 | 产品合同缺口，CR-015 |
| 填空行距 | 行高 32.1408px，输入高 37.3125px | 各视口不重叠且可辨识同组 | 设计缺口，CR-016 |
| 访客 `/review` | 直接到 `/login?redirect=/review` | 先显示批准 auth gate | 实现偏差，CR-017 |
| 访客 `/library` | 直接到 `/login?redirect=/library` | 先显示批准 auth gate | 实现偏差，CR-017 |
| admin 页眉 | `ADMIN` | `ADMIN WORKSPACE` | 实现偏差，CR-018 |
| Add/Edit model | 3 文本输入，0 switch，0 warning | 3 文本输入，1 switch，1 warning | 实现偏差，CR-018 |
| Replace key 输入背景 | rgb(238, 232, 220) | rgb(255, 255, 255) | 实现偏差，CR-018 |
| Plans 模型标题间距 | 0px | 8px | 实现偏差，CR-018 |
| Plans 保存文案 | `Save` | `Save changes` | 实现偏差，CR-018 |
| 用户管理列表 | 运行页 17 行；无批准列表态 | PAGE-103/CAP-104 需要搜索结果设计 | 设计缺口，CR-019 |

## 复现方法与边界

- 运行应用：http://localhost:6001；批准原型：http://localhost:6010/prototype/index.html。
- Playwright 复现脚本：`verification/evidence/uat-final-findings.mjs`。
- 管理弹窗和 Plans 数据直接读取运行页与原型的 DOM、computed style 和几何。
- 短文空位字段来自真实多目标复习 attempt；布局值通过运行前端真实 CSS 下的 390×844 探针测得。
- 用户观察到的实际重叠是 UAT 判定事实；几何测量说明现有行盒比输入框矮，支持其重叠风险。
- 脚本未写入共享 UAT 学习者数据；管理员界面语言在检查结束后恢复为 zh-CN。

## 截图

- `screenshots/uat-final-actual-add-model.png`
- `screenshots/uat-final-prototype-add-model.png`
- `screenshots/uat-final-actual-edit-model.png`
- `screenshots/uat-final-prototype-edit-model.png`
- `screenshots/uat-final-actual-replace-key.png`
- `screenshots/uat-final-prototype-replace-key.png`
- `screenshots/uat-final-cloze-mobile.png`
