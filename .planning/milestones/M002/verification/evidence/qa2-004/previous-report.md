---
milestone: M002
stage: verification
role: quality/base
agent_name: qa-quinn
status: awaiting_user_review
result: failed_requires_implementation_rework
version: M002-QA-03
date: 2026-09-21
---

# 二期独立验收第三轮

**CR007、CR008 原缺陷复验通过；整体仍为 FAIL，新发现模型目录分页导致卡配置遗漏/丢失引用。** [CR009 / QA2-F05](../changes/CR-009.md) 交 frontend-claire 修复。未提交最终 UAT，不宣布里程碑完成。

## 输入与方法

授权 TRANSITION-M002-024，当前 verification / qa-quinn。PRODUCT-03、UI22/H01、DB-03、BE-03、FE-02 与既定业务约束不变，没有新产品假设。前端 [frontend-cr008](../implementation/evidence/frontend-cr008/manifest.json) 274 文件、后端 [backend-cr007](../implementation/evidence/backend-cr007/manifest.json) 285 文件与工作区逐一匹配；生产前端沿已交付 CR008 构建，真实 Go 服务与 PostgreSQL18 为新建隔离栈。未机械重跑开发单测、lint、格式、类型或构建。

本轮从 UI22 的 identity.js 删除对话框、app.js/itemForm、growth.js 与 copy.json、相关 API 验收条款推导预期，打开了账户删除原型并检查真实页面的状态/文案。真实浏览器操作与 API/数据库核对分别记录，不把原型一致当作完整设计验收。所有模型调用限 loopback；成功运行准备 4 次、首次测试准备失败另 4 次，总计 8 次本地调用，真实 AI 为 0。测试设置仅写一次性数据库。

## 修复复验与新问题

| ID | 结论 | 范围与证据 |
|---|---|---|
| CR007 / QA2-F03 | **原缺陷复验通过，待守门关闭** | S02–04，真实个人页注销有 claimed 内容的账号成功；19 类非空关联表删除、多会话失效、其他账号与共享配置保留；错误密码/未确认保护、纯注册账号对照通过 |
| CR008 / QA2-F04 | **原缺陷复验通过，待守门限定关闭** | S05–07、S06-live，已加载目录内保留下架模型可从后台保存，用户端重新预览后按新金额退一次；后续页情况不在该通过结论内 |
| CR009 / QA2-F05 | **P2，阻塞** | S08、真实鼠标 S08-repro、S13：超过 20 个模型时，后续页旧引用不可见；增选首屏项导致 PUT 200 却丢失旧引用。仅后续页模型的卡改积分被 required 阻止，手动加载后才可保存 |
| W01 console 观察 | **未稳定复现，不作新增功能缺陷** | 账户完整脚本收集到一次未记录页面归属的 hydration 警告，四项业务断言通过但脚本退出 1。后续 10 路由定向访问及成长实测未复现；保留原记录，不称整轮无运行警告 |

CR009 来源为 CAP217/AC217 的编辑一致性、D2-41/51/74 与 API206。不是要求管理员改变业务规则或重新设计：可选目录分页不能把未显示的现有值当作已删除。CR007/008 的原始故障与修复证据继续保留，正式索引由守门维护。

## 独立结果

本轮 **11 项场景通过**（S01–07、S09–12），**2 项失败场景**（S08、S13）指向 **1 项新缺陷**。S08-repro、S06-live 为重复/补充验证，不重复计数；准备步骤、运行探测与截图不额外算通过项。

| 检查 | 实际结果与边界 | 原始证据 |
|---|---|---|
| S01 自动签到与掌握 | 同学习日游客有效生成后 claim，积分/经验各 1 且今日已签；原词+三处词形全对复习后 mastered_total=1，未重复发签到积分；不代表补签/04:00 全边界覆盖 | [account-final-results](evidence/qa2-003/account-final-results.json)、[前后状态](evidence/qa2-003/account-data.json) |
| S02 误删保护 | 未勾选不发 DELETE，最终确认可取消；错密码 422、未 confirmed 的 API 422，批次与 claim 保留 | 同上、[页面截图](evidence/qa2-003/S02-password-protection.png) |
| S03 领取后注销 | 游客生成→注册收录→复习→兑换并启用次数卡；个人页双确认 DELETE 204；19 个已填充表计数全部归零，第二会话/当前会话读取 401，旧账号登录 401。另一真实 claim 账号计数和批次、共享道具定义不变 | 同上、[真实脚本](evidence/qa2-003/account-reverify-v2.mjs)、[注销后首页](evidence/qa2-003/S03-deleted-home.png) |
| S04 纯注册对照 | 无 claim 的新账号注销 204，后续读取 401 | account-final-results |
| S05 完整改价→退款 | 后台原模型选中、20→35 保存 200，GET/重新打开保持；用户已有 20 的弹窗确认返回 409、余额不变，重试显示 35，再确认到账；新幂等键重试仍原收据，余额 195→230 | [cards-results](evidence/qa2-003/cards-results.json)、[请求/结算](evidence/qa2-003/cards-details.json)、[新金额弹窗](evidence/qa2-003/S05-current-refund.png) |
| S06 混合模型与手机 | 下架/非下架模型同时保留，320px 改价成功无文档横向溢出；首次非下架样本为暂未启用，另以已启用样本 S06-live 补验通过，不混淆二者 | [手机截图](evidence/qa2-003/S06-mixed-mobile.png)、[S06-live](evidence/qa2-003/mixed-live-results.json) |
| S07 新建限制 | 无下架选项，空模型不发请求；选择非下架项后创建成功 | cards-results |
| S08 / S13 分页缺陷 | 默认目录 20 条。原 B、X，X 在后页；真实 Meta+点击增选 C 后请求/持久化 B、C，未选择删除的 X 丢失。只有 X 时 0 PUT，加载更多对照恢复选中并可保存 | [首次](evidence/qa2-003/S08-paginated-reference.json)、[重复与对照](evidence/qa2-003/pagination-details.json)、[截图](evidence/qa2-003/S08-modifier-click-before-save.png)、[空选择](evidence/qa2-003/S13-empty-selection.png) |
| S09 / S10 手动奖励 | 已收录成就达成不自动付；说明尖括号按纯文本；页面手动领取 +7积分/+20经验，达到2级但级奖仍待领；再次手动领级奖 +9；成就用新幂等键重领仍原收据 | [growth-results](evidence/qa2-003/growth-results.json)、[手动领奖截图](evidence/qa2-003/S09-manual-rewards.png) |
| S11 / S12 整份奖励 | 奖励模型下架后成就/称号保留、整份领奖 422，不发积分/经验；改成有效但未上架次数卡后可领 +3/+2/卡1，称号保持达成时快照 | 同上、[阻塞提示](evidence/qa2-003/S11-blocked-reward.png) |

S03 没有把“19 表清零”扩大为所有隐私/并发组合；受限 wordweave_app、删除后段故障回滚、claim 并发重放沿匹配后端开发证据复用。本轮页面/API由隔离测试数据库角色运行，不冒充生产部署。

## 测试方法及运行观察

首次 account-reverify 在第二个对照账号注册时，没有等新页 appReady 就填写，按钮未启用，属于准备失败；初始 S01 与失败脚本/结果原样保留。account-reverify-v2 增加就绪等待后 S01–04 全通过，但统一采集器记录一次 `Hydration completed but contains mismatches.`，因采集器没有附当时 URL，暂不能定位触发页；未修改产品或删除该警告换取脚本成功。

[10 路由补查](evidence/qa2-003/runtime-audit.json)依次检查个人资料/成长/卡/兑换/书架/日期复习/首页及后台概览/成长/预设，无 hydration/pageerror；[成长运行记录](evidence/qa2-003/growth-runtime.json)也为空。W01 仍作待定位观察，后续对应页面复验记录 URL/触发动作后再归责，不要求无证据重构。所有已执行业务断言仍按各自结果计数，不宣称账户脚本整体退出 0。

分页首次采用 selectOption 后又以实际修饰键鼠标增选，在另一张新卡重复复现相同丢引用结果；后续页仅引用的加载更多前后对照进一步定位，不靠读取源码猜测缺陷。S06-live 和奖励可用性补验仅在隔离库设置测试模型 enabled，未调用真实探针或供应商。

## 剩余范围与接续

当前 [覆盖矩阵](coverage-matrix.md)仍保留 49 CAP / 25 PAGE / 28 视图 / 119 UIA，机器索引在 [coverage.json](evidence/qa2-003/coverage.json)。本轮增加自动签到/手动奖励独立场景，未将整项能力或全部 UIA 自动标 PASS。前两轮有效证据见 [QA02 原报告](evidence/qa2-003/previous-report.md)及 [QA02 manifest](evidence/qa2-002/manifest.json)，CR005/006 维持 022 的限定关闭。

CR009 先由 frontend-claire 修复分页读入与已有引用保护，再由 qa-quinn 复验。补签/历史差额、完整日期多批、随机无候选/额度、部分重叠卡与时间边界、更多后台并发、指标核算及全 UIA 仍未完成；真机/人工读屏、生产代理/回滚和真实历史容量不具备当前独立证据。AI-QUALITY-90、CR039-L1、CR042-L1 不变。用户 UAT 未执行。

## 原件与保护

当前报告/矩阵/UAT/AI评估/交接及 CR007/008 修改前原文封存于 [before-owned.tar.gz](evidence/qa2-003/before-owned.tar.gz)，哈希见 [inputs](evidence/qa2-003/inputs.json)。QA02 旧 manifest 中这些可变文件的旧摘要可从快照恢复，其原始脚本、失败、截图和其他专业交付不变。新 CR009 原件不改控制面。

本轮未修改应用或上游设计/API、无提交或部署。专用 API/PG、3331 前端、3301/3302 临时代理和 loopback provider 均停止，原预览保留；私有临时凭据不入库。证据与保护检查见 [manifest](evidence/qa2-003/manifest.json)。新会话独立交接实验未执行，无委派授权；静态文件检查不冒充独立接续，输入/token 计量 unknown。
