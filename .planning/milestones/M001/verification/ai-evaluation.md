---
milestone: M001
stage: verification
role: quality/base
agent_name: qa-quinn
status: tuning_stopped_existing_samples_reviewed
date: 2026-09-16
verification_round: M001-CLOSEOUT-137
---

# AI 评测：停止调优后的证据收尾

用户已停止模型调优。本轮仅接收前端部署差量与用户UAT确认，**0次真实调用、0新增内容读取或合成测试**。以下内容评阅和合成验证均为QA132既有结果，不改样本结论。[当前报告](./report.md)、[QA132原件](./evidence/closeout-132/qa.json)、[本轮接收](./evidence/frontend-sync-134.json)。

| 冻结批次 | 首轮 / 最终成功 | 纠正调用 | 结论边界 |
| --- | --- | ---: | --- |
| r10 MiniMax | 4/5 → 4/5 | 2 | 唯一失败未获纠正救回 |
| r10 GLM | 5/5 → 5/5 | 0 | 当前五份样本成功 |
| r10 Luna | 5/5 → 5/5 | 0 | 与前两模型分开统计；不能推导长期稳定成功率 |

[两模型 10 次原件](../implementation/evidence/corrections-r10-10-20260912/results.json)、[Luna 5 次原件](../implementation/evidence/luna-r10-5-20260912/results.json)。Luna 测试名为 ~openai/gpt-luna-latest，开发证据按提供方元数据确认实际模型；本轮不更改模型启用、分组或默认配置。≥90% 仍是已确认目标；小样本点估计不是稳定性证明，不由“停止调优”改成免验。

## 独立内容评阅

QA132当时只读 Luna 5 个既有私有样本并逐篇核对原词释义、英文正文/提示、主题标签、目标覆盖与自然度。样本 ID 与评语保留在原件，不另存正文，不延长最长 24 小时留存。

- 中/英/日释义未见文章作用、剧情解释或按派生词替换原词的明显现象；标签描述短文而非各单词。
- discussion 样本包含 grapes/grape、younger/young；business 样本包含 perceived/perceive、undermining/undermine。变形与重复目标能在正文中自然出现。
- 554 词故事分 7 段，场景和资源一致；57 词故事虽满足下限、目标齐全，但叙事单薄，不能把结构通过等同高文学质量。
- 这是定向人工评阅，不保证所有多义词释义、所有模型或之后每次输出质量。

## 同一真实失败的原因有据可查

run 01a094a0-f848-779e-906e-05b4059dc3c1 / 私有证据 83f1fd3d-4a12-4998-b22e-cd75534831c1：

1. 输入是 sustainable/prevalent/vulnerable/ambiguous/coherent，但首轮正文多出 younger(young) 标注。
2. 第一次纠正的候选摘要与首轮一致，错误仍在。
3. 第二次回复删去全部正文标注；最终 passage_annotation_missing，业务失败且退款。

3 份回复均能解析 JSON，证据完整，非凭 EventStream 猜测。现有单回复 replay 命令不支持整包多回复；QA132直接按 model_end 分段核查，不新增回放工具或宣称已执行该回放命令。

## 保留限制

safe→safety/safely 被拒、safer 尚未核实仍见[既有证据](../implementation/evidence/ten-entry-example-r8-20260911/verification.json)；未知标注反馈定位不精确、r10 真实失败仍 OPEN。未批准兼容、词形扩展或新 Prompt 试验，本轮均未做。

QA132合成测试证明的是“成功可交付、失败可解释、最多两次纠正、结算不乱”，不是模型聪明程度或真实成功率。当前[前端版本差异已解决](./report.md)，用户UAT已接受；技术说明已完成同步；本次按用户要求结束当前交付，不自动收费测模型。上述限制不因本次接受而改成已修复。

收尾保留编号：CR039-L1（safe派生）、CR042-L1（纠正反馈定位／整包回放限制）、AI-QUALITY-90（长期目标未证明）。限定变更关闭不改变上述状态；后续动作与验收依据见[当前报告](./report.md#收尾核对与保留事项)。
