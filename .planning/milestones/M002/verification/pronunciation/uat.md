---
milestone: M002
stage: verification
role: quality/base
agent_name: qa-quinn
version: M002-QA-PRON-01-R1
status: ready_for_user_uat
date: 2026-10-16
---

# 浏览器发音用户验收

入口：[http://localhost:3016/login](http://localhost:3016/login)。沿用 root 提供的 learner 账号；私有凭据只保存在本机 0600 文件中。

1. 打开已保存文章 [01a14352-828b-743a-b0fb-09bc1d6d85ee](http://localhost:3016/library/01a14352-828b-743a-b0fb-09bc1d6d85ee)，确认词标题旁是 18px 裸图标，没有常驻操作/状态文字。
2. 打开系统音量，点击一个词并实际听音：应只朗读当前词，页面进入时不得自动播放。
3. 播放 A 后立即点 B，再重播 B；确认旧声音停止，不重叠、不排队。
4. 播放中离开文章再返回，确认旧声音停止且不会自动继续。
5. 若本机有多个英语口音，打开当前词菜单选择另一项；若只有一项，控件不应显示来源文字。
6. 打开真实 [Create](http://localhost:3016/create)，按正常产品流程生成一次，检查计划与结果词义卡都可手动播放；计划退场时旧声音停止，结果不会自动播放。无需为了组合覆盖反复生成，也不评文章质量。
7. 真实手机尚未覆盖：当前入口只绑定本机 `localhost`，待后续具备手机可访问的环境后再补验。桌面缩窄窗口不能替代手机验收，本轮不新增 LAN 暴露或隧道。

请记录桌面系统/Chrome、是否实际听到正确词、A→B/重播/离页结果和可见口音；真实手机保持待补验。当前服务已保持运行，但 `user_uat_accepted=false`；完成桌面验收后请明确回复 PASS 或具体偏差。

本地运行参数与同一份简明步骤见 [发音 UAT 指南](uat-local-20261016/guide.md)。
