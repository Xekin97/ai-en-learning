---
milestone: M002
stage: verification
role: quality/base
agent_name: qa-quinn
version: M002-QA-PRON-01-R1
status: ready_for_user_uat
date: 2026-10-16
---

# M002 本地真实 UAT

服务已启动并保持运行。入口是 [http://localhost:3016/login](http://localhost:3016/login)。发音验收使用 root 提供的 learner 账号；配置可移植性使用既有 admin 账号。私有值仅在 `/private/tmp/wordweave-m002-cr313-uat-20261016` 的 0600 文件内，不在仓库或证据中。

## 浏览器发音最短路径

1. 打开既有[已保存文章](http://localhost:3016/library/01a14352-828b-743a-b0fb-09bc1d6d85ee)，确认词标题旁只有 18px 裸图标，没有常驻播放/状态文字。
2. 开启系统音量，点击一个词并实际听音：应只读当前词，进入页面时不自动播放。
3. 播放 A 后立即点 B，再重播 B；确认旧声音停止，不重叠、不排队。
4. 播放中离开文章再返回；旧声音应停止，返回后不自动继续。
5. 若本机出现多个英语口音，可打开当前词菜单选择另一项；只有一个实际选项时不显示来源文字。
6. 打开真实 [Create](http://localhost:3016/create)，按正常流程生成一次，检查计划与结果词义卡都能手动播放；计划退场停止旧声音，结果不自动播放。无需反复生成，也不评文章质量。
7. 在真实手机重复第 1～4 步。桌面窄窗口只证明布局，不能代替手机或人耳验收。

QA 已在真实 headed Chrome 证明 native start/end、A→B/重播/离页取消、结果按钮/焦点、无自动播放和 0 播放业务写请求。人耳听感与真实手机仍须用户填写结论。

## 配置可移植性原 UAT 路径

- [模型](http://localhost:3016/admin/models)：普通导出不含凭据；成功回导需勾选 **Include API keys (encrypted)**、自行设置密码，并用同一密码导入。
- [计划](http://localhost:3016/admin/plans)：可执行导出 → 导入预览 → 确认完整替换 → 刷新验证；取消预览时不得提交。
- [成长操作](http://localhost:3016/admin/growth)：Items 与成长规则各有导入/导出入口。

用户在真实 `/create` 主动生成时使用当前已保存的模型配置，并遵循现有模型和额度规则；本次发音 QA 没有修改模型配置或额外调用模型。

## 生命周期

以下脚本只操作本轮本地 UAT；停止/重启保留 PostgreSQL 数据和当前前端输出：

```sh
/private/tmp/wordweave-m002-cr313-uat-20261016/uat-status.sh
/private/tmp/wordweave-m002-cr313-uat-20261016/uat-restart.sh
/private/tmp/wordweave-m002-cr313-uat-20261016/uat-stop.sh
/private/tmp/wordweave-m002-cr313-uat-20261016/uat-start.sh
```

当前 `user_uat_accepted=false`。完成后请向 root 明确回复 PASS 或具体偏差；本页不表示 M002 已收尾。
