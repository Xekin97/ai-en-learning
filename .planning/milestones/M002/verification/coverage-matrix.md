# M002 当前验证覆盖与回归入口

本表按能力汇合已有证据，适用于2026-10-16已接受交付；本次文档整理未执行产品测试。整体接受不代表逐项实测、全设备或模型质量通过。正式结论与遗留事项见[报告](report.md)，批准来源见[五组交付](report.md#当前证据范围)。

## 有效覆盖

| 能力 / 问题 | 已有方法与结果 | 适用范围与定位 |
|---|---|---|
| 原49项基础/学习/成长/管理员能力 | 沿原091与QA38证据逐项继承；保留原49项表中的PARTIAL与未验边界，不汇总为49项全部独立PASS | QA38的[check](evidence/qa2-038/check.json)；逐CAP/PAGE/API旧矩阵按下方历史恢复，期望仍由[产品能力](../product/abilities.md)定义 |
| CR005–022 存储、注销、下架卡、书架、标题、图表及焦点 | 复验来源按问题ID和QA2 evidence查询；已纳入接受基线，不继承原open/待守门指令 | [修改索引](../changes/index.md)；需要修复某项时只读该CR及其原复验，不因整个里程碑接受推断未列场景通过 |
| CR023–028 UI、词义、消息、统一控件、搜索权限/加载 | 复用QA23–32及相应修复；真实接口/浏览器与契约fixture各按原方法解释 | [123接受](../reviews/verification-acceptance-123.md)；QA31消息真实HTTP补验，QA30搜词限定复验 |
| CR029 服务商聚合/原子保存/CAS/凭据隔离 | QA36/37及开发同版本证据；UI31双语双视口、真实API/DB、25+模型及回滚等通过，真实provider输出不由替身证明 | [后端当前结论](../implementation/backend-validation.md)、[前端当前结论](../implementation/frontend-validation.md)、[QA36清单](evidence/qa2-036/manifest.json) |
| 精选词义位置/重复词签/语言标签 | 开发定向回归及真实3302双视口与同数据原型比较通过；语言标签保持原语言名 | [原证据](../implementation/evidence/gallery-meanings-fix/manifest.json)；布局样本变化需重建期望，不沿旧截图冒充新数据一致 |
| CR301–310 规划/纠错/审稿/参数/编辑与模态焦点 | 原096接受记录绑定该交付；功能/参数/状态机的结论沿原专项，模型语义判断不归QA | [096范围](../../M002-legacy-M003/reviews/verification-acceptance-096.md)、[修改索引](../changes/index.md)；CR308为重分类，不能宣称模型缺陷修复 |
| CR311/312 搜索与随机过滤、逐段替换、焦点/取消 | API/DB 100/100、browser13/13、focus5/5；41排除词、合法substring/短词、Random、38-event匹配捕获线、1440/390与reduced motion | [原报告](../../M002-legacy-M003/verification/report.md)、[矩阵](../../M002-legacy-M003/verification/coverage-matrix.md)；受控local provider与重放不能证明真实模型文章质量 |
| CR313 权限、四类别导入导出、凭据、历史保护 | 隔离真实PG/HTTP及代表UI完成范围通过；699文件快照匹配；原6次整套runner失败保留，使用版本匹配的个案与定向复验 | [原矩阵](config-portability/coverage-matrix.md)、[原报告](config-portability/report.md)；不得称6次整套runner为PASS |
| CR313 未知结果恢复及UI | 丢submit响应只发1次import，resolve not_applied；current不是操作完成证明；中文桌面/英文移动及modal焦点通过 | [UI证据](config-portability/evidence/ui-focused-01/qa-ui-focused-results.json)；真实COMMIT ACK/kill等仍未执行 |
| PRON 浏览器朗读与控件 | 真实headed Chrome学习卡35项、R1计划/结果18项、切换后6项冒烟通过；R1受控计划/结果为浏览器内存注入 | [原报告](pronunciation/report.md)、[用户接受](../reviews/pronunciation-uat-acceptance.md)；native事件不证明全部设备人耳听感，手机未测 |

## API、数据与剩余工作

<a id="api数据与剩余工作"></a>
不将原矩阵的“其他组合”扩成无限测试。当前未验证/保留项为 CR039-L1、CR042-L1、AI-QUALITY-90、W01、QA26-MINIMAX、PRON-MOBILE，以及生产/人工/时序/配置故障专项，具体来源和触发条件统一维护在[报告](report.md#保留事项)。

## 回归选择

| 触发 | 最小相关入口 | 仍需判断 |
|---|---|---|
| 结果发音按钮禁用、计划→结果焦点不转移 | [修改结论](../implementation/frontend-validation.md#可复用失败经验)、frontend/tests/unit/generation-pronunciation-focus.test.ts、frontend/tests/unit/word-pronunciation.test.ts | 同版本原QA R1事件证据能否复用；不能把单元测试当作真机听音 |
| 配置import结果未知 | frontend/tests/unit/config-portability.test.ts、backend/internal/portability/portability_integration_test.go、上述CR313 UI证据 | 校验无重放、resolve终态和版本依赖；有实际故障任务时才补对应注入 |
| QA历史指纹随后台运行变化 | [方法修正](config-portability/evidence/history-method-correction.md)、DB501-03/06 | 派生recompute游标与个人事实分开，不能宽泛忽略业务差异 |

## 历史逐项记录

QA轮次正文退出默认读取，原49项表、全部原CAP/PAGE/API ID与失败过程仍在产品提交 `ce42e8726f7cf765a37afb574fe46f15b5d47f62` 的同路径。按[版本索引](../reviews/evidence/context-maintenance-20261019/receipt.json)恢复或按ID检索；下方旧锚点仅提供历史定位，不表示旧轮次仍是当前任务。需要审计具体原结论时读取原件，不从本汇总反推未测事实。

## 旧引用的版本定位

以下旧锚点仅定位整理前原文，按[版本索引](../reviews/evidence/context-maintenance-20261019/receipt.json)中的原路径、Git提交与摘要恢复；不代表当前行动指令。

<a id="qa38"></a>
<a id="qa32"></a>
<a id="qa31"></a>
<a id="qa30"></a>
<a id="qa29"></a>
<a id="qa28"></a>
<a id="qa33"></a>
<a id="qa34"></a>
<a id="qa35"></a>
<a id="qa36"></a>
<a id="最终增量验收登记qa38"></a>
<a id="精选释义复验qa37--gallery-meanings-f01f02"></a>
<a id="覆盖矩阵"></a>
<a id="用户验收登记与收尾qa32"></a>
<a id="cr026-一次提醒qa31pass"></a>
<a id="当前搜词修复限定复验qa30pass"></a>
<a id="当前页头限定复验qa29pass"></a>
<a id="当前-ui26-增量验收qa28"></a>
<a id="49-项能力"></a>
<a id="25-page--28-视图与设计条目"></a>
<a id="本轮技术质量与局限"></a>
<a id="qa17入口流程增量"></a>
<a id="qa18菜单复验"></a>
<a id="qa19增量与返工"></a>
<a id="qa20增量"></a>
<a id="qa21收敛"></a>
<a id="qa22-当前集成候选"></a>
<a id="qa23-用户反馈定向复验"></a>
<a id="qa24-本地生成替身修复"></a>
<a id="qa25-生成完成结果区还原"></a>
<a id="qa26-真实模型配置供用户验收"></a>
<a id="qa33--cr029-当前增量"></a>
<a id="qa34--cr029-f02"></a>
<a id="qa35--cr029-f03f04"></a>
<a id="qa36--ui31--cr029-f05"></a>
