---
milestone: M002
stage: implementation
role: frontend-implementer/base
agent_name: frontend-claire
version: M002-FI-PRON-01-R1
status: complete
date: 2026-10-16
mode: requirement-acceptance
---

# 浏览器朗读前端开发验证

## 范围与环境

覆盖 FE402-1～4、CAP-401～404、PAGE-402/403、API-402 v2 与 UIA-M002-451～455 的前端可证明部分。4175只读设计服务可用；3016/3017/43331、真实模型/数据/DB保持不动。确定性浏览器测试允许fake speech/clock，但不能证明真实声音、人工听音或设备兼容性，最终真实UAT保持pending。

## 运行前矩阵

| 范围                   | 场景/定位                                                 | 预期                                                                                                | 方法与证据                                               |
| ---------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| FE402-1 / CAP-402～404 | 协调器与browser端口                                       | 默认/单多口音、voiceschanged、1.5/2/12秒、手势、重播、跨词取消、晚事件无污染                        | Vitest fake port/clock；原始stdout                       |
| FE402-2 / UIA-452～455 | `WordPronunciation`、4175 formal 的 `[data-pron-control]` | R4 copy/SVG/CSS；18px裸图标；单源无标签；失效口音含单替代明确选择；菜单键盘/焦点/live               | 组件/浏览器结构断言；正式设计只读对照；代表截图          |
| FE402-3 / PAGE-402     | create计划/结果词义卡                                     | 只读entry；planLeaving立即失效/inert；结果新surface；picker/trial/admin/preset无入口                | 定向unit/浏览器；DOM、焦点、调用计数                     |
| FE402-3 / PAGE-403     | `/library/[batchId]`学习卡                                | 每词标题旁控件；route/batch/session/卸载取消；原权限/保存数据不变                                   | 定向unit/浏览器；无额外API断言                           |
| FE402-4                | 工程边界                                                  | application无DOM/Vue，presentation不导入infrastructure，SSR不访问speech对象；production build可生成 | dependency-cruiser、typecheck、lint、Prettier、隔离build |

视觉证据软上限3张（结果桌面、计划移动、library移动/长词菜单择要），送模最多2张；仅在实际差异或失败无法判定时追加。状态机与取消优先用结构化断言。

## 结果矩阵

| 范围                          | 结果                      | 实际证据与边界                                                                                                                                                                                                                                                                                                                                                                                         |
| ----------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| FE402-1 / AC-403～406         | PASS（开发）              | 纯协调器、原生适配器共覆盖实际默认英语、英/美/未知地区代表、无声音1.5秒、开始2秒、结束12秒、not-allowed手势、重播/跨词、cancel前令牌失效、晚start/end/error、显式声音消失和唯一替代。最终4个发音测试文件18项PASS。                                                                                                                                                                                     |
| FE402-2 / UIA-M002-451～455   | PASS（开发）              | 4175正式设计接收11/11；R4运行copy、8种SVG、控件/菜单/减少动效CSS由`sync-design.mjs`生成，demo/formal键排除。SSR测试确认首屏仅稳定speaker、无菜单。组件测试覆盖单项无来源文字、双项菜单、单替代、方向/Home/End/Escape/回焦。                                                                                                                                                                            |
| FE402-3 / AC-401/408          | PASS（源码与共享控件）    | `pronunciationEnabled`继续负责入口opt-in，trial/preset/admin保持关闭；已启用词义卡内`pronunciationActive`默认true，计划退场时才显式false。planLeaving先同步cancel surface再inert，并只在原焦点属于退出控件时回同entry结果或workspace。session epoch、route、surface、卸载、删除均释放。                                                                                                                |
| PRON-DEFECT-001 / AC-405      | PASS（R1开发复验）        | 修复结果词义卡因省略Boolean prop而被Vue转成false的问题；结果按钮现在可操作，焦点从同entry计划按钮转入结果按钮且不自动播放。真实后端session + 隔离R1 production output + 浏览器原生speech受控链16/16 PASS：首次焦点样本已在结果surface，旧计划cancel 1次，随后手动点击结果得到native start/end；无模型/DB写入。见`r1-controlled-plan-result.json`与`raw-checks/r1-browser-controlled-plan-result.log`。 |
| 真实API library + fake speech | PASS（开发）              | 临时3019代理、43240 Nuxt、真实43331和既有learner文章；5个真实学习卡控件。390px下图标18×18、无可见操作文字、scrollWidth=viewport=390、菜单不溢出、卡高99→99。A→B只cancel 1次，A晚end时B仍playing；显式GB消失后仅US仍须点菜单选择，警示点击不发声；console/page error 0。原始结果见`raw-checks/browser-real-api-fake-speech.log`。                                                                       |
| 工程门                        | PASS                      | 复用首版dependency-cruiser与无关测试结果；R1受影响范围在Node24下typecheck、scoped ESLint 0 error、Prettier、焦点定向2项及隔离production build均PASS。原始stdout见`raw-checks/r1-*.log`。                                                                                                                                                                                                               |
| AC-410真实可听性              | 部分开发证据，UAT pending | R1桌面Chrome链已取得真实浏览器`speechSynthesis`的native start/end事件，证明结果控件能调用本机voice并完成事件生命周期；尚未由人耳确认实际扬声器声音，也未验证手机、其他设备或不同voice目录，因此不能写成真实可听UAT通过。                                                                                                                                                                               |

## 开发中修复

- 首次build暴露`exactOptionalPropertyTypes`默认值类型，已补明确`undefined`联合后重建；首错保留为`build-first-fail.log`。
- 首次实际页面发现嵌套生成图标未被Nuxt按短名自动解析，改为`WordPronunciation`显式import后，实际页面console/page error归零并最终重建。
- 43240直连登录因已配置public origin被403；使用QA只读代理模板的/tmp副本在3019映射origin完成自检，没有改后端配置或3016。
- QA首版发现计划→结果焦点落到BODY。R1追踪确认焦点请求已捕获且同entry目标已找到，但`GenerationVocabularyList`的可选Boolean在结果区省略时被Vue转成false，令目标持续disabled。组件现明确默认`pronunciationActive: true`，计划退场仍显式传false；临时追踪和帧重试均未保留。

## 未执行变体

- 手机与其他设备浏览器、人工听音、后台标签页及浏览器级voice热插拔；R1已执行桌面Chrome native start/end事件链，但不等于这些未执行项。
- 真实模型生成后的计划→结果全过程；R1仅用浏览器内存注入受控plan/result状态复验真实DOM、焦点和原生speech，没有触发模型、额度或新数据。
- trial/admin/preset/explore/review逐页浏览器遍历；本轮以默认关闭的数据流和调用点检查证明排除，QA可做最终回归抽样。
- library删除、logout、route切换的完整UI手工链；协调器surface/release/session代码和定向单测已覆盖取消基础语义。
