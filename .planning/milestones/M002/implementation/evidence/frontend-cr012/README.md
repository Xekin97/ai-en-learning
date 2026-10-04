# CR012 书架位置恢复

授权 TRANSITION-M002-032；frontend-claire；UI22/H01、FE02、CAP012–014、PAGE005/006、UIA-PAGE-005-LIBRARY18。生产应用仅改 library/index.vue，新增 m002-library-return.mjs 回归脚本。当前为 implemented_pending_qa，正式 CR012 未关闭。

## 原因与修复

Nuxt 4.5.2 的 pages/runtime/router.options.js 在 page:loading:end 后安排默认滚动；旧书架 mounted 的位置恢复先发生，随后页面内返回被拉到 0。原 CR010 构建在 before-browser-v3 可重复得到 3115→0；历史后退为3115→3115，查询/21行/焦点均在。

书架进入中间件提前固定本次 scrollToTop 决策。只有从记录的详情且相同查询返回时由书架恢复位置；其他入口清除过期恢复标记并保留默认滚动。目标行取导航 batchId，避免依赖浏览器是否自动聚焦被点击链接；组件卸载取消已安排的恢复帧。保持已有内存状态，无新增持久化、样式、文案、API 或依赖。

## 当前证据

- combined-results.json：27 项有通过证据。browser 为25通过/2测试同步失败，controls补验2通过；生产代码和构建未变，不改写原失败为通过。
- browser/details.json：中英320/390/768/1440 × 页面返回/历史后退16项；Firefox/WebKit中英代表视口4项；键盘含空格查询1项。逐项记录前后滚动/焦点/可见位置/宽度/行数。
- browser/results.json另含标题编辑返回、无结果清空、非详情菜单进入/直达详情返回、空库；controls/results.json含删除原行回退及Axe/运行时。两轮运行时列表均空。
- prototype-320/1440 在browser中，为实际打开UI22原型；生产对应截图保留在同目录。长标题、3个目标词、原有行结构/操作均保留，四宽度无整页横向溢出。本次未宣称全UIA/真机/读屏/完整性能通过。
- typecheck-final、lint-final、format-check-final、lint-boundaries-final、test-final通过；29单元文件309项；边界242模块271依赖。最终测试脚本仅补导航等待/选择性补验，再通过test-script-lint/format。
- build-v2.log为当前隔离生产构建（5.25MB/gzip1.23MB，不等于页面下载量）。build-location.json定位输出；初始build仅编译记录，不作为当前浏览器证据。
- source.json / frontend-source.tar.gz / source-diff.patch / manifest.json固定当前源码、应用增量、命令与保护校验。新增测试脚本完整内容在源码归档。

## 复现

从产品根运行；Node24、pnpm10、Go1.26.7、PostgreSQL18与已安装Playwright三引擎。3301/3331/38081/38082/39081/63541须空闲。原型使用已有4186服务，根目录为M002/design。测试只连接一次性数据库、本地确定性模型提供方，无外部AI调用。

```sh
export PATH=/Users/xekinzhuo/.npm/_npx/387698761821791d/node_modules/node/bin:$PATH
CR012_WORK=$(mktemp -d /tmp/wordweave-cr012-repro-XXXXXX)
cp .planning/milestones/M002/implementation/evidence/frontend-cr012/build.mjs "$CR012_WORK/build.mjs"
cp .planning/milestones/M002/implementation/evidence/frontend-cr012/production-server.mjs "$CR012_WORK/production-server.mjs"
(cd frontend && node "$CR012_WORK/build.mjs")
python3 frontend/tests/integration/m002-local-stack.py
PORT=3331 HOST=127.0.0.1 NUXT_BACKEND_INTERNAL_ORIGIN=http://127.0.0.1:38081 node "$CR012_WORK/production-server.mjs" > "$CR012_WORK/server.log" 2>&1 &
CR012_SERVER_PID=$!
node frontend/tests/integration/m002-library-return.mjs "$CR012_WORK/browser"
kill "$CR012_SERVER_PID"
python3 frontend/tests/integration/m002-local-stack.py stop
```

脚本自建/关闭3301代理和38082本地模型服务。新库通过真实生成/保存API建立21篇三词短文及长标题；会删除其中最后一篇，故完整复验应使用新库。私有env.json含临时凭据，不能复制进证据包。可选第3参数before仅运行旧构建的页面返回/历史后退；第4参数复用同一未销毁数据库的fixture.json。CR012_CASES逗号分隔ID用于指定补验；不得借此忽略失败。

## 原始失败与边界

before-browser、before-browser-v2为测试准备失败：最初缩短了固定兼容探针文本，随后发现learn提示必须完整包含重复的learning片段；恢复现有探针协议后v3才生成成功。不涉及产品修复；两次失败均保留。共24次本地提供方调用（2次失败准备、1次成功探针、21次生成），外部调用0。

browser原两项失败来自删除步骤点击后未等待详情挂载，导致还在21个删除按钮的列表中定位；随后的Axe已在详情，书架区域不存在。controls仅增加URL/详情可见等待，删除回退与Axe0违规通过；未增加产品延时或放宽期望。初次运行脚本冻结于browser/regression-script.mjs。

6518个既有非本轮文件校验无变动；QA06、CR、backend-cr013、上游和控制面原件保留。旧本角色文档/原页面在before-owned.tar.gz。本轮自建服务已停止，原3300/3330/38080/4186预览保留；无提交/部署/代理委派/换模。独立QA未执行，新会话接收实验未执行，输入/token unknown。

