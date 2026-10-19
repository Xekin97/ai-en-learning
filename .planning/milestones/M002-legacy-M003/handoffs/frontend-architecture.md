---
milestone: M003
stage: technical-design
role: frontend-architect/base
agent_name: frontend-bob
status: awaiting_user_review
version: M003-FE-04
date: 2026-10-13
input_version: M003-PRODUCT-10 / M003-BE-08 / M003-UI-13-R4 / retained DB04
---

# CR-311/312 前端架构交接

frontend-bob 已完成 **FE04 有界技术设计，等待用户审阅**。当前唯一实施合同为 [technical/frontend.md#fe4-cr311-312](../technical/frontend.md#fe4-cr311-312)，不启动实施、不调用下一门禁。CR311/312保持open；096历史验收与已解决CR302/306/307/309/310不重开。

## 输入与确认闭环

- [100独立入口](../reviews/cr312-frontend-entry-100.md)、[USER-M003-UI13R4-FE-NEXT-20261013](../reviews/requirements-feedback.md#user-m003-ui13r4-fe-next-20261013)已接受完整UI13-R4并仅授权前端技术接收；不重复征询文案、typing或返修方向。
- [PRODUCT10 / CAP302、307、AC323–328](../product/abilities.md#uat097-acceptance)、[BE08](backend-architecture.md)、[API302 v6](../technical/api/generation.md#cr312-wire)、[API004候选](../technical/api/generation.md#cr311-candidates)、[API304](../technical/api/presets.md)为业务/接口源，DB04无新增持久化影响，无新DBA批准声明。
- [UI13-R4设计](uiux.md)、[规格](../design/design-spec.md)、copy/theme/交互/响应式和R4冻结源已接收。UI交接中“待评审”是100前提交状态；本次用100接受范围，不改设计原件。
- 锁定consumer-ai-web@1.0.0/model-routing-v1不变，请求gpt-6-astra/high，实际serving model/usage未知；无待确认关键业务假设或上游BLOCKED。

## 关键实施取舍

1. **接通两套真实消费链**：generation reducer与后台admin-presets store现在各自实现旧splice。FE4-02/03抽取小型共享正文归约，保持各自终态/权限；types、schema、mapper、store、selector一起升v6，DTO止于转换层。
2. **权威文本与显示分离**：working收全部合法codepoint edit；published只在批准边界发布；displayed仅首稿grapheme前缀。首字即时、36/s、650ms＋一帧、单一可取消rAF；缓存分段索引，禁止每帧重扫全篇。完整段220ms交接，valid即刻完成业务，Plan仅视觉240ms退场。FE4-04/05已写flush/取消/后台恢复/epoch清理及稳定按钮、段、passage与滚动锚点。
3. **共享真实Vue组件**：新GenerationContent与presenter服务PAGE204/216/212，复用GenerationVocabularyList；后台lastPreview/stale/ready、无用户保存语义保持。WordPicker只展示BE过滤候选，不复制41目录或追溯拒绝旧词。
4. **设计源有界转译**：现sync-design需把来源清单更新为R4，并仅排除设计harness键/样式/数据；保留m003产品状态文案与现locale转换。不把app.js、timingProbe或演示节奏当生产方案。

## 验证与未完成

[FE4-V01–08](../technical/frontend.md#fe4-08-有限实施验收与证据分工)覆盖UIA427–438/API004、302、304、006/AC323–328：typed契约、半段隐藏/旧尾、codepoint与grapheme、动画及终态/取消/旧epoch、同组件两页、UI11/UI12丢稿保护。实施后只运行相关单测、typecheck/边界、必要构建和定向浏览器；后端负责41完整集合、调用序列和结算，QA不评文章质量/模型漏判。

本次仅 [静态检查](../technical/evidence/cr311-312-fe/check.json) 与 [来源清单](../technical/evidence/cr311-312-fe/source-manifest.json)：R4冻结源/证据/archive、稳定ID/引用、源码接点、保护文件哈希。R4 lifecycle 6/6、scheduler 5/5及R3样例完整性只复用为设计证据；未运行Vue/浏览器/产品测试、独立QA、真实provider或UAT。FE4-T01–05/V01–08全部仍未实现验证，设计PASS不等于应用通过。

保留CR039-L1、CR042-L1、AI-QUALITY-90、W01、QA26-MINIMAX；无新容量/时延/质量承诺。UAT3015、真实数据/新增mimo模型、额度/预算/付费审稿保持，本轮不读private-env/uat-accounts、不迁移/重启/刷新。

## 文档维护与下一角色

- 两份FE原件及两CR修改前内容在 [before.tar.gz](../technical/evidence/cr311-312-fe/before.tar.gz) / [before-manifest](../technical/evidence/cr311-312-fe/before-manifest.json)。FE3-01–16/T01–06/V01–21和CR309/310稳定锚点保留；旧待办退出当前入口，完整原文可恢复。模型JSON/终态/权限等未变合同原地保留或定向索引，不覆盖冻结审批/失败/测试证据。
- 同口径两FE原件前后字符数见check；字符不是tokens/真实输入。因两套接收链及有效基线核对超planning软预算，已缩小交接并去重，未全读history。新会话交接测试未执行，静态追踪不能冒充独立接续通过。
- 用户接受FE04并经独立门禁后，建议 **backend-ethan先落实BE08，frontend-claire配套接入**：FE4-T01类型映射→T02共享归约/两store→T03代表生成区与后台共享展示→T04同步/UI11/UI12→T05配套验证交qa-quinn。可用契约Mock并行准备，端到端须BE/FE一致v6；不由本文激活角色或刷新UAT。
