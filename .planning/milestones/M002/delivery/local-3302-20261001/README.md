# 3302 本地正式模型环境更新

2026-10-01，用户在“下一步可将已验收版本同步到3302”的交付说明后回复“下一步”，本次按该授权完成本地环境更新。M002继续保持完成状态；本记录不新增需求、角色阶段、产品QA门或用户UAT。

入口：[http://127.0.0.1:3302](http://127.0.0.1:3302)。正式OpenRouter配置沿用原环境，既有账号凭证保持。3311继续作为契约测试预览。

已部署版本为CR026-UI28-DB04-BE05-FE05-fixed-input；[源校验](source-check.json)覆盖302项前端文件和291项组合后端文件，无差异。前端复制已验收构建到独立运行目录，后端从匹配源重新编译；[前端产物](frontend-artifacts.json)、[构建及范围](inputs.json)、[部署结果](deployment.json)绑定实际运行文件。

先备份现有数据库、全局角色、环境、进程记录、旧后端及旧前端；备份位于inputs中的私有目录，目录权限0700，仓库只记录摘要。数据库归档目录可读，未执行完整恢复演练。随后应用唯一待执行迁移0014_notice_remind_once.sql，既有消息开关默认false。迁移前后59张业务表原有行完全一致，详见[备份](backup.json)、[迁移前](database-before.json)、[迁移后](database-after-migration.json)。

浏览器经3302代理连接新Go服务及现有PostgreSQL，未替换API响应。[6项冒烟检查通过](smoke.json)：首页/自定义语言下拉、garden与learn真实搜索、选词交互、学习者登录/消息/书架/复习、管理员登录及只提醒一次开关。后台开关只做未保存交互；没有改动现有通知配置。一次提醒跨账号与持久化细节沿用QA31和开发验收证据。

[检查后数据保护结果](preservation.json)：模型、凭证、计划、额度、生成、学习、道具和预设等19张重点表保持一致；真实模型调用新增0。登录及访问产生正常会话/分析记录，后台聚合任务仅推进growth_settings中的两个分析时间字段，未更改成长配置。[方法和边界](method-notes.json)保留脚本预检查纠正记录。

当前服务恢复入口为本目录preview.py，读取原私有配置和当前已部署路径，不重新初始化数据：

```sh
python3 .planning/milestones/M002/delivery/local-3302-20261001/preview.py status
python3 .planning/milestones/M002/delivery/local-3302-20261001/preview.py stop
python3 .planning/milestones/M002/delivery/local-3302-20261001/preview.py resume
```

本次执行了status，三个服务均存活；stop/resume仅提供恢复入口，未额外中断服务演练。不要继续使用qa2-026的旧恢复脚本，它固定指向旧前端构建。迁移脚本为本次一次性操作，完成后不要重复执行prepare/apply。

备份保存了完整迁移前恢复材料；如需回退，须先停止此环境并保护更新后数据，再决定恢复迁移前库和旧构建，不能直接覆盖运行中的数据库。未执行回退或生产部署，未新增真实AI评测。原保留事项继续见[质量报告](../../verification/report.md#保留事项)。

更新前的QA32文档完整保存于[归档](before-current-documents.tar.gz)，原验收摘要和091收尾记录不重写。本次仅更新当前文档的运行环境事实，验收结论不变。
