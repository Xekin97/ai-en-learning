---
milestone: M002
stage: verification
role: quality/base
agent_name: qa-quinn
version: M002-CR313-UAT-01
status: ready_for_user_uat
date: 2026-10-16
---

# CR313 本地用户验收

服务已启动并保持运行。打开 [http://localhost:3016/login](http://localhost:3016/login)，使用root单独提供的本地管理员账号和密码登录。账号只属于本机合成UAT；私有值保存在 `/private/tmp/wordweave-m002-cr313-uat-20261016/credentials.env`（0600），没有写入证据或仓库。

## 建议最短验收路径

1. 打开[模型](http://localhost:3016/admin/models)，确认页面明确显示 `SYNTHETIC UAT`、模型为 Disabled，并能看到“Import configuration / Export configuration”。普通模型导出不含凭据，重新导入会按合同拒绝。要验证成功流程，请勾选 **Include API keys (encrypted)**、自行设置文件密码并导出，再用同一密码导入该文件。
2. 打开[计划](http://localhost:3016/admin/plans)，导出配置。再导入导出的文件或 `samples/plans.json`，核对完整替换预览，继续确认替换，然后刷新页面验证配置仍可正常读取。
3. 打开[成长操作](http://localhost:3016/admin/growth)。默认 **Items** tab对应道具类别；切换 **Check-in rules / Levels / Achievement tiers** 后对应成长类别。分别确认导入、导出入口。
4. 可用 `samples/items.json` 与 `samples/growth.json` 完成 **导出 → 导入预览 → 确认完整替换 → 刷新验证**。另做取消场景时，在预览页点 **Cancel**，确认没有提交且页面当前配置保持不变。
5. 本轮模型是禁用的测试配置，provider指向不可达的本机端口9；验收范围是配置导入导出，不提供真实造文服务。

样本目录：`/private/tmp/wordweave-m002-cr313-uat-20261016/samples`。普通模型文件只适合核对无Key导出合同；加密模型文件中的Key是合成值。

## 当前准备结果

真实浏览器已通过普通登录、三个页面的四类别入口、四个普通JSON导出，以及plans预览后取消且revision不变。完整结果见 [readiness.json](readiness.json) 和 [readiness-smoke.json](evidence/readiness-smoke.json)。这只证明环境可供验收，不代表用户已经接受UAT。

## 生命周期

以下脚本只操作本轮 `/private/tmp/wordweave-m002-cr313-uat-20261016` 环境，停止/重启会保留PostgreSQL数据和已构建前端：

```sh
/private/tmp/wordweave-m002-cr313-uat-20261016/uat-status.sh
/private/tmp/wordweave-m002-cr313-uat-20261016/uat-restart.sh
/private/tmp/wordweave-m002-cr313-uat-20261016/uat-stop.sh
/private/tmp/wordweave-m002-cr313-uat-20261016/uat-start.sh
```

现有3015与4174/4175/4176服务、既有数据库均未修改。完成验收后请明确告诉root结论，再决定是否停止本轮UAT；当前不得据此关闭CR313或M002。
