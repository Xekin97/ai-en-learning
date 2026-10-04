---
milestone: M002
stage: verification
role: quality/base
agent_name: qa-quinn
status: awaiting_user_review
result: scoped_reverification_passed_remaining_coverage
version: M002-QA-08
date: 2026-09-28
---

# 二期独立验收第八轮

**CR014书架焦点、CR015参与统计的原缺陷独立复验通过；补充复习并发验证通过。** 最终15个稳定场景PASS，无新增产品缺陷。首次K10在淡入过程中扫描出对比度问题，原失败保留；独立复查原型与生产页面、等待动画完成后的K10均通过。两项CR记为verified_pending_gate，正式关闭由守门处理。整体验收仍有剩余覆盖，UAT未执行。

## 输入与批准依据

TRANSITION-M002-035，verification / quality/base / qa-quinn；PRODUCT03、UI22/H01、DB03/BE03/FE02保持。前端[frontend-cr014-015](../implementation/evidence/frontend-cr014-015/manifest.json)280文件、后端[backend-cr013](../implementation/evidence/backend-cr013/manifest.json)288文件与当前源码匹配，见[inputs](evidence/qa2-008/inputs.json)。复用匹配的生产前端，在一次性环境启动真实Go/PostgreSQL；未重跑开发单元、lint、类型、格式或前端构建。

CAP012/013/015、PAGE005/006、UIA-PAGE-005-01/02/LIBRARY18及[UI18交互](../design/interactions.md#书架--ui-18)明示操作后焦点、统计同步。[API007](../technical/api/identity-library.md)规定全库六统计、参与设置及固定会话边界；[API008](../technical/api/review.md)规定重复提交最小回执、替换CAS和提交/替换冲突。B01–05来自已有矩阵缺口，没有新增产品规则。

Node24.21.0、Go1.26.7、PostgreSQL18、生产Nuxt与Chromium模拟视口。真实生成收录建立本人24篇有效短文（learn21、book3）、本人删1篇、他人1篇，含暂停项和长标题；初始六统计25/2/23/1/0/0。仅loopback供应商，27次本地确定性调用（探针1、生成26），真实AI0。私有账号凭据、env及token不进入证据。

## 修复与有效结果

| 场景 | 实际结果 | 证据 |
|---|---|---|
| K01 | 中英×320/390/768/1440：按钮搜索、Enter、无结果、清空后焦点回输入且可见；book筛选3篇仍显示全库统计 | [书架结果](evidence/qa2-008/library-results.json)、[脚本](evidence/qa2-008/library.mjs) |
| K02 | 同8组合20→24篇；焦点移到首个新增标题而非最后一篇，原行顺序不变，长标题可见、无文档横向溢出 | 同上；[英文1440长标题](evidence/qa2-008/K02-en-1440.png) |
| K03 | 同8组合、筛选/未筛选、双向参与切换：PATCH/详情/checkbox一致；焦点留同checkbox；参与/暂停全库统计同步，其余四统计不变 | 同上 |
| K04/K05 | CR012回归：英文390、中文1440，显式返回/历史后退均保留LEARN、21行、焦点与位置（误差<3px）；详情共享checkbox变更后返回书架统计同步 | 同上 |
| K06/K07 | PATCH断网不改变已确认checkbox或统计，错误可见、重试恢复；PATCH成功而summary读取失败时保留已提交checkbox，显示错误，重新搜索后统计恢复 | 同上；runtime仅这两次故意ERR_FAILED |
| K08/K09 | 较旧真实summary响应在第二次变更后到达，不覆盖新统计；旧加载页在搜索book后到达，不追加旧行或抢焦点 | 同上 |
| K10 | 准确六标签、标题→统计→搜索→列表顺序、稳定后的书架axe扫描与运行时检查通过 | [最终控制](evidence/qa2-008/library-controls.json)、[脚本](evidence/qa2-008/library-controls.mjs) |
| B01 | 日期预览23→22随参与设置更新；已建范围仍23；暂停批次仍可单篇复习 | [复习结果](evidence/qa2-008/review-results.json)、[脚本](evidence/qa2-008/review-concurrency.mjs) |
| B02 | 同attempt同时提交两次，submitted/already_submitted各一次；成功复习/曾全对批次/唯一掌握仅加1；重试与读取只返回最小事实，无答案对照 | 同上 |
| B03 | 同版本同时替换，201/409各一次，败方session_replaced；旧会话abandoned、唯一新活动会话 | 同上 |
| B04/B05 | 真实提交/替换竞争中提交胜出200、替换409 revision_conflict，成功只加1；另验替换先完成后旧start/submit/restart均409 session_replaced，旧attempt读为restarted，无再次结算或答案 | 同上 |

K01–03的尺寸/语言组合及控制复查不重复加总；K01–10共10项、B01–05共5项。B04实际观察到提交先胜出，不声称穷尽全部调度；B05是明确先替换的相反顺序控制。

| 问题 | 本轮结论 |
|---|---|
| [CR014 / F10](../changes/CR-014.md) | verified_pending_gate：K01–03焦点目标/可见性通过，K04–09关联回归通过 |
| [CR015 / F11](../changes/CR-015.md) | verified_pending_gate：K03/05–08全库统计、失败与延迟响应通过；B01未来日期预览与现有快照边界通过 |
| 历史关闭 | CR012/013沿034、CR011沿031、CR010沿029、CR009沿027、CR007/008沿025、CR005/006沿022限定关闭保持；W01旧未定位观察保留 |

## 设计核对与测试修正

实际打开UI22原型并读取准确文案、交互和响应式来源；人工核对[生产中文320](evidence/qa2-008/contrast-production-zh-320.png)、[原型中文320](evidence/qa2-008/contrast-prototype-zh-320.png)及英文1440长标题截图。六统计、列表卡、操作层级与长标题布局在本轮范围内可用；动态数据不同，不按夹具数值逐像素比较，也不以局部截图代替完整UIA。

首次library执行9 PASS/1 FAIL：[原始axe](evidence/qa2-008/axe.json)在入场动画期间读到合成前景色#65726a，对背景#edf2e4为4.41。新上下文等待字体和淡入完成后，在中文1440、英文1440、中文320分别扫描生产与原型，共6次均0违规，实际字体色rgb(95,109,101)，见[对比复查](evidence/qa2-008/contrast-repro.json)。随后K10用原标签/顺序/axe/运行时期望独立通过。原脚本、失败截图、日志未覆盖，未改变产品样式或放宽对比度阈值。结论仅覆盖稳定显示；不宣称测量了每一动画帧。

## 剩余范围与交接

[矩阵](coverage-matrix.md)和[机器索引](evidence/qa2-008/coverage.json)继续保留49 CAP/25 PAGE/28视图/119 UIA。本次局部通过不将整项能力改成PASS。剩余包括trial/visitor退款、生产SSE代理及更多失败UI、真实04:00时点、更多运营配置/奖励并发、业务事件留存与90天物理清理、完整UIA/真机/读屏/性能/部署；复习并发已补上述场景，其他故障组合和真实BFCache仍待覆盖。CR001/002、CR039-L1、CR042-L1、AI-QUALITY-90保持。

建议守门按本轮范围正式关闭CR014/015，保持质量角色继续剩余覆盖。无需前端再次返工或新增产品决策；QA不自行切阶段或关闭控制面问题。下一批优先补生成trial/visitor失败退款与预设固定配置流程，再核对分析留存/清理。

## 原件与运行环境

修改前五份QA正文及CR014/015在[before-owned](evidence/qa2-008/before-owned.tar.gz)和可读previous副本。6752份受保护文件包含应用、控制面、批准来源与旧证据；QA07共75份原件按原摘要恢复核对，当前7份更新正文的旧字节可从归档恢复。结果、链接、同口径文档大小、来源摘要见[manifest](evidence/qa2-008/manifest.json)，复现见[README](evidence/qa2-008/README.md)。

本轮开始时相关端口均关闭；自建3331/3301/38081/38082/39081/4186及一次性PostgreSQL已停止。仅更新QA5文档、CR014/015复验记录及新证据；无应用修复、提交、部署、真实AI、委派或换模。新会话交接实验未执行，input/token未知。
