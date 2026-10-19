---
milestone: M002
stage: product-planning
role: product/to-c
agent_name: product-maya
status: accepted
version: M002-PRODUCT-09-R1
current_scope: CR-313
date: 2026-10-15
---
> 归属纠正124：本文件需求属于 **M002**。正文旧 M003 版本/决定号仅为原件追踪标识，不能用来启动或收尾里程碑。当前状态以 [M002续做索引](../continuation.md) 和工作流为准；本次仅转接归属与链接，不重新批准业务。产品已按原门禁109（CR-313）接受；保留正文中的“待审”仅描述当时提交状态。



# product-maya：CR-313 PRODUCT12-R1 当前交接

已落实两项明确答复并补齐四类配置必填/可选/条件必填表。Q313-01/02均已闭环，无关键产品问题待重问；完整产品稿仍待审，本轮答复不代表产品批准或M003收尾。

## 输入与确认闭环

- [本轮用户原话与问题原件](../../M002-legacy-M003/reviews/evidence/cr313-product-revision-108-r1/clarification.json)：“1. 不包含则导入失败，需要明确哪些必填，哪些非必填；2. A”。[CR-313当前确认](../changes/CR-313.md)保留原始三项问答，记录本轮覆盖范围与撤销旧建议。
- Q313-01明确模型文件任一连接缺Key整次失败；撤销目标Key保留/清空后补填建议，停用不构成例外，不新增导入时补Key。普通无Key导出仍允许但不能直接导入，需重导含加密Key的包。输入有效仅指可解密、非空及本地合法，不验证提供方凭据。
- Q313-02明确跨类别移除引用整次阻止并列依赖，不能联动修改其他类别。字段表依据现有后台及后端校验，数值/布尔/集合必填不能被表单默认值替代，确实可选字段省略按明确无值或自动命名处理，不继承目标旧值。
- 沿[门禁108](../../M002-legacy-M003/reviews/cr313-product-entry-108.md)留在M003/product-planning/product-maya，single；沿[锁定Profile1.0.0](../../M002-legacy-M003/reviews/evidence/start/locked-profile.yaml)和[模型锁](../../../agt/model-routing-v1.lock.json)，requested gpt-6-astra/high，actual_model/usage unknown。此前已完整读取的技能、共同/工作流/ToC/路由契约与交接模板继续适用。

## 原件与追踪

唯一当前真源：[config-portability.md](../product/config-portability.md)。

- [四类字段总则](../product/config-portability.md#fields)：必填、空值、false/0/null、集合与可选缺省。
- [模型字段](../product/config-portability.md#model-fields)、[计划字段](../product/config-portability.md#plan-fields)、[道具字段](../product/config-portability.md#item-fields)、[成长字段](../product/config-portability.md#growth-fields)。
- [字段错误反馈](../product/config-portability.md#field-errors)、[AC-501～514](../product/config-portability.md#acceptance)、[确认与技术接收](../product/config-portability.md#open)。

Profile主入口：[overview](../product/overview.md)、[data-assets](../product/data-assets.md)、[abilities](../product/abilities.md)、[pages](../product/pages/index.md)、[ai-behavior](../product/ai-behavior.md)。仅更新头部/当前指针，PRODUCT10正文原样保留。DATA-501～506、CAP-501～504、PAGE-501～504不变，新增AC-513/514响应用户字段要求。

## 剩余技术接收与下一步

TECH-501由dba-diana/backend-alex落实文件版本、准确身份/依赖映射、整类原子替换、历史与并发保护；TECH-502由backend-alex落实加密/秘密和完整性校验；TECH-503由frontend-bob接收正式设计并落实文件错误定位、预览失效及未知提交结果处理。未定义API字段名、序列化schema或密码算法；技术须显式区分缺失与false/0/null，不能复用现有单项编辑“缺Key保留”绕过本轮确认。

后续建议在产品稿接收后由designer-tony交类别操作、加密选项、必填说明、错误定位、全量预览/确认的原型与正式设计；阶段由控制面处理，本角色不激活下游。CR-313仍open，产品未实施，全部AC尚未实现验收。

## 保留与验证

[修订前快照](../../M002-legacy-M003/reviews/evidence/cr313-product-revision-108-r1/before-clarification.tar.gz)保留8份原件与旧manifest/check；原product/evidence/cr313证据冻结不覆写。PRODUCT11发音原件、UI14设计/交接/manifest保持；发音产品已接收、UI14尚待审。M003整体未收尾，CR311/312的QA/UAT接受保持；UAT3015/4174、应用源码、数据与模型配置未动，[QA范围政策](../../../agt/qa-scope-policy.md)不变。

本轮[静态自检](../../M002-legacy-M003/product/evidence/cr313-r1/check.json)、[当前产物manifest](../../M002-legacy-M003/product/evidence/cr313-r1/manifest.json)、[保留清单](../../M002-legacy-M003/product/evidence/cr313-r1/preservation-before.json)核对链接、编号、答复收敛、旧正文/发音/设计/冻结证据完整性。无应用测试、真实Key读取、提供方或模型调用、运行时刷新；静态通过不等于功能验收。总实际输入/运行token未知，不以字符数冒充token。
