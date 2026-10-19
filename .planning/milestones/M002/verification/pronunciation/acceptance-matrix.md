---
milestone: M002
stage: verification
role: quality/base
agent_name: qa-quinn
version: M002-QA-PRON-01-R1
status: pass_awaiting_user_uat
date: 2026-10-16
actual_model: unknown
---

# 浏览器发音独立验收矩阵

本轮对 `M002-FI-PRON-01-R1` 的独立 QA 结论为 **PASS**。用户人耳听音与真实手机仍待 UAT；本结论不表示用户已经验收，也不关闭 M002。

## 环境与接收

| 项目 | 结果 |
|---|---|
| 产品/设计/技术合同 | `abilities.md` AC-401～410、browser-only design R4、FE402-1～4、API-402 v2 |
| R1 源与构建 | 23 个产品源 + 1 个定向验证文件全部匹配；462 文件 aggregate `a6437e56fe8a60781a7ec9b9ccbdc86272ae73a8cc734a8dc4ca4cd32066071a` 精确匹配 |
| 独立候选 | production Nitro 3018 + real proxy 3019 → backend 43331；无 mock/fixture 标志 |
| 真实浏览器 | headed Google Chrome，真实 `speechSynthesis`；190 个系统声音、47 个英语声音，实际 locale 覆盖 en-AU/en-GB/en-IE/en-IN/en-US/en-ZA |
| 真实数据 | learner 正常登录；读取既有 saved batch `01a14352-828b-743a-b0fb-09bc1d6d85ee`，证据不含正文或秘密 |
| 开发证据复用 | 相关 71/71、发音核心 18/18、typecheck/lint/boundary/build；未机械重跑 |

## 最小用例结果

| ID | 结果 | 独立证据与边界 | 覆盖 |
|---|---|---|---|
| PRON-QA-01 范围与视觉 | PASS | 真实 library 有 5 个控件；受控 PAGE-402 计划与结果各 1 个；picker、explore、review 均 0。18×18px 裸图标、无 tooltip/可见状态文字、0px 几何位移；390px 桌面窄布局无横向溢出。trial/admin/preset 关闭入口复用交接的 opt-in 结构与开发证据。 | AC-401/408；FE402-2/3 |
| PRON-QA-02 当前词与真实播放 | PASS | 点击前 0 utterance；当前控件 entry 与 utterance 精确匹配。真实 library 与 R1 结果卡均收到 native `start → end`，无自动播放。 | AC-402/403/410；FE402-1/4 |
| PRON-QA-03 实际声音与口音 | PASS | 实机 47 个英语声音形成多口音菜单；checked、End/Home/Escape 与回焦通过。默认 native 播放使用 en-GB。0/1/失效替代等无法自然稳定构造分支复用开发确定性用例。 | AC-404；FE402-1/2 |
| PRON-QA-04 局部失败与时限 | PASS（确定性证据复用） | 本机未自然发生 unsupported/not-allowed/超时；1.5s/2s/12s、迟到事件和 voiceschanged 边界由已接收 fake clock/voice 单元证据覆盖，未把它当成真实发声证明。 | AC-406；API-402 |
| PRON-QA-05 单活动与生命周期 | PASS | 真实 A→B、重播、离页均取消旧 attempt，旧 native 事件为 `error(interrupted)`；R1 受控计划退场在 240ms 内 inert/aria-hidden/disabled，旧音取消，同 entry 结果首样本获焦且不自动播放。 | AC-405/409；FE402-1/3 |
| PRON-QA-06 无障碍与菜单 | PASS | 实际 button/aria/current entry、menuitemradio/checked、键盘菜单与 Escape 回焦通过；播放态无可见状态文案。reduced-motion 和其余确定性分支复用开发用例。 | AC-402/404/406；R4/R3/TA1 |
| PRON-QA-07 无 API/额度副作用 | PASS | library 纯播放窗口 0 forbidden/业务/写请求；受控 plan→result 仅 1 个 Nuxt build-meta GET，0 DB/model/generation 写；未运行模型生成、未改 DB/额度。 | AC-403/407/409；API-402 |
| PRON-QA-08 候选、修复与上线 | PASS | 首版发现 PRON-DEFECT-001：结果 Boolean 缺省被 cast 为 false，按钮持续 disabled 并导致焦点丢失。R1 定向复验 18/18 PASS。3016 仅替换前端后，正常 learner 登录、5 控件、无自动播放、native start/end 和 0 写请求小烟测 6/6 PASS；后端/PG PID 未变，旧输出已备份。 | FE402-4；AC-410 |

## 缺陷与复验

- `PRON-DEFECT-001`：结果词卡的 `pronunciationActive` 可选 Boolean 被 Vue 视为 false，结果按钮不可点击，计划转结果也无法转移焦点。
- 原责任人把该 prop 显式默认设为 true，同时保留 `pronunciationEnabled` 的 opt-in 开关。
- R1 复验确认结果按钮 connected/enabled/outside inert、同词焦点转移、转场前仍只有用户启动的计划 utterance、手动点击结果后 native start/end、0 写/模型请求。状态：`FIXED_RETEST_PASS`。

## 证据索引

- 首版真实 library 35/35：`evidence/run-143/real-native-results.json`
- 首版方法失败（保留）：`evidence/run-143/attempt-01-method-failure.json` ～ `attempt-04-method-failure.json`、`controlled-attempt-01-method-failure.json`
- 首版缺陷：`evidence/run-143/defect-pron-001-focus-transfer.json`
- R1 接收与定向复验：`evidence/run-145/r1-reception.json`、`controlled-plan-result-r1.json`、`defect-pron-001-retest.json`
- 3016 更新：`evidence/run-145/pre-switch.json`、`switch-receipt.json`、`live-3016-smoke.json`

## 保留边界

真实人耳是否听到正确目标词、主观音质及真实手机浏览器兼容性必须由用户完成。390px 桌面窗口只证明布局；受控 plan/result 数据只证明最终组件与生命周期，不替代用户在真实 `/create` 的完整生成验收。
