# CR014/015 前端返工证据

授权TRANSITION-M002-034；frontend-claire，UI22/H01、FE02、API007。修复书架搜索/清除、加载更多、参与开关完成后的焦点，并在参与成功后读取权威全库六统计。列表查询/游标与详情返回恢复保持。仅三个生产文件，无CSS/文案/API/依赖变化。

## 结果与限制

- unit-red.log：原实现8项失败；unit-green.log：同一组期望8项通过。30单元文件317项全部通过（test.log）。
- checks.json：类型、lint、格式、依赖边界及全单元通过。后续浏览器脚本修正单列browser-lint-final/browser-format-final。
- build.log：隔离生产构建通过，5.25MB/gzip1.23MB（服务端构建总量，不等于页面下载量），位置见build-location.json。
- browser-v2/results.json：21项PASS，含中英四宽度、Firefox/WebKit代表视口，成功/失败/重试、详情共享开关、三引擎详情返回及Chromium历史后退。details记录统计前后和焦点。无pageerror/hydration；三条net::ERR_FAILED均为对应测试主动注入的网络失败。
- browser-v2/axe.json：书架区域WCAG2A/AA/2.1AA违规0，不代表全站读屏通过。
- visual-check.json与visual-production/visual-prototype：实际打开并等待动效稳定的中英320/1440对照；结构/准确标签顺序与原型一致，真实21篇/3词数据不应等同原型夹具数值。长标题及焦点目标可见性另见矩阵截图。

统计只接受较新请求和当前身份的响应；同一序号保护现有列表/删除统计读取，防止较早读取覆盖操作后的结果。PATCH失败不改已确认状态；PATCH成功但统计读取失败，保留已确认的参与值并使用现有失败提示，后续请求可恢复。没有新建焦点框架或手算统计。

## 复现

Node24、pnpm10、Go1.26.7、PostgreSQL18、已安装Playwright。先确认3301/3331/38081/38082/39081/63541空闲，原型4186指向M002/design。只使用一次性数据库和loopback模型替身。

```sh
export PATH=/Users/xekinzhuo/.npm/_npx/387698761821791d/node_modules/node/bin:$PATH
CR14_WORK=$(mktemp -d /tmp/wordweave-cr14-repro-XXXXXX)
cp .planning/milestones/M002/implementation/evidence/frontend-cr014-015/build.mjs "$CR14_WORK/build.mjs"
cp .planning/milestones/M002/implementation/evidence/frontend-cr014-015/production-server.mjs "$CR14_WORK/production-server.mjs"
(cd frontend && node "$CR14_WORK/build.mjs")
python3 frontend/tests/integration/m002-local-stack.py
PORT=3331 HOST=127.0.0.1 NUXT_BACKEND_INTERNAL_ORIGIN=http://127.0.0.1:38081 node "$CR14_WORK/production-server.mjs" > "$CR14_WORK/server.log" 2>&1 &
CR14_SERVER_PID=$!
python3 -m http.server 4186 --bind 127.0.0.1 --directory .planning/milestones/M002/design > "$CR14_WORK/prototype.log" 2>&1 &
CR14_PROTO_PID=$!
node frontend/tests/integration/m002-library-interactions.mjs "$CR14_WORK/browser"
kill "$CR14_SERVER_PID" "$CR14_PROTO_PID"
python3 frontend/tests/integration/m002-local-stack.py stop
```

仅在4186空闲时自建原型服务；已有服务可直接复用，不停止他人进程。测试代理自建/关闭3301，提供方自建/关闭38082。可选第三参数复用同一测试库的fixture.json；无该参数新建21篇。CR014_CASES可选择已知场景补验，不用来隐藏失败。私有env仅留临时目录，不能复制进证据。

## 原始失败与保护

browser首次脚本使用Playwright setChecked，而组件按批准设计先回到已确认值、等待API再更新；setChecked即时检查失败。首条变更其实已持久成功，使后续同值操作未触发请求；中断该轮避免重复相同脚本错误。原脚本/四条失败结果/日志/截图全部保留。v2改为普通点击→等待PATCH/控件重新可用→断言状态和焦点；重用夹具前显式恢复初始参与值。产品代码和构建未因测试失败改变。unit-red命令外层首次使用zsh保留变量status导致退出包装失败，测试自身完整8 FAIL日志保留；后续改用cr_task_exit。

准备调用22次本地provider（1兼容探针+21生成），v2及视觉读取0，真实AI0。本次启动前全部预览端口均关闭；结束仅停止本轮生产前端/Go/PG/原型。无提交/部署/委派/换模/阶段迁移。

before-owned.tar.gz保留原3生产文件及3前端文档，QA07/CR/上游/后端/控制面/旧证据受保护；source.json和frontend-source.tar.gz固定当前280源文件，source-diff.patch仅列本轮增量。manifest保留保护核对和证据摘要。CR014/015待独立QA，其他矩阵待验项仍从当前报告可达。
