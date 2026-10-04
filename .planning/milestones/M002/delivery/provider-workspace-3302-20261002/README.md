# 本地3302服务商工作区交付（UI31 / QA36）

入口 http://127.0.0.1:3302/admin/models。当前release位于私有WORK/provider-workspace-ui31-20261002-r3/release；`preview.py status|stop|resume`读取动态processes.json、原env启动，不重置数据/密钥。当前0016账本已应用，不再运行deploy.py。

`deployment.json`记录源码和发布产物SHA256；`restore-rehearsal.json`证明当前备份恢复并执行0016后60表业务数据一致。`database-before.json`与`database-after.json`仅含行数/摘要，无用户正文或密钥。完整备份在私有WORK对应目录/before.dump，权限0700父目录，未提交仓库。迁移未改任何业务行，仅把名称唯一范围改为服务商、增加窄权限凭据更新函数。

演练恢复仅使用--no-owner以映射原环境测试owner到隔离owner，保留ACL。最小权限功能另由真实app/ai角色集成验证。两次前序方法失败在initial-rehearsal保留；原库未迁移时已自动恢复旧服务。最终通过后才运行真实页面冒烟。`smoke.json`证明桌面/手机服务商分组、整组编辑/添加、单项反馈及不保存；探测拦截、0真实模型调用、0原配置写入。

回退：旧后端会严格核对迁移账本，不能带0016直接启动。脚本只在本次切换失败且业务摘要完全未变时撤销0016函数/索引/账本恢复旧进程。当前交付成功后如已有新配置（尤其跨服务商同名模型），应前滚修复，不能直接套用旧全局唯一索引或恢复旧备份覆盖新数据。未执行生产部署、Git提交；用户新版本验收待反馈。
