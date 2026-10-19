---
milestone: M004
agent_name: product-maya
status: awaiting_user_review
date: 2026-10-15
---

# AI 与发音行为边界

CONFIRMED：[S401/403](overview.md) 明确本功能不依赖大模型生成语音、不扣造文额度。浏览器语音是已选的回退能力，不新增 OpenRouter 模型、提示词、语音模型或付费 TTS。原有造文、审稿、返修、保存及权益规则继续适用，不因听词而触发或等待这些操作。

| 项目 | M004 约束 |
| --- | --- |
| 输入与配置 | 当前被点击的 DATA-401 单词；仅实际可用口音选择。无新 AI 配置。 |
| 输出与状态 | 单词音频播放或浏览器朗读；局部准备、播放、回退、失败和可重试状态，详见 CAP-401～404。不会向文章输出流追加语音字段或词典释义。 |
| 用户控制 | 点击尝试、切换词/口音、重听与重试；不自动播，不新增保存音频动作。 |
| 失败与中断 | 发音失败按 CAP-402 收敛，不触发文章重新生成、模型重试或退款流程。原有 AI 流未完成/中断时，不因发音把草稿标为可保存。 |
| 权益与成本 | 原页面允许访问即可免费尝试听词；任何发音结果都不消耗造文额度，不新增收费模型调用。 |
| 隐私与信任 | 只处理当前词；词典来源和浏览器合成区分，不将合成宣称真人音频，不保证所有设备离线；不修改文章语境释义，不宣称解决同形异音语境消歧。 |

以上行为细化为 PROPOSED，审阅后作为实现约束。[MDN SpeechSynthesis](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis)说明可取得当前设备声音并控制朗读；[localService](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesisVoice/localService)说明声音服务可能本地或远程，因此浏览器 API 可用不能替代真实声音及网络验证。

验收对应 [AC-403～410](abilities.md#acceptance)；QA 遵循[项目范围政策](../../../agt/qa-scope-policy.md)，验证发音功能、权限/额度、取消/错误和既有生成流程的隔离，不增加文章质量评估或真实模型调用。当前文档核对不是浏览器实测，技术待办见 [OPEN-401～403](overview.md)。
