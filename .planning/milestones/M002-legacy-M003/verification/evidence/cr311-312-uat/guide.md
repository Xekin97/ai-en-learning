# CR-311/312 真实 UAT3015 使用说明

当前入口：<http://127.0.0.1:3015/create>；管理员模型只读核对：<http://127.0.0.1:3015/admin/models>。账号仍从本机 `/tmp/wordweave-m003-uat-real-003/uat-accounts.json` 读取，密码未写入证据或本文。

环境已经刷新到 QA07 通过的 CR-311/312 前后端，使用原 PostgreSQL、账号、数据和 3 个已保存真实模型。没有 mock、请求拦截、回放 provider 或认证绕过。准备过程没有点击 Generate/preview，没有发起新 provider 调用；调用账本前后均为 23 条。

用户最短验收：

1. 在 Create 验证 `THE/and/you` 不作为 exact 候选，同时 `theater/art/go` 可用，Random 不返回排除词。
2. 用 Basic 或 Pro 账号登录，选择已保存模型并实际点击 Generate。该操作会调用真实外部 API，可能产生费用。
3. 观察 Plan 保留、正文逐步出现、完整 Result 后才可保存。若模型自然触发审校或返修，再观察变化段替换和旧稿恢复；没有自然触发就记“条件未触发”，无需制造失败。
4. 如需验证下一次生成，先修改设置，再检查放弃确认；确认会产生另一条真实调用。
5. 管理员 preview 仅在确有需要时执行；每次 preview 也可能产生真实调用。reduced-motion 可由系统偏好开启后观察。

当前用户 UAT 为 **NOT RUN**。准备证据不评价文章质量，也不保证真实模型一定触发 Q02、repair 或服务失败。
