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

# 浏览器发音独立验证报告

## 结论

`M002-FI-PRON-01-R1` 独立 QA **PASS**，本地真实 UAT 已更新并保持运行在 [http://localhost:3016](http://localhost:3016)。用户人耳听音和真实手机尚未验收；M002 不据此收尾。

## 已证明行为

真实 headed Chrome 在既有 learner 文章上完成 35 项断言：5 个学习卡控件、18px 裸图标、无可见状态文本、实际多口音菜单、键盘菜单、当前词 native start/end、A→B/重播/离页取消旧声音，以及播放期间无业务请求或写请求。设备枚举到 190 个声音，其中 47 个英语声音，覆盖 6 个英语 locale。

PAGE-402 使用冻结 production build、真实会话/选项和浏览器原生 speech，只在浏览器内存注入一个最小计划与结果；它没有写数据库、没有请求生成或模型。首版由此发现 `PRON-DEFECT-001`：结果区省略可选 Boolean 后被 Vue cast 为 false，结果发音按钮持续禁用，计划焦点也无法转移。

原实现者交付 R1 后，QA 核对 23 个产品源、1 个定向验证文件及 462 文件构建摘要全部匹配。R1 定向复验 18/18 PASS：结果按钮启用，同 entry 焦点首样本转移，计划旧音取消，结果不会自动播放，手动点击后 native start/end，且无写/模型请求。该缺陷状态为 `FIXED_RETEST_PASS`。

## 运行环境更新

切换前旧 3016 前端输出为 459 文件、aggregate `70e3db479335eb5bea9ab2b1f7ffc16db08bb959b01bdf065d88bc5990cc0311`。它已保存在 `/private/tmp/wordweave-m002-cr313-uat-20261016/frontend-output.pre-pronunciation-20261016T190516`。

3016 当前安装 R1 的 462 文件，aggregate `a6437e56fe8a60781a7ec9b9ccbdc86272ae73a8cc734a8dc4ca4cd32066071a`。切换后 `/`、`/login`、`/api/v1/bootstrap` 均为 200；普通 learner 登录、既有文章、无自动播放、当前词 native start/end 和 0 业务写请求小烟测 6/6 PASS。后端 PID 24845 与 PostgreSQL PID 24625 在切换前后未变。3018/3019 已停止，3016/3017 保持运行。

## 方法记录

首版 4 次真实 library 整体 runner 调用因取消终态、点击时序、网络窗口和滚动条判定过宽而失败；另一次受控链同步焦点断言过早。这些方法失败均原样保留，不能称为通过。修正后的不受影响真实 library 个案 35/35 与 R1 定向个案 18/18 是本结论依据，没有为追求全绿而重复整条 mutation 链。

## 限制

QA 观察 native 事件，未声称人耳已听到声音或听感正确。真实手机未测试。受控 PAGE-402 注入不是最终 UAT；用户可以在真实 `/create` 正常生成并检查计划与结果，生成行为仍遵循原模型和额度规则。
