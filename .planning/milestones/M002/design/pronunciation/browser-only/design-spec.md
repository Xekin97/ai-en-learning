# M002-UI-32-R4 浏览器朗读接收

基于[产品08-R1](../../../product/pronunciation/browser-only/overview.md)及用户B；按持续推进至UAT授权提交。完整沿用R3+TA1布局、图标、触控/焦点，仅替换双音源场景和承诺。未改变页面视觉方向，旧源冻结保留。

## 来源与复现

静态服务根为`.planning/milestones`，当前4175；`M002/design/pronunciation/browser-only/formal/?page=result&lang=zh`。page可为plan/result/library/picker；picker无播放。原型在`prototype/`。scenario为browser/delayed/gesture/unavailable/accent；失效口音可加lost=en-US&alternatives=en-GB。样例继续使用M003前端书店fixture，不改业务内容。

- 当前文案唯一源copy.json（完整合并R3与TA1）；原型与正式稿共同读取。运行文案只转换pron.*；demo/formal页面说明不进入应用。
- theme.css引用原R3，controller.js保留同一SVG路径/状态/菜单规则；formal/prototype均消费本目录controller和copy。
- PAGE-402的`#pron-page-402-plan/#pron-page-402-result`及PAGE-403学习卡，标题与`[data-pron-control]`的内容顺序不变。PAGE-401不接入。

## 验收接收

UIA-M002-452～454沿TA1准确口音与单替代规则；原R3其余UIA视觉、焦点、移动端规则保留。新增UIA-M002-455：正常与延迟准备两场景完成均以browser为来源，无dictionary或fallback分支/可见声明。新准备演示不是生产等待要求。

设计浏览器检查见evidence/browser-report.json；原型演示不宣称声音实际可用。前端须按正式源转换样式、SVG、文案，检查实际三处入口与SSR/生命周期。产品scope与设计规则均清楚，无新业务问题。

本轮6组定向检查通过（计划/结果/文章、反向单替代、选后来源、排除选词）。首轮用动画中的包围盒判断18px，受既有pulse缩放影响误报；保留first-run，改用布局尺寸检查并重验通过，未修改设计预期。查看380px文章整页截图确认现有布局和局部裸图标；真实音频0次，用户可听性仍待UAT。
