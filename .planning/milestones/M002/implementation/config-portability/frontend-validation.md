---
milestone: M002
stage: implementation
role: frontend-implementer/base
agent_name: frontend-claire
version: M002-FI-CR313-01
status: awaiting_user_review
date: 2026-10-16
---

# CR313 前端开发验证

## 范围与环境边界

验证模式为需求验收，覆盖 AC-501～514 / UIA-501～515 与 FE-V1～V8 的前端可证明部分。后端原子性、真实 ACK 丢失、进程 kill、KDF 内存压力、真实 provider 和 04:00 wall-clock 不由前端测试宣称通过。原 UAT3015、设计预览4174/4175/4176、真实 `.env`/Key/数据库保持不动。

## 运行前矩阵

| FE-V / AC | 源与运行定位 | 方法 | 计划证据 |
|---|---|---|---|
| FE-V1 / AC-501,502,512,514 | UI33R3 四入口；`/admin/models`、`/admin/plans`、`/admin/growth` 四 tab | unit contract + Playwright 导航/请求断言 | 结构化日志；代表入口截图 1 |
| FE-V2 / AC-502,503,510,513 | TA1 文件/口令；modal file/export 区 | 8 MiB、Unicode scalar/UTF-8、storage/URL/request body、Blob revoke 单测和浏览器断言 | unit 输出；模型含 Key 截图 1 |
| FE-V3 / AC-504,505,513,514 | API-502/505、FE313-B1；preview/change/notice | schema/mapper 表驱动与浏览器动态值断言 | unit 输出；代表 preview 截图 1 |
| FE-V4 / AC-506,507,511,512 | blockers/effects 与 blocked 区 | contract fixture、imports 请求为0、safe labels | unit/浏览器日志；blocked 截图 1 |
| FE-V5 / AC-508 | confirm/submitting | 双击、期限、late response、200 not_applied 时序单测 | unit 输出 |
| FE-V6 / AC-509 | recovery/resolve/current | sessionStorage、unknown、410/403/503/superseded/refresh failure unit+browser | unit/浏览器日志；unknown/current 截图 1 |
| FE-V7 / AC-504,509 | UI33R3 modal、R3 priority modal | 1440×950 zh 与390×844 en；焦点/Escape/backdrop/footer/overflow/reduced-motion | 代表截图最多 6 张、送模最多 4 张 |
| FE-V8 / AC-501,503,508,512 | application→infrastructure→runtime→presentation | dependency-cruiser、typecheck、lint、build，异常200→unknown 单测 | 原始命令/stdout |

超出 6 张截图软预算仅在同一 AC 失败或无法判定时追加，并在结果中说明。普通成功路径优先结构化断言。设计原件 R2/R3 证据只证明批准设计，不作为生产 Vue 通过证据。

## 结果

| FE-V | 结果 | 已执行证据 | 未执行边界 |
|---|---|---|---|
| FE-V1 | PASS（限定范围） | mock Playwright 桌面/移动四入口；正式设计与实现运行时比较 8/8 | 未做全站导航回归 |
| FE-V2 | PASS（限定范围） | 8 MiB/+1、Unicode 口令、秘密不入恢复槽、普通导出精确 body/CSRF 的 unit；密文模型浏览器链 | 未以浏览器检查 DevTools 内存 |
| FE-V3 | PASS（限定范围） | 严格 schema/mapper、false/0/null/empty、B1 notice code/item_ref/field 与动态文案断言 | 未枚举后端所有未来 notice code |
| FE-V4 | PASS（限定范围） | blocked dependency 桌面 fixture 显示精确安全 source/target 文案、无确认/提交按钮，断言 imports=0；`models-blocked-desktop-en.png` | 未枚举全部 blocker/error 变体 |
| FE-V5 | PASS（限定范围） | 重复提交门、类别/会话迟到响应、期限、200 `not_applied` unit；真实后端 normal applied 与 dropped-response 合法终态 | 未执行 04:00 wall-clock 或全部 reason code |
| FE-V6 | PASS（限定范围） | unknown 刷新恢复、resolve 不重发、403/410/current 非证明、superseded/refresh-failed 标记、storage failure/no dispatch、logout 清理 | 未执行真实 403/410、不同管理员/多 tab/关闭 tab 变体 |
| FE-V7 | PASS（受影响区域） | 1440×950 / 390×844 mock；modal、focus、Escape、backdrop、footer/overflow；正式设计与实现实时比较 8/8 | 未做旧编辑器全部路径或 zh 生产截图 |
| FE-V8 | PASS | Node 24 lint/typecheck/boundary/61 unit/Prettier/隔离 build；mock 7 passed / 1 bounded mobile skip；真实后端 1/1 | 不以这些检查证明数据库故障注入 |

原始 stdout/exit 在 `evidence/frontend/raw-checks/`。最终 Node 为 v24.22.0；lint、typecheck、boundary、Prettier、unit、build、mock Playwright 均 exit 0。真实 Playwright 的 runner 原始状态在 `playwright-real-artifacts/.last-run.json`（`passed`），完整链结果记录于测试日志。

4176 当时未监听且未被重启。随后在独立 43132 只读静态服务打开同一 formal URL，并与 43130 隔离实现运行时对照；models/plans/items/growth、top-layer、焦点返回、背景阻断和无横向溢出共 8/8，通过后服务与端口清理。结构化原始观察为 `evidence/frontend/design-runtime-comparison.json`。

最终 build 使用 `NUXT_BUILD_DIR=.nuxt-cr313-final` 与 `NUXT_OUTPUT_DIR=.output-cr313-final`；Nitro 明确输出到 `.output-cr313-final/server/index.mjs` 后清理。3015 由 nginx 监听，活动 Node server 全在 `/private/tmp` 或 `/var/folders/.../T` 的独立 `.output`，不使用仓库 `frontend/.output`；只读进程证据见 `raw-checks/uat-isolation.log`。
