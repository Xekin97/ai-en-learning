---
milestone: M002
stage: verification
role: quality/base
agent_name: qa-quinn
status: awaiting_user_review
result: failed_requires_implementation_rework
version: M002-QA-05
date: 2026-09-21
---

# 二期独立验收第五轮

**CR010图表布局独立复验通过；新增CR011 / QA2-F07：书架搜索合法大写词条返回422。** 本轮14个稳定场景中13 PASS、1 FAIL，整体仍需实现返工。用户UAT未执行，不能宣布二期完成。

## 输入与方法

TRANSITION-M002-028，verification / quality/base / qa-quinn。PRODUCT-03、UI22/H01、DB-03、BE-03、FE-02保持。前端[frontend-cr010](../implementation/evidence/frontend-cr010/manifest.json)277文件、后端[backend-cr007](../implementation/evidence/backend-cr007/manifest.json)285文件与当前源码匹配，见[inputs](evidence/qa2-005/inputs.json)。复用CR010最终生产前端构建，新建隔离Go/PostgreSQL18环境；不重复开发单元、lint、类型、格式或前端构建。

既有CAP013/017/020/021/106/107/201–204/208/213/216/219和API002/007/008/004/103/204/209为验收依据。没有增加跨设备草稿、任务体系或新统计口径。浏览器使用真实前端/API；分析历史事件、复习批次时间、成长启用和卡模型启用仅在一次性数据库设置。分析由实际分钟任务聚合。五篇短文通过真实生成/收录API产生；本地确定性provider共6次调用（1探针、5生成），真实AI调用0。

## 缺陷闭环

| ID | 当前结论 | 范围 |
|---|---|---|
| [CR010 / QA2-F06](../changes/CR-010.md) | **verified_pending_gate** | V01–04通过，建议守门限定关闭；QA不修改控制面 |
| [CR011 / QA2-F07](../changes/CR-011.md) | **OPEN / P2** | V11：learn成功，LEARN/Learn返回422，真实书架出现填写错误；交backend-ethan |
| CR009 | 既有限定关闭保留 | TRANSITION-M002-027，原T01–07；不重复扩大通过范围 |
| CR005/006、CR007/008 | 既有限定关闭保留 | 沿022、025 |
| W01 | 历史未定位观察保留 | 本轮没有pageerror/hydration，不能反证旧版本的未定位观察 |

## 本轮有效结果

| ID | 预期与实际 | 原始证据 |
|---|---|---|
| V01 | 未启用分析源的Unknown/空状态，中英文320px、7/30天均无页面横溢；原型结构对照 | [图表结果](evidence/qa2-005/analytics-results.json)、[原型截图](evidence/qa2-005/V01-prototype.png) |
| V02 | Chromium中英文×320/390/1280/1440×7/30；逐日非零/零PV和UV与手算及API一致；日期标签未遮挡/重叠，完整明细键盘可达；桌面双列均衡 | 同上、[手机中文](evidence/qa2-005/V02-chromium-zh-320-30.png)、[桌面英文](evidence/qa2-005/V02-chromium-en-1440-30.png) |
| V03 | Firefox/WebKit手机/桌面和英文重载通过；更新时间的北京时间本地化文案与浏览器一致，无hydration警告 | analytics-results、V03截图 |
| V04 | 图表双面板范围axe WCAG2A/AA/2.1AA无违规；本轮图表runtime为空，不代表整站人工辅助技术通过 | [脚本](evidence/qa2-005/analytics.mjs)、analytics-results |
| V05 | 洛杉矶本地日期边界选中2批，同一单日用北京时间只命中0批、洛杉矶命中1批；从真实日期UI开始，改参与开关只改变新预览、不改变当前2批快照；题面无标题/原词 | [业务结果](evidence/qa2-005/business-results.json)、[事实](evidence/qa2-005/business-details.json) |
| V06 | 两批依次填写→概览→提交→下一批→完成，进度1/2到2/2；相同lexeme首次新增1、第二次0；刷新只剩最小概况，GET不回传comparison或题面 | 同上、[最终总结](evidence/qa2-005/V06-final-summary.png) |
| V07 | 替换到空范围422保留旧安排；开始草稿后旧版本替换409；新版本替换成功，旧会话abandoned且旧start/restart409 | business-details |
| V08 | 两词临时词表使候选可穷尽：本人库learn被排除、选book后无候选；另一用户及访客可得learn；无效词422。随机前后quota、extra、3条实际generation_charges计数及成长均不变；删库后mastered仍1且learn可再抽 | [补验结果](evidence/qa2-005/random-v2-results.json)、[脚本](evidence/qa2-005/random-v2.mjs) |
| V09 | AB3天+BC6天及反向使用，A3/B9/C6；每份贡献实际时长正确，重叠B接原末尾。同/新幂等键不重复贡献；两种顺序都只有4条贡献，生成额度不变 | business-details、[逐模型到期显示](evidence/qa2-005/V09-overlap-items.png) |
| V10 | 当前计划全覆盖卡模型时预览拒绝且零贡献；只覆盖A时AB卡可启用。之后计划覆盖再移除不暂停、不重写原时长 | business-details |
| V11 | **FAIL**：learn分页2批无重复且含暂停；LEARN/Learn和带空格完整词422。浏览器LEARN报填写错误。book仅出现在标题时为200空列表，统计不变；非法前缀lear仍拒绝 | [首次结果](evidence/qa2-005/inherited-results.json)、[重复API/页面对照](evidence/qa2-005/search-repro-results.json)、[截图](evidence/qa2-005/V11-search-LEARN.png) |
| V12 | 后台真实用户学习列表与阅读弹窗展示本人相同标题/正文；无编辑控件或复习动作。直接修改/删除/代复习均403/405，错owner路径404，内容不变 | [继承功能结果](evidence/qa2-005/inherited-results.json)、[请求状态](evidence/qa2-005/inherited-details.json)、[只读弹窗](evidence/qa2-005/V12-admin-readonly.png) |
| V13 | UI切中文，刷新仍中文；新英语浏览器显式登录仍采用账号中文偏好并渲染中文书架 | 同上、[语言持久化](evidence/qa2-005/V13-account-locale.png) |
| V14 | 后台密码不一致禁用确认，取消不撤会话；真正确认204后两个旧会话/旧密码401，新密码登录200且两批仍在，管理员会话保留 | inherited-details、[成功界面](evidence/qa2-005/V14-reset-success.png) |

26组图表参数组合只算V01–03对应稳定场景；反向用卡、重复诊断、准备和截图不额外计通过数。V08以random-v2为当前有效结果；V11最终仍FAIL，未因小写对照通过掩盖大小写问题。

## 测试自身问题与运行记录

- 初次V08读取了不存在的quota_charges，属测试表名错误；纠正为实际generation_charges/account_id，仅补跑V08，不重复其他通过场景。第一次补跑DELETE未带JSON Content-Type（未传空对象），中间件400；补跑v2用真实客户端同样的JSON请求后通过。全部原脚本/失败日志/结果保留，未修改产品。
- 初次V11在第一条大写API断言即失败。独立search-repro再次比较大小写、分页和实际页面，确认是真实缺陷。未放宽为小写通过。后续页面定位采用实际.library-row，初版未执行到的.library-card不作为证据。
- analytics、business、inherited三组runtime为空；search-repro仅记录实际大写请求422资源错误，无pageerror/hydration。图表跨三个引擎，其余业务场景仅Chromium，不推及真机输入、读屏或完整性能。
- 临时随机词表仅在一次性数据库替换snapshot指向，finally恢复；仓库词表与产品源文件未改。图表PV由原始历史事件聚合，合成fixture的渠道不用于本轮渠道正确率结论，既有T11渠道独立证据继续保留。

## 剩余范围与交接

[矩阵](coverage-matrix.md)保持49 CAP /25 PAGE /28视图 /119 UIA；CAP013现FAIL，CAP219恢复PARTIAL，后台密码/只读库/语言增加独立证据。通过局部场景不等于整个能力全部通过。[QA04原报告](evidence/qa2-005/previous-report.md)和[原清单](evidence/qa2-004/manifest.json)保留。

建议守门按V01–04限定关闭CR010并激活backend-ethan修复CR011，规范化必须先于词表查找及cursor绑定；不改变完整词搜索边界。然后由qa-quinn复验。其余待验见矩阵：取消/失败来源退款、复习替换并发、04:00实时时点、更多后台运营并发、分析业务事件链及90天物理清理、完整UIA/辅助技术/性能/生产代理。CR001/002、CR039-L1、CR042-L1、AI-QUALITY-90保留；用户UAT未执行。

## 原件与环境保护

变更前6份自有文档在[before-owned](evidence/qa2-005/before-owned.tar.gz)；旧报告/矩阵/UAT/AI/交接有可读副本。6296份受保护原件含控制面、上游、开发交付、历史失败保持不变；旧QA04中可变文档摘要用before-owned恢复。新证据、同口径文档大小及链接核对见[manifest](evidence/qa2-005/manifest.json)、[复现说明](evidence/qa2-005/README.md)。

仅更新5份QA入口、CR010复验记录并新增CR011；不改应用/产品/设计/API/控制面。自有PG/API/3331/3301/provider均清理，原3300/3330/38080/4186保留；凭据只在私有临时环境，不提交运行token。无提交/部署/委派/模型切换；新会话交接实验未执行，静态核对不冒充独立接续，input/token计量unknown。
