---
id: M002-CR-011
status: open
milestone: M002
raised_by: qa-quinn
owner_stage: implementation
owner_role: backend-implementer/base
finding: QA2-F07
severity: P2
date: 2026-09-21
---

# 书架完整词条搜索未规范化大小写，合法输入返回422

## 发现的问题与批准来源

[CAP-013 / AC-013](../product/abilities.md#cap-013)、[API-007](../technical/api/identity-library.md#2-六项统计列表及详情)、[公共分页规则](../technical/api/index.md#2-公共传输与类型)、UIA-PAGE-005-01/02。API明确 `entry` 按完整词条精确大小写规范化匹配，cursor绑定规范化筛选。仍只搜目标词，不能扩展为标题、全文或模糊搜索。

真实生产前端 frontend-cr010 / Go backend-cr007 / PostgreSQL18 中，`learn`搜索成功，`LEARN`、`Learn`均422 validation_failed；页面输入大写出现“Check the information you entered.”，同时保留上次结果。完整合法词因大小写被当成无效输入，属于实现缺口，无需新产品决策。

## 复现与证据

1. 隔离学习者通过真实生成/收录保存两批目标词 learn，一批参与日期复习、一批暂停；第一批标题改为book。
2. GET `/api/v1/me/batches?entry=learn&limit=1` →200，有下一页；继续同筛选返回另一批，无重复，包含暂停批。
3. 相同账号请求 `entry=LEARN` 或 `entry=Learn` →422；带合法learn分页游标也422。`entry=%20learn%20`同样422。
4. 浏览器书架先搜learn得两条，再搜LEARN：实际API422，页面出现填写错误。改搜book为200空列表，证明当前仅搜目标词且小写正常。

[初次V11](../verification/evidence/qa2-005/inherited-results.json)、[独立重复/API与页面对照](../verification/evidence/qa2-005/search-repro-results.json)、[可复现脚本](../verification/evidence/qa2-005/search-repro.mjs)、[错误截图](../verification/evidence/qa2-005/V11-search-LEARN.png)。两批由本地确定性provider产生，未调用真实AI。空格为同一规范化问题的补充边界，核心已复现大小写违约；非法前缀lear仍应拒绝，不视为问题。

## 定向定位与建议修复

`backend/internal/httpapi/learning_handlers.go` 的 listBatches 直接以原query构造cursor scope；`backend/internal/learning/service.go` 的 ListBatches直接用原entry查小写词库，未规范化。前端library store仅trim，不转换大小写，页面复现同一问题。

交backend-ethan按API既有规则统一规范化，再用于词表精确查找和cursor绑定；明确空/非法输入沿批准语义，不放宽为模糊匹配。即使前端补转换也不能替代服务端契约修复。无需迁移、增加数据或改变搜索范围。

复验至少覆盖：learn / LEARN / Learn结果一致，合法首尾空白处理一致；同一规范化词的有效cursor可续页且不重复；改变成另一个词时cursor仍422；暂停批可查、book仅为标题不命中、非法词仍拒绝、他人库不泄露、统计不随筛选改变。页面真实大写搜索不报错。

## 影响与路由

P2，阻塞CAP013搜索契约和最终UAT；不影响本轮已通过的复习、模型卡或CR010。责任阶段implementation / backend-implementer/base / backend-ethan，由守门登记并激活，之后qa-quinn独立复验。QA不修改应用或自行迁移阶段。需要用户决定的问题：无。

## 解决记录

OPEN；尚未修复。当前实现、失败原件和后端定位均保留。
