# M001 历史检索与有效性索引

只在任务需要时按 ID 读取。本目录的当前交接和权威正文提供有效知识；历史原件保留事实，不应将当时的 `active`、`awaiting_user_review`、失败或临时授权直接当作当前状态。

## 原文恢复

本次整理前已推送的完整提交：`521de847183088dc8f3d69112d94f4977a90d06b`（ai-en-learning 仓库）。应用交付提交：`387c775534844ff0b8ca9857523dc39c1d8ee87a`。替换文档的原路径、SHA-256、被移出当前状态的字段清单见[整理证据](../reviews/evidence/m001-agent-context-001.json)。不需要复制整个历史或切换工作区：

```sh
git show 521de847183088dc8f3d69112d94f4977a90d06b:.planning/workflow/state.yaml
git show 521de847183088dc8f3d69112d94f4977a90d06b:.planning/milestones/M001/handoffs/uiux.md
rg -n -C 8 'TRANSITION-M001-138' .planning/workflow/history.yaml
```

只有被本次替换的正文从该提交恢复；下表所列原件仍在原路径。早期批准版快照仍在 product/archive、technical/archive 及各 evidence 的 prior_documents/pre-test；冻结摘要应核对当时快照，不能用今天的正文冒充原件。

## 按目的找历史

| 稳定 ID / 类别 | 原路径 = 保存路径 | 当前处置 / 提取位置 |
| --- | --- | --- |
| TRANSITION-M001-* / scope decisions | [workflow/history.yaml](../../../workflow/history.yaml) | 138 为最终迁移；按 ID 读取，不全量载入 |
| CR-001–039、041 | changes/CR-*.md | 过程与事实原件；当前交付按 138 关闭，限制按报告保留 |
| CR-040 | [原词释义需求](../verification/cr040-meaning-only-request.md) | 需求已交付；当前真源 product/ai-behavior.md#original-entry-meaning |
| CR-042 | [生成取证](../verification/CR-042-generation-evidence.md) | 交付关闭，CR042-L1 仍开放 |
| DEC-001–036 | decisions/DEC-*.md | 已采纳与替代范围沿主文档/后续 gate，不把旧 proposed 当作新待决 |
| UI/账号/管理/复习回归 | verification/cr*-report.md、design/*validation.md | 按[覆盖索引](../verification/coverage-matrix.md)查具体能力/版本；旧 FAIL 不改成 PASS |
| r5–r10 / 产品模型实验 | implementation/evidence/*、[AI 评测](../verification/ai-evaluation.md) | 当前 r10 小样本有效范围见 AI 评测；原文有期限，不承诺可恢复 |
| 开发 agent 执行记录 | .planning/agt/runs/*.json、[状态旧字段](../../../workflow/state.yaml)的 Git 原文 | 工作流实验材料；不与产品模型样本合并。CTX-M001-01 尚无独立试验结果 |
| 历轮 reviews、worktree plans、旧 intake、截图/日志、archive | 各原路径 | 按需历史；不进入默认启动，不据此重复执行旧任务 |

## 必须处理的替代关系

- DEC-009/032 的“情境释义” → CR-040 独立原词释义；其他学习/挖空规则保留。
- CR039 旧 v4 `passage_forms`/`hint_forms` → 当前 AI 集成的内联标注协议；WordNet/词形独立校验边界保留。
- 早期单次调用/no-retry → r10 仅允许受限纠正/续写；不扩展成网络自动重试。[AI 真源](../technical/ai-integration.md#r10-corrections)。
- 早期兼容待办 → USER-COMPAT-001 撤销首版旧版兼容范围；旧失败事实不改写。
- 已消费 claim 一律保留 24 小时 → USER-CLAIM-DELETE-001 的主动删批次窄例外。
- 069 UI、CR040 架构/实现、133 部署的“待审/待接收” → 后续 gate、134 UAT、138 关闭；不会因保留旧文件重新开启。
- Q127-01 → 用户保留为非阻断风险，不扩容；其他三个限制仍 OPEN/UNVERIFIED，见[当前报告](../verification/report.md#收尾核对与保留事项)。

## 有据的失败经验

| 触发条件 | 原因/处理与限制 | 回归或原件 |
| --- | --- | --- |
| 生成异步返回时已离开页面/换身份 | 旧回调不可覆盖新 run；使用身份/request epoch 与既有 reducer 终态规则 | frontend/tests/unit/generation-lifecycle.test.ts；[consumer-126](../implementation/evidence/ai-consumer-126/developer.json) |
| 退款结算未确认 | 不能先发 `refunded=true`；按持久化事实报告，后续恢复；失败不得变成功 | backend/internal/generation/settlement.go；[QA132](../verification/evidence/closeout-132/qa.json) |
| 源码通过但浏览器仍用旧 bundle | 测试候选与实际部署不一致（Q132-01）；133/134 核对镜像和公开资源后解决 | [部署差量接收](../verification/evidence/frontend-sync-134.json) |
| 文章出现未选 young 标注 | r10 既有失败：第一次纠正未改变，第二次删除全部标注；定位反馈改进尚未实施 | [AI 评测](../verification/ai-evaluation.md)；CR042-L1，不能写成已修复经验 |
| 旧交接仍要求重新审批/执行 | 本次观察到多个入口过期；已统一当前状态与替代关系，能否改善新会话接续尚未实测 | CTX-M001-01；[整理证据](../reviews/evidence/m001-agent-context-001.json) |

M002 只继承适用知识；本索引不自动把旧实验、旧授权或开放问题纳入新里程碑范围。
