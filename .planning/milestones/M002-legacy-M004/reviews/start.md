---
milestone: M004
stage: product-planning
agent_name: gatekeeper-owen
review_status: initialized_for_product_planning
decision_id: TRANSITION-M004-001
date: 2026-10-15
---

# M004 单词发音：需求研发启动

## 当前与目标状态

M003 已由 `TRANSITION-M003-105` 完成用户 UAT 接受及结项。根据用户“就按这个方案来，走一遍需求研发”，独立初始化 M004 / product-planning / product/to-c / **product-maya**。不重开 M003，不将历史产品、设计或技术批准用于 M004。

## 原始输入与确认

- [本次授权与已接受方向](evidence/start/authorization.json)：词典音频优先，浏览器 speechSynthesis 兜底；点击播放，按实际资源提供英美音。
- [用户范围与权益答复](evidence/start/scope-confirmations.json)：造文工具台选词、词义卡片及已保存文章单词详情；游客、普通和付费用户免费使用，不扣造文额度。
- [M003 已验收交接](../../M002-legacy-M003/handoffs/verification.md)、[结项门禁](../../M002-legacy-M003/reviews/verification-acceptance-105.md)。
- [锁定 Profile](evidence/start/locked-profile.yaml)、[启动前完整控制快照索引](evidence/start/preservation.json)。
- [公开接口环境探测](evidence/start/public-api-environment-check.json)：当前环境 TLS 证书校验/超时失败；尚未证明目标部署网络可用性，不据此判定提供方整体不可用。

## 启动检查

| 条件 | 结果 | 依据 |
|---|---|---|
| 前里程碑完成 | PASS | M003-105 与完整启动前快照 |
| 新需求与专业角色委派授权 | PASS | USER-M004-PRONUNCIATION-20261015 |
| 入口与权益已确认 | PASS | USER-M004-SCOPE-ENTITLEMENT-20261015 原始答复 |
| 锁定 Profile | PASS | consumer-ai-web@1.0.0 原文 SHA256 匹配项目清单；不升级为当前基座 Profile |
| 语义角色名 | PASS | 独立 gatekeeper 校验 product-maya、gatekeeper-owen |
| 新阶段必需产物 | 待交付 | Profile 六项产品产物，尚未批准 |
| 历史可恢复 | PASS | before-state/history/project/agents 快照；原历史条目追加前后逐项比对 |
| 全局约束保留 | PASS | retained_open_items、兼容/删除/质量政策、QA 范围及模型路由锁保留 |

## 执行与边界

独立守门会话按锁定路由请求 gpt-5.6-terra / medium，完成启动预检；其 CLI 会话采用只读权限，控制写入被该会话的文件权限拒绝，未改变文件。当前主会话据已有授权执行机械登记，未再次请求权限，未修改 sandbox 或路由。[原始守门结果](evidence/start/gate-last.txt)与[登记回执](evidence/start/gate-receipt.json)保留。未有运行时模型证明，actual_model 为 unknown。

本次仅激活产品策划。产品采用锁定 frontier 配置 gpt-6-astra / high。产品自行交付原始专业文档，守门器不代写。原型与正式设计、前后端技术、开发和独立 QA 在后续分别交接，不以启动授权冒充尚未产生的成果批准。

UAT3015 仍是已接受的 M003 环境，保持运行。既有源码改动、数据、账户、模型配置和冻结历史保持；本次不生成付费模型调用、不迁移数据库、不提交或发布。单词发音以免费资源为基础，第三方音频来源许可、覆盖和部署网络需在技术方案中验证。

## 下一角色

**product-maya（product/to-c）**：按 agt-product-planning 交付 M004 产品六项必需原件、可观察验收与角色交接。尚未确认的额外功能不得纳入实施范围。
