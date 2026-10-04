# QA07 修复复验与书架补验

当前生产版本：frontend-cr012 / backend-cr013。授权TRANSITION-M002-033；真实生产Nuxt/Go/PG，未重跑开发检查。当前19个稳定场景16PASS/3FAIL，旧CR012/013原缺陷通过，新CR014/015待前端修复。详情见QA当前报告和两个新问题单；不能因为命令退出1就抹掉同轮已通过的原修复。

## 证据与版本

- inputs.json：278/288源码版本摘要；protected-before.json：6603个受保护文件；before-owned.tar.gz和previous-*：七份原QA/CR可恢复原件。
- library.mjs / library-results.json / library.log：23次真实生成收录建立21篇本人库、他人隔离样本与删除项；J01–09共6PASS/3FAIL。中英四宽度页面返回/历史后退、改标题/语言、静态结构/axe通过；J05/J06焦点、J07参与统计失败。
- generation.mjs / generation-results.json / generation.log：G01–10全通过；沿QA06原实际生成路径复验四终态409，并补404/保存幂等/草稿410/过期原卡退款。共10本地provider调用。
- independent-repro-v2.mjs/json/log：另两个全新浏览器上下文确认搜索/加载/参与焦点以及统计失同步，实际PATCH/API/页面/刷新数据记录完整。此重复不增加场景计数。
- independent-repro.mjs/log及未加v2前缀的图片：第一次辅助重复在页面reload后才读Playwright响应body，导致响应已不可用；没有生成完整结果。v2只前移读取，另存输出，原失败保留。主J05/J06/J07并未因该测试故障而改变。
- prototype-library-*及J01/J02截图：UI22原型与生产代表视口。表面数据不同，不按夹具数值做逐像素比对。library-axe是局部WCAG2A/AA/2.1AA，运行时列表为空，不代表真机/人工读屏或全部UIA。
- coverage.json：保持49能力/25页面/28视图/119UIA；matrix与报告当前结论一致。

模型只监听127.0.0.1:38082；library24（探针1+生成23）+generation10=34调用，真实0。所有token/临时密码仅内存/私有临时env使用，不进入输出。G09/G10的到期只回拨一次性DB时间，未声称真实跨30分钟或04:00运行；中断直连独立Go API，不代表Nginx生产代理。

## 复现入口

从产品根运行，Node24/Go1.26.7/PG18及已安装Playwright Chromium。3301/3331/38081/38082/39081/63541需空闲，4186提供批准design目录的prototype。必须先复制脚本到新目录，避免覆盖这份冻结证据。当前生产前端输出可由frontend-cr012/build-location.json定位；源匹配时可复用。以下前端服务仍引用这份输出，不重新编译前端。

```sh
export PATH=/Users/xekinzhuo/.npm/_npx/387698761821791d/node_modules/node/bin:$PATH
QA07_WORK=$(mktemp -d /tmp/wordweave-qa07-repro-XXXXXX)
cp .planning/milestones/M002/verification/evidence/qa2-007/harness.mjs "$QA07_WORK/harness.mjs"
cp .planning/milestones/M002/verification/evidence/qa2-007/library.mjs "$QA07_WORK/library.mjs"
cp .planning/milestones/M002/verification/evidence/qa2-007/generation.mjs "$QA07_WORK/generation.mjs"
cp .planning/milestones/M002/verification/evidence/qa2-007/independent-repro-v2.mjs "$QA07_WORK/independent-repro-v2.mjs"
python3 frontend/tests/integration/m002-local-stack.py
PORT=3331 HOST=127.0.0.1 NUXT_BACKEND_INTERNAL_ORIGIN=http://127.0.0.1:38081 node .planning/milestones/M002/implementation/evidence/frontend-cr012/production-server.mjs > "$QA07_WORK/frontend.log" 2>&1 &
QA07_FRONTEND_PID=$!
node "$QA07_WORK/library.mjs"
node "$QA07_WORK/generation.mjs"
node "$QA07_WORK/independent-repro-v2.mjs"
kill "$QA07_FRONTEND_PID"
python3 frontend/tests/integration/m002-local-stack.py stop
```

每个脚本分别启动/关闭3301代理，library/generation分别管理38082；必须按顺序执行，generation读取library建立的fixture。当前library与independent-repro-v2会因已记录缺陷退出1，仍需执行余下步骤及清理。现有测试完成后专用服务已停，原四个预览服务保持。失败时清理自己创建的进程，不动原预览，不导出私有env.json。

没有实施修复、阶段迁移、提交、部署或新增真实AI授权。新会话交接实验未执行，input/token unknown。
