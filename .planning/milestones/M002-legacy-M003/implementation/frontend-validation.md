---
milestone: M003
stage: implementation
role: frontend-implementer/base
agent_name: frontend-claire
status: developer_verified_awaiting_user_review
date: 2026-10-14
source_version: M003-TECH-04 / M003-UI-13-R4 / M003-BE-08 / CR-311 / CR-312
transition: USER-M003-CR311312-FRONTEND-NEXT-20261014
---

# M003 CR-311/312 前端开发期验证

## 结论与边界

CR-311/312 的前端有界实施已完成并通过开发期验证，建议根代理接收为 `awaiting_user_review`。CR 保持 open；本报告不宣称独立 QA、真实 provider、文章质量、真实 UAT3015 或部署通过，也未启动后续 QA/UAT。

本轮以 gate 102 的 325 项精确当前前端为基线，不以 Git HEAD 的整份 dirty diff 冒充本次改动。旧 CR-310 当前报告与交接原件保存在 `reviews/evidence/cr311-312-frontend-entry-102/before.tar.gz`，前端修前源码保存在同目录 `frontend-before.tar.gz`。最终差异为 35 项前端文件（26 项相对基线修改、9 项新增、0 删除）；797 项后端、产品、设计与技术保护输入逐项哈希未变。

浏览器验证只使用隔离本地 Nuxt 与 v6 合成合同流，没有访问或改变 3013/3014/3015、4174，没有真实 provider 调用、DB 迁移、seed/reset、额度或模型配置变化。

## 实施结果

- 普通生成与 PAGE-212 preview 均由严格 `m003-stream-v6` schema、DTO mapper、应用 state 和 selector 进入 Vue；preview 保持独立 `lastPreview/stale/ready`，没有把后台 generation 当普通生成处理，也没有 v5 兼容分支。
- 共享纯 draft reducer 管理 `working/published`、initial/replace/append/restore/discard、rev/seq/source/epoch 和 Q02。半段只进入 working；`paragraph_complete` 公开完整段，`body_complete` 公开完整正文但不授予 valid/save；权威 Result 到达后同步正文与段落。码点 edit 保留已提交前缀，允许合法短稿删除未提交尾部，并用已提交边界及单调 edit cursor 避免每片从全文起点扫描。
- 普通与后台 store 对 cancel、failed、protocol failure、pending/EOF、`status=valid/result=null`、新 epoch 和 authoritative result 使用同一清理/冻结边界，旧 draft、activity 或 presenter callback 不会复活。
- 共享 presenter 将 received 与 displayed 分离：首 grapheme 同步出现，基础 36 grapheme/s，固定 650ms backlog deadline，单一 rAF、每帧至多一次 patch；支持 combining/ZWJ 尾部原子重组、Segmenter fallback、hidden catch-up 和 reduced motion 直显。确定性 scheduler 测试直接比较 60Hz/120Hz 在相同 100ms 的显示前缀、36/s floor、固定 deadline 及 combining/ZWJ 原子尾。body complete、返修 begin、finalizing、validated 同步 flush；host identity、`isConnected` 和 epoch 阻止旧回调写入。
- `GenerationContent` 在普通与 preview 复用稳定 passage/paragraph/status 节点。新 Plan/正文区域和新词义行只对新稳定 key 做 180ms 入场；返修变化段做真实 220ms 文本/高度交接，旧尾做 180ms inert/`aria-hidden` 退场，Plan 在 valid 时做 240ms opacity/height 收拢。语义文本不等待动画；reduced motion 不加进入 class、ghost 或 caret。
- 阅读锚点只补偿首个实际可见保留段的 top 差，未改段、selection 和 Generate/Cancel 原按钮身份保持。按钮在 stream 中原位变 Cancel，终态恢复 Generate；仅当原焦点仍应返回且 activeElement 尚未移走时回焦，不夺取用户新焦点。
- 原 UI12 `AppDialog` 仍只在下一次 Generate 弃稿时打开；valid 后配置可编辑，旧 Result 稳定。PAGE-212 只有一行 Preview/status 标题，不重复 Draft 标题或 streaming notice；后台 body complete 不越过关联 GET 的 publish-ready 边界。
- WordPicker 只消费 API004 后端候选，未复制 41 项目录、短词规则或旧目标追溯拒绝。最终补充的 mapper/store 单测直接断言 `theater/another` 原样映射、`no_candidates` union 与反馈、旧 selected `the` 在新候选到达后仍进入 generation request；全 41 项和 SQL 先过滤仍引用 BE08。同步保留 UI11 词义结构、UI12 再生成行为和 UI13-R4 批准文案/theme/source hash。

## 原型与运行时定位

已实际打开并对读批准原型：

- 中文桌面 create：`/M003/design/prototype/?page=create&lang=zh&scenario=ui13-r3-bookshop&event=11&demo=open&rev=ui13-r4`
- 英文 390px PAGE-212：同一原型的 `page=presets&lang=en` 入口
- 源：`design/prototype/index.html`、`app.js`，以及 `design/theme.css`、`copy.json`、`interactions.md`、`responsive.md`

| 区域 | 批准原型 | 实际应用 locator | 直接核验 |
| --- | --- | --- | --- |
| 主结果区 | `#generation-status .m003-result-body` | `[data-region="generation-result"] .m003-result-body` | 同一容器贯穿 Plan、正文、终态 |
| Plan | `#planning-preview`, `[data-plan-kind]` | 同名节点与 `.m003-vocabulary-list` | 180ms 新节点入场；240ms inert/aria-hidden 退场与高度收拢 |
| 正文 | `#live-draft [data-paragraph-index]` | `#generation-content-passage [data-paragraph-index]` | received/displayed、3 改 1 不改、节点身份、220/180ms、高度与可访问旧层 |
| 状态 | `[data-stream-status]` | `.m003-stream-status .m003-status-copy` | 单一稳定节点、精确双语 copy、160ms 轻淡换 |
| 动作 | `#generation-actions [data-action]` | `#generation-actions button` | 同一按钮 Generate→Cancel→Generate、焦点返回 |
| preview | `#preview-result .m003-result-body` | 同名应用节点 | 390px 英文、共享正文、独立 ready 资格 |
| UI12 | `#regenerate-confirm` | `#generation-confirm` AppDialog | 下一次 Generate 才确认；失败/取消保留既有边界 |

## FE4-V01–08 证据映射

| 验收 | 覆盖结果 | 证据 |
| --- | --- | --- |
| FE4-V01 | Search/Random 直接消费候选；`theater/another`、no_candidates 与旧 selected `the` 边界；全 41/SQL 资格不由前端少量样本代证 | `m003-generation-contract` schema/mapper 与 `generation-lifecycle` store/request 直接断言；浏览器只证明 create/PAGE-212 消费通路；全目录引用 BE08 |
| FE4-V02 | 双 namespace v6 schema→mapper→state；shorter/longer/continuation/unicode/CRLF/large paragraph/preview；working 半段隐藏 | 实施主线 449 项 checkpoint 中的 contract/reducer/fixture suites；最终新增断言未改 reducer |
| FE4-V03 | baseRev/rev/seq/source/range/重复/乱序、Q02 mid/after body、pending/EOF/result-null、cancel/failed/protocol 两 store 清理 | focused reducer/fixture、generation/admin lifecycle、cancel 浏览器 |
| FE4-V04 | 首 grapheme、两个真实时刻增长、36/s、60Hz/120Hz 等时前缀、650ms deadline、combining/ZWJ、fallback/reduced、hidden 到期追平 | `content-presentation` 确定性 scheduler 单测与 1440/hidden/reduced 浏览器 |
| FE4-V05 | 新区域/词义行 180ms，变化段 220ms、高度差，未改段稳定，旧尾 180ms，Plan 240ms；锚点/selection/focus | 1440 中文 MutationObserver/rAF/WAAPI 采样与 DOM identity；3 张代表图 |
| FE4-V06 | 同批控制信号 flush，新 epoch/terminal/cancel/unmount 清回调；preview 不越过关联 GET ready | presenter/store 单测、cancel/background、390 PAGE-212 |
| FE4-V07 | valid 后配置可编辑、下一次 Generate 才 UI12、请求顺序/竞争/pending 边界 | UI12 CR-310 浏览器 5/5 与 generation lifecycle |
| FE4-V08 | 精确双语状态/词义结构、无百分比/ETA/轮次、reduced 无 ghost/caret、运行包无 harness/timingProbe、R4 hash | locale/design sync、browser DOM、生产包搜索 |

## 最终执行矩阵

| 检查 | 结果 | 原始证据 |
| --- | --- | --- |
| v6 schema/mapper/reducer/two-store/scheduler/typing Vitest | 实施完整 checkpoint 45 files、449/449 PASS；最终只新增证据断言后受影响 3 files、46/46 PASS | [`02-unit.log`](evidence/cr311-312-frontend/02-unit.log)、[`12-accuracy-unit.log`](evidence/cr311-312-frontend/12-accuracy-unit.log) |
| UI12 受影响浏览器回归 | 5/5 PASS | [`03-ui12-regression.log`](evidence/cr311-312-frontend/03-ui12-regression.log) |
| CR-311/312 浏览器 | 5 PASS / 5 按 project 刻意 SKIP：1440 中文完整流、reduced、cancel、hidden、390 英文 PAGE-212 | [`10-browser-final.log`](evidence/cr311-312-frontend/10-browser-final.log)、[`browser-results.json`](evidence/cr311-312-frontend/browser-results.json) |
| Motion/DOM | 180ms 区域/新词行起中后采样；220ms 段高度两端不同；180ms 旧尾；240ms Plan opacity+height；稳定节点、3 改 1 不改、锚点 0、selection/focus 保持 | 同上；[`screenshots/`](evidence/cr311-312-frontend/screenshots/) |
| Node 24 typecheck | PASS，0 TS diagnostics；新增证据断言后再次 PASS | [`06-typecheck.log`](evidence/cr311-312-frontend/06-typecheck.log)、[`13-accuracy-typecheck.log`](evidence/cr311-312-frontend/13-accuracy-typecheck.log) |
| dependency boundaries | PASS | [`05-boundaries.log`](evidence/cr311-312-frontend/05-boundaries.log) |
| affected ESLint / Prettier | PASS；主线 ESLint 仅 CSS/JSON 无匹配配置的既有 warning；最终 3 个测试文件零 warning | [`04-eslint-final.log`](evidence/cr311-312-frontend/04-eslint-final.log)、[`07-format.log`](evidence/cr311-312-frontend/07-format.log)、[`14-accuracy-eslint.log`](evidence/cr311-312-frontend/14-accuracy-eslint.log)、[`15-accuracy-format.log`](evidence/cr311-312-frontend/15-accuracy-format.log) |
| production build | PASS | [`08-build.log`](evidence/cr311-312-frontend/08-build.log) |
| 运行包排除 | `.output/public` 与 app/current tests 无 `timingProbe`、`m003.harness`、`ui13-r4-bookshop`、`playback`，产品源码无 `m003-stream-v5` | [`09-runtime-exclusion.log`](evidence/cr311-312-frontend/09-runtime-exclusion.log) |
| 精确基线/保护集 | 26 modified + 9 new + 0 deleted；protected 797 changed 0 | `baseline-diff.json`、`protected-check.json` |

浏览器最终代表流直接确认：初稿首字符立即出现且 70ms 后增长；四段首稿中返修 3 段、第二段保持同节点同文本；长首段 220ms 高度 keyframes 两端不同；旧第四段只在 body complete 后作为 inert/`aria-hidden` 层退出；Plan 在 240ms 中点 opacity 与高度均处于两端之间；最终 passage/首段/未改段/第三段/status/button 均为原节点，selection 保持 `They learn together.`，阅读锚点 delta 为 0，按钮回焦。该浏览器合同 fixture 是前端隔离合成的 `adapt / They learn / Art` 场景，长首段专为产生真实高度差，不是 UI13-R3 的书店六词正文，也不作为设计文案一致性证据。390px 英文 preview 无横向溢出且只显示一个 Preview/status 标题，关联 GET 后才 ready。

## 失败与修正记录

所有浏览器建设期失败原日志保留在本证据目录，未覆盖为成功：早期运行暴露 fixture/locator 与短 motion 窗口采样问题，随后改为事件前安装 MutationObserver/rAF/WAAPI probe；真实终态 options refresh 曾造成按钮短暂 disabled/focus 丢失，改为等待实际 `canSubmit` 且只在原焦点尚未移走时恢复；高度样本改为前端 mock 中确有两行差的合成长 `adapt` 返修句，只验证高度 motion，不冒充批准书店样例；最后的入场补验首次发现首个词义子组件挂载未带 class，已在稳定 entry key 初次挂载及后续追加统一处理。取消回焦的一个复测在 dialog 两次 `nextTick` 完成前过早读 activeElement，最终测试等待既有 return-focus 合同后仍要求同一按钮聚焦，没有放宽产品断言。

原始失败：`00-browser-first-failure.log` 至 `00-browser-seventh-failure.log`、`00-browser-entry-failure.log`、`00-browser-entry-cancel-timing-failure.md`；调试运行：`01-browser-*.log`。修正后的最终证据为 `10-browser-final.log` 与 `browser-results.json`。

## 冻结与下一步

最终 35 项前端源码与四份交付原件（本报告、当前前端交接、CR-311/312 自有实施段）由 `source-manifest.json` 逐项哈希，并冻结在 `cr311-312-frontend-source.tar.gz`。`verification-summary.json` 记录命令结果和归档哈希。

建议根代理核验并将本前端实施交付接收为 `awaiting_user_review`。CR-311/312 仍保持 open；下一责任是否启动独立 QA 或 UAT 刷新由根代理与用户另行决定。
