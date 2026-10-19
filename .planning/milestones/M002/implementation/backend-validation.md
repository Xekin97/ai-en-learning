# M002 后端交付与验证接续

M002 已完成。这里维护最终行为、修改原因与验证入口；提交时报告的待QA/待部署指令已由[最终接受](../reviews/milestone-closeout.md)替代。本次只整理文档，未重跑应用测试或操作数据库。

| 范围 | 最终行为与不可丢失的约束 | 验证/代码定位 |
|---|---|---|
| CR029-F05 服务商聚合 | 整组GET/POST/PATCH、完整成员归属、稳定UUID、配置锁/CAS、Key目的地保护及原子保存；省略不等于下架。0016将名称唯一约束改为服务商内 | [原实现证据](evidence/provider-workspace31)、[API](../technical/api/model-connections.md)、[123接受](../reviews/verification-acceptance-123.md)；真实DB/HTTP覆盖25+模型、旧引用、Key隔离、晚期SQL失败回滚；0真实模型调用 |
| CR301–312 生成链 | 规划进入writer；普通与增强链按已批准权益执行；有限修正、终态/取消/退款一致；功能词过滤与逐段返修保持原批准语义 | [历史交付](../../M002-legacy-M003/implementation/backend-validation.md)、backend/internal/generation/、[105接受](../../M002-legacy-M003/reviews/verification-acceptance-105.md) |
| CR313 四类别配置可移植性 | models/plans/items/growth全类preview/import/resolve；凭据严格输入；锁后权限/CAS复验、幂等与不可变回执；保留个人事实与跨类引用。0018及BE501-06退役runtime闭环 | [专项验证](config-portability/backend-validation.md)、[命令与首次失败](config-portability/evidence/backend/test-log.md)、backend/internal/portability/；[用户接受](../reviews/cr313-uat-acceptance.md) |
| 浏览器发音 | 使用浏览器speechSynthesis；不新增服务端录音获取、缓存或发音生成接口 | [有效API契约](../technical/pronunciation/api/browser-speech.md)；旧录音草案为被替代历史 |

## 可复用失败经验

- 跨服务商同名模型发生唯一约束冲突→旧全平台索引范围过大→按服务商聚合维度调整0016并复验→从 provider-workspace31 的真实DB/HTTP证据和批准API定位；不能通过改名绕开已批准行为。
- 配置导入后整行历史hash变化→既有后台重算会推进派生marker→按批准DB501边界分离个人事实与游标，仅放行已证实的派生变化→[QA方法原件](../verification/config-portability/evidence/history-method-correction.md)。不能把任意历史变化归因于后台任务。

完整有效测试边界和遗留项统一见[当前QA报告](../verification/report.md#保留事项)。冻结源码/QA清单证明原接受版本；后续修改必须重新判断受影响依赖。旧部署指令仅用于追溯，不应在恢复会话时重跑迁移或种子。

## 旧引用的版本定位

以下旧锚点仅定位整理前原文，按[版本索引](../reviews/evidence/context-maintenance-20261019/receipt.json)中的原路径、Git提交与摘要恢复；不代表当前行动指令。

<a id="cr029-f05-服务商聚合实现"></a>

## 更早审批的引用定位

以下锚点在本次整理前已缺失。问题编号转接到保留的原CR及其中复验来源；旧下一步须按发起链接的审批记录时点解释，不能恢复为当前任务。

<a id="cr006"></a>
历史 CR006：[原问题、修订与复验](../changes/CR-006.md)；当前处理见[变更索引](../changes/index.md)。

<a id="cr007"></a>
历史 CR007：[原问题、修订与复验](../changes/CR-007.md)；当前处理见[变更索引](../changes/index.md)。

<a id="cr011"></a>
历史 CR011：[原问题、修订与复验](../changes/CR-011.md)；当前处理见[变更索引](../changes/index.md)。

<a id="cr013"></a>
历史 CR013：[原问题、修订与复验](../changes/CR-013.md)；当前处理见[变更索引](../changes/index.md)。

<a id="cr027"></a>
历史 CR027：[原问题、修订与复验](../changes/CR-027.md)；当前处理见[变更索引](../changes/index.md)。
