---
milestone: M002
stage: verification
role: quality/base
agent_name: qa-quinn
version: M002-QA-PRON-01-R1
status: ready_for_user_uat
date: 2026-10-16
---

# 浏览器发音本地真实 UAT

服务已启动并保持运行。打开 [http://localhost:3016/login](http://localhost:3016/login)，使用 root 提供的 learner 账号登录。私有凭据只保存在本机 `/private/tmp/wordweave-m002-cr313-uat-20261016/uat-private.json`（0600），没有写入仓库或证据。

## 最短验收

1. 打开[既有已保存文章](http://localhost:3016/library/01a14352-828b-743a-b0fb-09bc1d6d85ee)，确认词标题旁只有 18px 裸图标，没有常驻播放或状态文字。
2. 开启系统音量，点击一个词并实际听音：应只朗读当前词，进入页面时不得自动播放。
3. 播放 A 后立即点 B，再重播 B；确认旧声音停止，不重叠、不排队。
4. 播放中离开文章再返回；旧声音应停止，返回后不自动继续。
5. 若本机有多个英语口音，打开当前词菜单选择另一项；若只有一个实际选项，不应显示来源文字。
6. 打开真实 [Create](http://localhost:3016/create)，按正常产品流程生成一次，检查计划与结果词义卡都可手动播放；计划退场停止旧声音，结果不会自动播放。无需反复生成，也不评文章质量。
7. 真实手机尚未覆盖：当前入口只绑定本机 `localhost`，待后续具备手机可访问的环境后再补验。不要把桌面窄窗口当作手机证明，本轮也不新增 LAN 暴露或隧道。

QA 已证明真实 Chrome native start/end、A→B/重播/离页取消、结果按钮与焦点、无自动播放和零播放业务写请求。用户在 `/create` 主动生成时使用当前已保存的模型配置，并遵循现有模型和额度规则；发音 QA 没有修改模型、数据库或额外调用模型。

## 结果

请回复桌面系统/Chrome、是否实际听到正确词、A→B/重播/离页结果和可见口音；真实手机保持待补验。当前 `user_uat_accepted=false`；本指南不表示 M002 已收尾。
