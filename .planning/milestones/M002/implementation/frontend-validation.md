# M002 前端交付与回归接续

M002 已完成，五组交付的接受来源见[当前QA报告](../verification/report.md)。这里保留当前行为、修改原因和定向回归位置；旧待QA/待用户/待切换环境指令已退出当前入口。本次未运行应用测试。

| 范围 | 最终行为与约束 | 证据/定位 |
|---|---|---|
| CR029/UI31 服务商工作区 | 以provider为列表和整组编辑单位；稳定模型ID、Key草稿、CAS三方合并；未知保存结果阻止重发；25+模型完整显示/保存 | [原证据](evidence/provider-workspace31)、[QA36](../verification/evidence/qa2-036/manifest.json)；中英×1440/390、原子性与隔离按各自证据，不把HTTP fixture当真实provider |
| GALLERY-MEANINGS-F01/F02 | 词义置于配置事实之后、试用按钮之前；无重复词签；语言标签固定语言原名，详情来自同一发布快照 | [原证据](evidence/gallery-meanings-fix/manifest.json)；frontend/app/pages/explore.vue；三语言、共享后台及真实双视口复验已接受 |
| CR301–312 生成体验 | 计划/输出保持同源；功能词过滤、逐段显示、保留完整旧稿逐段替换、阅读位置/焦点和终态遵从批准契约 | [原实现报告](../../M002-legacy-M003/implementation/frontend-validation.md)、frontend/app/presentation/generation/、[105接受](../../M002-legacy-M003/reviews/verification-acceptance-105.md) |
| CR313 配置可移植性 | DTO→schema→mapper→model→store；秘密仅留Nuxt app隔离WeakMap，sessionStorage只存恢复字段；unknown只resolve不重放import，session epoch拒收迟到响应 | [实现原件](config-portability/frontend-validation.md)、[用户接受](../reviews/cr313-uat-acceptance.md)；frontend/app/runtime/stores/config-portability.ts、frontend/tests/unit/config-portability.test.ts |
| 浏览器发音R1 | PAGE402计划/结果与PAGE403已存文章词义显示紧凑控件；浏览器native speech，同词重播/A→B/离页取消，禁止自动播放；计划→结果焦点交接 | [原实现交接](../handoffs/pronunciation-frontend-implementation.md)、[QA原件](../verification/pronunciation/report.md)、[桌面接受](../reviews/pronunciation-uat-acceptance.md)；frontend/app/presentation/pronunciation/、frontend/app/application/pronunciation/ |

## 可复用失败经验

| 触发 | 有据原因与已验证处理 | 回归入口/边界 |
|---|---|---|
| PRON-DEFECT-001 结果发音持续禁用、焦点不转移 | 可选Boolean省略被Vue转成false；R1修复后QA结果18/18通过 | frontend/tests/unit/generation-pronunciation-focus.test.ts、frontend/tests/unit/word-pronunciation.test.ts；[原QA](../verification/pronunciation/report.md)。受控计划/结果为内存注入，桌面接受不替代手机 |
| 词义位置/语言标签与批准设计不一致 | 按原型调整区域顺序、移除重复词签、保留语言原名；同数据实际页面复验通过 | gallery-meanings-fix证据；fixture查询串、样本篇数与语言设置须匹配当前批准数据 |
| 配置导入响应丢失 | 结果未知时不得用current快照推断完成或自动重发；只resolve并保留回执语义 | frontend/tests/e2e/m002-config-portability.spec.ts、frontend/tests/e2e/m002-config-portability-real.spec.ts；真实COMMIT ACK/kill等未全部执行 |

未验证环境、W01、模型问题与PRON-MOBILE统一见[QA保留项](../verification/report.md#保留事项)。后续只按实际变更/缺陷选择验证；来源版本变化后重判证据适用性，不自动重跑全站。

## 旧引用的版本定位

以下旧锚点仅定位整理前原文，按[版本索引](../reviews/evidence/context-maintenance-20261019/receipt.json)中的原路径、Git提交与摘要恢复；不代表当前行动指令。

<a id="精选词义还原"></a>
<a id="仍有效的-ui31-交付"></a>
<a id="cr029-f05-服务商工作区ui31"></a>

## 更早审批的引用定位

以下锚点在本次整理前已缺失。问题编号转接到保留的原CR及其中复验来源；旧下一步须按发起链接的审批记录时点解释，不能恢复为当前任务。

<a id="cr005"></a>
历史 CR005：[原问题、修订与复验](../changes/CR-005.md)；当前处理见[变更索引](../changes/index.md)。

<a id="cr008"></a>
历史 CR008：[原问题、修订与复验](../changes/CR-008.md)；当前处理见[变更索引](../changes/index.md)。

<a id="cr009"></a>
历史 CR009：[原问题、修订与复验](../changes/CR-009.md)；当前处理见[变更索引](../changes/index.md)。

<a id="cr010"></a>
历史 CR010：[原问题、修订与复验](../changes/CR-010.md)；当前处理见[变更索引](../changes/index.md)。

<a id="cr012"></a>
历史 CR012：[原问题、修订与复验](../changes/CR-012.md)；当前处理见[变更索引](../changes/index.md)。

<a id="cr014"></a>
历史 CR014：[原问题、修订与复验](../changes/CR-014.md)；当前处理见[变更索引](../changes/index.md)。

<a id="cr016"></a>
历史 CR016：[原问题、修订与复验](../changes/CR-016.md)；当前处理见[变更索引](../changes/index.md)。

<a id="cr017"></a>
历史 CR017：[原问题、修订与复验](../changes/CR-017.md)；当前处理见[变更索引](../changes/index.md)。

<a id="cr019"></a>
历史 CR019：[原问题、修订与复验](../changes/CR-019.md)；当前处理见[变更索引](../changes/index.md)。

<a id="cr020"></a>
历史 CR020：[原问题、修订与复验](../changes/CR-020.md)；当前处理见[变更索引](../changes/index.md)。
