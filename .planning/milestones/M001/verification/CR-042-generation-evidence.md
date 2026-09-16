---
id: CR-042
status: closed
milestone: M001
raised_by: quality/base
agent_name: qa-quinn
owner_stage: technical-design
date: 2026-09-12
closeout_review: TRANSITION-M001-137
closed_by: TRANSITION-M001-138
closed_at: "2026-09-16T02:09:06.968504+00:00"
closure_scope: accepted_M001_delivery_with_retained_limitations
---

# 生成阶段与内容证据链

## 当前收尾结论（2026-09-16）

阶段取证、受控采集、有限留存及QA132已通过，r10技术说明已同步；Q132-01解决，用户UAT已接受。 本次用户明确要求收尾并提交两个仓库，QA建议限定关闭当前交付，正式处置见[138门禁](../reviews/stream-failure-capture-gates.md)；不重跑UAT、不批准生产发布或新模型调用。[当前报告](../verification/report.md)为最新证据入口。以下原始问题、初稿与历史“未实施”等文字保留发现时点，不应再当作当前进度。

<a id="retained-limitations"></a>
### 保留限制

CR042-L1 / OPEN：未知标注反馈定位精度不足，单回复replay不能直接回放多回复整包。定位证据见[AI评测](./ai-evaluation.md)，若用户后续明确提出改进，先基于既有失败定位而不扩建监控平台；回放能力扩展不属于本轮交付。 关闭交付不代表限制修复或撤销质量目标。收尾前全文见[快照](../technical/archive/pre-m001-closeout-136.json)。


用户要求“先有阶段/内容证据再排查”，限定专用账号，反对扩展成监控平台。原始 OBS-129 缺口与提案完整保存在[前一版快照](./evidence/closeout-132/previous-qa.json)，后续授权以[131/132 交接记录](../reviews/stream-failure-capture-gates.md)为准；不再把“留存待确认、未实施”作为当前状态。

## 当前边界与实现

普通日志保留阶段、安全计数和结算事实；必要模型输出进入独立私有通道，不进入普通日志。采集只绑定 account 身份的专用 ID 01a08e5a-2250-7854-81df-5aeb26e7f461，排除其他账号/访客。容量最近 50 份、最长 24 小时、每份最多 1 MiB，标明截断/不可用；容量不是模型调用授权。

后端 r10 已部署受控采集，QA132当时只读见38份既有记录；本轮不读取或重新清点私有内容，不将历史数量当作当前数量。新旧 prompt/build 由各 manifest 识别，不冒称全部来自 r10。普通构建默认关闭与专用运行配置、安全边界沿后端既有方案，不在 QA 扩建设备、平台或接口。

## CLOSEOUT-132 独立结果

[报告](./report.md)、[覆盖](./coverage-matrix.md)、[原件](./evidence/closeout-132/qa.json)。隔离正常规模测试覆盖成功、两次纠正、续写、纠正耗尽、取消、断连、JSON 失败及退款恢复，8/8 PASS。每个私有记录可关联 run、模型回复数、失败阶段及结算；解析前失败也有内容片段，不再只在 Candidate 已存在时采样。普通日志未发现所检查的合成秘密和文本。

真实失败 83f1fd3d-4a12-4998-b22e-cd75534831c1 的三次回复及最终失败已独立核对；首轮错误、纠正不变和末轮标注缺失有原文证据。没有新调用、没有原文复制到仓库、没有续长留存。多次回复按 model_end 分段读取；现有单回复 replay 命令不能直接回放整包，本轮不增加工具，也不虚报回放成功。

TTL/满额/身份排除/存储失败等专项复用与当前源码摘要匹配的开发证据，不重复跑开发单测；当前新增 PASS 不能冒充所有分支重新独立覆盖。

## 未决与路由

CR-042 的阶段取证目标在本轮有限范围内通过，本轮正式关闭由138门禁办理，不改变已通过范围之外的质量限制。Q132-01 已由[本轮部署差量接收](./evidence/frontend-sync-134.json)确认解决，用户UAT已接受；它不是新监控需求。safe 派生、纠正反馈精度和小样本成功率的限制仍公开保留，不靠增加监控掩盖质量问题。有限纠正说明已由后端架构同步并由136接收；不得引入新需求、兼容或自动模型试验。
