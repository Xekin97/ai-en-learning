# CR-005 开发复现

角色 frontend-claire；授权 TRANSITION-M002-020；UI22/H01、FE-02 §6.2。当前修复仅开发自检通过，正式 CR/QA 状态不变。来源与测试范围见 source.json、manifest.json 及 ../../frontend-validation.md#cr005。

从产品 frontend 目录运行，Node 24.21.0 / pnpm 10.33.0，已安装项目锁定依赖及 Playwright 浏览器。以下构建和进程均为本地合成契约环境；不使用生产库、账号或真实模型。

```sh
pnpm test
pnpm typecheck
pnpm lint
pnpm lint:boundaries
pnpm format:check
node ../.planning/milestones/M002/implementation/evidence/frontend-cr005/build.mjs
```

build.mjs 以 Nuxt kit 的正式构建 API 使用项目现有配置，将 .nuxt 和 .output 写入独立系统临时目录；位置在 build-location.json，不覆盖原生产预览输出。首次以 stdin --input-type 调用构建的 worker 报错保留在 build-first.log，最终使用 .mjs 调用通过。

保留已有 3300/3330/4186 服务。确认新端口空闲后，分别在终端启动：

```sh
# 如已有契约 mock 38080，复用它；否则启动这一项。
node tests/e2e/mock-backend.mjs

HOST=127.0.0.1 PORT=3333 NUXT_BACKEND_INTERNAL_ORIGIN=http://127.0.0.1:38080 node ../.planning/milestones/M002/implementation/evidence/frontend-cr005/production-server.mjs
node ../.planning/milestones/M002/implementation/evidence/frontend-cr005/production-proxy.mjs
```

3334 代理到新生产前端 3333 与契约 mock 38080。该 mock 的复习 fixture 在测试前重置，避免与其他测试并发运行。若重新取证，先复制 config 并更换 outputDir 和 JSON reporter 输出路径，以保留本目录已有记录。

```sh
pnpm exec playwright test --config ../.planning/milestones/M002/implementation/evidence/frontend-cr005/playwright.config.mjs
```

24 项：桌面及 320px 手机各 8 项，Firefox/WebKit 各 4 项。IDB open SecurityError、实际写事务 abort、损坏 schema 注入；不声称是真机存储策略或真实磁盘耗尽。QuotaExceededError、题面 mismatch、账号 epoch 与无法读回的 CAS 冲突由新增单测补充。测试后停止自己的 3333/3334 进程，保留原进程。

first-browser.log、first-browser-results.json、first-browser-results/ 为初次两个 selector 超时的原始记录。其内部附件路径仍记原 browser-results/，实际附件在 first-browser-results/；无需更改原日志内容。脚本从 fresh 修正为 restart 后最终 24 项通过。format-first.log 与最终 format.log 保留格式检查前后结果。修改前源码/本角色文档在 before-owned.tar.gz，旧 QA 证据及 CR 原件未改。

visual.mjs 仅在设计原型 4186 和本次 3334 服务均可用时补拍本轮 UI；结果 visual.json 与 memory-editing-*.png，未代替完整 UIA。prototype-review-stable.png 为等待动效稳定后的源原型。所有结果为开发检查，仍需 qa-quinn 独立复验。

取证说明：首次生产构建回归 24 项通过的原日志保留在 browser-production-first.log。随后 --list 覆盖了 JSON reporter，已将列表结果单独保存到 test-index-results.json，并为最终 browser.log/results 重新运行同一组用例；没有改应用源码或放宽断言。
