---
milestone: M001
stage: implementation
role: frontend-implementer/base
agent_name: frontend-claire
status: awaiting_user_review
date: 2026-09-02
change_requests:
  - CR-013
  - CR-014
---

# M001 全站 UI 返工实现审计

## 结论

CR-013 与 CR-014 的实现修订已完成，开发期结论为 **PASS**。运行中的 Nuxt 前端已按批准原型重构 PAGE-001–009、PAGE-101–103；中文、英文、桌面和 390px 移动端均完成实际页面与原型对照。动态用户名、模型、生成内容、统计值和批次数量来自真实 UAT 数据，不以原型演示值替代。

## 逐页修订覆盖

| 页面 | 对齐结果 |
| --- | --- |
| PAGE-001 | 批准 SVG Logo、品牌、三条访客导航、主标题、CTA、词语视觉和 01/02/03 流程卡均与原型一致 |
| PAGE-002/003 | 恢复两栏认证布局、叙事列、标题层级、辅助文案和 quiet link |
| PAGE-004 | 恢复紧凑编号表单、绝对定位词语候选层、四组阅读偏好、额度条及生成空态/流式态/成功态 |
| PAGE-005/006 | 恢复六项统计、搜索工具栏、批次行、直接单篇复习、参与复习 checkbox、短文/主题/目标词/偏好详情和删除弹窗 |
| PAGE-007/008 | 恢复日期范围卡、续接提示、乱序复习来源、阶段一提示开关与单答案、阶段二多空输入及汇总结构 |
| PAGE-009 | 恢复账号信息与危险区双栏；修改密码、注销确认均按需进入原生 modal dialog |
| PAGE-101 | 恢复密钥卡、模型列表；密钥、新增和编辑模型均按需进入 dialog |
| PAGE-102 | 四方案改为单方案页签，仅渲染当前方案表单 |
| PAGE-103 | 恢复用户检索、详情、只读学习记录；换组与重置密码均按需进入 dialog |

## 品牌、文案与视觉结果

- 中文只显示“词涟”，英文只显示 `WordWeave`；两种语言均使用批准的交织线 SVG Logo。
- 首页桌面关键盒模型与原型一致：header `1440×72`、hero `1440×953`、hero grid `1168×497`、path grid `1168×208`。
- 首页 390px 移动端关键盒模型与原型逐项一致：header `390×72`、hero `390×1627`、hero grid `358×811`、path grid `358×656`。
- 造文页实际 UAT 仅配置 1 个模型，原型展示 2 个模型，因此桌面/移动端表单高度分别少 43px；其余标题、控件、栅格、字体与状态结构一致。这是允许的动态配置差异。
- 英文 PAGE-001–009、PAGE-101–103 及移动首页/造文页均为 `viewportOverflow: 0`，没有越界元素；长模型名继续由容器内换行处理。
- 关闭的 dialog 不留在页面语义树中，避免隐藏标题污染页面层级；打开时使用原生 modal、可访问标题、Escape 和遮罩关闭行为。

## 控件样式与图标结果

- 中英文实际页面扫描中，可见带下划线链接仅有 `.skip-link`；导航、身份胶囊、认证辅助动作、批次动作和管理员链接的 `text-decoration-line` 均为 `none`。
- 未使用全局 `a { text-decoration:none }` 覆盖正文链接；归一化仅施加到设计系统控件类。
- `☰`、`⌕` 等原始字符图标已从前端源码移除，头部、搜索、管理导航、删除、退出等动作统一使用批准 SVG 图标组件。
- hover、focus-visible、aria-current、disabled 状态沿用批准 theme token；Axe 桌面/移动端扫描没有 critical 或 serious 发现。

## 自动化与运行证据

| 检查 | 结果 |
| --- | --- |
| `pnpm format:check` | PASS |
| `pnpm lint` | PASS，0 error / 0 warning |
| `pnpm lint:boundaries` | PASS，66 modules / 46 dependencies |
| `pnpm typecheck` | PASS |
| `pnpm test` | PASS，5 files / 14 tests |
| `pnpm test:e2e` | PASS，desktop + mobile 18/18 |
| Node 24 Docker production build | PASS；镜像内 typecheck、lint、boundaries、unit、Nuxt build 全部通过 |
| UAT runtime | PASS；frontend/backend/nginx/postgres healthy，`/`、`/api/v1/bootstrap`、`/health/ready` 均为 200 |
| 中英文视觉扫描 | PASS；0 横向溢出、0 控件下划线泄漏、品牌/标题/字体与原型一致 |

## 截图证据

- 中文实际/原型：[`screenshots/ui-rework/`](screenshots/ui-rework/)，29 张，覆盖 PAGE-001–009、PAGE-101–103、管理员用户列表/详情及首页/造文移动端。
- 英文实际/原型：[`screenshots/ui-rework-english/`](screenshots/ui-rework-english/)，29 张，覆盖同一页面矩阵。
- 批次、用户、模型、统计和短文内容的差异均来自 UAT 数据；页面结构、控件位置与视觉层级不因数据差异而改变。

## 实现边界

- 保持 API → strict schema / mapper → runtime store → presentation 的既有边界；本轮页面没有直接引用 infrastructure DTO。
- 没有修改 API v1.2、后端领域行为、数据库或 UAT 业务数据。
- 本报告只提交实现阶段结果；CR 的独立验收仍由 verification 角色在用户批准阶段迁移后执行。
