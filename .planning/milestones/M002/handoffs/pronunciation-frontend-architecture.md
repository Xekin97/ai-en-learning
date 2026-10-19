---
milestone: M002
stage: technical-design
role: frontend-architect/base
agent_name: frontend-bob
version: M002-FE-PRON-01
status: awaiting_user_review
readiness: architecture_review_only
date: 2026-10-16
requested_model: gpt-6-astra
requested_effort: high
actual_model: unknown
---

# 单词发音前端架构交接

本次提交前端架构审阅稿，未实现发音。后端直连方向已接受供续做，完整技术出口仍受CR-315及OPEN-401～403限制。

## 输入与需求确认

- [产品08能力/验收](../product/pronunciation/abilities.md)、[UI32-R3规格](../design/pronunciation/design-spec.md)、[接受设计交接](pronunciation-uiux-accepted.md)、[DB-PRON-01](../technical/pronunciation/database.md)、[后端合同](../technical/pronunciation/api/index.md)、[门禁135](../reviews/pronunciation-frontend-entry-135.md)。
- 沿用用户已明确的入口、免费权益、裸图标与无可见操作/状态文字，不重问相同偏好。原选词入口已被CR-314覆盖；scope-clarification保持FreeDictionary与浏览器speechSynthesis，未采用页底来源入口。
- 新发现的口音异常交互缺口已交[CR-315](../changes/CR-315.md)，未擅自改R3文案或预定新UI。其余模块/期限为前端技术建议，等待本稿审阅。
- 全局约束及适用例外集中在主方案§1；既有CR313 UAT和M002未收尾状态保留。

## 产物与UI接收

- [frontend.md](../technical/pronunciation/frontend.md)：§2～4工程落点与数据边界，§5状态/期限/手势，§6口音及资源，§7环境，§8设计转换，§9验证与顺序。
- [输入清单](../technical/pronunciation/evidence/frontend/input-manifest.json)、[接收探测](../technical/pronunciation/evidence/frontend/intake-probe.json)、[静态检查](../technical/pronunciation/evidence/frontend/static-check.json)、[提交回执](../reviews/evidence/pronunciation-frontend-submission-135/submission-receipt.json)。
- R3运行入口、视口和fixture来源在原规格；本轮复用原R3视觉证据，新增四个正式入口DOM检查，不重新设计页面、不修改源样式。代码尚无所需播放图标，sync-design必须接入批准路径；相关映射已写入方案，未执行生成脚本。
- 计划/结果共享组件，trial/后台复用须显式排除；计划240ms退场需要立即撤销播放资格。library维持已存entry/释义/用法和原权限。局部状态永不写到生成流或保存数据中。

## 验证和文档整理

DATA-401～404、CAP-401～404、PAGE-402/403及PAGE-401排除边界映射到API-401/402、FE401-S1～S3、FE401-V1～V8。后续测试均尚未执行，真实音频及人工听音没有通过证据；本轮HTML头检查不能替代最终部署CSP验证。

当前权威入口为本交接及frontend.md，CR-315只维护设计接收缺口；后端/设计/数据冻结源、原审批、历史CR313文档不动。引用、源摘要与控制状态由静态检查记录。没有新会话恢复测试；字符计量与token未知的限制在input-manifest和主方案末尾说明。未新建专业运行线程或声称模型切换。

## 未决与具体下一动作

| ID | 负责人 / 当前状态 | 完成条件 |
| --- | --- | --- |
| CR-315 | designer-tony / OPEN | 补通用口音失败aria及只有一个替代项的原位选择规则、设计证据和受影响版本；frontend-bob再接收，不代改源 |
| OPEN-401 / BE401-B1 | backend-alex / OPEN | 落实FreeDictionary资源使用条件，不能把未明确录音直接宣布生产可用 |
| OPEN-402 / BE401-F2 | backend-alex + frontend-bob / OPEN | 目标网络的匿名词条/音频CORS、Blob实际播放与人工听音；最终HTML策略证据 |
| OPEN-403 / BE401-F1 | frontend-bob / 方案已细化，验证未完成 | 审阅所提1.5/2/12秒界限；按FE401-V3～V5/V8补实际设备声音、手势、取消及有限终态证据 |

建议先审阅本稿；随后由门禁安排CR-315设计局部补充及后端开放项接收，前端依据结果修订/完成设备验证，再判断技术阶段出口。没有绕过开放项直接进入编码的建议。实施角色之后按FE401-V1～V8接续，不新增服务器端发音业务或把QA变成短文质量评测。

本交接不切换阶段；按agt-frontend-design要求呈现方案并待审。
