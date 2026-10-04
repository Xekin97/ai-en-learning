---
milestone: M002
stage: verification
role: quality/base
agent_name: qa-quinn
status: awaiting_user_review
result: scoped_verification_passed_remaining_coverage
version: M002-QA-10
date: 2026-09-28
---

# 二期独立验收第十轮

**监控数据90天生命周期、匿名历史汇总、跨期复习统计和注销访问链，最终11项限定场景通过，无新增产品缺陷。** 首轮9 PASS/1测试夹具FAIL，A09定向控制通过；原始失败保留。其余批准范围仍需收敛，最终UAT未执行。

## 验收依据与环境

APPROVAL-M002-036继续授权verification / quality/base / qa-quinn；PRODUCT03、UI22/H01、DB03/BE03/FE02保持。依据[API209/900](../technical/api/analytics.md)、[DB2-Q03与分析存储](../technical/database.md)、[BE2-V14/15](../technical/backend.md)、[身份删除](../technical/api/identity-library.md)及[复习最小事实](../technical/api/review.md)。90天是用户已确认的分析明细期限，与本机复习草稿无关；没有新增数据保留需求。

[输入](evidence/qa2-010/inputs.json)核对前端280、后端288源文件与当前交付一致。一次性PostgreSQL18和实际Go1.26.7服务，Node24.21.0/Playwright HTTP上下文维护真实Cookie/CSRF；本轮没有页面操作或UI新增通过声明。只配置loopback模型，共2次本地调用（兼容探针1、有效生成1），真实AI0。未重复单元、lint、类型、格式或前端构建。

## 独立结果

| 场景 | 预期与实际 |
|---|---|
| A01 | 匿名PV重试只落一次；注册关联当前会话；登录前后同浏览器同UV，另一个浏览器另算UV。真实3PV/2UV/1注册 |
| A02 | 实际生成→保存201→重复保存200→开始复习→恢复：generation_started/valid、passage_saved、registered、review_started各1；浏览器伪造提交事件422 |
| A03 | 实际分钟任务产生当日PV3/UV2、注册转化1、有效生成1、收录1、开始复习1/提交0、WAU1；尚活跃会话不算跳出，D1仍observing/null |
| A04 | 两个真实注册账号的历史事实夹具：D1/D7/D30各1/2；注册当日及后6日激活1/2，第7日收录不算；全空提交计频次但不计活跃，指定日WAU1、提交1、频次1 |
| A05 | 暂停聚合且检查点滞后，数据库仍有过期明细；读取标delayed。历史PV3、两个日UV各1仍可用，范围及渠道精确UV为unavailable/detail_expired，未相加伪造2；成熟D30仍1/2 |
| A06 | 显式删除一个历史WAU汇总点，同时保留对应个人成长日；读取为unavailable/source_unavailable，未用长期成长表重建 |
| A07 | 释放聚合锁，实际维护物理删除过期事件/会话/两个注册分析副本，真实账号保留；恰好90天处记录被清，期限内15分钟对照仍在；匿名汇总值不改、成熟D30仍1/2、旧draft最小事实保留 |
| A08 | 开始已超过90天且开始分析事件已清理的实际attempt，恢复后非空错误提交200；重放200只一次提交事件；实际下一次聚合将原开始队列更新为1开始/1提交/0成功，当天提交数1；读取不恢复答案 |
| A09 | 真实注销204，三条已关联浏览器访问链与本人分析事件/cohort/session关联/复习attempt/成长日全清；同浏览器另一个账号的registered事实保留但browser/session链解除；旧匿名汇总不改 |
| A10 | 模型不可用模式下live/ready均200，健康查询不调用提供方；公开API监听上的internal/metrics为404 |
| A11 | 持有聚合锁、检查点落后5分钟时，实际定时清理拒绝超前删除，过期对照行保留；输出analytics_cleanup_failed及有限reason；查询仍delayed且不提供过期范围UV |

主轮[结果](evidence/qa2-010/analytics-results.json)/[脚本](evidence/qa2-010/analytics-lifecycle.mjs)，A09[定向控制](evidence/qa2-010/deletion-control-results.json)/[脚本](evidence/qa2-010/deletion-control.mjs)，A11[停滞验证](evidence/qa2-010/stalled-results.json)/[脚本](evidence/qa2-010/stalled-maintenance.mjs)。稳定场景计11项，不重复计算时间点、恢复或重放次数。

## 夹具、原始失败与限制

- 注册、生成、收录、开始/恢复/提交和注销走实际HTTP事务。历史留存活动由合成服务端事实表示，时间明确调整；先让实际聚合器计算结果，再把汇总与明细一起移到过期日期，汇总值没有人为编造。真实维护执行读取和清理；不声称等待了90天或跨过实际04:00。
- A09首轮测试账号`qa10_shared_browser_`加时间戳超过32字符，被正确422拒绝，尚未执行注销。控制使用合法短名称并重建同浏览器多账号场景，原来两条访问链加新的第三条全部验证。未修改产品或放宽删除期望；原主轮FAIL不改写。
- A11通过独立数据库会话持有聚合锁，并将检查点设为5分钟前，实际等待分钟任务记录错误；证明清理保护和可观察失败，不证明生产告警已送达或长期积压恢复容量。
- 本地API/PG、权限判定和数据结果通过；隔离库运行身份不冒充生产最小授权或Linux/Nginx验收。API900本轮只补健康/公开监听边界。真实设备、辅助技术、生产网络与容量沿原限制保留。

## 交接与剩余范围

[矩阵](coverage-matrix.md)和[机器索引](evidence/qa2-010/coverage.json)保持49 CAP/25 PAGE/28视图/119 UIA；仅增加相关API/数据证据，没有把完整能力或UIA整体标通过。QA09预设/退款、此前限定修复结论均保持。

下一批按已有授权收敛剩余验收，优先对CR001一期继承、CR002标题需求建立应用证据结论，整理实际仍缺的UI/运行环境项与UAT候选。匹配开发证据与独立结果分别列明，不机械重跑或为“更多组合”新增隐性门槛。CR001/002、CR039-L1、CR042-L1、AI-QUALITY-90、W01保留；本轮没有新的返工或同角色交接审批。

## 原件与环境

仅修改QA五份正文及本轮证据；6874受保护文件不变。QA09的63原件中58原位保持、5份旧正文在[归档](evidence/qa2-010/before-owned.tar.gz)及previous副本；版本/链接/私有值保护/文档大小见[manifest](evidence/qa2-010/manifest.json)，操作说明见[README](evidence/qa2-010/README.md)。自建服务均已停止；无应用或控制面修改、提交、部署、真实AI、委派、换模。新会话交接实验未执行，input/token未知。
