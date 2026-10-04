# CR029 本地3302交付

当前地址：http://127.0.0.1:3302/admin/models。原账号、3个模型、密钥、计划和学习记录保留；通用模型新功能等待用户验收。本地已更新，不是生产发布。

[准备输入](inputs.json)、[备份摘要](backup.json)、[完整备份恢复与迁移演练](restore-rehearsal.json)、[部署结果](deployment.json)、[3项真实浏览器冒烟](smoke.json)。0015升级前后59张原业务表全部原字段一致；新增ai_providers与加密凭据表，原模型引用保留。运行env没有改动，原始配置/二进制/前端/数据库全备份保存在inputs.json所列0700私有目录，密钥未写入证据。

首轮演练因模型updated_at被触发器更新而中止，原数据库未执行迁移；修复与复验见[first-attempt.json](first-attempt.json)。首轮浏览器移动端脚本预设英文，账号实际中文，定位等待超时；按实际语言定位后通过。保留首轮失败，不以覆盖文件掩盖。

恢复当前服务（不重置数据、不seed）：从项目根目录运行 `python3 .planning/milestones/M002/delivery/generic-models-3302-20261001/preview.py status` 查看状态；完整停止后用 `resume` 恢复。以/tmp/wordweave-m002-integrated-current指针与processes.json为当前事实，不运行旧qa2-026启动脚本。

本轮0真实模型调用、0浏览器配置写入；三协议收费连接测试由管理员显式操作。未提交Git。完整回退需停止写入后使用私有数据库备份与对应旧二进制/前端一起恢复；不要用旧结构直接覆盖新数据。


## 测试按钮状态修复

CR029-F02已通过[前端增量更新](test-state-deployment.json)同步3302；[实际包检查](test-state-smoke.json)通过，仅当前模型显示加载与结果。后端进程、数据库和服务商配置保持，processes.json的build字段已指向新前端；仍使用preview.py动态恢复。


## 2026-10-01 UI30 增量

本地 3302 已更新服务商优先批量表单和严格流式测试。更新由 update-provider-batch.py 完成，仅替换 Go/Nuxt，无迁移、无模型配置写入；原环境参数/加密凭据摘要相同。当前 release 在私有 WORK/provider-batch-ui30-20261001；之前 release 保留。继续用本目录 preview.py status|stop|resume 读取动态状态，勿重跑旧0015部署脚本。provider-batch-deployment.json 保存源/产物摘要，provider-batch-smoke.json 保存桌面/手机定向结果（真实模型探测拦截，0付费调用）。用户新UI验收待反馈。
