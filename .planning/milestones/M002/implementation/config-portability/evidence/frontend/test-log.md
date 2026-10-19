---
milestone: M002
version: M002-FI-CR313-01
date: 2026-10-16
scope: frontend-development-validation
---

# CR313 前端测试日志

最终静态、unit、build 与 mock browser 命令在 `frontend/` 以临时、校验过 SHA256 的 Node v24.22.0 执行；真实后端 browser 集成在临时 Node24 可用前以项目原 Node22 执行并通过。逐项最终源码检查 stdout 与 exit code 位于 `raw-checks/`；证据没有保存合成登录口令、包口令、Cookie、CSRF、文件内容或真实环境资料。

## 最终通过

```text
$ pnpm typecheck
> nuxt typecheck
exit 0

$ pnpm lint:boundaries
✔ no dependency violations found (280 modules, 313 dependencies cruised)

$ pnpm exec vitest run tests/unit/config-portability.test.ts tests/unit/m002-admin-contracts.test.ts tests/unit/admin-plan-policy.test.ts tests/unit/private-session-state.test.ts
Test Files  4 passed (4)
Tests       61 passed (61)

$ pnpm lint
exit 0

$ pnpm exec prettier --check <30-file CR313 source/test manifest>
All matched files use Prettier code style!
exit 0

$ pnpm exec playwright test --config playwright.cr313.config.ts --reporter=line
7 passed, 1 bounded mobile skip (32.6s)

$ pnpm exec playwright test --config playwright.cr313-real.config.ts --reporter=line
1 passed (15.7s)

$ NUXT_BUILD_DIR=.nuxt-cr313-final NUXT_OUTPUT_DIR=.output-cr313-final pnpm build
✔ Client built
✔ Server built
✔ Nuxt Nitro server built
You can preview this build using node .output-cr313-final/server/index.mjs
✨ Build complete
exit 0
```

Playwright mock 的原三项在桌面与移动各执行一次：模型密文 preview/import 与动态 notice；未知结果刷新恢复后 resolve 且 imports 总数仍为1；四入口和计划优先级真实 top-layer modal。另有一项限定桌面 blocked dependency：精确安全 source/target 文案可见、确认与提交按钮不存在、imports 总数为0；移动实例按证据预算明确 skip，因此总计7 passed / 1 skipped。真实后端的1项通过正式登录、同源代理、正式 repository/schema/mapper/store/component 链执行普通导出下载、预览、imports 响应丢失、API-505 当前读取、resolve，以及再次预览后不丢响应的确定性 applied 导入；总 imports 为2，无 provider 请求。

## 首次失败与修复

- mock 首轮 6 项失败证据保留在 `playwright-first-failure-20261016/`。定位到精确 accessible-name 测试定位、旧 admin fixture 缺 M003 group 字段，以及生产 CR313 写请求未刷新 CSRF。
- 后续浏览器暴露无效 `Intl.DateTimeFormat` 选项和 recovery 的 SSR hydration mismatch；分别改为显式日期字段并用 `ClientOnly` 挂载秘密/恢复 dialog。
- 真实后端首次有效全链结果在 dropped-response 后 resolve 为合法 `not_applied`，原测试错误地只接收 `applied`；清理含合成登录 query 的预 hydration 失败证据后，保留无秘密的 `playwright-real-first-failure-20261016/`，断言改为明确接收两个合同终态，并新增第二次无丢响应导入严格断言 `applied`。
- 早期 `pnpm lint` 在临时 `.nuxt-cr313*` build tree 仍位于扫描根目录时于 ESLint config normalize 阶段退出2：`TypeError: Unexpected function`，不是源码 lint finding。只清理本任务临时 build tree 后，保持 `eslint.config.mjs` 不变，Node24 最终 lint exit 0。

## 视觉与只读设计检查

- 人工查看 `models-success-desktop.png`、`models-success-mobile.png`、`growth-entry-mobile-en.png`、`models-blocked-desktop-en.png`：modal 处于 top layer、背景阻断、桌面计数横排、移动计数纵排、blocked 安全文案和唯一“Choose another file”动作准确，footer 可见，无横向裁切。
- 批准地址 4176 首次只读访问返回 `ERR_CONNECTION_REFUSED`，未启动、重启或修改 4174/4175/4176。随后将冻结 design 根以只读静态服务临时绑定 43132，打开同一 `/formal/?page=...` URL，并与43130实现逐项比较；models/plans/items/growth、modal、焦点、backdrop、overflow 共8/8，通过且 console/page error 为0。原始结构化观察：`design-runtime-comparison.json`。

## Build 与 UAT 隔离

最终 build 同时隔离 Nuxt 中间目录 `.nuxt-cr313-final` 和 Nitro 输出 `.output-cr313-final`；`build-isolation.log` 记录 server entry 确实生成，随后两目录均被清理。3015 的只读进程检查显示监听者为 nginx，活动 Node server 均来自 `/private/tmp` 或 `/var/folders/.../T` 中的独立 `.output`，不是仓库 `frontend/.output`；证据为 `raw-checks/uat-isolation.log`。早期仅隔离 buildDir 的检查即使写入仓库本地忽略 `.output`，也没有覆盖正在服务的 UAT 输出。

## 原始结果索引

- `raw-checks/{unit,typecheck,boundaries,lint,prettier,build,playwright-mock}.{log,exit}` 均为最终 exit 0。
- mock runner 原始输出为7 passed / 1 bounded mobile skip；真实 runner teardown 前的 `.last-run.json` 为 `passed`、无 failedTests。
- mock 首次失败 traces 位于 `playwright-first-failure-20261016/`；不含凭据的真实断言首次失败位于 `playwright-real-first-failure-20261016/`。

## 已清理的隔离资源

真实后端辅助在43131、一次性 PostgreSQL 63542运行；完成后已停止并确认端口释放，临时 cookie、env、密文包和脚本目录已删除。设计比较43132、mock app43130与 mock API43131 也已停止；三端口无监听。未接触 UAT3015、真实数据库、真实 `.env`/Key 或 provider。
