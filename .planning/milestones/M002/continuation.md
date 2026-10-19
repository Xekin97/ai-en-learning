# M002 已交付基线与接续入口

用户于 2026-10-16 明确批准正式收尾，并将误拆的 M003、M004 合并及压缩整理。正式状态见 [workflow](../../workflow/state.yaml)，关闭记录为 [TRANSITION-M002-146](reviews/milestone-closeout.md)。M002 已完成，无活动角色、开放 CR 或待审功能。下一步仅在收到具体新任务后按范围启动；不会自动创建新里程碑。

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

| 保留项 | 接续条件与原件 |
|---|---|
| CR039-L1、CR042-L1 | 词形与未知标注限制；有实际失败或明确改进任务时按[原 CR039](../M001/changes/CR-039.md#retained-limitations)、[原 CR042](../M001/verification/CR-042-generation-evidence.md#retained-limitations)处理 |
| AI-QUALITY-90 | ≥90% 稳定成功率未获统计证明；[评估原件](verification/ai-evaluation.md)，独立模型研究，不纳入 QA 或自动调用模型 |
| W01、QA26-MINIMAX | 个人页历史警告未定位、旧模型兼容问题未解决；复现或需要恢复模型时按[原报告](verification/report.md#保留事项)定向处理 |
| PRON-MOBILE | 真实手机未验证；具备可访问环境后按[发音 UAT](verification/pronunciation/uat.md)补验，桌面通过不替代手机 |
| 环境与专项边界 | 生产 SSE、Linux、容量告警、真实输入法/读屏、04:00 边界，以及配置导入故障注入/并发/KDF 压力等，按[整体核对](reviews/milestone-closeout-check.md#继续保留的事项)和各原报告保留，不写成已验证 |

失败经验：结果控件可选 Boolean 缺省变 false，导致禁用及焦点转移失败；PRON-DEFECT-001 的 R1 修复和定向回归见[原 QA 报告](verification/pronunciation/report.md)。相关修改从原证据和代码恢复，不改写历史失败结论。

## 本地交付与恢复

接受环境为 [localhost:3016](http://localhost:3016)，真实服务及已保存模型配置，无 mock；[账号使用说明](verification/pronunciation/uat-local-20261016/guide.md)、[访问及凭据文件位置](verification/pronunciation/uat-local-20261016/access.json)、[构建切换与回退](verification/pronunciation/evidence/run-145/switch-receipt.json)。收尾未操作运行环境，访问可用性随本地进程生命周期变化。

源码版本以[713 项接受清单](reviews/evidence/milestone-closeout-146/accepted-source-after-rename.json)为准；发音安装构建摘要 `a6437e56fe8a60781a7ec9b9ccbdc86272ae73a8cc734a8dc4ca4cd32066071a`。最后一次发音 QA 不代表全站重测，按上表逐能力取证。2026-10-04 的 Git 归档仅覆盖当时版本，本次没有新增提交或发布。

## 整理与归档

本文件是统一交付索引；当前控制状态仅保留完成事实、有效政策、遗留 ID 和来源。被精简的旧 state/project/agents/入口原文在[压缩归档](reviews/evidence/milestone-closeout-146/before-controls.tar.gz)，按[索引](reviews/evidence/milestone-closeout-146/archive-index.json)定向读取；归档不是第二份当前状态。原始审批、测试与失败内容保留；目录搬迁和机械引用更新见[路径映射及完整性记录](reviews/evidence/milestone-closeout-146/legacy-directory-rename.json)。冻结证据中的旧路径按该映射解析，不指向未来新建的同名里程碑；旧稿“待审”只说明当时事实。

前后字符/字节计量、摘要和引用检查见[整理回执](reviews/evidence/milestone-closeout-146/closure-receipt.json)。静态追踪已验证；新会话独立交接测试未执行，tokens 与运行时累计输入未知。
