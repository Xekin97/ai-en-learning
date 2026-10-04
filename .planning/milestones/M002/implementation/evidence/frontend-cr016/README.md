# CR016 前端修复与复现

授权 TRANSITION-M002-037；frontend-claire；AC220/UIA-PAGE-006-03/API007；输入 QA12 F12/F13、UI22/H01、FE02。仅一生产页及新增组件行为测试，源码/差异/摘要见 source.json、source-diff.patch、frontend-source.tar.gz 和 manifest.json。before-owned.tar.gz 保留三份前端原稿与详情页；QA12、CR016原件和控制面不改。

## 行为与版本

详情页用局部 input ref。保存前捕获 session epoch，返回后先确认身份未变且批次存在，再接收成功或失败。失败保留用户输入并采用最新 revision；解除 disabled 后 await nextTick 再回焦。epoch改变或详情消失后不读 titleRevision，不提示成功，也不强夺焦点。未改变文案、CSS、API、持久化或判分。

原型标题失败状态已实际打开，prototype-check.json / prototype-title-failure.png 记录；读取 learning.js titleRegion/saveTitle、theme.css 1896–1912、copy.json。实现输入/提示/错误/按钮顺序和焦点环按原样保留，手机390与桌面1440无横向溢出。代表截图已人工查看；未将不同fixture正文长度当设计差异。

## 命令与有效结果

在产品根目录运行，Node24路径固定于脚本。

- `PATH=/Users/xekinzhuo/.npm/_npx/387698761821791d/node_modules/node/bin:$PATH pnpm --dir frontend exec vitest run tests/unit/library-title-editor.test.ts`：原代码7项中5失败2通过；修复后7项全过，见unit-red.log/unit-green.log。原red外层命令返回tail状态0，真实Vitest失败以日志为准。
- `python3 .planning/milestones/M002/implementation/evidence/frontend-cr016/checks.py`：类型、ESLint、格式、依赖边界通过；全量31文件324项单元通过，见checks.json。
- frontend目录运行 `node ../.planning/milestones/M002/implementation/evidence/frontend-cr016/build.mjs`：隔离生产构建通过，build-location.json记录目录，build.log保留原始输出；5.25MB/gzip1.23MB是服务端总量。
- `python3 .planning/milestones/M002/implementation/evidence/frontend-cr016/browser-v2/run.py`：16项通过。Chromium英文1440/中文390、Firefox英文1440、WebKit中文390；每组包括取消/空白/契约503与显式重试、真实409、删除时404、会话失效401。真实Go/PostgreSQL18、生产Nuxt、本机同源代理；截图、runtime、响应状态和数据库核对记录在browser-v2/results.json。

浏览器不只监听pageerror，也检查console.error/warning。只允许当前用例、当前批次URL、明确预期HTTP状态对应的浏览器资源加载错误，其他错误全部失败。503为完整Problem对象并带 `application/problem+json`，还断言界面显示service_unavailable，避免只验证协议错误。409通过真实API在另一个客户端改revision；身份失效通过隔离数据库删除账号session。

本地运行数据沿QA12隔离临时数据库，input.json与stack-location.txt只定位测试库，env.json中的私有凭据不进入产物。脚本先核对loopback/数据库名，测试后停止自建Go/Nuxt/PG/代理/替身。复现需要该临时数据目录及对应隔离构建仍存在；source archive可重建前端，QA12 runner可重新准备数据库，但需更新input的fixture ID，不能把旧ID当通用fixture。没有生产服务或真实AI调用。

## 失败与追加观察

首轮browser保留15 PASS/1 FAIL；其中503虽然Problem正文完整，但Content-Type为application/json，被规范化为contract_violation，不能作为普通服务故障通过证据。v2仅修正夹具头并增加service_unavailable断言，生产代码/构建未变。四组每轮各创建并删除一篇测试短文，累计8次本地替身、真实AI0；其他对照0次调用。

首轮WebKit中文用例开始时，账号实际保存语言仍为英文；自动切换到中文前遇到英文日期SSR水合不一致。v2在用例前经正式API设置目标语言，保证中文用例从中文SSR开始；未过滤hydration，也未宣称WebKit英文通过。两轮对照分别见webkit-diagnostic和webkit-baseline-control。

**FE2-R16-W1（未解决，交QA确认路由）**：同一日期，服务端输出 `Sep 28, 2026, 2:46 PM`，本机WebKit输出 `Sep 28, 2026 at 2:46 PM`，产生 `Hydration completed but contains mismatches.`。MutationObserver定位到详情页 `p.eyebrow`；当前构建与修改前frontend-cr014-015构建均可复现，账号中文时两者均无差异。代码来源是共享 use-display-formatters.ts 的 Intl.DateTimeFormat dateStyle/timeStyle，未纳入本次限定CR016修复。没有证据将其直接等同历史W01（个人页未定位观察），二者保留独立追踪。

webkit-baseline-control第一次启动被预检查端口占用阻止（未进入测试）；再次检查各端口可绑定后成功执行。原工具返回保留在会话，launcher.log是实际成功执行日志，不伪装首次成功。

## 验收边界

这是开发自检：CR016正式仍open，独立QA12整体FAIL与UAT未执行不变。CR001/002、CR039-L1、CR042-L1、AI-QUALITY-90、历史W01及完整矩阵待验项保留。无真机/读屏/生产代理/04:00跨日/完整UIA或新AI质量评估。未委派、提交、部署或改工作流阶段。FE2-R16-W1由独立QA确认后按交接门路由，不在本轮改共享日期格式或覆盖其原失败记录。
