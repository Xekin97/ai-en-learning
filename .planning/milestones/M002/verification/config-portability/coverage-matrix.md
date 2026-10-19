---
milestone: M002
stage: verification
role: quality/base
agent_name: qa-quinn
version: M002-QA-CR313-01
status: awaiting_user_review
date: 2026-10-16
mode: requirement-acceptance
---

# CR313 独立验收覆盖矩阵

## 范围、版本与证据预算

验收基线为 M002-PRODUCT-09-R1（AC-501～514）、M002-UI-33-R3/TA1（UIA-M002-501～515）、M002-DB-CR313-01、M002-BE-CR313-01/B1、M002-FE-CR313-01，以及已接收实现 M002-BI-CR313-01 / M002-FI-CR313-01。当前实现快照以 `reviews/evidence/cr313-verification-entry-131/implementation-before.json` 的 699 个文件为准；QA 不修改应用源码或已批准来源。

采用最短充分的真实当前后端 + 一次性空 PostgreSQL + 隔离前端验收。开发者 unit/lint/type/build 不机械复跑；只有真实用户流、API/数据库跨边界、代表性失败和生产 UI 行为由 QA 独立执行。截图软上限 4 张，送模型视觉检查软上限 2 张：桌面中文成功/确认、移动英文阻止/长内容各一；只有确定性差异或结构信号无法判定时追加。普通 API 成功使用结构化响应、数据库前后快照和请求计数，不截图。

## 用例矩阵

| Case | AC / UIA / API | 场景与代表边界 | 运行定位 / locator | 预期结果 | 方法与证据 | 可复用证据及理由 | 状态 |
|---|---|---|---|---|---|---|---|
| QA313-01 | AC-501/502/512; UIA-501/502/513/514; API-501/505 | 管理员四类别 current/export；导出不受当前列表筛选/成长 tab 影响；普通 models 包无秘密；普通用户、过期会话与 CSRF 拒绝 | `/admin/models`, `/admin/plans`, `/admin/growth`; `POST /api/v1/admin/config-portability/{category}/exports`; `GET .../current` | 四类完整、范围外用户/预设/公告/历史不在包；普通包无 Key/掩码；拒绝请求无写入/秘密 | 真实 HTTP + 导出 JSON 键检查 + DB revision/范围快照；浏览器入口检查 | BI01 的管理员/CSRF integration 只复用为实现层基线；QA 重验真实运行边界 | **PASS**：四类导出 200；2 connections/4 plans/4 items/2 growth levels；匿名401、learner403、缺CSRF 403；普通包无Key/范围外数据。 |
| QA313-02 | AC-502/503/510; UIA-502/503/508; API-501/502 | models 显式加密导出，正确口令 roundtrip；错误口令、tag/密文篡改、普通无 Key 包、停用连接缺 Key | models export/password fields; `POST .../models/previews` | 正确包可预览且每连接 `replace_from_package`；四类失败均无 token、无写入、不回显口令/Key、不调用 provider | 真实 API；响应/日志脱敏搜索；DB revision；provider 请求计数 | BI01 crypto/KDF integration 可复用固定算法与资源门基线；真实端到端需独立执行 | **PASS**：2连接加密包正确口令 preview/import；错口令与篡改均422 `decryption_failed`，普通包422 `credentials_required`；provider调用0。 |
| QA313-03 | AC-504/505/513/514; UIA-504/505; API-502/503/505 | plans 完整导出→修改合法 priority/0/null/false/空集合→preview→取消→重新 preview/import；列表筛选无关；固定四计划缺项和必填遗漏拒绝 | plans modal; `previews/imports/current`; 目标用户 usage/trial/base-plan、进行中快照 DB 行 | preview 准确；取消无 mutation；提交整类替换；usage/trial/history/base plan 不变；缺项/遗漏整次拒绝；可选/显式值不被默认覆盖 | API + DB 前后快照 + 浏览器宿主页刷新 | FI01 真实链证明 repository/store 接线；本用例独立验证具体数据结果 | **PASS**：preview不改revision；提交只推进配置；相同operation结果revision相同；0/false/empty/null保留；缺计划/必填422；usage/trial/charge事实保持。 |
| QA313-04 | AC-506/507/511/512/514; UIA-506/507; API-502/503 | items/growth 正常 roundtrip；遗漏 ever-issued/reward-referenced item、同 kind+threshold 异 achievement identity、移除跨类 model/item；合法 empty items 仅在无依赖时 | items/growth previews; blockers/effects; DB inventory/award/claim/checkin rows | 阻止项无 token、无 imports；准确 source/target identity；不自动解绑/按名映射；成功保留库存/发放/达成/领取/当天签到，下一学习日意图准确 | 真实 API + DB 前后快照；一张阻止态 UI 代表图 | BI01 对 domain 接点与历史保护的 package integration 可复用；QA 聚焦一组真实跨边界样本 | **PASS**：四类别均真实applied；移除道具返回 `active_reference`+`ever_issued`、无token/import；库存、award、settlement、checkin等事实不变；下一学习日为2026-10-17。 |
| QA313-05 | AC-503/513/514; FE313-B1; API-502/ERR | 每类别组合代表 presence/null/false/0/empty/可选清空；未知合法 notice、非法 item_ref/pointer 由前端拒收 | preview response mapper + real malformed files | 必填遗漏/null 拒绝并定位；0/false/empty 保留；可选省略生成/清空；密钥/攻击者原始值不回显 | 真实 API 表驱动脚本；前端生产 mapper 通过运行 UI 注入单个合同异常 | BI01/FI01 单元矩阵复用其余等价组合，依赖未变且本轮只抽验代表值 | **PASS（代表值）**：真实API证实missing/null/0/false/empty边界；其余等价表由BI01严格decode与FI01 mapper矩阵复用，版本/699源摘要一致。 |
| QA313-06 | AC-508/509; UIA-509/510; API-503/504/505 | relevant config 变化后 stale preview；同 operation 同请求重放；不同文件冲突；imports 响应丢失→unknown→resolve；resolve 先到封死迟到提交；current 不证明结果 | imports/resolve/current；sessionStorage 恢复槽；DB receipt/revision | stale 为 not_applied 且零计数；同 ID 无重复 revision/副作用；unknown 不自动重发；resolve 返回 applied/not_applied；403/410/current 状态文案及动作准确 | 真实 API fault proxy + DB receipt/revision；浏览器 request count | BI01 已证 deterministic pool-close unknown 与 receipt barrier；真实 UI/API 丢响应链必须独立重验 | **PASS（保留边界）**：真实stale=`revision_changed`；幂等无重复revision；真实403；丢响应仅1次import、current不改操作事实、resolve终态`not_applied`。真实24h 410未等待，复用FI01确定性UI合同。 |
| QA313-07 | AC-504/509; UIA-501～515 | 1440×950 中文与 390×844 英文：四入口、准确文案/顺序、modal/backdrop/focus/Escape、reading/submitting 禁关、footer/overflow、accessible names/status；原 plan priority 草稿/preview/top-layer | 可访问 role/name；`dialog[open]`; activeElement; bounding boxes; request log | 批准 copy/顺序/行为一致；Tab 不离开；关闭回 opener；移动无横溢、普通动作≥44px、footer主动作≥48px；priority 预览保留输入且背景不可操作 | Playwright 生产页面结构断言 + 4 张以内截图 + 人工视觉比较批准 formal | UI33R3 设计证据只作基线；FI01 mock 图不替代 QA 当前运行验证 | **PASS**：1440中文unknown结果与390英文blocker；无横溢、modal/focus正确、44/48px；priority top-layer/draft/backdrop/12次Tab/Escape回焦均通过。 |
| QA313-08 | AC-501/503/508/512; API-501～505 | 基本交互/接口延迟、导出/preview/import 无 provider 调用、无范围外写入；隔离与清理 | HTTP timing；provider trap；DB schema/table diff；监听端口 | 合成代表包在交互可用范围完成；不设新容量门槛；0 provider；仅所选类别和回执/revision变化；所有 QA 资源可清理 | 结构化 timing、provider count、DB diff、进程/端口清单 | 开发 build/性能不重跑；这里只记录实际验收路径耗时 | **PASS**：代表API 18–263ms、丢响应UI链2.53s；provider相关表/日志调用0；一次性DB/外置Nuxt输出，清理结果见环境回执。 |

## 结论规则

- `PASS`：当前用例的批准结果由匹配版本的实际结构化/视觉证据充分证明。
- `FAIL`：存在可复现的批准合同偏差；保留首次失败并路由原责任人，修复后定向复验缺陷及受影响共享路径。
- `UNVERIFIED`：方法、环境或授权不足，不能提升为通过；记录影响、责任和补齐动作。
- 达到上述八组的充分证据后停止扩测；真实 TCP ACK 丢失、进程 kill、KDF RSS 压测、04:00 wall-clock 等保留边界只有在批准条目无法由现有确定性证据覆盖时才升级，不建设新故障平台。

## 最终判定

八组均为 **PASS**；QA313-05 明示代表值抽验，QA313-06 明示真实24小时过期窗口未等待。未发现CR313产品实现缺陷。首次运行失败均为测试方法、定位器或重复运行触发的受控KDF限流，保留于 `evidence/run-01`～`run-06`，随后仅定向复验受影响用例，未掩盖或放宽批准预期。完整结论见 [report.md](report.md)。
