# M002 已交付基线与接续入口

用户于 2026-10-16 明确批准正式收尾，并将误拆的 M003、M004 合并及压缩整理。正式状态见 [workflow](../../workflow/state.yaml)，关闭记录为 [TRANSITION-M002-146](reviews/milestone-closeout.md)。M002 已完成，无活动角色、开放 CR 或待审功能。下一步仅在收到具体新任务后按范围启动；不会自动创建新里程碑。

当前测试结论先读[QA报告](verification/report.md)与[覆盖矩阵](verification/coverage-matrix.md)，修改状态先读[变更索引](changes/index.md)。开发回归从[后端](implementation/backend-validation.md)、[前端](implementation/frontend-validation.md)定位；下表专业原件只在对应任务需要时展开，旧提交状态不恢复为待办。

## 交付后的 Q001 本地增量

2026-10-19 用户授权用 agt-quick 实现代码诊断驱动纠正。代码与功能回归已完成，当前读取[产品规则](product/correction-routing.md)、[技术契约](technical/correction-routing.md)、[验证结果](verification/correction-routing.md)和[实现交接](handoffs/backend-implementation.md#q001-本地增量代码诊断与字段纠正)。仅原生纠正的诊断、提示组合、局部返回与合并被替代；不重新打开M002或继承历史产品验收。

[Q001任务与恢复证据](../../quick/Q001-code-driven-corrections/task.json)保存本次角色回执、命令、决定及上下文收尾。当前修改仅本地保存，未提交/推送/部署，没有进行付费模型调用。下列历史保留项继续有效。

## 按任务读取原件

| 交付范围 | 需求与技术原件 | 验证及用户接受 |
|---|---|---|
| 学习、成长、运营、服务商管理及精选释义 | [产品](product/overview.md)、[技术](technical/backend.md) | [原交接](handoffs/verification.md)、[123 接受](reviews/verification-acceptance-123.md) |
| 造文规划、普通纠错与付费审稿返修、流式输出、模型自定义参数 | [产品](../M002-legacy-M003/product/overview.md)、[设计](../M002-legacy-M003/design/design-spec.md)、[后端](../M002-legacy-M003/technical/backend.md)、[前端](../M002-legacy-M003/technical/frontend.md) | [原交接](../M002-legacy-M003/handoffs/verification.md)、[096 接受](../M002-legacy-M003/reviews/verification-acceptance-096.md) |
| 功能词过滤、渐进展示、返修保留旧稿并逐段替换 | [CR-311](changes/CR-311.md)、[CR-312](changes/CR-312.md) | [105 接受](../M002-legacy-M003/reviews/verification-acceptance-105.md) |
| 模型、计划、道具、成长规则分类导入导出 | [产品](product/config-portability.md)、[设计](handoffs/config-portability-uiux.md)、[API](technical/config-portability/api.md)、[前端](technical/config-portability/frontend.md) | [QA 及边界](verification/config-portability/report.md)、[CR313 接受](reviews/cr313-uat-acceptance.md) |
| 免费浏览器单词朗读 | [产品 08-R1](product/pronunciation/browser-only/overview.md)、[设计 R4](design/pronunciation/browser-only/design-spec.md)、[API-402 v2](technical/pronunciation/api/browser-speech.md)、[前端 FE-PRON-02](technical/pronunciation/frontend-browser-only.md) | [实现 FI-PRON-01-R1](handoffs/pronunciation-frontend-implementation.md)、[QA-PRON-01-R1](verification/pronunciation/report.md)、[桌面 UAT 接受](reviews/pronunciation-uat-acceptance.md) |

五组交付均属于 M002。2026-10-15 误建的 M003/M004 实例已撤销，并改名为 `M002-legacy-M003`、`M002-legacy-M004`；两个原目录名已腾出，未来新建的同编号里程碑不受这次历史撤销影响。[归属决定 124](reviews/milestone-ownership-correction-124.md)和[转接映射](reviews/evidence/m003-ownership-correction-124/rehome-map.json)保留。原 M004 发音稿已被上述浏览器版本替代；CR-301 至 CR-316 沿用原编号与 M002 `changes/` 入口，不批量改写源码、契约或证据编号。

## 有效约束与保留事项

QA 仅验证功能与实现，不评判文章质量或模型漏判；见[项目 QA 政策](../../agt/qa-scope-policy.md)。[首版兼容政策](../M001/reviews/first-release-compatibility-policy.md)、[主动删除承接记录例外](../M001/reviews/claimed-batch-delete-retention-exception.md)继续有效。新里程碑须明确授权；当前 UAT 数据和模型配置保留，收尾不授权数据迁移或生产发布。

CR039-L1、CR042-L1、AI-QUALITY-90、W01、QA26-MINIMAX、PRON-MOBILE及环境/专项边界统一维护在[QA保留事项](verification/report.md#保留事项)，均未因收尾宣称解决。PRON-DEFECT-001等有证据的失败经验与回归位置见[前端修改结论](implementation/frontend-validation.md#可复用失败经验)和[后端修改结论](implementation/backend-validation.md#可复用失败经验)。

## 本地交付与恢复

接受环境为 [localhost:3016](http://localhost:3016)，真实服务及已保存模型配置，无 mock；[账号使用说明](verification/pronunciation/uat-local-20261016/guide.md)、[访问及凭据文件位置](verification/pronunciation/uat-local-20261016/access.json)、[构建切换与回退](verification/pronunciation/evidence/run-145/switch-receipt.json)。收尾未操作运行环境，访问可用性随本地进程生命周期变化。

源码版本以[713 项接受清单](reviews/evidence/milestone-closeout-146/accepted-source-after-rename.json)为准；发音安装构建摘要 `a6437e56fe8a60781a7ec9b9ccbdc86272ae73a8cc734a8dc4ca4cd32066071a`。最后一次发音 QA 不代表全站重测，按上表逐能力取证。历史 Git 归档按各自版本恢复；本轮配置与文档整理随 Git 提交保存，不构成应用部署。

<a id="整理与归档"></a>

## 上下文整理

2026-10-19按用户要求由root串行整理QA、前后端修改、45项变更状态和三份角色交接；产品/设计/架构沿上表已批准原件按范围读取。本次只维护上下文，M002终态、原接受、代码与环境不变。[责任范围、原件版本、计量与检查回执](reviews/evidence/context-maintenance-20261019/receipt.json)按需读取；[AGT修订](../../agt/context-maintenance-adoption.json)显式叠加到锁定的2.0版本。

内容与静态检查通过；经用户授权，独立只读接续验证的状态恢复、缺陷回归定位、变更及未验证项识别三项通过，读取范围与限制见回执；实际token节省仍未测量。历史原件以回执的Git提交、路径、SHA定位；原稿待审状态不恢复为当前任务。恢复示例：

```sh
git show ce42e8726f7cf765a37afb574fe46f15b5d47f62:.planning/milestones/M002/verification/coverage-matrix.md
```

冻结清单继续按原版本/SHA解析，不与今日摘要混比。旧控制备份见[原索引](reviews/evidence/milestone-closeout-146/archive-index.json)，旧M003/M004路径见[目录映射](reviews/evidence/milestone-closeout-146/legacy-directory-rename.json)。原始审批、失败与专项QA原件保持；本次没有文件打包。
