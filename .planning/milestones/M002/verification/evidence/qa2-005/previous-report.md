---
milestone: M002
stage: verification
role: quality/base
agent_name: qa-quinn
status: awaiting_user_review
result: failed_requires_implementation_rework
version: M002-QA-04
date: 2026-09-21
---

# 二期独立验收第四轮

**CR009 原缺陷独立复验通过；新发现 CR010 / QA2-F06：数据分析切到近 30 天会撑宽手机页面。整体仍为 FAIL。** 本轮 14 项有效场景通过、1 项失败；没有用户 UAT 或里程碑完成结论。

## 输入与方法

授权 TRANSITION-M002-026，verification / quality/base / qa-quinn。PRODUCT-03、UI22/H01、DB-03、BE-03、FE-02 不变。前端 [frontend-cr009](../implementation/evidence/frontend-cr009/manifest.json) 的 276 文件、后端 [backend-cr007](../implementation/evidence/backend-cr007/manifest.json) 的 285 文件与当前源码一致；核对见 [inputs](evidence/qa2-004/inputs.json)。复用已交付 CR009 生产前端，在新的隔离 Go/PostgreSQL18 栈和 Chromium 上验证；没有重复开发单测、lint、格式、类型或前端构建。隔离栈启动编译同版 Go，不算开发测试重跑。

期望来自 CAP212/217/219、API101/203/204/206/209，以及 UI22 的道具、补签、看板文案和响应式规则。保存、补签和退款均通过真实页面/API；历史签到、模型启用和分析历史事件只在一次性数据库设置。分析浏览器事件通过真实收集 API，分钟聚合由实际维护任务产生，未伪造聚合结果。历史生成终态是合成事实，只证明聚合口径，不证明供应商生成链路。真实 AI 与 loopback provider 调用均为 0。

## 缺陷闭环

| ID | 当前结论 | 范围 |
|---|---|---|
| [CR009 / QA2-F05](../changes/CR-009.md) | **verified_pending_gate** | T01–07 覆盖 44/45 个模型、多页已有引用、真实鼠标增删、失败重试、服务端修订冲突、移动编辑和改价退款。待守门按本范围限定关闭 |
| [CR010 / QA2-F06](../changes/CR-010.md) | **OPEN / P2** | T15：近30天的30根柱撑开网格。390/320px 页面宽均为770px，7天对照正常；交 frontend-claire 修复 |
| CR007/008、CR005/006 | 既有限定关闭保留 | 分别沿 TRANSITION-M002-025、022，不重开或扩大旧通过范围 |
| W01 | 未稳定复现的旧观察保留 | 本轮记录 URL/动作，没有 pageerror/hydration；不反证 QA03 曾出现的未定位警告 |

## 本轮有效结果

| ID | 预期与实际 | 原始证据 |
|---|---|---|
| T01 | 仅第3页下架模型的卡自动显示并选中已有模型；20→35保存成功，持久化引用不变 | [卡结果](evidence/qa2-004/cards-results.json)、[请求/持久化](evidence/qa2-004/cards-details.json)、[截图](evidence/qa2-004/T01-loaded-retired.png) |
| T02 | 已打开的20分退款确认返回409，余额195不变；重试显示35，确认余额230；新幂等键重放仍原收据 | 同上、[退款弹窗](evidence/qa2-004/T02-current-refund.png) |
| T03–04 | 实际 Meta+鼠标增选首屏模型保留后页旧引用；显式取消才移除。新建不显示下架项，空选不发请求，选合法模型后可创建 | cards-details / cards-results |
| T05 | 后续页503时模型框和保存禁用，输入42保持、0次写；Retry后恢复原引用，显式保存只发1次写入 | 同上、[失败状态](evidence/qa2-004/T05-failed-page.png) |
| T06 | 另一管理员新增模型并改卡后，旧保存409；旧模型游标也实际409。前端重载目录、保留67分输入，未自动保存；第二次明确保存保留服务器新增引用 | cards-details 的 T06 responses及请求 |
| T07 | 320px编辑只有后页下架引用的卡，表单/文档无横向溢出；48分保存成功且引用不变 | [手机编辑](evidence/qa2-004/T07-mobile-edit.png)、cards-details |
| T08 | 补8月31日，旧规则8+2、9月起20+3、今天提高为50+10；预览仍分别为0→10、20→26、23→29，合计22；跨月可选、预览不消耗卡或改余额 | [补签结果](evidence/qa2-004/makeup-results.json)、[事实与结算](evidence/qa2-004/makeup-details.json)、[差额展示](evidence/qa2-004/T08-historical-differences.png) |
| T09 | 页面确认只耗1卡、51→73积分，经验保持13，历史最长签到变4；复习日期/连续事实不变。新成就达成、称号显示，但7分/11经验奖励仍待手动领 | 同上、[待领奖励](evidence/qa2-004/T09-unclaimed-achievement.png) |
| T10 | 新幂等键重放不重复付；第二张卡补已签日422不消耗；第30日可补、第31日/今天/未来/注册前不可补 | makeup-details |
| T11 | 真实事件重试只记1条；单日PV4/UV3/跳出1÷3，两日PV5/UV3（日UV相加为4）/跳出2÷4。渠道按每次会话入口计UTM2/外部1/直接2，未配置Clarity为不可用 | [独立计数](evidence/qa2-004/analytics-counts-results.json)、[夹具](evidence/qa2-004/analytics-fixture.json) |
| T12 | 合成2成功、2失败、1取消、1进行中得失败率50%，分母4。无样本比率null，新注册D1/7/30观察中，超90日范围精确UV为detail_expired | [接口结果](evidence/qa2-004/analytics-results.json)、[响应](evidence/qa2-004/analytics-details.json) |
| T13 | 管理员事件204但不入库；私密未知字段、伪造业务事件、带路径referrer均422且不入库；访客查分析401、学习者403，管理查询no-store | analytics-details |
| T14 | 页面与同范围API数值一致，50%显示为50.0%；切30天实际请求3接口200；管理员分析页和个人成长页无Clarity请求 | [页面补验](evidence/qa2-004/analytics-ui-final-results.json)、[30天截图](evidence/qa2-004/T14-analytics-verified.png) |
| T15 | **FAIL**：1280px下30天将流量/转化列从481/481压成766/200.8；390/320px下两面板宽754、文档宽770。7天均正常。违反页面不得整体溢出的批准规则 | [几何与结果](evidence/qa2-004/analytics-layout-results.json)、[390px](evidence/qa2-004/T15-390-30.png)、[320px](evidence/qa2-004/T15-320-30.png) |

T14只证明数字、切换和本次无第三方请求，不代表全页布局通过；随后实际截图触发T15定向复验。15项按稳定场景计数，准备步骤、纠正测试预期后的重复执行和截图不增加通过数量。

## 测试自身问题与运行记录

- 首次 cards-preparation 写错测试表名 `wordweave.models`，准备失败；改用实际 `ai_models` 后重建隔离库再运行。原脚本/日志/结果保留，没有产品代码修改。
- 初次T11把第二日新会话无来源错误归入前日UTM；API209明确按会话入口。纠正为UTM2/直接2后用同一事实重新独立计数通过，未改服务器或数据。
- 初次T14误把过去两日夹具PV5当作页面七日PV，漏算此前QA访问3次；随后误要求字符串50%而实际格式50.0%。都属于测试口径错误。再用 `getByLabel(exact)` 定位不到嵌套select，v2等待响应未处理超时、v3仍超时；[定位记录](evidence/qa2-004/T14-label-diagnostic.json)显示正确可访问名称为Period、combobox可定位。v4通过真实select切换完成，无实现修补或跳过业务断言。
- 初次分析日志2 PASS/2 FAIL、UI v1/v2/v3失败与v4通过均保留；当前有效T11取counts、T12/13取原analytics、T14取final，不能把早期失败文件当成功证据。
- cards-runtime仅含故意构造的409/503资源错误，makeup/analytics及最终UI无pageerror/hydration。保留原HTTP错误，不宣称所有console为空。真机、其他引擎、人工读屏和性能均不因本次Chromium通过而获通过结论。

## 剩余范围与交接

[覆盖矩阵](coverage-matrix.md)仍为49 CAP /25 PAGE /28视图 /119 UIA。CAP212、CAP219已增加独立证据，不能把局部场景提升为全部验收通过；PAGE213的30天响应式失败单独归CR010。前轮原件见 [QA03原报告](evidence/qa2-004/previous-report.md)及[QA03清单](evidence/qa2-003/manifest.json)。

下一责任为 frontend-claire，仅修复CR010的真实动态数据布局并提交开发自验；由守门登记/激活，qa-quinn随后独立复验。CR009可按本轮范围限定关闭。继续矩阵中的完整日期多批、随机无候选/额度、部分重叠卡与时间边界、后台其他并发、指标业务链与完整UIA。04:00实时时点、真实历史容量/90天物理清理、真机/人工读屏和生产部署仍无本轮独立结论。CR001/002、CR039-L1、CR042-L1、AI-QUALITY-90保持。用户UAT未执行。

## 原件与环境保护

改动前6份QA自有文档归档于 [before-owned](evidence/qa2-004/before-owned.tar.gz)，旧报告/矩阵/UAT/AI/交接另存可读快照。6052份其余原件、开发交付、前轮失败和控制面保持；旧QA03可变文档摘要从本轮快照恢复。新证据与校验见 [manifest](evidence/qa2-004/manifest.json)及[复现说明](evidence/qa2-004/README.md)。

本轮只修改QA文档、CR009状态记录并新增CR010，未改应用、产品/设计/API、控制面。专用API/PG、3331及3301均停止；原3300/3330/38080/4186保留，私有凭据不入库。无提交/部署、无真实AI调用、无委派或模型切换。新会话交接实验未执行，静态保护/链接检查不冒充独立接续，input/token计量unknown。
