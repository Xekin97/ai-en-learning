---
milestone: M002
stage: technical-design
role: backend-architect/base
agent_name: backend-alex
version: M002-BE-PRON-02
status: awaiting_user_review
source_scope: user_confirmed_browser_only
readiness: architecture_review_only
date: 2026-10-16
actual_model: unknown
---

# 单词发音：首版浏览器朗读与实测补充

用户已选择**首版仅使用浏览器朗读**。当前建议是客户端直接使用`speechSynthesis`，移除FreeDictionary录音及其等待/回退流程；无需新增后端接口、服务器音频处理或许可说明UI。[决策原件](evidence/backend-followup/scope-decision.json)确认范围，未自动批准实现或完整技术出口。

## 1. 生效范围

本稿及[API-402 v2](api/browser-speech.md)是BE-PRON-01的局部替代：覆盖原方案中的双音源、API-401、录音许可、词典网络、Blob/CORS和词典→speech回退部分。原稿其余关于权益、原词、无业务请求、SSR隔离、取消、单页协调、无持久化的约束继续使用；旧文件及证据不改写。产品与设计源的同步按[CR-316](../../changes/CR-316.md)接收。

已批准视觉继续：18px裸图标、无边框/边距、状态在本词、无可见操作与状态文字、单选项隐藏来源、选词位置不播放。R3+TA1的实际口音选择及失效替代仍适用；仅浏览器来源不意味着所有设备只有一个可选口音。

## 2. 有界实测结果

本轮换用本机**已安装的有界面Chrome**与独立临时浏览器上下文；没有读取个人浏览器配置，没有mock或TLS绕过，没有改3016 UAT、账号、OpenRouter或应用代码。调用的词只有hello。

| 检查 | 实际结果 | 能证明的范围 |
| --- | --- | --- |
| 词条JSON、匿名fetch Blob录音探测 | 词条2502ms取消；录音2501ms到达下载/启动截止时间，无媒体事件 | 原目标网络当前未取得录音；不能推导供应商全球不可用。该路径随后因用户选择B退出首版 |
| 直接点击浏览器朗读 | 枚举190个设备声音；本次选Daniel/en-GB/localService=true；start约12ms，结束约2452ms | 此Mac/Chrome具备可调用的英语语音；不是必须使用Daniel，不保证190个都能播 |
| 请求失败后自动朗读（选择B之前补的旧架构缺口） | 2503ms词典超时，2512ms语音start，3973ms end | 该浏览器此时允许异步降级；已撤下路径的历史探测，不加入新版首版验收 |

原件：[probe.mjs](evidence/backend-followup/probe.mjs)、[probe.json](evidence/backend-followup/probe.json)、[fallback-probe.mjs](evidence/backend-followup/fallback-probe.mjs)、[fallback-probe.json](evidence/backend-followup/fallback-probe.json)。浏览器具体版本、事件与环境在原件中。不是产品集成测试、人工听音或移动真机结果；没有用事件声明用户确实听到声音。

不再在相同网络反复下载录音；其路径已退出首版，不需要为了关闭旧测试而重试。原无头浏览器0声音与超时记录保留，不能据此宣称实际桌面浏览器不支持朗读。

## 3. 资源使用核实与用户取舍

FreeDictionary的hello响应确实包含具体录音的来源与许可；本轮只读研究取得两份原文件元数据，HTTP200约0.88秒，确认作者及`AttributionRequired=true`。[元数据原件](evidence/backend-followup/source-metadata-response.json)、[请求记录](evidence/backend-followup/source-metadata-probe.json)。Wikimedia只是该响应指定的出处，没有作为新音源接入。

英音[原始说明](https://commons.wikimedia.org/wiki/File:En-uk-hello.ogg)署名Association Shtooka、Judith Franck，澳音[原始说明](https://commons.wikimedia.org/wiki/File:En-au-hello.ogg)署名Commander Keane。对应[CC BY 3.0 US §4](https://creativecommons.org/licenses/by/3.0/us/legalcode.en)与[CC BY-SA 4.0 §3](https://creativecommons.org/licenses/by-sa/4.0/legalcode.en)含署名条件；API免费或软件开源不是录音免署名的依据。

因此提交了两个具体方向，用户选择B，撤掉首版录音路径。**OPEN-401以范围移除关闭**，不宣称原录音条件已落实；A的统一许可入口未采用，也不为浏览器朗读增加该入口。若以后用户再引入录音，必须重新恢复资源条件与真实网络验收，不能沿用本次关闭作为许可证明。

## 4. 新架构及成本

`词卡点击 → 页面协调器 → 复核实际英语voice → speak → start/end/error → 本词图标`。voice未就绪时有限等待，选定口音失效按TA1明确选择替代；新词或离页取消旧播放。没有应用管理的外部词典请求、音频下载、Blob及其重试链，减少一次点击的等待环节。

延用前端已有预算：voice-ready最多1.5秒、start最多2秒、end最多12秒。可用声音已就绪则直接speak，不人为等待；点击前可枚举声音，不能自动朗读。具体错误/重试/口音规则见唯一合同，不复制旧双路径分支。

这项功能对自有业务后端新增请求数、音频带宽和队列占用均为0；页面本身的既有请求不在此计算中。浏览器声音可能由平台远程提供，因此不承诺离线或Google音色。容量无需MQ/并发池/服务器TTS；没有新依赖、表、迁移、密钥、模型调用或运营配置。

## 5. 下游变更清单

| 接收方 | 具体变更 | 保留部分 |
| --- | --- | --- |
| 产品 | 更新S401、CAP-402/403及涉及词典/回退的AC和DATA-402；OPEN-401注明范围移除；OPEN-402只保留浏览器真实验证 | 免费、原词、入口、非阻断学习、无整篇朗读 |
| 设计 | 在R3+TA1上同步浏览器单路径的演示及说明；选项由真实voice决定，不承诺词典录音/固定双口音；不新增许可入口 | 现有布局、图标、尺寸、焦点、局部状态、TA1明确替代规则 |
| 前端架构 | 删除free-dictionary适配器、录音DTO/Blob/媒体期限/CSP扩展；直接从点击进入speech；同步FE401-V2/V4/V6等词典相关断言 | 协调器、attempt token、speech适配器、三处组件、SSR、取消与voice终态预算 |
| 数据边界接收 | 确认DATA-402不再消费，DATA-403/404保留运行时状态 | 无表、无持久化、无迁移；无需重做存储设计 |

以上是待接收差异，不声称已由原产品/设计/前端作者完成；冻结批准稿仍保留。CR-316在接收齐备前保持open，用户已选择的B不再重复询问。

## 6. 验证与剩余条件

- **OPEN-401**：closed_by_scope_change，引用用户B；不再阻塞浏览器首版。
- **OPEN-402**：partial。原FreeDictionary部分withdrawn_by_scope_change；直接speech的本机start/end已取得，其他目标设备/网络及人工听音仍未验证。事件来自隔离探测，不是应用验收。
- **OPEN-403**：open / frontend-bob。保留声音延迟就绪、无英语、手势重试、取消/晚事件和真实设备覆盖。此桌面一次成功不覆盖iOS/Android，也不验证1.5秒声音等待后丢失手势的情况。
- **CR-316**：方向confirmed、下游接收pending。完成后由既有门禁结合设备证据判断技术出口，不能把范围删减当成所有测试通过。

无需重测已移除的词典、媒体或署名UI；后续确定性测试聚焦speech端口和生命周期，真实UAT用实际设备。测试角色不评价文章质量或模型漏判。

本轮专业产物及探测脚本有静态链接/哈希检查，详见[提交清单](evidence/backend-followup/delivery-manifest.json)和[静态检查](evidence/backend-followup/static-check.json)。不修改生产代码，不以文档静态通过代替功能验收。当前阶段保持technical-design，本稿提交审阅；正式角色路由交守门器，不自行切换实现或收尾M002。
