---
milestone: M002
version: M002-UI-33-R3-TA1
status: proposed_frontend_reception_supplement
review_with: M002-FE-CR313-01
source_design: M002-UI-33-R3
source_backend: M002-BE-CR313-01
date: 2026-10-15
agent_name: designer-tony
---

# CR313 技术接收设计补充

## 状态与边界

本补充只关闭 frontend-bob 在 [FE501-08](../../../technical/config-portability/frontend.md#fe501-08-最小上游接收缺口与完成边界)登记的 FE313-U1～U3。准确后端来源是 [API 合同](../../../technical/config-portability/api.md)与 [FE313-B1 类型补充](../../../technical/config-portability/evidence/backend/FE313-B1-clarification.md)，视觉与交互宿主仍是已冻结的 M002-UI-33-R3。

新增文案真源是 [technical-alignment/copy.json](copy.json)。本文件与该 copy 必须随 M002-FE-CR313-01 一起审阅；它们没有回写或重新冻结 UI33-R3，也不能借 UI33-R3 已批准状态被视为已批准新增内容。本补充不增加页面、入口、确认步骤、人工映射或恢复能力，不改变 API、产品规则或原型。

## U1 · 动态参数与空缺规则

冻结 copy 中的固定样例只继续服务原设计演示。生产接收按下表替换；所有参数进入文本节点，禁止 `v-html`。

| 旧来源 | 生产来源键 | 参数与空缺规则 |
|---|---|---|
| static `import.fileSelected` 固定文件名 | template `import.fileSelected` | `filename` 取浏览器 File.name 的显示值，只作文本渲染并允许换行；空名称使用 `import.fileSelectedFallback`。不得显示本地路径。导出反馈的文件名取已校验 Content-Disposition 安全文件名，同样空缺回退。 |
| template `preview.fileMeta` 在解密前显示固定项数 | template `preview.encryptedFileMeta` | 解密前只显示固定类别和外层格式版本，不显示条目数。预览成功后才使用原 `preview.fileMeta`，其中 `items=added+updated+removed+unchanged`，不从 DOM、类别固定数或 fixture 读取。 |
| static `preview.credentials` 固定 3 | template `preview.credentials` | `count` 是合法 Preview changes 中 `kind=connection` 且 `credential_action=replace_from_package` 的连接数量。models 的 canCommit 预览若无法得到非负整数，按合同响应错误处理，不隐藏缺 Key。 |
| static `error.category` 固定计划→模型 | template `error.category` | `fileCategory`、`currentCategory` 只取四类别枚举的既有本地化名称；无法解码类别时走 unsupported format，不把任意文件文本放入模板。 |
| static `error.missingKey` 固定 OpenRouter | template `error.missingKey` | `category` 取固定模型类别名；`item` 优先取安全 problem item label，其次合法 identity，二者都没有时用 `item.fallback(index)`。不得使用 API Key、指纹或服务器 message。 |
| static `error.required` 固定 Pro/返修上限 | template `error.required` | `category` 同上；`item` 按安全 label→identity→index 回退；`field` 优先取宿主页已有准确业务标签，没有映射时原样显示已校验 JSON Pointer；`reason` 只取 copy 中十个 `error.reason.*` 键。未知字段错误码使用现通用文件错误，不显示裸 code。 |
| fixture `detail/applied` | `change.fieldChanged/Added/Removed` 与 `notice.*` | Change 只渲染 API 的 label、identity 和 fields；defaultsApplied/warnings 只按 FE313-B1 的 notice 规则渲染。不得把 fixture 自然语言或样例 applied 结果带入生产。 |
| static `export.ready` 设计演示声明 | template `export.downloadStarted` | 只有完整响应已读、Blob 下载已触发后显示“下载已开始”；不宣称文件已落盘或加密已在浏览器执行。设计演示继续保留原键。 |

### Change 值格式

`before`/`after` 先按 FILE502 对应字段类型验证，再进入文案参数：

- false、0、空数组和空字符串必须分别显示，不能用 truthy 判断隐藏；空数组使用 `change.valueNone`，空字符串使用 `change.valueEmpty`。
- `rolling_24h_limit` 的显式 null 使用 `change.valueUnlimited`；其他允许 null 的可选字段使用 `change.valueNotSet`。新增/移除一侧不存在由 change action 判定，使用 `change.valueMissing`，不能把业务 null 当缺失。
- Amount 保留规范十进制字符串，不转 Number；时间、枚举、ID 和布尔值使用已验证值的既有呈现器。结构值按已知字段拆行，不输出 `[object Object]` 或任意 JSON/HTML。
- `field` 没有批准的业务标签时显示已验证的相对 JSON Pointer，并沿现有 monospace/换行规则；不猜译名称。

### Preview notice 映射

FE313-B1 的 `item_ref` 必须按 kind+identity 精确匹配同一响应 Change，名称只取该 Change.label。defaultsApplied 必须同时有 item 和 field；warning 可按合同为类别级。未知但格式合法的 code 使用 `notice.unknown`，不显示 code 原文，也不改变 canCommit。

| 数组 / code | copy message |
|---|---|
| defaultsApplied / name_generated | `notice.nameGenerated` |
| defaultsApplied / optional_value_cleared | `notice.optionalValueCleared` |
| defaultsApplied / reward_quantity_zero | `notice.rewardQuantityZero` |
| defaultsApplied / checkin_current_selected | `notice.checkinCurrentSelected` |
| warnings / language_fallback | `notice.languageFallback` |
| warnings / plan_no_models | `notice.planNoModels` |
| warnings / plan_no_lengths | `notice.planNoLengths` |
| warnings / category_cleared | `notice.categoryCleared` |
| warnings / effective_plan_may_change | `notice.effectivePlanMayChange` |
| warnings / level_may_downgrade | `notice.levelMayDowngrade` |
| 任一数组 / 合法未知 code | `notice.unknown` |

有 item+field 使用 `notice.itemField`，只有 item 使用 `notice.item`，类别级使用 `notice.category`。field 仍遵守业务标签→严格 pointer 的规则。任何结构错误、未匹配 item_ref 或非法 pointer 都是合同错误，不能降级为 unknown notice 后继续确认。

## U2 · 结果事实与按钮映射

结果状态继续使用现有 result mark、标题、notice、dialog body/footer、`.btn`/`.primary`/`.danger` token。当前配置快照使用现有可折叠 `change-details` 表面和滚动 body，不增加页面或入口。

| 接收事实 | 标题/正文 | footer 与动作 |
|---|---|---|
| HTTP 200 `status=applied, superseded=false` | 原 category success 标题、`result.successSummary`、`result.successHelp` | `common.close`。宿主页读取最新配置。 |
| HTTP 200 `status=applied, superseded=true` | 同一成功事实和计数，追加 `result.superseded` notice；不能改成 unknown 或 notApplied | `common.close`。宿主页读取 current revision。 |
| applied 后宿主页刷新失败 | 保留成功标题/计数，追加 `result.refreshFailed`；不能建议重复导入 | `result.retryRefresh` 只重试宿主页读取，另保留 `common.close`；不得重发 imports。 |
| HTTP 200 `status=not_applied` | `result.notApplied` + `result.notAppliedHelp`；counts 必须为 0，不显示 success mark/summary | `result.startNewPreview` 清除旧 File/口令/票据并回 file；`common.close`。所有 reasonCode 共用这一结果页，不为每个码新建页面。revision_changed/impact_changed/dependency_changed 可在同页追加既有 `error.staleHelp`，其他原因不套该句。 |
| 提交结果未知 | 继续复用 `result.unknown`、`result.unknownHelp`，追加 `result.lookupWindow(retainUntil)` | 继续复用 `result.read` 与 `result.check`。check pending 时只禁用重复点击，不改成功态。 |
| 410 result_expired | `result.expired` + `result.expiredHelp`；不得显示 notApplied、回滚或成功 | `result.read` + `common.close`；不再显示 `result.check`。 |
| 403 recovery_token_invalid | `result.tokenInvalid` + `result.tokenInvalidHelp`；不得显示 notApplied、回滚或成功 | `result.read` + `common.close`；不再显示 `result.check`。 |
| API-505 当前配置读取成功 | 在原 unknown/expired/tokenInvalid body 内追加 `result.current`、安全配置与 `result.currentHelp(readAt,category)` | unknown 且票据仍有效时保留 `result.check`；expired/tokenInvalid 只保留 `common.close`。快照不能使本次操作转 success/notApplied。 |

API-505 读取失败保留原 operation 状态并使用现有通用网络错误；不能因 current 与预览相似而推断本次导入成功。200 畸形 imports 响应仍进入 unknown。按钮 disabled 是真实 DOM 状态，不只忽略点击。

## U3 · 已批准边界在原区域中的文案

无需新布局：

- export/import 的既有 passwordHelp 改用本补充同名键。输入规则是 12–128 Unicode scalar、UTF-8 ≤512 bytes、非全空白、无 U+0000，不 trim、不做 Unicode normalization；导出两次输入仍原样完全一致。
- file/drop 与 selected-file 区在原 `import.noWrite` 旁显示 `import.fileLimit`。File.size >8 MiB 时不读取文件，进入现 error surface，footer 只保留现“修正文件/重新选择”动作。
- confirm body 在 ack 上方显示 `confirm.deadline(deadline,retainUntil)`。deadline/retainUntil 必须取服务端时间，按当前界面语言格式化并明确时区；不得硬编码样例或用浏览器本地午夜推算。到 deadline 后立即禁用 `confirm.replace`，显示 `confirm.previewExpired` 并使用现 repreview/file 动作；服务端仍是最终判定。
- unknown body 显示 `result.lookupWindow(retainUntil)`。结果查询窗口截止为 commitNotAfter 后 24 小时；到期转 resultExpired 映射，不自动提交或循环轮询。
- sessionStorage 不可用继续走现通用 error/alert，imports 按钮保持 disabled；本补充不增加恢复平台文案或新步骤。

## 布局、焦点与 token

所有新增句子落在现 `dialog-body` 的 field-help/notice/change-details；新增 footer 动作复用 `.btn`，唯一主动作继续用 `.primary`。不增加颜色、图标、宽度、断点或全局 token。长文件名、identity、pointer 和英文提示使用现 overflow-wrap，modal body 继续独立滚动，footer 保持可达。

状态更新后焦点进入错误、结果或新增快照标题；关闭仍回入口。reading/submitting 规则、Escape/关闭禁用、390px 48px 目标和 UI33-R3 priority modal 均不变。

## 可复用证据与未验证项

可复用的冻结证据只有 UI33-R3 的布局、导航、modal、焦点和响应式检查，以及既有 copy 的 unknown、wrongPassword、dependencyHelp、successSummary、reference、growth.effective。本补充没有运行应用、浏览器、API、数据库、加密或 provider；动态长文本、notApplied、expired、tokenInvalid、current snapshot、superseded 和已批准限制在生产 Vue 中都尚未验证。

前端实现需用合同 fixture 定向检查占位符无遗漏、未知 notice 不泄露 code、HTTP 200 notApplied 不进 success、current 不改变 operation 事实、applied+superseded 与刷新失败文案准确，以及中英文 1440/390 的 body/footer 可达。该验证属于 M002-FE-CR313-01 接收，不回写旧设计证据。
