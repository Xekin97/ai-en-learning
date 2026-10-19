---
milestone: M002
version: M002-BE-PRON-01
status: proposed
date: 2026-10-16
---

# 单词发音与AI生成的边界

本增量不调用项目大模型、OpenRouter、Google Cloud TTS或付费语音生成；使用FreeDictionary与浏览器speechSynthesis，合同见[API-401/402](api/index.md)。本文件满足技术交付中的AI边界说明，不新增AI编排。

- 既有生成模型、提示词、释义/场景/正文流、付费审稿与返修、次数限制、审核记录及额度结算全部沿原范围；发音不新增generation_run、不走AI Gateway、容量闸门、usage或退款。
- 输入仅为当前卡片entry，不能把文章上下文或释义发给第三方；FreeDictionary返回的词义不覆盖AI生成释义。声音不作同形异音的语境准确性承诺。
- 播放、失败和重试不改变文章可保存状态，不阻断流式展示；组件生命周期变化应取消旧播放，责任在页面协调器。
- 浏览器语音名称及localService来自当前设备，不据“Google控件”的称呼假定固定声音、离线保证或账号权益。[浏览器声音属性](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesisVoice/localService)
- 验证使用已有词卡/文章数据及必要公共词条探测，不为发音额外生成文章或执行真实模型请求。QA遵守[既有职责政策](../../../../agt/qa-scope-policy.md)，验证功能和隔离，不做文章质量或模型语义评判。

真实UAT与保存的OpenRouter配置未改动；本轮没有模型调用或DB操作。首版开放项仍为[主方案](backend.md)中的OPEN-401～403，不以“无LLM调用”替代语音功能验证。
