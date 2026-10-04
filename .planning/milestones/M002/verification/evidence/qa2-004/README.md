# QA04 冻结证据

授权TRANSITION-M002-026，独立验证frontend-cr009 / backend-cr007。14个有效场景通过，T15为CR010响应式失败；CR009原条件通过待守门限定关闭。当前结论见[报告](../../report.md)、[manifest](manifest.json)。

## 环境与复跑

脚本创建测试账号、修改配置、正式下架模型、兑换/退款/补签及调整历史事实；只能运行于新的隔离数据库。**先把`.mjs`复制到新的输出目录，不能在这里直接重跑**。私有`/tmp/wordweave-fe-m002-current`所指env.json包含凭据，不输出或提交。

1. 从产品根运行`python3 frontend/tests/integration/m002-local-stack.py start`。隔离PG63541、API38081、metrics39081，模型请求仅可到loopback38082；本轮不启动provider。
2. 复用当前交付的`implementation/evidence/frontend-cr009/build-location.json`及production-server.mjs，用Node24在3331运行，NUXT_BACKEND_INTERNAL_ORIGIN指向38081。旧3300为契约mock，不作为本轮后端。
3. 复制目录依次运行`cards.mjs`→`makeup.mjs`→`analytics.mjs`。各自启3301代理并在finally清理。cards初始化成长及模型；makeup增加跨月历史签到；analytics通过真实事件API建立样本、设置合成历史run，等待实际每分钟聚合。它保留首次错误断言，预期T11/T14失败，不改写冻结脚本掩盖该结果。
4. 在相同隔离事实基础运行`analytics-counts.mjs`与`analytics-ui-v4.mjs`，分别取得当前T11/T14补验证据。`analytics-layout.mjs`最后验证7/30天、1280/390/320px，当前实现应记录T15 FAIL。
5. 停止3331自有进程，执行local-stack.py stop。保留原3300/3330/38080/4186，不停止其他预览。

历史夹具受运行日期约束：makeup以当前月份前月最后一天作补日，运行日须距该日≤30且之后至少有两个历史日。若其他日期复跑，在复制脚本中选择符合相同已批准窗口的历史跨月夹具，不能将准备失败归产品。

## 有效结果与原始失败

- T01–07：cards-results.json / cards-details.json；模型数44，冲突时新增第45个；无真实模型探针/生成。
- T08–10：makeup-results.json / makeup-details.json；旧规则8+2，新月20+3，今天50+10；手算补差10+6+6=22。
- T11：analytics-counts-results.json。首次analytics误认为无来源的新会话沿用前日UTM；按契约每会话入口应为UTM2、referrer1、direct2。PV/UV/跳出事实未改。
- T12/13：原analytics-results.json中的两项PASS，实际维护聚合、隐私/权限测试。
- T14：analytics-ui-final-results.json。初次使用夹具两日PV5对比实际页面七日PV8，漏算之前QA访问；随后50%与显示50.0%的格式假设错误。v2/v3用getByLabel精确匹配嵌套label失败，v2还有未处理的等待超时；可访问树的combobox名确为Period，v4真实选中30成功。截图与3接口200保留。v3/v4写同一before-period诊断文件，当前该辅助文件为v4最后快照；各失败脚本、日志、结果及v3失败截图保留，不将辅助文件冒充v3原件。
- T15：analytics-layout-results.json，一项FAIL，六个尺寸/周期样本不当作六项独立测试。
- cards-preparation.mjs/log/results为最初测试准备表名错误，尚未执行场景；重建隔离库后cards通过。准备失败不计功能缺陷。

makeup、analytics及最终UI的运行事件为空；cards仅捕获故意构造的409/503资源错误，没有pageerror/hydration。W01旧观察保留。本轮没有人工读屏、跨引擎、真实软键盘、生产代理或90天物理清理通过声明。

## 保护

inputs.json存受保护文件摘要、源码匹配和启动前端口；before-owned归档修改前6份QA自有文档。QA03 manifest中可变原文可由该包恢复，其他前轮原件不改。当前权威报告只指QA04，不覆盖原始失败。manifest不自哈希；应用、控制面、开发证据与上游产物均只读。真实与本地AI调用0，无提交或部署。
