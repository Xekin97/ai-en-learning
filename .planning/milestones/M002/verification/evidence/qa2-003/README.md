# QA03 冻结证据

授权 TRANSITION-M002-024，独立验证 frontend-cr008 / backend-cr007。整体 FAIL：11 个场景通过，S08/S13 指向 CR009。复现和计数以 [报告](../../report.md)与 [manifest](manifest.json)为准。

## 环境与复跑

这些脚本会注册/注销测试账号、正式下架模型及修改成长配置，只可在新建的一次性数据库运行。不要在当前目录直接重跑：脚本按自身目录写结果，会覆盖证据；先复制全部 `.mjs` 到新的输出目录。环境读取沿 `frontend/tests/integration/m002-local-stack.py` 的私有指针，env.json 含凭据，不复制到仓库或终端输出。

1. 在项目根目录用 `python3 frontend/tests/integration/m002-local-stack.py start` 建立新隔离栈；使用 Node 24 与可用 Playwright Chromium。
2. 将 CR008 已交付生产构建按 `implementation/evidence/frontend-cr008/build-location.json` 与该目录的 production-server.mjs 启动在 3331（构建仍可用时复用；修改实现后须使用新交付构建）。不能使用 3300 的契约 mock 代替真实 API。
3. 依次运行复制目录的 `account-reverify-v2.mjs` → `cards-reverify.mjs` → `growth-audit.mjs` → `pagination-repro.mjs` → `mixed-live.mjs`。前者创建后续依赖的控制账号/模型。脚本自建 3301 代理；账户准备自建 38082 loopback provider。出现已记录的预期失败时核对 JSON，不将退出 1 隐藏为成功。
4. `runtime-audit.mjs` 使用 3302 代理，可在控制账号创建后定向排查运行警告。它只证明当次访问未捕获警告，不反证旧日志。
5. 停止本次启动的前端进程，再用 local-stack.py stop 清理专用 API/PG；脚本临时代理/provider 在 finally 中清理。不要停止既有预览 3300/3330/38080/4186。

所有 provider 请求仅 loopback，无真实 AI 调用。SQL 状态设置限隔离测试模型，并非新增产品接口。依赖/启动细节沿源码脚本与已冻结开发交付，不包含可用于外部系统的凭据。

## 历史与限制

- `account-reverify.mjs`、account.log、account-first-results.json 为首次准备失败原件；第二个注册页缺少就绪等待。保留但不作为当前成功脚本。随后重建隔离栈使用 v2，两个准备各 4 次本地 provider 调用，总计 8。
- account-final-results.json 的 S01–04 通过，但一次未定位 hydration console 警告令脚本退出 1；runtime-audit.json 和 growth-runtime.json 当次未复现。W01 不计确认功能缺陷。
- cards-results.json 的 S06 文本使用 live；初始样本实际为未下架但未启用，S06-live 补充已启用样本，二者不重复计数。
- S08-repro 是真实 Meta+鼠标操作复现 S08，S13 是同根因的仅后页引用对照，缺陷只有 CR009 一项。
- 先前 QA02 可变报告等原文保存于 before-owned.tar.gz；QA02 原始证据未改。manifest 自身不纳入自身哈希，后续复跑必须建立新证据目录。
