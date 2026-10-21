# M002 当前验收结论与保留事项

Q007（2026-10-21）仅调整测试产物留存与输出位置。历史图片按[截图恢复入口](screenshot-archive.md)查找，旧报告/清单继续按原版本解释；下列功能验收、未验证项及保留事项不变。

> **2026-10-19 Q001 增量**：[代码诊断与局部纠正验证](correction-routing.md)记录当前本地实现及最终功能回归；这是新任务证据，不扩展下列历史用户验收。

M002 已于 2026-10-16 完成，五组交付均已获用户接受；无活动角色、开放 CR 或待用户评审任务。正式状态见 [workflow](../../../workflow/state.yaml)，最终批准为 [TRANSITION-M002-146](../reviews/milestone-closeout.md)。本页于 2026-10-19 收敛已有结论，没有新增测试、扩大验收或重新关闭里程碑。

## 当前证据范围

| 交付范围 | 当前有效结论与版本 | 接受来源 / 详细证据 |
|---|---|---|
| 学习、成长、通知、服务商模型管理及精选释义 | 原091接受基线及 QA38/UI31 的限定增量已接受；保留旧矩阵的 PARTIAL/环境边界 | [123接受](../reviews/verification-acceptance-123.md)、[QA38核对](evidence/qa2-038/check.json) |
| 规划、基础纠错、付费审稿返修、自定义参数、完成后编辑 | 归属 M002 的原 M003 交付由096接受；CR308仅撤销QA缺陷分类，模型漏判未被证明修复 | [096接受](../../M002-legacy-M003/reviews/verification-acceptance-096.md)、[QA政策](../../../agt/qa-scope-policy.md) |
| 功能词过滤、渐进显示、返修保留旧稿逐段替换 | CR311/312 的 QA07 版本由105接受；API/DB 100项、浏览器13项、焦点5项是该范围证据 | [105接受](../../M002-legacy-M003/reviews/verification-acceptance-105.md)、[专项报告](../../M002-legacy-M003/verification/report.md) |
| models/plans/items/growth 配置导入导出 | M002-QA-CR313-01 在699文件快照上的 PASS with retained limits 已获用户接受 | [CR313接受](../reviews/cr313-uat-acceptance.md)、[提交时QA原件](config-portability/report.md) |
| 浏览器单词朗读 | M002-FI-PRON-01-R1 / QA-PRON-01-R1；PRON-DEFECT-001修复后18/18定向通过；本地桌面UAT已接受 | [发音接受](../reviews/pronunciation-uat-acceptance.md)、[提交时QA原件](pronunciation/report.md) |

逐能力的验证方法、版本复用和边界见[当前覆盖矩阵](coverage-matrix.md)。原报告中的 awaiting_user_review、待听音、待关闭及旧环境端口描述只属于原提交时点，不再作为当前行动指令；接受记录没有把未执行的专项变成测试通过。

## 保留事项

| ID / 范围 | 当前事实 | 触发接续的条件与原件 |
|---|---|---|
| CR039-L1 | safe→safety/safely 被拒，safer 未核实 | 用户明确改进词形或复现失败时，按[原CR](../../M001/changes/CR-039.md#retained-limitations)定位；不得据收尾标为修复 |
| CR042-L1 | 未知标注反馈定位与多回复整包回放仍受限 | 按[原边界](../../M001/verification/CR-042-generation-evidence.md#retained-limitations)和实际失败定向处理 |
| AI-QUALITY-90 | ≥90%稳定成功率未获统计证明 | [原评估](ai-evaluation.md)；独立模型研究须有对应任务与调用授权，不纳入QA功能阻塞 |
| W01 | 个人页曾有 hydration 警告，原因未定位；后续未复现不等于修复 | 再现时保存页面/堆栈/操作并定向复验；[QA03原观察](evidence/qa2-003/manifest.json) |
| QA26-MINIMAX | 启用校验两次 model_incompatible，未复查当前服务状态 | 需要恢复模型时先查[原失败](evidence/qa2-026/minimax-retry.json)和[配置核对](evidence/qa2-026/final-check.json)，验证启用及关联生成 |
| PRON-MOBILE | 真实手机未验证；桌面整体接受不证明全部设备/口音或逐项人工听音 | 有可访问手机环境与明确验证任务后按[发音UAT](pronunciation/uat.md)补验 |
| 环境与人工专项 | 生产SSE、Linux、容量告警、真实输入法/读屏、04:00实时边界等未全部验证 | 依据[整体保留表](../reviews/milestone-closeout-check.md#继续保留的事项)及受影响专项选择验证 |
| CR313故障与并发边界 | TCP COMMIT ACK丢失、进程kill、双时序barrier、KDF压力、全多tab/管理员组合、真实24h过期未全部执行 | [原QA边界](config-portability/report.md#复用与保留边界)；替身/确定性证据不提升为真实故障注入 |

QA仅验证功能与实现；文章质量和模型语义审稿准确率遵守[项目政策](../../../agt/qa-scope-policy.md)。默认不重跑全站、不恢复模型研究、不改现有UAT数据。后续从具体问题与批准范围进入，先核对代码/依赖是否仍匹配证据。

## 历史恢复

本页与相关入口的整理前正文、摘要和旧锚点由[版本索引](../reviews/evidence/context-maintenance-20261019/receipt.json)定位到产品提交。冻结QA原件、失败日志和接受记录保持原样。原件恢复命令与本次整理结果见[接续入口](../continuation.md#上下文整理)。

## 旧引用的版本定位

以下旧锚点仅定位整理前原文，按[版本索引](../reviews/evidence/context-maintenance-20261019/receipt.json)中的原路径、Git提交与摘要恢复；不代表当前行动指令。

<a id="二期增量验收已通过"></a>
