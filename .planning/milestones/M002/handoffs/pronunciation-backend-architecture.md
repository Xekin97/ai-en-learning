---
milestone: M002
stage: technical-design
role: backend-architect/base
agent_name: backend-alex
status: awaiting_user_review
version: M002-BE-PRON-01
readiness: architecture_review_only
date: 2026-10-16
requested_model: gpt-6-astra
requested_effort: high
actual_model: unknown
---

# 单词发音后端架构交接

提交 M002-BE-PRON-01 架构审阅稿；推荐FreeDictionary客户端直连，失败后浏览器speechSynthesis兜底。当前没有实现发音，未证明真实浏览器播放成功；OPEN-401～403保持开放，不能将本交接当成技术阶段整体通过或上线许可。

## 已批准输入与确认闭环

- [产品08](../product/pronunciation/overview.md)、[UI32-R3接受交接](pronunciation-uiux-accepted.md)、[DB-PRON-01](../technical/pronunciation/database.md)、[门禁134](../reviews/pronunciation-backend-entry-134.md)。原数据稿中的待审字段是冻结提交时事实，接受状态以134与工作流为准。
- 用户本轮纠正音源范围，原话及回到最初speechSynthesis记录的解释见[scope-clarification.json](../technical/pronunciation/evidence/backend/scope-clarification.json)。FreeDictionary返回的Wikimedia链接只作为来源元数据；不加入新音源、不加入Google Cloud/Translate接口。
- 之前提出的页底音频来源入口未获采用，已撤回，不扩展为产品/设计需求。原来的资源使用条件问题继续在OPEN-401中处理；本轮纠正没有构成许可豁免、后端方案批准或新增入口批准。
- 无需重新确认裸图标、控件内状态、选词不播放、所有用户免费等既定要求。新架构选择和数值预算在主方案明确为待审建议，未实施。

## 本次产物与具体接收

- [backend.md](../technical/pronunciation/backend.md)：原方案范围、真实探测、直连/代理取舍、模块边界、超时取消、安全、成本和BE401-V1～V6。
- [API-401/402合同](../technical/pronunciation/api/index.md)：FreeDictionary外部GET/音频处理和浏览器非HTTP能力；没有新增项目后端端点。词条/媒体开始各2.5秒、响应/音频大小限制是待审预算。
- [ai-integration.md](../technical/pronunciation/ai-integration.md)：发音不进入模型、审稿、额度、生成或保存流程。
- **BE401-F1 → frontend-bob**：接收客户端适配器、单页面协调器、R3控件三个职责；明确现有卡片组件落点及计划转结果生命周期，补齐OPEN-403的voice-ready/start/end期限、支持设备、手势重试、取消和焦点规则。
- **BE401-F2 → frontend-bob**：验证浏览器对FreeDictionary JSON与录音的匿名CORS、fetch Blob方案、对象URL释放、最终HTML CSP；不能用放宽安全设置/携带凭据解决网络失败。浏览器失败不得扩展为新供应商或自动后端代理。
- **BE401-B1 / backend-alex保留责任**：OPEN-401的FreeDictionary资源级使用条件落实、OPEN-402的供应商/目标网络验证。后端将已发现信息交前端，不将资源使用问题推给其自行猜测UI方案。

## 证据与验证边界

命令行 `hello` 一次HTTP200约1.077秒，响应有CORS允许头；其他词/音频超时。独立Chromium真实词条和媒体请求超时、无可用声音。没有实际播放成功、人工听音、移动设备或最终部署区域证据。

- [原始HTTP探测](../technical/pronunciation/evidence/backend/network-probe.json)、[音频补充探测](../technical/pronunciation/evidence/backend/network-audio-probe.json)、[真实浏览器探测](../technical/pronunciation/evidence/backend/browser-probe.json)、[探测脚本](../technical/pronunciation/evidence/backend/browser-probe.mjs)。探测无mock、无TLS跳过、无账号/Key/模型调用；临时页面已关闭，没有修改UAT。
- [源哈希](../technical/pronunciation/evidence/backend/input-manifest.json)、[静态核对](../technical/pronunciation/evidence/backend/static-check.json)、[提交回执](../reviews/evidence/pronunciation-backend-submission-134/submission-receipt.json)。静态核对只证明文档/链接/冻结源和状态一致，不代表BE401-V1～V6或AC-410通过。
- 产品实现尚未开始；本轮不运行既有应用单测、迁移或服务重启，也没有改真实OpenRouter配置。请求次数/耗时只来自这次小样本，不推导稳定成功率或生产容量。

## 未决事项与完成条件

| ID | 当前状态 | 下一动作与阻塞范围 |
| --- | --- | --- |
| OPEN-401 | OPEN；已得到FreeDictionary资源级许可信息，落实方式未完成 | backend-alex继续核实原来源使用说明；如必须改UI才提出有据局部差异。未闭环前不能把资源标为可上线；不重新引入已撤回入口 |
| OPEN-402 | OPEN / 本地探测部分成功，音频未通过 | 后端/前端在目标环境取得词条→录音→播放事件和人工确认，补缺词与单音源样例；目前不宣称生产可用 |
| OPEN-403 | OPEN / 前端责任 | 补齐浏览器声音就绪、手势、取消、有限终态与设备矩阵；当前无头环境0声音是限制证据，不是支持范围结论 |

这些事项允许继续不依赖其结论的架构设计和确定性合同验证，但阻止宣布完整语音交付/技术出口已就绪。未新增CR或默认迁移回产品设计；未把用户对音源范围的纠正当作任何一项已解决。

## 文档整理与下一步

当前权威入口为上述三份技术文档及本交接，范围纠正在主方案第1/5节；原产品、R3、DB方案、CR313技术/验收、历史提交及冻结证据保持。DATA-401～404、CAP-401～404、PAGE-402/403和PAGE-401排除边界沿原编号；新增API-401/402、BE401-R1～R6、BE401-V1～V6不与既有条目冲突。

本轮由主会话按活动backend-alex角色执行，没有新建专业线程或声称模型切换；actual_model/usage未知。已检查当前文档链接，未做新会话交接测试。

建议审阅本架构方向后，再经既有角色门禁交frontend-bob接收BE401-F1/F2；backend-alex的开放项继续保留，不自动批准技术阶段、实施或M002收尾。
