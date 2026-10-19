---
milestone: M002
version: M002-UI-33-R3
agent_name: designer-tony
status: awaiting_user_review
date: 2026-10-15
input_version: M002-PRODUCT-09-R1
current_scope: CR-313
requested_model: gpt-5.6-sol
requested_effort: high
actual_model: unknown
---

# 配置导入导出设计规格

## 修订结论

M002-UI-33-R3 保留 R1 的直接继承方案和 R2 的导航修复，并纠正计划“档位优先级”编辑器落在页面底部的问题。R2 仅证明旧源与继承稿相同，错误地把 `<dialog open>` 的页面内呈现当成可接受继承；用户已明确要求它是弹窗，因此 R2 关于该编辑器正确性的结论失效。R3 由正式稿局部 adapter 将每次重绘出的旧 dialog 安全提升为原生 modal，保留原字段、文案与动作。

R1 因临时 base 影响相对 URL，侧栏可能离开 formal 宿主；成长入口也会沿用初始类别。R2 已将宿主 URL 固定为 formal 绝对路径，并在打开操作时读取当前成长 tab。旧 M003-UI-15 的“独立重画管理台”方向无效；其证据和可恢复归档只保留为历史。

本稿直接运行冻结的原正式设计模块，再用局部 adapter 增加 CR-313。模型和计划继承原 M003-UI-13-R4 页面源，成长和道具继承原 M002-UI-26 页面源；这些历史路径只说明来源，当前需求与交付均属于 M002。

## 唯一产品范围

唯一产品来源是 [M002-PRODUCT-09-R1](../../product/config-portability.md)。管理员可在现有页面分别导入或导出四类运营配置：

1. 模型服务商、连接与模型配置；
2. Visitor、Basic、Pro、Plus 四个固定计划；
3. 四种现有道具定义；
4. 签到、等级与四类成就组成的完整成长规则。

用户、用户资产、库存实例、发放或使用流水、生成内容、预设短文和公告无入口。导入替换所选类别的全部活动配置。模型默认导出不含 Key；只有显式选择并设置文件口令后，才演示“含密钥加密导出”。模型导入要求每个连接携带本次文件中可解密的 Key。依赖、历史保护、缺 Key、字段非法或预览失效均阻止整批提交。

## 继承源与有限 adapter

| 宿主页 | 冻结真源 | R3 保留内容 | 唯一增量 |
|---|---|---|---|
| 模型 | formal/vendor/M003/design/prototype/app.js、design/theme.css、technical/fixtures/cr306 | 三个服务商、四个模型、原服务商编辑 modal、协议/URL/Key、模型高级参数和测试入口 | 页头原操作组前置“导入配置 / 导出配置” |
| 计划 | 同一 M003 app.js/theme.css/prototype fixtures | 四个横向 tabs、左右表单、模型/长度选项、额度、优先级、内容审稿与返修配置、优先级编辑器全部字段与动作 | 页头原优先级按钮前置两个类别操作；局部 adapter 将旧页面内 dialog 提升为真实 modal |
| 道具 | formal/vendor/M002/design/prototype 下的 app、operations、admin、growth 模块及 M002 theme/copy/fixtures | 原成长运营导航、道具筛选、四行表格、新建/编辑/上下架/引用/删除动作和编辑 modal | 成长运营页头增加道具类别操作 |
| 成长 | 同一 M002 模块 | 签到、等级、成就、道具四个 tabs；签到五字段、等级/成就表格和旧编辑交互 | 页面当前为成长类别时，页头增加完整成长规则操作 |

formal/boot.js 先捕获正式入口的绝对 pathname，再为原模块的相对资源设置临时 base；history 更新始终使用捕获的 formal pathname，原模块加载完即移除 base。formal/enhancer.js 只负责将模型、计划、成长侧栏入口规范化到 /formal/、入口插入、成长 tab 的类别映射、独立 #cr313-dialog、关闭后焦点恢复，以及计划 #priority-editor 的 modal 提升和本轮草稿恢复。新增导入导出事件使用 data-cr313-action，不进入原模块的 data-action 分发。theme.css 只包含 #cr313-dialog、#priority-editor:modal、.cr313-actions、.cr313-demo 和 .cr313-prototype 的局部规则，不声明 :root、通用按钮、panel、tabs 或管理台布局。

查询 inheritance=baseline 加载同一冻结模块但不加载 enhancer，用于同数据、同语言、同视口对照；这只是设计审阅参数。

## 页面定位

| 类别 | 正式入口 | 宿主页中保留的主要结构 |
|---|---|---|
| 模型 | formal/?page=models&category=models&portState=idle&lang=zh | .page-head、.generic-provider-list、#admin-model |
| 计划 | formal/?page=plans&category=plans&portState=idle&lang=zh | 横向 tabs、完整 panel、#service-settings、#priority-editor |
| 道具 | formal/?page=operations&category=items&portState=idle&lang=zh | 原四 tabs、道具表格、原 #dialog |
| 成长 | formal/?page=operations&category=growth&portState=idle&lang=zh | 原四 tabs、签到表单、等级与成就表格 |

portState 支持 idle、export、file、decrypt、reading、preview、confirm、submitting、success、unknown、blocked、missingkey、fields、mismatch、wrongpass、stale。它只切换确定性设计状态，不是生产路由或 API。

## 导入导出结构

导出 modal 顺序为类别范围、普通无 Key 说明、可选“包含 API 密钥（加密）”、两次文件口令、准备结果。未勾选时不显示口令字段；演示不创建真实文件或执行加密。

导入顺序为选择文件、必要解密、字段校验、逐项预览、完整类别确认、提交结果。预览固定显示新增、更新、移出、不变计数，并按安全身份展开具体项目：

- 模型基线来自原三个连接、四个模型。样例新增 Responses example › example-responses-alt，更新 DeepSeek 与 Responses model，移出 OpenRouter › Unmodified model，Messages model 不变。
- 计划基线是原 Visitor 0/2、Basic 10/8、Pro 10/8/返修1、Plus null/8/返修1。样例只更新 Visitor、Pro、Plus，Basic 不变；Plus 的不限额来自显式 null，必填额度省略会拒绝。
- 道具基线是补签卡、额外生成次数卡、模型探索卡、高级计划体验卡。样例更新额外次数卡与计划卡，移出模型探索卡，补签卡不变。
- 成长基线是签到 5/1/10/10/5、等级阈值 0/100/200/300 和四类各四档成就。样例新增等级5与词语收藏家V，更新签到两项与等级2/3，移出既有故事织造者IV。

确认页把移出项排在第一位并展开。提交中不可关闭或重复提交。未知结果只提供查询本次结果与读取当前配置，不提供盲目重试或伪回滚。

## 文案、图标与实现映射

精确中英文文案位于 copy.json，安全样例位于 fixtures/admin-safe.json，状态控制器位于 controller.js。图标继续使用原页面的 Lucide 线性图标；CR-313 新增图标使用同一 24px 线性语法。

业务 modal 标题只描述任务与类别，不包含内部版本号。M002-UI-33-R3 只出现在交互原型 eyebrow 和正式页默认收起的“设计状态演示”区。

## 设计验收合同

| ID | 必须实现 |
|---|---|
| UIA-M002-501 | 只有四类现有页面有入口；原导航、标题、控件和编辑路径保留 |
| UIA-M002-502 | 普通模型导出无 Key；显式选择后才显示两次文件口令 |
| UIA-M002-503 | 选择、解密、校验和预览均不写入 |
| UIA-M002-504 | 四类预览显示计数与可定位项目明细；确认明确列出移出项 |
| UIA-M002-505 | 四计划作为一个类别；显式 null 与字段省略不可混同 |
| UIA-M002-506 | 道具类型变化、历史或奖励引用阻止整批；不改库存与流水 |
| UIA-M002-507 | 成长包含签到、等级及四类成就；个人达成与领取历史保持 |
| UIA-M002-508 | 每个模型连接的 Key 条件满足前不可提交；界面不回显秘密 |
| UIA-M002-509 | 提交前重新检查目标与依赖；失效后重新预览 |
| UIA-M002-510 | pending 防重复；unknown 先查询，不能盲目重试 |
| UIA-M002-511 | 390px 无横向溢出，modal body 独立滚动，footer 可达，目标至少 44px |
| UIA-M002-512 | 原模型编辑 modal、计划 tabs/返修、成长 tabs、道具编辑仍可操作 |
| UIA-M002-513 | 模型、计划、成长侧栏往返、刷新、浏览器回退始终留在 formal，语言保持 |
| UIA-M002-514 | 道具 tab 打开 items；签到、等级、成就 tab 均打开完整 growth 类别 |
| UIA-M002-515 | 档位优先级使用 top-layer modal 与遮罩；背景不可操作，Tab 不离开，预览重绘保留本轮输入，保存、取消与 Escape 关闭后焦点回到入口 |

## 真实性边界

正式设计与交互原型只使用本地安全 fixture。它们未读取真实文件、未生成导出文件、未执行加密、未读取密钥、未调用提供方、未写配置，也未验证文件 schema、稳定身份映射、数据库事务、权限、生产 Vue 或 UAT。后续技术设计需定义这些边界；本稿不批准实现或阶段切换。
