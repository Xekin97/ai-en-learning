---
milestone: M001
stage: verification
role: quality/base
agent_name: qa-quinn
status: awaiting_user_review
date: 2026-09-06
verification_round: TRANSITION-M001-072
verdict: fail_rework_required
functional_uat: not_reissued
release_readiness: blocked
---

# 第 072 轮 CR-029–034 独立复验

## 结论

独立复验执行结束，**FAIL，暂不重新交 UAT**。原 CR-031 中文重试、CR-032 弱文本色与 CR-034 空范围恢复/1080 断点均已在当前候选上通过独立检查；Users 全状态补查仍发现以下两组前端偏差，归入 [CR-030](../changes/CR-030.md)。不把通过断言总数当作全站逐像素通过。

| 残余 | 实际 / 批准 | 影响与路由 |
| --- | --- | --- |
| CR030-R072-01 / MEDIUM | 英文搜索失败说明为“Please try again shortly.”；原型为“Please try again in a moment.”；390/1440 均复现 | PAGE-103 / CAP-104/021。现有明确英文基线，frontend-claire 精确修订，不重开需求或设计 |
| CR030-R072-02 / MEDIUM | 720px 搜索输入为630×44，原型432×44；390/720px 搜索前状态卡片顶部为348.78125，原型380.78125（均为1000px高视口） | PAGE-103 / CAP-104/021。双语、字体 loaded、两帧稳定、scrollY=0、隐藏设计控制器后仍重现。检查搜索宽度覆盖和后台壳/内容高度分配；不得用随意32px补丁代替根因修复。如改共享后台壳，回归 Models/Plans |

第二项独立测量中，390px 输入均300×44，1280px 输入及卡位置相同；差异限定为实测状态/尺寸，不推断所有页面、数据量或视口均固定差32px。源证据：生产 application.css 的≤720px规则将 toolbar-search 的 max-width 设为 none；原型保留27rem。批准响应式说明只规定搜索表单纵排和主按钮全宽，没有为搜索输入另列宽度例外。卡片纵向差异随上方 admin-sidebar 高度一起出现，深层 CSS/DOM 根因留给实现阶段处理。

[文案原始证据](./evidence/cr029-cr034-072/CR030-R072-01.json) / [实际截图](./evidence/cr029-cr034-072/screenshots/CR030-R072-01-actual-1440.png) / [原型截图](./evidence/cr029-cr034-072/screenshots/CR030-R072-01-design-1440.png)；
[几何完整观测](./evidence/cr029-cr034-072/users-geometry-observations.json) / [稳定复现结果](./evidence/cr029-cr034-072/users-geometry-confirmation-results.json) / [720实际](./evidence/cr029-cr034-072/screenshots/users-geometry-actual-en-US-720.png) / [720原型](./evidence/cr029-cr034-072/screenshots/users-geometry-design-en-US-720.png)。

## 对象、隔离与独立性

- 授权为 [072实现交付批准](../reviews/implementation-cr029-cr034-independent-verification-approval.md)；verification / quality/base / qa-quinn 与注册表一致。没有启动其他角色、改 workflow 或关闭 CR。
- 前端固定 sha256:1326b841346634992f1d6a9228e909d39e987efc2f04e986d446a2573a0ff5e7；后端固定 sha256:e8c4ee91a7c3265cda8c496ccc8fb485328d95b6c1662eaf2502011ce5d005a5，API v1.4。不重建镜像，不重复开发 unit/lint/typecheck。
- 独立 tmpfs PostgreSQL、真实 Go API、Nuxt production 与 Nginx；仅127.0.0.1:6101，独立原型6110。供应商地址禁用、后端内部网络、凭证为0，不读取历史密钥，不执行真实生成。
- 两份合成夹具：45行用户分页+长短文；另有旧记录、真正空库、全部未参与、参与状态变化、密码重置账号。旧记录按上海2026-07-15的前一秒/当日开始/中间/结束/后一秒构造，期望3批次6词条；顺序与来源独立于生产 mapper。
- 新结果均在 [本轮目录](./evidence/cr029-cr034-072/PLAN.md)。历史065、开发068/071与本轮首次失败均保留，不覆盖失败来制造通过。

## 主要覆盖与结果

[逐项覆盖矩阵](./cr029-cr034-072-coverage.md)。

- 首页 Review、From/To 44px等宽、注销文案/颜色；5类访客原地引导、准确品牌/完整消息/颜色、无私有SSR或请求、入口统一与认证返回：本轮指定场景通过。
- Users 真正45行3页、exact优先、大小写/trim、cursor权限、结果追加失败后重试、不丢行、终页、详情再搜索、返回40行/焦点/滚动；账号方案、只读资料、密码重置204/旧密码拒绝/两个旧会话失效均通过。搜索失败英文说明和窄屏几何除外，不能标整页PASS。
- Reader 真实不同批次、短/压力长文、query/旧地址/前进后退/刷新、只滚正文、固定首尾、关闭焦点、迟到响应、500重试/404无重试、中文“重试”准确；双引擎与真实200%操作通过。
- 额度实际GET/PUT有限/0/不限/admin null；手工计费标记/窗口外/退款/他人/降额/重置；原生PUT200与实际提交后丢响应只做1 PUT+1 GET，未重放。6条手工运行记录不代表真实AI调用。
- CR-034：Chromium zh/en ×320/390/560/561/720/900/901/960/1024/1079/1080/1081/1280/1440，empty/invalid/failed；WebKit补901/1080/1081。同引擎实际与实时原型测量510项通过。另补ready/loading/resume和连续resize、语言、稳定input节点/焦点、失效范围无请求、最新响应、重试、真实创建、422再预览、未完成范围复用/单篇并存。
- 浏览器本地7天初值含UTC闰日、上海跨日和洛杉矶DST；3例都只发一次正确初始查询。服务端日期两端均含、暂停排除的精确计数通过。批次/词条随机顺序跨刷新固定；不以单次随机结果必须不同于排序为断言。
- 非回归：Models/Plans 指定标题/副标题、Add/Edit/Key样式和文案、停用模型状态与0方案引用；Library六统计标签和空态。两类成功复习总结、实际词形、重复短语全部挖空及同源颜色稳定；另外两原词条交错4空呈现2组颜色，跳过总结为1未成功/1跳过。
- Axe只宣称实际所测页面/状态的serious/critical为0；不是全站/人工读屏认证。真实200%经chrome.tabs.getZoom=2确认，CSS视口720×456、DPR4；使用browser-view截图，不用CSS缩放或DPR冒充。
- 20次本地Nginx+API+SQL顺序详情读取，p95=3.891ms；[样本](./evidence/cr029-cr034-072/local-performance.json)。不是并发压测或公网性能承诺。

## 原始结果与测试前提修正

不相加重复调试断言。P/F/E分别为PASS/FAIL/ERROR；结果文件与同名可重现脚本保留在本轮目录。

| 结果文件 | P/F/E | 解释 |
| --- | --- | --- |
| visual-results.json | 774/0/0 | 指定正常态、引导与reader对照，不覆盖后补的搜索错误/空态几何 |
| api-results.json | 58/0/0 | 实际HTTP/SQL |
| flows-complete-results.json | 26/1/1 | route.fetch转发安全头不完整，403发生在提交前；不是目标“提交后丢响应” |
| mutation-diagnostic / lost-response | 2/0/0；3/0/0 | 原生200；保留Origin/Sec-Fetch-Site后真实提交并丢响应，1PUT+1GET |
| regression-final-results.json | 146/0/0 | 已完成配置/Library部分；随后高频同账号登录触发真实429，reader段未执行，不能算整个进程成功 |
| users-supplemental-results.json | 180/4/0 | 2次英文同一文案缺陷；2次误用不存在的GET /me得到404，不是会话失效失败。reader双语/尺寸遗漏在此补测 |
| password-session-corrected-results.json | 7/0/0 | 正确GET /me/account：重置前两会话200，重置204后均401；保留旧404记录 |
| range-independent-results.json | 47/0/2 | 真实业务47通过；原型日期卡是div不是form，首次矩阵定位错误。生产与原型均未修改 |
| range-matrix-corrected-results.json | 510/0/0 | 用共同card语义定位，新文件完整重跑 |
| zoom-boundaries-results.json | 138/0/0 | 双引擎边界状态、真实双语200% |
| review-regression-results.json | 22/0/0 | 两种成功总结及普通登录不创建 |
| final-supplement-results.json | 29/4/0 | 性能/交错两组/跳过通过；模型比较错误地把停用夹具与启用原型相比，并复用原型语言缓存 |
| models-list-corrected-results.json | 7/0/0 | 同停用/0引用夹具、双语独立context并检查locale，精确通过 |
| versions-results.json | 8/1/1 | 新新/新旧/旧新/旧旧的SSR/客户端8项通过；常驻页导航未稳定时取样，不作产品失败定论 |
| version-resident-diagnostic-results.json | 3/0/0 | 等待目标路由后观察旧缓存；明确刷新与新context均恢复v1.4 |
| users-search-geometry-results.json | 8/4/0 | 双语390/720的几何偏差，其他采样宽度通过 |
| users-geometry-confirmation-results.json | 6/6/0 | 新干净隔离栈、加载字体/稳定布局/隐藏控制器后，720宽度2项与390/720位置4项仍失败，归为R072-02 |

最后一个几何复现实验只创建1个合成管理员，无真实学习数据。用准确完整测量保留残余，而不是以“没有横向溢出”代替与原型一致。

## 版本与边界

旧常驻管理员页在配套升级后仍可能展示旧缓存和契约错误；本轮可见旧Plus/Unlimited，刷新后变为新Plus/0及正确日期/文案。配套发布/回滚必须要求刷新或关闭旧标签；未新增自动版本探测，不能把刷新前旧数据算作新候选通过。

未测试真机软键盘/人工读屏/Firefox、全部统计生命周期、数据库微秒竞争和公网负载；未重跑AI 3×4×4生成矩阵、有效访客生成承接或真实账号删除。这些沿用历史功能边界，不伪装为本轮执行。真实供应商兼容性和概率性质量继续BLOCKED/NOT VERIFIED，见 [AI评估](./ai-evaluation.md)。

## 清理、交接与下一步

[主栈清理](./evidence/cr029-cr034-072/cleanup.json)：8容器/2网络，58合成账号、11批次、4会话、6手工计量、0凭证；
[几何复现栈清理](./evidence/cr029-cr034-072/geometry-cleanup.json)：4容器/2网络、1合成管理员。tmpfs内容不可恢复，seed/脚本/截图保留，可重建。6110本轮原型进程已停止，原6010保留。两次清理均验证1557份基线文件未改、6001容器ID/镜像/启动时间不变。

PROPOSED：将CR030-R072-01/02交给frontend-claire，在既有批准设计下有限返工；再由qa-quinn复测Users全状态、390/720/901/1280/1440及共享后台壳受影响页面，保留本轮CR-031/032/034通过证据。没有新的产品、设计或API选择需要用户决定。CR-029–034全部仍open，等待交付审阅/剩余项闭合，不自行迁移。按agt-verify-milestone提交 [交接](../handoffs/verification.md)，不更新6001、不邀请UAT。

