---
milestone: M003
stage: uiux-design
role: uiux/base
agent_name: designer-tony
status: awaiting_user_review
version: M003-UI-14
current_scope: pronunciation
date: 2026-10-15
---

# M003 单词发音 UI/UX 交接

designer-tony 已完成 M003-UI-14 单词发音的独立交互原型与完整正式设计，当前等待用户评审。本交接不批准设计、不进入技术/实现，也不表示 M003 整体收尾。

## 使用的输入与确认闭环

- 已接受上游：[M003-PRODUCT-11](../product/pronunciation/overview.md)、[TRANSITION-M003-107](../reviews/pronunciation-design-entry-107.md)。用户已确认词典优先/浏览器兜底、PAGE-401～403 三个入口、所有用户免费且不扣造文额度；本轮没有需重问的业务假设。
- 视觉/交互基线：M002、M003-UI-11/UI-12/UI-13-R4；实际核对 `WordPicker.vue`、`GenerationVocabularyList.vue`、`GenerationContent.vue`、`GenerationWorkspace.vue`、`library/[batchId].vue` 及现有主题。
- 锁定 Profile `consumer-ai-web@1.0.0`；requested `gpt-5.6-sol/high`，actual model/usage unknown。
- 纠正边界：发音属于 M003；M003 closeout `not_approved`。旧 M004 文件只作历史来源，不是当前产物入口。

## 本次产物

- 当前唯一规格：[design/pronunciation/design-spec.md](../design/pronunciation/design-spec.md)
- 交互与 Motion：[interactions.md](../design/pronunciation/interactions.md)
- 响应式/无障碍：[responsive-accessibility.md](../design/pronunciation/responsive-accessibility.md)
- 精确文案：[copy.json](../design/pronunciation/copy.json)；局部继承样式：[theme.css](../design/pronunciation/theme.css)；共用确定性控制器：[controller.js](../design/pronunciation/controller.js)
- 独立交互原型：[prototype/index.html](../design/pronunciation/prototype/index.html)
- 完整正式设计：[formal/index.html](../design/pronunciation/formal/index.html)
- 浏览器报告：[M003-UI-14-browser.json](../design/pronunciation/evidence/M003-UI-14-browser.json)；390px 长词定向报告：[M003-UI-14-long-word.json](../design/pronunciation/evidence/M003-UI-14-long-word.json)；源快照/哈希：[M003-UI-14-source-manifest.json](../design/pronunciation/evidence/M003-UI-14-source-manifest.json)

主 `design-spec.md`、`interactions.md`、`responsive-accessibility.md` 已增加唯一当前范围指针；旧 UI13-R4 主体继续作为生成视觉基线。旧 `design/theme.css`、`copy.json`、`prototype/**` 与 4174 预览未修改。

## UI 交付与接收

仓库根目录运行：

```sh
python3 -m http.server 4175 --bind 127.0.0.1 --directory .planning/milestones
```

当前预览 PID `1513`：

- 原型：<http://127.0.0.1:4175/M003/design/pronunciation/prototype/>
- 正式稿：<http://127.0.0.1:4175/M003/design/pronunciation/formal/>

正式稿完整入口：`?page=picker|plan|result|library&lang=zh|en&scenario=dictionary|fallback|gesture|unavailable|accent`；`menu=1` 可打开代表性双口音菜单。`?page=picker&lang=en&scenario=dictionary&longwords=1` 是 390px 长词布局的定向设计检查入口。底部状态演示默认收起且不属于产品。

前端接收从 UIA-M003-439～450 开始：PAGE-401 把候选行播放与添加拆为独立动作；PAGE-402/403 只在现有词标题旁增加播放组；单一活动播放、迟到隔离、离页取消、真实来源、显式口音替代与有限失败终态均为必须结果。正式稿使用现有导航、设置 select、工具台、760px 阅读列、UI11 词义和已收藏文章卡片；不得用交互原型的实验台外观替代。

## 验证与证据

- 模式：设计需求验收；最终浏览器检查 `12/12 PASS`，console/page error `0`，provider call `0`。
- 覆盖：1440/390、中文/英文、正常/双单口音/回退/手势/完全失败/跨词取消/键盘/Escape/reduced motion、PAGE-401～403、移动 44px 与零横溢。
- 原完整矩阵保留 `12/12 PASS` 与 5 张截图；本轮没有重跑该矩阵。仅对受影响路径补做 390px 长词检查，`4/4 PASS`，并目视第 6 张截图：普通 `communication` 文本 client/scroll width 为 `110/110px`，带菜单 `pronunciation` 为 `99/99px`；两者 token 均为 `316×52px`，所有播放、菜单和删除目标均为 `44×44px`，横向溢出为 `0`。该通用单列/可换行规则不依赖测试词。
- 失败记录分别保留为 `browser-run-00-infra-failed.json`、`browser-run-01-failed.json`、`browser-run-02-failed.json`、`browser-run-03-failed.json`、`browser-run-04-check-failed.json`；最终报告没有覆盖失败原因。
- 本证据只证明设计演示，不证明真实音频、网络、许可、设备支持、声学质量、Vue/API、生产 QA 或 UAT。

## 文档整理

- 当前权威入口：本交接 → `design/pronunciation/design-spec.md`。主设计三文档只留当前范围指针，UI13-R4 原正文未删除。
- 设计入口前快照：`reviews/evidence/pronunciation-design-entry-107/before-design-entry.tar.gz`。当前源快照和逐文件 SHA 在 pronunciation evidence；冻结证据未覆盖。
- 稳定编号检查：DATA-401～404、CAP-401～404、PAGE-401～403、AC-401～410 均映射；新增设计验收 UIA-M003-439～450。

## 未决事项与风险

- `OPEN-401 / backend-alex`：候选音频来源使用条件、署名与限制。
- `OPEN-402 / backend-alex + frontend-bob`：目标环境网络、真实词典音频及代表词验证。
- `OPEN-403 / frontend-bob`：浏览器/设备范围、voices 延后、手势、有限等待、取消与失败技术契约。
- 若技术结果不能满足双路径或口音真实性，返回产品/设计修订；不得以本原型的确定性状态宣称真实能力。

## 下一步建议

先由用户审阅 M003-UI-14 的原型与正式设计。若用户明确接受本设计阶段，再由 gatekeeper 按现有 M003 流程检查并决定是否进入技术设计；未获得该批准前不启动技术/实现。M003 整体收尾仍需另行明确授权。

> 本交接单不能切换阶段。阶段迁移必须由用户显式提交给守门器。
