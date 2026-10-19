---
milestone: M003
version: M003-UI-15
agent_name: designer-tony
status: awaiting_user_review
date: 2026-10-15
input_version: M003-PRODUCT-12-R1 / TRANSITION-M003-109
current_scope: CR-313
---

# M003-UI-15 后台配置导入导出设计

## 当前目标与有效范围

- 当前唯一产品来源为 [M003-PRODUCT-12-R1](../../product/config-portability.md)：DATA-501～506、CAP-501～504、PAGE-501～504、AC-501～514；Q313-01/02 已闭环。
- 在现有 `/admin/models`、`/admin/plans` 和 `/admin/growth` 页面增加四个独立类别入口：模型配置、四个固定计划、道具定义、完整成长规则。用户、预设短文、公告均无入口；不新增迁移中心或导航项。
- 导入是所选类别完整替换。文件选择、必要解密、校验、影响预览和确认前均不写入；跨类别引用、道具历史保护、缺 Key、字段非法或目标改变会阻止整次提交。
- 模型普通导出不含 Key；显式选择后设置并确认文件口令，才准备含凭据的加密文件。模型导入要求每个连接都在本次文件中带可解密的非空 Key，不复用目标 Key、不在导入时补填，也不自动测试提供方。
- M003-UI-15 当前 `awaiting_user_review`，不表示设计批准、技术接收、产品实现或 M003 收尾。M003-UI-14 发音设计仍单独待审，未被替代。
- `TECH-501～503` 仍由 backend-alex、dba-diana、frontend-bob 后续定义文件/身份映射、原子替换、加密安全与工程接收。设计中的文件、加密、校验与提交结果均为确定性演示，不证明真实能力。

## 设计目标与表达

正式稿沿用实际管理台的暖白画布、绿色选择态、192px 左导航、72px 顶栏、圆角 panel、表格和 AppDialog 层次。导入/导出作为当前类别的次级操作，与既有“添加服务商”“保存修改”“新建道具”并列，不重排原有编辑主任务。

风险沟通按操作阶段递进：入口只说明“完整类别”；文件态明确整类替换；预览用新增/更新/移出/不变四个计数，并按安全身份逐项列出业务字段变化和省略字段的应用结果；最后确认优先展开移出项，使用危险色和完整动作名称。依赖/历史/字段错误显示“类别 → 配置项 → 字段 → 原因”，不会展示 Key、口令或原始秘密字段。

交互原型是无产品导航的状态实验台，用于验证凭据选择、文件/解密、预览、确认与未知结果恢复。正式稿独立重建实际完整管理台页面和 modal 位置，不能由前端用原型外观替代。

## 实际视觉来源与安全样例

- 管理台结构：`frontend/app/layouts/admin.vue`；基础 Token：`frontend/app/assets/css/theme.css` 的 `.admin-layout`、`.admin-nav`、`.section-head`、`.panel`、`.tabs`、`.data-table`、`.toolbar`、`.btn`、`.notice`。
- modal 行为与层次：`frontend/app/presentation/components/AppDialog.vue`；模型页：`frontend/app/pages/admin/models.vue`；计划页：`frontend/app/pages/admin/plans.vue`；成长页和道具区域：`frontend/app/pages/admin/growth.vue`、`frontend/app/presentation/components/admin/ItemDefinitions.vue`。
- `fixtures/admin-safe.json` 是设计合成数据，基于现有 M002 `prototype/fixtures.json#admin` 的四计划/Model A/B 和当前页面结构扩展。它不含凭据、用户数据或运行历史；连接名称、影响计数和日期仅用于确定性审阅。
- 图标使用本地 Lucide 线性关系，前端映射到现有 `AppIcon`；无远程字体、位图或外部依赖。

## 打开原型与复现场景

在仓库根运行：

```sh
python3 -m http.server 4176 --bind 127.0.0.1 --directory .planning/milestones/M002-legacy-M003/design/config-portability
```

- 交互原型：<http://127.0.0.1:4176/prototype/>
- 正式稿默认入口：<http://127.0.0.1:4176/formal/?page=models&category=models&state=idle&lang=zh>
- 文案：`copy.json`；样式：`theme.css`；共享状态/对话框：`controller.js`；安全 fixture：`fixtures/admin-safe.json`。
- 等待条件：`#app[aria-busy="false"]`。查询参数仅用于设计审阅，不是生产路由或 API。

| 页面 / 能力 | 稳定入口 | 正式定位与可观察内容 |
|---|---|---|
| 原型 · 加密导出 | `prototype/?category=models&state=export&lang=zh` | `.prototype-stage`；显式勾选后才出现两次文件口令，演示不真实加密 |
| PAGE-501 默认页 | `formal/?page=models&category=models&state=idle&lang=en` | `#page-501-models`；完整导航、服务商和模型列表、页头分类操作 |
| PAGE-501 替换预览 | `formal/?page=models&category=models&state=preview&lang=zh` | 当前页 A/B/C 为目标基线；文件新增 D、更新 A/C、移出 B；hostname 自动连接名、无说明与未设置最大输出 token 的应用结果；凭据完整性 |
| PAGE-501 缺 Key | `formal/?page=models&category=models&state=missingkey&lang=en` | 连接/业务字段级错误；无 Key/口令回显，无提交动作 |
| PAGE-501 依赖阻止 | `formal/?page=models&category=models&state=blocked&lang=zh` | 三类引用示例；未选类别和当前配置保持 |
| PAGE-502 计划预览 | `formal/?page=plans&category=plans&state=preview&lang=en` | `#page-502-plans`；三项更新、明确无新增/移出；Plus 对必填额度显式提供 null，应用为 Unlimited；省略额度会拒绝 |
| PAGE-503 道具预览 | `formal/?page=growth&category=items&state=preview&lang=zh` | 新增/更新/移出逐项定位；中文说明有值、英文说明显式为空时按现有规则回退；不继承旧译文 |
| PAGE-503 道具阻止 | `formal/?page=growth&category=items&state=blocked&lang=zh` | `#page-503-items`；当前道具表、发放历史与奖励引用阻止 |
| PAGE-504 成长预览 | `formal/?page=growth&category=growth&state=preview&lang=en` | `#page-504-growth`；11 项变化逐项定位；等级 4 省略奖励应用为 No item；目标生效日 |
| 移动确认 | `formal/?page=models&category=models&state=confirm&lang=en` | 390px 底部 modal；正文独立滚动，footer 固定可达 |
| 结果未知 | `formal/?page=plans&category=plans&state=unknown&lang=zh` | 仅“查询本次结果 / 读取当前配置”，无盲目重试或回滚承诺 |

`state` 还支持 `file / decrypt / reading / fields / mismatch / wrongpass / stale / submitting / success`。正式稿底部“设计状态演示”默认收起且不属于产品 UI。

## 页面与内容定位

| 页面 / 区域 | 元素顺序 | 文案键 | 稳定定位 / 规则 |
|---|---|---|---|
| PAGE-501 页头 | 标题/说明 → 导入 → 导出 → 添加服务商 | `portability.import/export`、既有页文案 | `#page-501-models .section-head`；导出完整类别，不受列表状态影响 |
| PAGE-502 页头 | 标题/说明 → 导入 → 导出 | 同上 | `#page-502-plans .section-head`；四计划始终作为一个类别 |
| PAGE-503 道具 panel | panel 标题/范围 → 导入 → 导出 → 既有筛选/表格 | `items.scope*` | `#page-503-items .panel`；无库存、发放或使用流水 |
| PAGE-504 成长 panel | 完整类别标题/范围 → 导入 → 导出 → 当前标签内容 | `growth.rulesScope*` | `#page-504-growth .panel`；文案明确不限当前 tab |
| 导出 modal | 完整范围 → 普通无 Key 说明 → 可选加密凭据 → 口令/确认 → 准备 | `export.*` | `#portability-dialog[data-portability-state=export]`；选项默认关闭 |
| 导入 modal | 整类警告 → 文件 → 解密 → 校验 → 计数及配置项明细 → 明确确认 → 结果 | `import.* / preview.* / changes.* / confirm.* / result.*` | `#portability-dialog[data-portability-state]`；preview 的三组默认展开，confirm 的移出组默认展开 |
| 错误 / 阻止 | 摘要 → 可定位项 → 恢复动作 | `error.*` | `.notice[role=alert]`、`.dependency-list`；没有提交按钮 |
| 字段说明 | 必填/可选/条件必填与缺失语义 | `field.* / changes.applied` | 文件态摘要 + 预览逐项应用结果；完整字段规则引用产品表，不复制竞争版本 |

动态模板 `preview.summary/fileMeta`、`result.successSummary`、`error.reference`、`growth.effective` 的值来自预览应用模型；变量按文本转义。技术实现需从 `copy.json` 转换到现有本地化体系，不能手写同义版本。

## 交互、响应式与样式入口

- `interactions.md` 定义 I501～I509 的导出、导入、失效、提交、未知结果、modal 焦点和 Motion。
- `responsive-accessibility.md` 定义 1440/1100/760/390、表格滚动、modal body/footer、键盘/触控、live region 与 reduced motion。
- `theme.css` 是 UI15 局部正式真源，数值沿实际管理台 Token。实现优先复用生产 `.btn/.panel/.notice/.admin-*` 与 `AppDialog`，只新增 portability 语义类。

## 实现约束与验收

| 验收 ID | 来源 / 定位 | 必须保持的结果 | 充分证据 |
|---|---|---|---|
| UIA-M003-451 | AC-501 / PAGE-501～504 | 仅四类当前区域有入口；用户/预设/公告无入口；文件和 UI 不出现运行数据 | 页面使用处清单、权限失败、导出内容断言 |
| UIA-M003-452 | AC-502 / export | 默认无 Key；显式勾选才出现口令/确认；完整类别不受筛选分页；无明文秘密 | 导出 adapter fixture、秘密扫描、两种 UI 路径 |
| UIA-M003-453 | AC-503 / error states | 类别/版本/损坏/口令/字段/引用失败均不写入，定位业务原因 | 可控失败矩阵 + 写入计数 0 |
| UIA-M003-454 | AC-504 / preview→confirm | 显示计数、每个变化项安全身份/字段变化/影响；确认页展开移出项；取消无变化；明确整类替换 | 四类 item-level preview/confirm 对照 |
| UIA-M003-455 | AC-505 / PAGE-502 | 恰含四计划；用户基础计划、额度使用、试用日期和在途快照不被重置 | 计划 fixture 与提交后读取 |
| UIA-M003-456 | AC-506 / PAGE-503 | 类型变化、发放历史或奖励引用阻止整次；库存/流水保持 | 道具历史/引用 fixture + 原子结果 |
| UIA-M003-457 | AC-507 / PAGE-504 | 完整成长类别；签到目标下一学习日生效；个人达成/领取历史保持 | 来源值、目标日期与历史读取 |
| UIA-M003-458 | AC-508 / stale/submitting | 文件/类别/目标变化使预览失效；提交只发一次；失败无部分结果 | revision/依赖改变与重复点击时序 |
| UIA-M003-459 | AC-509 / unknown | 响应丢失显示待确认；只允许查询结果/读取配置，无盲目重放或假回滚 | unknown→read/check→终态路径 |
| UIA-M003-460 | AC-510 / PAGE-501 missingkey | 所有连接含 Key 才能继续；停用/同地址/目标已有 Key 无例外；不测试提供方 | 每连接缺失矩阵、provider call 0 |
| UIA-M003-461 | AC-511 / blocked | 跨类别引用逐项列出并阻止整次；不级联改未选类别 | 引用图与其他类别 before/after |
| UIA-M003-462 | AC-512 / category file | 跨环境准确匹配；无历史复制/按相似名猜测；无生成、发奖或模型测试 | 身份映射 fixture 与负请求断言 |
| UIA-M003-463 | AC-513 / field errors | 缺失/null/false/0/空数组按产品字段表区分，错误可定位且不泄密 | 四类边界表驱动输入；计划显式 null → 不限额，省略 → 拒绝 |
| UIA-M003-464 | AC-514 / optional defaults | 真正可选字段按表生成/清空且结果逐项可见；不继承目标旧值；待生效签到整组处理 | hostname 自动连接名/无说明/未设置最大输出 token/单语言回退/无道具 + 明确零值/目标旧值对照 |

DOM、组件拆分和后端合同可按 TECH-501～503 决定；上述可见顺序、文案、整类语义、焦点/移动结果和阻止边界不可改变。

## 设计自检与未验证范围

- 需求验收模式浏览器报告 `evidence/M003-UI-15-browser.json`：`14/14 PASS`，覆盖独立原型、显式加密导出、PAGE-501～504、完整操作路径、依赖/Key 阻止、提交互斥、未知结果、焦点恢复、390px、reduced motion、零横溢和唯一 ID；console/page error `0`，provider call `0`，配置写入 `0`。
- 英文日期修正后只复验受影响路径并补无遮挡正式页：`evidence/M003-UI-15-localization-visual.json` 为 `3/3 PASS`。
- 补齐 CAP-502/503、AC504/514 的配置项级明细后，定向报告 `evidence/M003-UI-15-change-detail.json` 为 `13/13 PASS`：四类 preview 的数组行数分别为模型 `1/2/1`、计划 `0/3/0`、道具 `0/2/1`、成长 `2/8/1`，安全身份无重复；正式页当前目标基线与差异左值/移出对象一致；四类确认均明确展开移出项（计划显示 0 / None）；390px footer 底边 `835 < 844`，按钮高 `70px`。保存 9 张代表图并全部目视。
- 源文件/归档/字段语义和既有资产保护检查 `evidence/M003-UI-15-source-check.json` 为 `8/8 PASS`；UI14、canonical design、产品稿与既有 handoff 共 43 个文件保持 gate109 前 hash。
- 初次 4176 进程未保活和首次 strict locator 方法问题分别保存在 `browser-run-00-infra-failed.json`、`browser-run-01-check-failed.json`；两者不被覆盖为通过。
- 未验证：真实文件生成/解析、加密安全、真实 Key、权限/API/schema、身份映射、原子替换、数据库约束、提供方接受 Key、生产 Vue、UAT3015。设计模拟不替代 TECH-501～503 或功能 QA。
