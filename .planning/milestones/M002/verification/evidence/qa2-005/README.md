# QA05 冻结证据

TRANSITION-M002-028；frontend-cr010 / backend-cr007。14稳定场景为13 PASS、V11 FAIL。CR010原缺陷通过待守门限定关闭；CR011为大小写搜索422。当前[报告](../../report.md)及[manifest](manifest.json)是结论入口，原始失败不覆盖。

## 环境与复现

仅一次性数据库，脚本含注册、运营配置、生成/收录/删除、模型卡激活、管理员重置测试账号密码和历史时间调整。**复制.mjs到新输出目录再运行，不得在冻结目录重跑。** 私有/tmp/wordweave-fe-m002-current指向env.json，不输出或提交。Node24、Playwright三引擎、Go1.26、PostgreSQL18。

1. 产品根执行 `python3 frontend/tests/integration/m002-local-stack.py start`，自有PG63541、API38081、metrics39081，仅允许模型loopback38082。
2. Node24复用frontend-cr010的production-server.mjs及final构建，HOST=127.0.0.1、PORT=3331、NUXT_BACKEND_INTERNAL_ORIGIN=http://127.0.0.1:38081。无额外前端构建。UI22原型4186保持供截图对照。
3. 依次运行 analytics.mjs → business.mjs → random-final.mjs → random-v2.mjs → inherited.mjs → search-repro.mjs，各脚本自启3301代理并finally关闭。不可同时运行。business/inherited各自启38082确定性provider并关闭，其他脚本不启动provider。
4. business V08保留最初错误表名，预期此项准备失败；random-final表名正确但DELETE缺JSON请求，预期中途400；random-v2才是有效V08补验。其余business通过结果保留，不重复计数。
5. inherited V11第一条大写查询422为真实FAIL，V12–14继续独立执行。search-repro为同账号再次核对小写分页、大/小写/空白/错误筛选cursor和真实页面，并在隔离库重置该测试账号密码以恢复诊断会话；不修改产品或原结果。
6. 停自有3331并执行local-stack.py stop；保持原3300/3330/38080/4186。所有脚本源与早期失败均保留。

固定2026-09-11T06:59:59Z/07:00:00Z和次日07:00:00Z用于洛杉矶本地日期边界，不依赖当前成长学习日。分析30天以实际learning_day回算；启动成长60天前及分析合成事件只为隔离样本，不作为迁移或生产启用验收。

## 有效结果选择

- V01–04：analytics-results.json；26组图表参数样本、三浏览器、双语言/7/30天/320–1440，完整API与几何、零/未知/观察状态。没有改聚合结果，等待真实维护任务产生数据。V04仅双面板axe，非整页读屏。
- V05–07/V09–10：business-results.json及business-details.json。3次生成+1次探针；两批同词复习1个唯一掌握、范围替换保护、双顺序模型卡B9天及计划覆盖。
- V08：random-v2-results.json。临时数据库snapshot两词learn/book使随机候选穷尽；保留旧目标/lexeme，finally恢复原snapshot，未改词表资产。3条实际generation_charges数、quota/extra/growth均不变；删当前库后已有掌握不排除候选。
- V11：inherited-results.json首次FAIL + search-repro-results.json最终重复FAIL。小写正常分页2批含暂停，大写/大小写混合422；真实UI出现输入错误，book仅标题不命中，统计不变。不是测试口径误判。
- V12–14：inherited-results.json/inherited-details.json；2次实际生成；后台只读列表/正文/拒绝写、账号语言跨登录保持、管理员密码确认/撤会话/新密可用。

业务/继承/图表runtime为空；search-repro只有真实422资源错误，无pageerror/hydration。5篇短文全部来自真实生成/保存链路的本地provider。总本地调用6，真实调用0；不当作LLM质量成功率。旧W01观察继续保留。

## 原件保护

inputs.json含前端277/后端285源码摘要，6296受保护原件及启动前端口。before-owned包含修改前5份QA入口及CR010原文；QA04的6份可变artifact可按此恢复，其余前轮证据和frontend-cr010170项冻结原件不变。manifest记录结束核对，不自哈希。文档、证据之外未改应用/上游/控制面，未提交、部署或委派。
