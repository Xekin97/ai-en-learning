# CR010 分析图表响应式修复

授权 TRANSITION-M002-027；CAP219 / PAGE213 / API209 / UI22-H01。本轮应用变更只在 analytics.vue 的图表/指标卡作用域样式、稠密序列 class 及同页最近更新时间的 NuxtTime 渲染；另增 m002-analytics-layout.mjs。全部日点和原明细表保留，日期轴按空间显示部分刻度，数值、查询范围和状态文案不改。

## 复现

使用 Node24、pnpm10、Go1.26.7、PostgreSQL18 和已安装的 Playwright Chromium/Firefox/WebKit。3331、3301、38081、39081、63541 必须空闲；使用全新一次性数据库。测试向该库写入历史流量事件及一个当日注册者，等待真实 Go 聚合，再经真实 API 和生产前端核对数据。没有模型提供方调用。

原型核对需要在 4186 提供 `.planning/milestones/M002/design`，URL 为 `/prototype/?page=metrics&lang=en`。现有服务已在运行时保留它，不再占用端口。以下从产品根执行，输出目录必须新建；失败也应清理自己启动的进程。

```sh
export PATH=/Users/xekinzhuo/.npm/_npx/387698761821791d/node_modules/node/bin:$PATH
CR010_WORK=$(mktemp -d /tmp/wordweave-cr010-repro-XXXXXX)
cp .planning/milestones/M002/implementation/evidence/frontend-cr010/build.mjs "$CR010_WORK/build.mjs"
cp .planning/milestones/M002/implementation/evidence/frontend-cr010/production-server.mjs "$CR010_WORK/production-server.mjs"
(cd frontend && node "$CR010_WORK/build.mjs")
python3 frontend/tests/integration/m002-local-stack.py
PORT=3331 HOST=127.0.0.1 NUXT_BACKEND_INTERNAL_ORIGIN=http://127.0.0.1:38081 node "$CR010_WORK/production-server.mjs" > "$CR010_WORK/server.log" 2>&1 &
CR010_SERVER_PID=$!
node frontend/tests/integration/m002-analytics-layout.mjs "$CR010_WORK/browser"
kill "$CR010_SERVER_PID"
python3 frontend/tests/integration/m002-local-stack.py stop
```

脚本自行启动/关闭 3301 同源代理。私有 env.json 包含临时凭据，不能输出或复制进证据包。生产构建写入独立临时目录，不覆盖原预览。测试布局、状态与真实 API 逐日一致性，不能替代独立 QA、真机或完整 UIA 验收。

在 frontend 目录运行 `pnpm typecheck`、`pnpm lint`、`pnpm format:check`；`pnpm test` / `pnpm lint:boundaries` 在本轮已执行，最终变更不改变这些单测覆盖的业务逻辑，新增模板组件导入后已重跑依赖边界。最终静态/构建日志以 v4 为准，浏览器以 browser-v4 为准。

## 保留的诊断记录

- before-browser：原 CR009 生产构建在 320px / 30 天测得文档宽 770px，原失败保留。
- browser：首版已消除图表撑宽，但英文 Unknown 指标卡使文档宽 421px，部分日期重叠；原截图、几何、脚本与应用版本分别在 browser、attempt-1-regression.mjs、attempt-1-analytics.vue、attempt-1-build-location.json。随后补齐本页面指标卡轨道/字号适配和刻度间距。
- 首次种子 SQL 使用不指定仲裁目标的 ON CONFLICT，命中可延迟唯一约束，准备失败；现改为明确的 level_no。未修改后端数据约束。
- browser-v2：重启前端时遗漏 NUXT_BACKEND_INTERNAL_ORIGIN，未进入分析页，属于本地启动配置错误；补齐参数后使用同一构建验证，不改产品代码或测试期望。
- browser-verified：25 项通过，运行时检查发现一次 WebKit hydration 告警，原结果完整保留；后续脚本在导航和切换语言时等待网络空闲，不忽略或过滤此类告警。截图人工核对另发现日期文字被相邻柱条覆盖，最终给刻度文字增加层级；attempt-2 源码和构建位置保留。
- browser-final：等待网络空闲后仍为 25 过 / 1 败，不能把上一条告警归因于测试时序。诊断构建开启 Vue 详细告警，hydration-diagnostic.log 确认同一时间被服务端格式化为 `Sep 21, 2026, 4:55 PM`，WebKit 为 `Sep 21, 2026 at 4:55 PM`。最终使用现有 NuxtTime 的预水合格式化机制，I18nT 继续消费原 `m002.updated` 文案，locale 变化重新建立时间组件；不屏蔽错误、不改共用日期工具或产品文案。
- 初版 build/typecheck/lint/format 日志不充当最终样式的验证。旧 build-location 保留；当前源码、构建及结果由 manifest 定位。

旧角色文档与 analytics.vue 可从 before-owned.tar.gz 恢复；既有 QA04、CR010、后端、设计/契约、控制面和旧 evidence 保持原件。当前正式角色仍 frontend-claire，CR010 独立复验待办；守门未转阶段、未关闭该问题。

## 最终结果

浏览器 v4 的 26 项全过；真实 API 对照与明细表保留全部日期，四个宽度文档无横向溢出。time-copy/result.json 额外核对 WebKit 中英文模板及北京时间。SSR 格式修复、最终标签层级与最终样式共同位于 v4 构建；最终类型/lint/格式/构建/边界通过。原单元 29 文件 / 309 项通过，不因仅模板/样式调整重复业务单元。

独立 QA 未执行，正式 CR010 仍 OPEN；没有提交、部署或阶段变更。清理本轮专用服务，保留 3300/3330/38080/4186 原预览。
