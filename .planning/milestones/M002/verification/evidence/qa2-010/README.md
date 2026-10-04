# QA10 · 分析生命周期

授权APPROVAL-M002-036，qa-quinn限定API209/900与BE2-V14/15；当前有效来源PRODUCT03/UI22-H01/DB03/BE03/FE02。

## 复现

从产品根目录，以Node24和现有依赖执行。须新的一次性PG库，不连接正式数据。旧证据不可覆盖；复验应复制脚本到新证据目录。`harness.mjs`强制数据库63541与loopback provider38082。

1. `python3 frontend/tests/integration/m002-local-stack.py`：构建运行用Go二进制、迁移一次性库、创建私有合成管理员。不是重跑开发检查。
2. `node <新证据目录>/analytics-lifecycle.mjs`：复制本轮harness/api-support/provider-fixed到同目录。等待实际分钟任务三次。本轮原件有A09超长用户名422准备失败，其余9项通过；保留原脚本与结果。
3. `node <新证据目录>/deletion-control.mjs`：依赖主轮生成的fixture.json和同一个临时数据库。合法短名称重新建立多账号共用浏览器，定向A09通过，0模型调用。
4. `node <新证据目录>/stalled-maintenance.mjs`：持有聚合advisory锁、回拨检查点5分钟，等待实际分钟任务错误；断言过期行保留/查询delayed及UV不可用。0模型调用，退出释放锁。
5. `python3 frontend/tests/integration/m002-local-stack.py stop`：停止Go和PG。本轮代理、Chromium和本地provider由脚本finally停止。未启动前端页面服务。

`finalize.py`仅用于本轮记录整理：依赖已完成结果/停服记录，写五份QA文档、索引及manifest；不属于产品或通用测试入口，不应在未来轮次原地重跑覆盖冻结证据。

## 期望与证据

主轮9PASS/1测试夹具FAIL + A09定向PASS + A11PASS = 11稳定场景PASS，非12。2次本地调用（探针1、生成1），真实AI0。完整断言及数值见analytics-results/deletion-control-results/stalled-results；当前QA五文档亦纳入manifest。

历史活动是显式合成服务端事实；先让实际聚合器生成数值，再把日期及对应明细平移至90天外，验证真实读取、清理和汇总保留，不人工写入预期指标值。边界对照为创建时正好90天与期限内15分钟；真实维护时钟继续前进。日期口径北京时间04:00，非实时时点跨越测试。

A09初次超长测试账号名被正确拒绝，控制只修夹具名称，并新增第三条可识别浏览器链，不改产品或删除期望。A11显式聚合锁/回拨检查点是隔离故障注入；日志可观察不代表生产告警送达。本轮不是UI/真机/生产Linux/最小权限/容量测试。

## 保护

before-owned.tar.gz及previous五文档保留QA09；protected-before.json覆盖6874个非本轮文件。应用、状态、批准、CR和旧证据均不改。私有env.json只在临时目录，凭据/能力token不进入结果。没有提交/部署/真实AI/委派或新角色切换。
