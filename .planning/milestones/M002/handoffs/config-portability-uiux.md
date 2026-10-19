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

# 配置导入导出 UI/UX 交接

## 当前状态

M002-UI-33-R3 是当前可审阅设计，仍未批准。它保留 R1 直接继承的管理台和 R2 导航修复，并把用户指出的计划“档位优先级”页面底部内容修成真实 modal。M002 发音产品08已接受，设计32仍单独待审；本交付不表示任何设计批准、技术启动、数据库工作、阶段切换或 M002 收尾。

当前原件：

- [设计规格](../design/config-portability/design-spec.md)
- [交互规则](../design/config-portability/interactions.md)
- [响应式与可访问性](../design/config-portability/responsive-accessibility.md)
- [交互原型](../design/config-portability/prototype/index.html)
- [继承式正式设计](../design/config-portability/formal/index.html)

## R3 档位优先级修复

浏览器复现确认，R2 打开档位优先级后 `#priority-editor` 虽有 open 属性，但不是 `:modal`，computed position 为 absolute，顶部 1471.256px、底部 2009.381px，已超出 950px 视口并落在整页末尾。根因是冻结源生成 `<dialog open>`，没有调用 `showModal()`。R2 用“与旧源一致”判断通过不能满足用户已明确的弹窗要求，该判断只保留为历史失败证据。

R3 不修改 vendor。formal/enhancer.js 在每次计划页重绘后：

1. 恢复本轮四个档位输入；
2. 对旧 open dialog 先 close，再调用 `showModal()`；
3. 限制 Tab 在 modal 内，Escape 复用原关闭动作；
4. 预览重绘前保存草稿，重绘后恢复并聚焦影响说明；
5. 保存、取消和 Escape 关闭后聚焦当前“档位优先级”入口。

theme.css 只为 `body.m003-page #priority-editor:modal` 增加 top-layer 尺寸、视口边界和移动动作规则。遮罩点击保持 modal 与草稿，避免在没有丢弃确认文案时意外清空输入。原字段、文案、按钮动作、计划 tabs、返修配置以及导入导出 modal 均保留。

## R2 复现、根因与修复

修复前，从正式模型默认页点击侧栏：

- “计划管理”进入 /formal/vendor/M003/design/prototype/?page=plans…；
- “成长运营”进入 /M002/design/prototype/?page=operations&lang=zh，并返回 404；
- 成长运营即使切换到签到、等级或成就，导入类别仍可能沿用初始 items。

根因是 boot.js 在临时 base 指向 vendor 目录期间使用相对查询字符串执行 history.replaceState，浏览器据此把文档 pathname 改为 vendor 路径。enhancer 随后生成的相对侧栏链接继续基于错误 pathname。成长操作的 category 又由初始化闭包固定，没有在点击时读取当前 tab。

R2 只修改局部 adapter：

1. boot.js 在设置 base 前捕获进入时的 formal pathname，更新 history 时使用完整 pathname 与 query；
2. enhancer.js 为模型、计划、成长生成 /formal/ 绝对宿主链接，并在捕获阶段接管这三个侧栏入口，防止 M002 原模块的内部路由把页面带离当前正式稿；
3. 每次打开导入或导出时读取选中 tab：itemsettings → items；signsettings、levelsettings、achievementsettings → 完整 growth；
4. 当前 URL 读取语言，切换中英文后按钮文案和后续侧栏目标继续保持该语言。

vendor 74 个文件、旧 fixture、原模型编辑 modal、计划横向 tabs 与返修配置、成长 tabs、道具表格及编辑 modal 均未修改。R1 的 manifest 和 archive 继续保留，archive SHA256 为 8576c5a69afcdeafe2a462995e7e412bf17c1945295b9503bf09c8c108fe1f6f，仅作为修复前可恢复快照。

## 本地预览

服务 PID 30189，仅监听 127.0.0.1:4176，静态根为 .planning/milestones/M002/design/config-portability。

- 正式默认模型页：http://127.0.0.1:4176/formal/?page=models&category=models&portState=idle&lang=zh
- 计划页：http://127.0.0.1:4176/formal/?page=plans&category=plans&portState=idle&lang=zh
- 道具页：http://127.0.0.1:4176/formal/?page=operations&category=items&portState=idle&lang=zh
- 完整成长规则页：http://127.0.0.1:4176/formal/?page=operations&category=growth&portState=idle&lang=zh
- 模型逐项预览：http://127.0.0.1:4176/formal/?page=models&category=models&portState=preview&lang=zh
- 交互原型：http://127.0.0.1:4176/prototype/?category=models&state=export&lang=zh

以上查询参数只用于设计审阅，不是生产路由或 API。

## R2 定向验证

[M002-UI-33-R2-navigation.json](../design/config-portability/evidence/M002-UI-33-R2-navigation.json) 为 7/7 PASS，provider call 0、配置写入 0、console error 0、page error 0。

验证覆盖：

- 中文 1440px 从默认模型页真实点击计划，路径保持 /formal/，四个横向 tabs、返修配置和优先级编辑器可用；定向完成编辑、预览、保存动作与关闭后，再截取正常计划主页面；
- 浏览器后退回模型、前进回计划，路径和原内容正确；
- 从计划点击成长进入道具页，从成长点击模型回到当前继承的模型页，原模型 editor 可打开；
- 道具 tab 打开 items，签到、等级、成就三个 tab 均打开完整 growth；
- 中文切换 English 后再点击成长，路径、语言、标题和新增按钮保持英文；
- 英文 390px 从模型点击计划再点击成长，两页均保持 /formal/，横向溢出 0。

代表截图为 R2-01 至 R2-04。R2 当时记录的优先级编辑器继承对比，只能证明缺陷来自冻结源且不是导航回归，不能证明弹窗行为正确；用户指出缺陷后，该结论已由 R3 取代。R1 的 12/12 继承、modal、内容明细与移动确认检查没有被覆盖。

R2 历史证据为 [导航检查](../design/config-portability/evidence/M002-UI-33-R2-navigation.json)、[优先级编辑器继承对比](../design/config-portability/evidence/M002-UI-33-R2-priority-editor-inheritance.json)、[视觉检查](../design/config-portability/evidence/M002-UI-33-R2-visual-review.json) 与 [源检查](../design/config-portability/evidence/M002-UI-33-R2-source-check.json)。R2 manifest/archive 已冻结并保持原样。

## R3 定向验证

[M002-UI-33-R3-priority-modal.json](../design/config-portability/evidence/M002-UI-33-R3-priority-modal.json) 为 12/12 PASS，provider call 0、配置写入 0、console error 0、page error 0。

- 1440×950 中文：真实 `:modal`、fixed、居中且完整位于视口；遮罩阻止背景导航并保留输入，连续 12 次 Tab 未离开 modal；
- 输入 37 后触发预览重绘，输入保持且影响说明获得焦点；保存、取消、右上角关闭与 Escape 均关闭并返回入口；
- 关闭档位优先级后，CR-313 导入 modal 仍正常进入 top layer；计划到成长的 R2 导航仍留在 `/formal/`；
- 390×844 英文：输入 41 在预览后保持，底部动作可达，页面与 dialog 横向溢出均为 0。

代表截图为 R3-01 至 R3-03；[视觉检查](../design/config-portability/evidence/M002-UI-33-R3-visual-review.json) 与 [源检查](../design/config-portability/evidence/M002-UI-33-R3-source-check.json) 只覆盖本次改动。R3 archive/manifest 由主控接收时冻结。

## 未验证边界

证据只证明本地静态设计的继承、导航和确定性交互。真实文件解析、导出生成、加密、Key、权限、身份映射、依赖查询、事务、生产 Vue、真实 UAT、数据库和提供方行为均未验证。

当前等待用户审稿。用户明确批准前，不能进入技术或实现阶段。
