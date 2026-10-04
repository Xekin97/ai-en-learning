# CR008 前端开发复验

授权 TRANSITION-M002-023；UI22/H01、API204/206；当前生产差异仅 ItemDefinitions.vue 的两处选项过滤/标签。回归脚本在 frontend/tests/integration/m002-retired-card.mjs，必须从产品根运行。source.json 的 274 个文件与 frontend-source.tar.gz 可恢复当前源码。

## 本次结果

- unit.log：28 文件、299 项；typecheck.log、lint-final.log、format-final.log、boundaries.log、build.log 全通过。
- real-final/results.json：真实 Chromium + 生产 Nuxt + Go + PG18，7 项通过。包含实际页面 PUT 请求体及截图；没有记录 Cookie、密码、CSRF 或退款确认 token。
- 模型创建/正式下架、定义/兑换/退款均走真实 API；enabled 及已生效签到规则仅作为隔离库测试 fixture 通过 SQL 设置，未运行模型兼容性探针、未启动模型供应商。
- real-first 为未启用模型导致 fixture 兑换 422；real-second 的两项失败为测试说明为空及错误定位器不符。保留当次 script.mjs、日志、结果；最终脚本已修正。生产组件在三次运行之间未再改变。
- 窄屏原生多选框长文本受自身内部裁切/滚动限制；页面和对话框无横向溢出。此项只声明桌面/320px Chromium，不冒充跨引擎或真机结果。

## 复现（使用新目录，避免覆盖冻结证据）

要求 Node24、pnpm10、Go1.26.7、PG18，且 3331、3301、38081、39081、63541 空闲。先确认 /tmp/wordweave-fe-m002-current 没有其他正在使用的测试栈。所有数据库操作限定 m002-local-stack.py 创建的独立临时数据库，绝不替换为业务数据库。

从产品根执行：

```sh
export PATH=/Users/xekinzhuo/.npm/_npx/387698761821791d/node_modules/node/bin:$PATH
CR008_WORK=$(mktemp -d /tmp/wordweave-cr008-repro-XXXXXX)
cp .planning/milestones/M002/implementation/evidence/frontend-cr008/build.mjs "$CR008_WORK/build.mjs"
cp .planning/milestones/M002/implementation/evidence/frontend-cr008/production-server.mjs "$CR008_WORK/production-server.mjs"
(cd frontend && node "$CR008_WORK/build.mjs")
python3 frontend/tests/integration/m002-local-stack.py
PORT=3331 HOST=127.0.0.1 NUXT_BACKEND_INTERNAL_ORIGIN=http://127.0.0.1:38081 node "$CR008_WORK/production-server.mjs" > "$CR008_WORK/server.log" 2>&1 &
CR008_SERVER_PID=$!
node frontend/tests/integration/m002-retired-card.mjs "$CR008_WORK/real"
kill "$CR008_SERVER_PID"
python3 frontend/tests/integration/m002-local-stack.py stop
```

脚本要求全新数据库（避免旧 fixture 同名/额外可选模型），输出目录必须不存在。若执行中断仍须按最后两步清理自己的服务，不停止原预览。私有 env.json 只保留在隔离临时目录，不复制进仓库。

开发静态检查在 frontend 执行 pnpm test / typecheck / lint / lint:boundaries / format:check。源码唯一变更是组件和新增集成测试；开发自检不关闭 CR008，下一接收为独立 QA 同时复验 CR007/008。
