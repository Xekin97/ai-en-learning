---
milestone: M001
stage: verification
role: quality/base
agent_name: qa-quinn
date: 2026-09-03
verdict: fail
---

# PAGE-103 用户管理列表专项审计

## 复核原因

用户质疑最终验证是否漏测用户管理列表。复查原有 `v13-final-retest.mjs` 后确认：旧脚本覆盖了初始、loading、20+3 分页结果、普通排序、单/空/错和详情返回，但没有验证精确匹配置顶、加载更多过程中的结果保留/焦点、720px 与原型对照，也没有独立核验长用户名和列表隐私字段。旧 PAGE-103 整体 PASS 结论过宽。

## 环境与方法

- 应用：`http://localhost:6001`
- 原型：`http://localhost:6010/prototype/index.html`
- 脚本：`verification/evidence/page103-list-audit.mjs`
- 使用 25 个独立测试账号，包括精确用户名、字典序更早的包含用户名、22 个分页账号和一个 32 字符用户名。
- 对 cursor 请求注入 900ms 延迟，观察真实追加 loading DOM 与焦点，而不是只检查最终行数。
- 视口：320、390、720、1440px；并切换 en-US → zh-CN，执行结果态 Axe 扫描。

## 稳定结果

**11/15 PASS，4/15 FAIL。**

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| 初始不预载全站用户 | PASS | 0 个 list request、0 行 |
| 初次搜索 loading | PASS | 3 个骨架、0 结果行 |
| 精确匹配置顶 | FAIL | 搜索 `qeky2nak`：`aqeky2nakz` 第一，精确账号第二 |
| 其余用户名忽略大小写排序 | PASS | 结果顺序稳定 |
| 搜索后焦点进入结果标题 | PASS | active=`admin-user-results-title` |
| API 列表字段最小化 | PASS | 仅 id、username、role、plan_code、status、created_at |
| 行语义、单一操作、用户名可访问名称 | PASS | 每行 role=listitem、仅 1 个 tabbable，“查看”名称包含用户名 |
| 加载更多保留已有行 | FAIL | 延迟期 rows=0、skeletons=3，已有 20 行消失 |
| 追加无重复 | PASS | 25 行、25 个唯一用户名 |
| 加载更多焦点 | FAIL | 延迟期及完成后均落到 BODY |
| 长用户名/页面溢出 | PASS | 4 个视口 documentWidth=viewport，32 字符用户名位于行内 |
| 320/390 布局 | PASS | 操作按钮宽度随行展开，无横向溢出 |
| 720px 批准布局 | FAIL | 实际按钮约 71/670px；原型约 537/670px，实际仍是四列桌面布局 |
| 语言切换保留查询与 25 行 | PASS | zh-CN 后查询和加载结果不丢失 |
| 结果态 Axe | PASS | serious/critical=0 |

## 已有其他证据仍有效

`v13-final-retest.mjs` 已验证单结果不自动跳转、无结果、可重试错误、20+3 最终追加、详情返回查询与所选行焦点；`revision-e2e.mjs` 已验证换组、密码重置、账号删除及只读权限边界。这些通过项不抵消本专项的 4 个失败。

## 责任判定

- 精确匹配置顶：设计与 API 排序合同不一致，必须先回 technical-design，登记 CR-021。
- 加载更多结果/焦点及 720px 实际布局：实现偏离批准交互与原型，登记 CR-022。

## 截图

- `screenshots/page103-list-audit/actual-loading-more.png`
- `screenshots/page103-list-audit/actual-results-320.png`
- `screenshots/page103-list-audit/actual-results-390.png`
- `screenshots/page103-list-audit/actual-results-720.png`
- `screenshots/page103-list-audit/actual-results-1440.png`
- `screenshots/page103-list-audit/prototype-results-720.png`

