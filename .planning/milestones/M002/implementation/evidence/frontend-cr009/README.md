# CR009 前端修复与复现

授权 TRANSITION-M002-025；范围为 CAP217/AC217、API101/206、UI22 PAGE-210。源码变更仅 admin.ts、ItemDefinitions.vue 与两份回归测试；276 文件冻结于 source.json / frontend-source.tar.gz，增量见 source-diff.patch。无后端/API/设计文案或依赖修改。

## 运行条件与复现

Node24、pnpm10、Go1.26.7、PostgreSQL18；所有测试限定一次性 m002-local-stack 数据库，模型启用仅通过隔离 SQL fixture，0 真实 AI 调用。3331、3301、38081、39081、63541 必须空闲，不能指向生产数据库。env.json 含私有运行凭据，不打印、不复制到仓库。

从产品根执行，使用新的证据目录，不能覆盖本目录：

```sh
export PATH=/Users/xekinzhuo/.npm/_npx/387698761821791d/node_modules/node/bin:$PATH
CR009_WORK=$(mktemp -d /tmp/wordweave-cr009-repro-XXXXXX)
cp .planning/milestones/M002/implementation/evidence/frontend-cr009/build.mjs "$CR009_WORK/build.mjs"
cp .planning/milestones/M002/implementation/evidence/frontend-cr009/production-server.mjs "$CR009_WORK/production-server.mjs"
(cd frontend && node "$CR009_WORK/build.mjs")
python3 frontend/tests/integration/m002-local-stack.py
PORT=3331 HOST=127.0.0.1 NUXT_BACKEND_INTERNAL_ORIGIN=http://127.0.0.1:38081 node "$CR009_WORK/production-server.mjs" > "$CR009_WORK/server.log" 2>&1 &
CR009_SERVER_PID=$!
node frontend/tests/integration/m002-retired-card.mjs "$CR009_WORK/retired"
node frontend/tests/integration/m002-paginated-card.mjs "$CR009_WORK/pagination"
kill "$CR009_SERVER_PID"
python3 frontend/tests/integration/m002-local-stack.py stop
```

两份脚本各自创建 3301 代理并在 finally 清理；按上列顺序执行，原 CR008 脚本需要全新模型目录。分页脚本以 50 余个模型构建跨三页目录，检查后页引用自动补齐、真实 Meta+鼠标增选、明确删除、新卡限制、320px 网络失败保留草稿/重试及 409 后新增后页引用。脚本实际调用配置 API 并正式下架合成模型；不可在业务库运行。异常退出后也须清理自己启动的服务，保留原预览。

单元/类型/代码/边界/格式分别在 frontend 执行 pnpm test / typecheck / lint / lint:boundaries / format:check。构建使用独立目录，不覆盖现有预览。源码检查与完整 UIA、独立 QA 分开。

## 原始失败与最终证据

- pagination-first/results.json：初版 4 过/1 败，冲突新引用未补齐；保留最初构建路径 build-first-location.json。
- pagination-final/results.json：第二版仍 4 过/1 败，只覆盖 422 的游标重读不足；构建路径 build-second-location.json。
- conflict-diagnostic 为诊断 fixture 的空说明 422，源码保留；conflict-diagnostic-v2/debug.json 记录真实目录 GET 返回 409 revision_conflict，明确最终修复依据。当前 admin.ts 同时处理真实 409 与契约 422 cursor invalid，只对目录读取从首屏重来一次，不自动重放保存。
- 最新结论仅使用 unit-verified / typecheck-verified / lint-verified / format-verified / build-verified 和 retired-verified、pagination-verified；早期通过记录不扩大为最终版本通过。boundaries.log 在本轮导入/依赖图未变化后复用。
- 原型在 4186/prototype/?page=operations&lang=zh 打开模型卡编辑，读取 app.js/itemForm 与 copy.json 后检查；目录根地址及错误页签定位的准备尝试不计验证通过。1440/320px 实际截图仅证明本次控件与失败状态，非全页面视觉验收。

旧角色文档/两份应用文件在 before-owned.tar.gz；批准设计/API、后端、QA/CR、控制面和旧证据保持原件。用户阶段仍 implementation / frontend-claire，独立 QA 与守门关闭未执行。新会话交接测试未执行，运行输入/token 计量 unknown。
