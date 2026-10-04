from pathlib import Path
import json,hashlib
D=Path(__file__).resolve().parents[2];E=D/'evidence/ui26'
front='''---
milestone: M002
stage: uiux-design
role: uiux/base
agent_name: designer-tony
status: awaiting_user_review
version: M002-UI-26
design_version: M002-UI-26
approval: pending_new_visual_review
date: 2026-10-01
---
'''
(D/'validation.md').write_text(front+'''
# UI26 选词交互验证

本轮为 UIA-PAGE-204-WORDS26、UIA-PAGE-212-WORDS26 需求验收：普通工作台与后台预设共享词库候选选择；不改变固定词表、当前计划上限、随机排除范围、后台不受用户上限、参数修改须重新预览等规则。设计基线 UI25；接收记录见 [reception](./evidence/ui26/reception.json)。真实接口接入不在此轮。

## 方法与结果

| 范围 | 数据 / 方法 | 结果 |
|---|---|---|
| 两页搜索与选择 | Chromium 实际操作；zh/en × 1440/390/320px；大小写、前缀优先、方向键/Enter/Escape、重复/不存在词、多词/标点原样保留 | 通过；browser.json 共 167 项，包含下列边界 |
| 普通工作台 | 当前 Basic 5 词上限、移除恢复、随机排除当前库/已选、语言重绘、输入法 Enter、生成中禁用 | 通过；未把初始 3 词误当作 Basic 上限 |
| 后台预设 | 添加至 7 词、保留未保存标题、草稿切换、旧预览过期、重新预览、保存失败保留词语 | 通过；仍需显式发布，不影响线上样本 |
| 搜索失败与限制 | 两处 word-loading / word-error + retry；试用没有搜索/移除入口 | 通过；原型本地场景，不代表真实接口容错 |
| 补充交互 | 390×844 两页空态/点击添加/重复点击/清除/Tab/外点/ArrowUp/搜索保持可见；访客 3 词上限 | 18 项通过，见 interaction-check.json |
| 视觉 | 四张代表图逐图检查，见下表 | 选词区域层级、标签换行、搜索候选及现有表单对齐满足本轮设计目标 |

完整操作和结果：[browser.mjs](./evidence/ui26/browser.mjs)、[browser.json](./evidence/ui26/browser.json)、[补充操作](./evidence/ui26/interaction-check.mjs)、[补充结果](./evidence/ui26/interaction-check.json)。主脚本固定 reducedMotion，选词没有新增动画；不据此声称其他动效得到复验。主场景高 980px，补充手机高 844px；DPR 1。浏览器无 pageerror。

| 图片 | 场景 | 人工检查 |
|---|---|---|
| [01-create-desktop](./evidence/ui26/01-create-desktop.png) | 中文 1440px，搜索 o，未满额 | 头部数量和随机对齐，候选与搜索同宽，前缀加粗、列表内部滚动；展开浮层覆盖后续内容属于选词时暂态。 |
| [02-preset-desktop](./evidence/ui26/02-preset-desktop.png) | 中文 1440px，七词及旧预览 | 选词在标题和配置之间，标签自然换行，模型等配置对齐；旧正文和释义仍为同一快照，发布不可用。 |
| [03-create-mobile](./evidence/ui26/03-create-mobile.png) | 英文 390px，当前计划满额 | 五词换行，完整保留 coup d'etat；满额反馈与禁用随机清晰，无横向裁切。 |
| [04-preset-mobile](./evidence/ui26/04-preset-mobile.png) | 英文 320px，七词及搜索 | 标签、搜索和配置单列；无普通计划上限，长预览自然纵向滚动，没有新增固定空白区域。 |

预算为 4 个代表场景截图，最终送图 4 张。首次方法错误的 4 张截图原件保留，修正检查脚本重跑后写入 4 张最终图，共采集 8 张、送模 4 张。补充交互没有截图。没有进行生产截图像素比较、全站重测、真实服务生成、人工读屏、真实移动键盘或 Safari/Firefox 测试；本次结论仅为选词原型设计自检。

## 方法修正与证据保留

首次脚本有两处方法错误：把普通用户初始 3 个词误当作当前 Basic 上限 5；对已隐藏的 native select 调用需可见的 selectOption。原始脚本、FAIL 报告和图片保留于 [first-run](./evidence/ui26/first-run/browser.json)。改为从既有计划夹具取上限、填满后校验，并实际点击可见的统一选择器后重跑，业务预期未改。补充脚本最初尝试正常 click 一个 aria-disabled 候选而超时，保留 [原因](./evidence/ui26/first-run/interaction-check-error.json) 和原脚本；该单个防御断言改用强制点击，正常候选仍使用实际可操作点击。无需变更产品代码来消除这些误报。

UI25 文案审查、消息列表、试用只读、下拉框及其他无关业务结论按各自版本保留；本轮不能替代它们的新视觉批准。未覆盖的跨设备/真实服务行为交正式前端按既有方案接续，不新增用户决策。

## 来源与范围一致性

[静态检查](./evidence/UI26-static.json) 核对产品/控制接收摘要未变、575 个前后端文件未变、UI25 冻结包与原证据未改、25 PAGE/28 视图/49 CAP 继承、文案键及模板、JS 语法和设计链接。新增共享选择模块、两页接线、主题、文案、追踪和设计交接均冻结于 [UI26 快照](./evidence/M002-UI-26.tar.gz) 与 [清单](./evidence/M002-UI-26-manifest.json)，归档复核见 [freeze](./evidence/UI26-freeze.json)。

CR026 / D2-88-LOCAL-SCOPE 保持 OPEN；当前状态仍是 UI/UX、designer-tony，旧批准仍为 UI22/H01，UI26 待用户审阅。正式实现/独立 QA 未执行，真实模型调用 0，token/费用 unknown。
''')
(D.parent/'handoffs/uiux.md').write_text(front+'''
# M002 设计交接 · designer-tony

当前 **UI26** 执行用户对普通造文工作台、后台预设配置的选词交互优化，继承 PRODUCT04 与 UI25。UI/UX 角色仍在 064 接收后的同一阶段；旧批准是 UI22/H01，UI23–26 视觉待审。一次提醒的 **CR026 / D2-88-LOCAL-SCOPE 仍 OPEN**，没有自行决定缓存范围。

设计入口：[规格](../design/design-spec.md)、[前端差异](../design/frontend-delta.md)、[copy.json](../design/copy.json)、[交互](../design/interactions.md)、[响应式](../design/responsive-accessibility.md)。预览：[普通工作台](http://127.0.0.1:4186/prototype/?page=create&lang=zh&v=M002-UI-26)、[后台预设](http://127.0.0.1:4186/prototype/?page=presets&lang=zh&v=M002-UI-26)；默认隐藏审阅工具，`inspect=1` 显示，`state=word-error/word-loading` 在查询时展示对应状态。

本轮以 prototype/word-picker.js 统一两处：搜索候选、点击/Enter 添加、词签移除、去重、输入法和键盘、空态/加载/错误/满额。普通台保留随机和有效计划上限；后台改词保留其他输入、无需逗号分隔、不受普通计划上限限制，仍须重新预览后发布。固定词库、多词和标点完整条目、只读试用、线上样本隔离与预览释义快照保持。未新增字段、任意词输入、批量导入或搜索释义请求，未修改正式应用。

前端接收重点：GenerationWorkspace.vue 与 admin/presets.vue 使用相同的框架选择组件，复用现有搜索合同与词条标识，保留过期响应处理、有效计划/服务端校验和预设签名逻辑。不能复制设计 fixture 或逗号拆分旧实现，也不能只按截图重写文案。UI25 文案清理和 UI23/24 消息等继承要求见差异表。

验证：[报告](../design/validation.md)、[UI26 清单](../design/evidence/M002-UI-26-manifest.json)、[当前指针](../design/evidence/design-manifest.json)、[UI26 快照](../design/evidence/M002-UI-26.tar.gz)。167 项主浏览器检查及 18 项补充交互检查通过，4 张代表图已检视；原始方法失败记录保留。575 个正式源文件、产品与控制文件不变，UI25 原件保留。真实模型调用 0，token unknown。

下一具体动作：呈现 UI26 供用户审阅，后续前端按用户确认版本接收，并沿用已有实施/QA 常设授权。CR026 未决问题仍由 product-maya 接续，不因本次选词优化隐式关闭。此交接不等于新增视觉已获批准或独立 QA 已完成。
''')
images=[{'file':n,'sha256':hashlib.sha256((E/n).read_bytes()).hexdigest(),'inspected':True}for n in ['01-create-desktop.png','02-preset-desktop.png','03-create-mobile.png','04-preset-mobile.png']]
(E/'visual-review.json').write_text(json.dumps({'version':'M002-UI-26','status':'PASS','images':images,'screenshots_saved':8,'images_viewed':4,'scope':'Two word pickers only; details in validation.md','production_comparison':False},ensure_ascii=False,indent=2)+'\n')
