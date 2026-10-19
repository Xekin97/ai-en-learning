---
milestone: M002
version: M002-PRODUCT-08-R1
agent_name: product-maya
status: submitted_under_continuation_authorization
date: 2026-10-16
---

# 单词浏览器朗读

首版只使用用户设备/浏览器提供的英语朗读能力。用户点击学习卡片旁的播放图标听当前原词，遇到不可用声音可就地重试，学习和生成流程继续。

## 已确认范围

- S401：用户选择B，取消FreeDictionary词典请求及录音路径；不新增音频署名入口。来源：[用户答复](../../../technical/pronunciation/evidence/backend-followup/scope-decision.json)、[CR-316](../../../changes/CR-316.md)。
- S402：仅PAGE-402生成计划/结果词义卡、PAGE-403已保存文章学习卡。PAGE-401选词不播放；依据CR-314及已批准R3+TA1。
- S403：游客、普通和付费用户均免费，不扣造文额度；原页面访问权限不变。只读当前原词，不朗读整篇、用法或释义。
- S404：每词18px裸图标；无边框、边距和可见操作/状态文字；状态在控件内，单可选声音不显示来源文字。键盘和读屏仍能识别当前词与状态。

不承诺固定Google声音、固定英美双音、真人录音或离线。无可用英语声音是可重试的局部失败，不新增TTS服务、麦克风、账号设置、音频下载、播放历史或管理台配置。

当前唯一产品基线为本目录五份文档及[交接](../../../handoffs/pronunciation-product-browser-only.md)，替代旧发音产品稿与本次范围冲突的部分。稳定DATA/CAP/PAGE/AC编号继续使用，旧源保留可恢复历史。

## 未完成项

OPEN-401因用户取消词典范围关闭，不代表许可通过。OPEN-402保留浏览器真实播放与人工听音；本机Chrome已有start/end事件，跨设备未验。OPEN-403保留声音就绪、手势、取消、有限失败与真机覆盖。实现前应有明确契约，集成和听音在验证/UAT完成，不能把旧词典验证作为新方案前置。

用户已授权持续推进到下一次本地真实UAT；功能接入及测试均尚未在本产品修订中完成。UAT由用户验收，M002不收尾。
