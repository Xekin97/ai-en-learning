---
milestone: M003
version: M003-UI-15
agent_name: designer-tony
status: awaiting_user_review
date: 2026-10-15
input_version: M003-PRODUCT-12-R1 / TRANSITION-M003-109
current_scope: CR-313
requested_model: gpt-5.6-sol
requested_effort: high
actual_model: unknown
---

# CR-313 配置导入导出 UI/UX 交接

## 当前交付

- 当前范围唯一设计规格：[config-portability/design-spec.md](../design/config-portability/design-spec.md)。交互、响应式和可访问性分别见同目录 `interactions.md`、`responsive-accessibility.md`。
- 独立交互原型：[prototype/index.html](../design/config-portability/prototype/index.html)。它用于检查状态机和风险沟通，不是管理台正式外观。
- 正式设计：[formal/index.html](../design/config-portability/formal/index.html)。它按现有管理台完整页面呈现 PAGE-501～504，并共享 `controller.js`、`copy.json`、`theme.css` 和无秘密 fixture。
- UI15 设计版本号只出现在原型介绍和正式稿默认收起的“设计状态演示”区；业务 modal 抬头只显示任务/类别。
- 本交付不修改 M003-UI-14 或 canonical design/handoff。M003-UI-14 仍单独 `awaiting_user_review`；本交付不表示发音设计批准、M003 收尾或阶段切换。

## 本地预览

当前服务：PID `25718`，仅监听 `127.0.0.1:4176`，静态根限制为 `.planning/milestones/M002-legacy-M003/design/config-portability`。

```sh
python3 -m http.server 4176 --bind 127.0.0.1 --directory .planning/milestones/M002-legacy-M003/design/config-portability
```

- 正式稿默认页：<http://127.0.0.1:4176/formal/?page=models&category=models&state=idle&lang=zh>
- 代表状态 1，模型逐项预览：<http://127.0.0.1:4176/formal/?page=models&category=models&state=preview&lang=zh>
- 代表状态 2，道具依赖阻止：<http://127.0.0.1:4176/formal/?page=growth&category=items&state=blocked&lang=zh>
- 代表状态 3，390px 适用的英文整类确认：<http://127.0.0.1:4176/formal/?page=models&category=models&state=confirm&lang=en>
- 独立原型：<http://127.0.0.1:4176/prototype/?category=models&state=export&lang=zh>

查询参数是设计审阅入口，不是生产路由或接口。

## 已确定的设计合同

四个类别分别在现有模型、计划、成长道具和成长规则页面提供完整类别导入/导出。用户、预设短文、公告无入口。模型默认导出不含 Key，只有显式选择并设置文件口令后才准备含凭据的加密导出；模型导入要求每个连接都带本次文件中的可解密 Key。

导入遵循“文件 → 必要解密 → 校验 → 预览 → 明确整类确认 → 提交结果”。预览列出新增、更新、移出和不变计数，并按安全身份逐项展示具体配置与字段变化及解析后的应用结果：模型省略值可生成 hostname 名称、清空说明或不设置最大输出 token；道具单语言为空按另一语言回退；计划不限额必须显式提供 `null`，省略额度会拒绝；成长奖励省略道具表示无道具。确认页把移出组排在第一位并默认展开；计划类别也明确显示 `0 / 无`。跨类别引用、道具历史、缺 Key 或目标失效均阻止整次提交，不跳过、不级联、不临时补秘密。

提交 pending 时关闭和重复提交不可用。结果未知只提供“查询本次结果 / 读取当前配置”，不提供盲目重试或假回滚。中文和英文共用结构；390px modal body 独立滚动、footer 固定，触控目标保持至少 44px。

## 设计验证与证据

- 基础需求/浏览器检查 `M003-UI-15-browser.json`：`14/14 PASS`；provider call `0`、配置写入 `0`、console/page error `0`。
- 英文日期与无遮挡正式页定向检查 `M003-UI-15-localization-visual.json`：`3/3 PASS`。
- 补齐 CAP-502/503、AC504/514 后的逐项明细定向检查 `M003-UI-15-change-detail.json`：`13/13 PASS`。模型 `1/2/1`、计划 `0/3/0`、道具 `0/2/1`、成长 `2/8/1` 的新增/更新/移出项均可按安全身份定位；正式页当前目标基线与差异左值/移出对象一致；四类确认均明确展示移出组；390px footer 底边 `835 < 844`、按钮高 `70px`、横向溢出 `0`。
- 9 张代表截图已目视检查。受逐项明细影响的模型、计划、道具、成长 preview 和移动确认截图已重新生成。
- 源文件与保护检查见 `M003-UI-15-source-check.json`；UI14、canonical design、产品稿与既有 handoff 共 43 个文件保持 gate109 前 hash。最终文件清单见 `M003-UI-15-source-manifest.json`，可恢复归档为 `M003-UI-15-source.tar.gz`。
- `M003-UI-15-source-manifest-superseded-20261015-162640.json` 与 `M003-UI-15-source-superseded-20261015-162640.tar.gz`（SHA256 `81d15e0dcd93c34ec828681a827e0a319ffe0120293e210903f059606065b359`）仅保留上一版证据；该 hash 已 superseded，不代表当前修正版。
- 初次预览进程未保活和首次浏览器 strict locator 脚本问题分别保留在 `browser-run-00-infra-failed.json`、`browser-run-01-check-failed.json`；它们是基础设施/测试脚本记录，不是产品设计通过证据。

以上证据只证明本地设计原型与正式稿的确定性视觉/行为。真实文件生成与解析、加密安全、Key、权限、API/schema、跨环境身份映射、数据库约束、原子替换、生产 Vue 和 UAT3015 均未验证，不能据此宣称产品功能已实现。

## 后续路由

1. 用户审阅 M003-UI-15 原型与正式设计；当前不自批。
2. 通过后由 TECH-501～503 定义文件格式/稳定身份、依赖预检与原子业务结果、加密凭据安全边界，再分别交 backend-alex、dba-diana、frontend-bob。
3. 技术和实现需保留 `design-spec.md` 中 UIA-M003-451～464，尤其逐项 preview、确认页明确移出项、可选字段应用结果和 unknown outcome 行为。

当前 M003 仍进行中，closeout 未批准。
