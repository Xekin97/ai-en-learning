---
milestone: M002
stage: verification
role: quality/base
agent_name: qa-quinn
status: awaiting_user_review
result: failed_requires_implementation_rework
version: M002-QA-01
date: 2026-09-21
---

# 二期独立验收第一轮

**本轮不通过，确认两项实现缺陷。** 当前不具备提交最终 UAT 或关闭里程碑的条件。QA 未修改应用或上游方案，正式阶段仍为 verification / qa-quinn。

## 基线与方法

授权 TRANSITION-M002-018；有效输入 PRODUCT-03、UI22/H01、DB-03、BE-03、FE-02。前端 271 文件与后端 283 文件的交付摘要均匹配，准确版本沿[前端清单](../implementation/evidence/frontend-final-manifest.json)和[后端清单](../implementation/evidence/backend-final-manifest.json)，不是只按 Git HEAD 认定未提交工作区版本。既有控制面、源码、批准文档和冻结证据保护基线见 [inputs.json](evidence/qa2-001/inputs.json)。

复用两端已完成的单测、类型、lint、构建及开发矩阵，不机械重跑；这些仍是开发证据，不改写为独立 QA 通过。新检查使用生产 Nuxt、真实 Go/独立 PostgreSQL 18、浏览器及 loopback 模拟供应商。另对存储故障、UI 来源和缩放使用契约 mock。运营配置和账号仅写一次性测试库，不写生产/UAT；所有新增真实 AI 调用为 0。

## 已确认缺陷

| ID | 优先级 / 责任 | 用户可观察结果 | 处理入口 |
|---|---|---|---|
| QA2-F01 | P2，前端实施；本期验收阻塞 | IndexedDB 被拒绝时复习输入区消失，重试和重来仍无法作答；恢复存储后才可继续 | [CR-005](../changes/CR-005.md)，含契约 mock 与真实后端两次复现 |
| QA2-F02 | P2，后端实施；本期验收阻塞 | 模型正式下架后，仅把已有模型卡下架积分从 20 改成 35 也返回 422，原值仍为 20，不能即时调整待退卡金额 | [CR-006](../changes/CR-006.md)，含真实 API 重复复现与字段定位 |

这两项都已有明确批准期望，不需要重选产品方案。F01 的损坏记录保护与无存储可继续学习须兼顾；F02 的允许既有下架引用与禁止新增下架模型引用须区分，不能靠取消验证解决。

## 本轮独立证据

| 范围 | 结果与边界 | 原件 |
|---|---|---|
| 真实生成/认证链路 | 后台独立预览、发布、访客生成、注册承接到书架可运行；准备步骤复用开发 harness，不将其重复累计为新测试数 | [real-audit-v2](evidence/qa2-001/real-audit-v2.mjs) |
| 标题/权限，Q01–03 | 纯文本长标题、320px、持久化、保留正文/配置/时间/统计；并发冲突保留本地输入并显式再保存；管理员写入 403、其他学习者读写 404 | [run2 结果](evidence/qa2-001/run2/real-audit.json) |
| 复习/恢复，Q04–07 | 原词与三个实际词形全对成功；全空重来不算有效学习、不加成功；返回不恢复总结；改标题不清草稿，恢复须确认 | 同上。Q04 名称含“清持久答案”，本轮断言实际覆盖服务端最小收据，不据名称声称 IDB 删除全路径已验 |
| 通知/库，Q09–11 | 空昵称/性别保存；明确登录弹提醒正文、隐藏消息不显示、脚本不执行、欢迎位于 dialog 子树；刷新不再弹；暂停批次排除日期预览但可单篇复习；删除取消/确认、删除后不可读取/复习且成长掌握保留 | 同上及 [欢迎截图](evidence/qa2-001/run2/welcome-reminder.png) |
| 存储拒绝 | **FAIL / F01**；mock 和真实后端均为 0 个输入槽；重试/重来仍为 0，解除注入后为 5 | [mock 记录](evidence/qa2-001/storage-fault.json)、[真实记录](evidence/qa2-001/real-storage/result.json) |
| 道具 API，C01–05/07 | 兑换幂等、6 天加 3 天精确增加 259200 秒、禁止负数补分和模型卡混入次数；管理员改基础 Pro 后 trial 投影原样保留，effective_origin=base；已用卡下架后可退；真实背包 DTO 可展示 | [道具结果](evidence/qa2-001/cards-audit.json)、[背包截图](evidence/qa2-001/cards-real.png) |
| 下架积分调整，C06 | **FAIL / F02**；阻塞于保存配置，后续旧预览失效、新金额退一次的端到端步骤未执行，不能标通过 | [最小重复复现](evidence/qa2-001/refund-config-repro.json) |
| 首页与认证，U01–03 | 首页实际运行文案、两篇完整样文及顺序直接比对批准原型；1440px 三主要区域几何一致；8 秒换卡、阅读停止及动态减少动效通过；登录/注册控件对齐与 320px 无横溢 | [UI 结果](evidence/qa2-001/ui-run2/ui-audit.json)、[几何](evidence/qa2-001/ui-run2/home-geometry.json)、[实装](evidence/qa2-001/ui-run2/home-actual.png)、[原型](evidence/qa2-001/ui-run2/home-design.png)。U03 实测布局，不宣称逐字段文案全量比对 |
| 真正浏览器 200% 缩放，U04 | Chrome 扩展 tabs.setZoom/getZoom=2，实际 CSS 视口 720px；登录/日期/书架/个人/工具台无页面横溢；另核对日期两字段均在宽度内 | [缩放度量](evidence/qa2-001/ui-run2/zoom-metrics.json)、[原生视口](evidence/qa2-001/zoom-native-viewport.png)、[字段记录](evidence/qa2-001/zoom-viewport.json)。不扩大为全部控件/手机/读屏通过 |

按有效独立检查计：Q01–07、Q09–11 共 10 项通过；C01–05/07 共 6 项通过；U01–04 共 4 项通过。另确认 F01、F02 两项失败；额外复现与截图不重复计数。运行脚本为收集所有问题可返回 0，**结论以 JSON 每项结果为准，退出 0 不等于整体验收通过**。

## 验证方法修正与原始失败保留

首轮 real-audit.json 原地保留。Q04 使用了错误的 CSS 后代选择器；正确分支的 good 与 result-word 在同一元素。Q05/07 错把离开后的已完成会话当作必须提供重来入口，已按 AC-203“当次总结重来、之后新复习”修正测试顺序。Q09 请求误用 UI 的 zh/en，契约明确为 zh_CN/en_US；Q10 使用不存在的文案键；Q11 把删除后当前库派生成功数推断成不得减少，现改查明确不回退的生成和二期掌握。以上不作为产品缺陷，也未修改应用迎合测试。

run2/Q08 抓 URL 的时点早于新会话就绪，不能作为真实存储故障证据；[real-storage.mjs](evidence/qa2-001/real-storage.mjs) 等待槽位并确认 /review/ 路径后单独重现 F01。UI 首次使用了错误原型服务根，终止后改为服务实际 /prototype/ 路径；原日志和脚本保留。首次全页缩放合成图存在截取比例问题，不能据其裁剪判断页面；改用原生 compositor 视口与实际坐标，原全页图不作为视觉基线。

本轮为第一次独立提交，已确认 2 项功能偏差，尚未发生实现返工或还原复验。代表性首页还原未发现确定性偏差；这不表示其他所有 UIA 已逐态通过。

## 未验证与接续

完整逐项索引见[覆盖矩阵](coverage-matrix.md)。全部 49 CAP、25 PAGE、119 个架构映射 UIA 有去向；PARTIAL/DEV_ONLY 不能当整项通过。改密/注销多会话、完整多批范围、随机词真实边界、所有成就/补签/多模型重叠/跨 04:00 组合、更多后台并发、全部 UIA 状态仍待定向独立验证；不无依据扩成新平台或新指标。

真机 IME/软键盘、人工读屏、实际 BFCache 命中、存储损坏/清理失败组合、生产 Linux/Nginx/CSP/回滚和历史分析数据尚未验证。浏览器返回检查只证明已运行路径，不声称浏览器确实使用 BFCache。≥90% AI 质量仍未证明，见 [AI 评估](ai-evaluation.md)，没有新增真实模型调用授权。

CR001/002 继续开放到对应完整应用验收；CR003/004 的设计关闭不扩大为本轮运行通过；CR039-L1、CR042-L1、AI-QUALITY-90 保留。新 CR005/006 在[本轮交接](../handoffs/verification.md)可达，正式状态的 CR 索引由守门器在后续接收时登记，QA 不自行改控制面。

建议先 backend-ethan 修复 F02，再 frontend-claire 修复 F01，各自在批准边界内提交代码及定向开发证据，然后 qa-quinn 复验并补齐剩余覆盖。两项均阻塞最终 UAT；[人工清单](uat.md)仅为准备，用户未被要求现在接受缺陷。

专用 QA API、PG 和 3331 前端均已停止，私有临时数据保留供定位；原 3300 契约 mock 预览及设计预览保留。清理见 [environment-stop](evidence/qa2-001/environment-stop.log)，交付/保护摘要见 [manifest](evidence/qa2-001/manifest.json)。无部署、提交或应用修改。新会话独立交接测试未执行，无额外委派授权；静态入口检查不称独立接续通过。运行输入及 token 用量 unknown。
