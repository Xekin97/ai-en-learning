---
milestone: M003
stage: technical-design
role: backend-architect/base
agent_name: backend-alex
status: awaiting_user_review
version: M003-BE-08
date: 2026-10-13
input_version: M003-PRODUCT-10 / TRANSITION-M003-098 / 096 accepted baseline
---

# CR-311/312后端技术交接

backend-alex完成本轮后端技术设计，可供独立接收后交designer-tony。两个CR仍open/unimplemented；没有修改workflow、激活下游或批准正式视觉。此前CR306待DB/UI/FE/实现/QA的旧交接已退出当前入口，其完成依据为[096历史接受](../reviews/verification-acceptance-096.md)，不是本轮重新验收。

## 输入与确认范围

[PRODUCT10](product.md)、[DATA307](../product/data-assets.md#data-307)、[CAP302/307与AC323–328](../product/abilities.md#uat097-acceptance)、[USER-M003-PRODUCT10-NEXT-20261013](../reviews/requirements-feedback.md)、[098激活](../reviews/uat-feedback-backend-entry-098.md)确认搜索/随机有限精确目录，以及完整旧稿保留、完整新段替换、轻量真实活动、规划至最终有效整包。无新的业务选择需重复询问。

锁定[Profile1.0.0](../reviews/evidence/start/locked-profile.yaml)与model-routing-v1保持；已读取agt-backend-design、共同/工作流/后端/路由/维护契约并核对registry/state。requested gpt-6-astra/high，098目录支持，actual_model/usage unknown。本轮源码只读，不读秘密、不发模型请求、不改真实3015或用户新增模型配置。

## 当前原始技术产物

- [BE8后端方案](../technical/backend.md#be8-cr311-312)：最小选择、源码责任表、无schema影响证据、CPU/内存/写成本、AC323–328有限实施验证计划及配套刷新边界。
- [API004候选资格](../technical/api/generation.md#cr311-candidates)：共享41項目录与SQL参数，过滤在LIMIT/random之前；现DTO/hash/权限保持，旧已选/锁定预设/历史不追溯拒绝。
- [API302 v6唯一流语义](../technical/api/generation.md#cr312-wire)：首稿原生增量；换稿完整段按序替换并保留旧尾；有界edit分片配paragraph_complete/body_complete原子呈现；真实activity、discard/Q02/同V续写/旧流隔离/Unicode；body_complete绝不代表整包valid。
- [API304预览](../technical/api/presets.md)、[API索引](../technical/api/index.md#cr311-312-index)、[AI3-05](../technical/ai-integration.md)：普通/预设/预览统一更新，Review仅私有整包接收，原模型/基础2/内容N/180每调用600总请求不变。
- [有限合成输入](../technical/fixtures/cr311-312/index.json)：短稿/增段/同段不变/长段分片/Unicode/同V续写/元数据延迟或失败/Q02/取消/失败/pending/管理员preview；不是运行或质量证据。

公开wire升m003-stream-v6；持久pipeline仍m003-content-v5、policy v1。[只读源码清单](../technical/evidence/cr311-312/source-manifest.json)记录DB04及0017两个run CHECK精确识别v5，故不能盲升pipeline；新状态只在请求内，无列/索引/快照/迁移/逐token写差异，**不需要新的DBA交接，也没有新的DBA批准**。若实施发现实际持久化差异须回dba-diana定向处理。

## 接收责任与完成条件

| 下一责任人 | 原件/动作/完成条件 |
|---|---|
| designer-tony — NEXT，尚未激活 | 上述API及fixtures、PRODUCT10、现M002/UI11/UI12完整页面；正式定义PAGE204/216/212规划＋旧稿＋逐段更新/等待/终态，中英文/窄屏、变化提示、阅读锚点、键盘与reduced motion。只消费技术语义，不发明百分比/审稿计数；新视觉须正式评审 |
| frontend-bob — UI后 | 接收批准正式设计和v6；strict schema/缓冲分片reducer/稳定阅读位置/旧epoch与status核对，验证半段不发布、正文完成不保存、规划保留、Q02与预览资格 |
| backend-ethan及前端实施 — 门禁后 | BE8最小源码表＋正式FE接收；共享候选目录、passage闭合hook、真实activity和事务式段提交，保持模型/预算/结算；只做相关替身/隔离验证 |
| qa-quinn — 实施后 | AC323–328有限功能验证，正文质量不评级；应用/浏览器/权限/终态/同模型调用序列证据，不能以本轮静态检查代替 |
| UAT刷新 — 独立门禁后 | BE/FE配套构建通过后按原有UAT流程刷新3015，保留真实DB及新增模型；不seed/reset/迁移/换mock，不自动发真实模型调用 |

## 验证、维护与未决事项

修订前八份原件保存在[before.tar.gz](../technical/evidence/cr311-312/before.tar.gz)和[hash清单](../technical/evidence/cr311-312/before-manifest.json)；067/068/096及旧审批/失败/fixture证据原位保留。只修本角色五份技术主文档、当前交接和两CR技术处理段，没有覆盖产品/UI/FE/DBA正文或控制面。

实际检查为[check.py](../technical/evidence/cr311-312/check.py)→[check.json](../technical/evidence/cr311-312/check.json)：冻结八文件hash、完整41目录、有限事件顺序/working与published/rev/终态样例、当前相对链接、产物hash/字符数；只证明合成契约自洽。无Go/SQL/浏览器/真实模型/新会话交接测试，应用实现与全部新增验收仍未验证。总运行token及累计输入unknown；静态文件字符数不能代表实际上下文或账单。已完成本角色入口去重，旧CR306待办不再支配当前下一步。

OPEN为CR311/312后续正式UI、FE接收、实施/独立QA/UAT刷新；客户端是否有额外停滞仍未知，[两次后端成功时序](../reviews/evidence/uat-feedback-097/real-run-timing.json)不能排除。CR039-L1、CR042-L1、AI-QUALITY-90、W01、QA26-MINIMAX及QA模型质量边界保留，不因设计关闭。当前没有阻塞本轮后端设计的业务歧义，未验证容量不冒充测量。

本交接建议awaiting_user_review，不切换正式阶段；下一owner为designer-tony，之后frontend-bob。
