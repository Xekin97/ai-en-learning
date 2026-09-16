---
milestone: M001
stage: verification
role: quality/base
agent_name: qa-quinn
status: awaiting_user_review
date: 2026-09-06
verification_round: TRANSITION-M001-076
verdict: fail_rework_required
functional_uat: not_reissued
release_readiness: blocked
---

# 第076轮独立复验报告

## 结论

FAIL，独立测试已结束，暂不重新交付UAT。CR030-R074-01长用户名详情与CR035字段标题布局均已通过；关联Plans配置状态检查发现一项既有功能/设计遗漏：[CR-036](../changes/CR-036.md)。本轮所有失败均归于该同一问题，不是16个不同缺陷。

责任为implementation / frontend-claire。按现有批准产品、原型及API补齐提示即可，无需重开需求、设计或后端契约。QA未修生产、未切换工作流、未更新6001、未关闭CR或宣布里程碑完成。

## 授权与候选

- [TRANSITION-M001-076批准](../reviews/implementation-cr030-cr035-reverification-approval.md)、[执行前计划](./evidence/cr030-cr035-076/PLAN.md)、[覆盖矩阵](./cr030-cr035-076-coverage.md)。
- 前端固定镜像：`sha256:22ae24c0c969f1653833968c81acbf2bde4248f4f998892a3d01b5934c314730`。
- 后端固定镜像：`sha256:e8c4ee91a7c3265cda8c496ccc8fb485328d95b6c1662eaf2502011ce5d005a5`。
- [环境](./evidence/cr030-cr035-076/environment.json)：真实Nuxt、Go、PostgreSQL tmpfs与Nginx，独立127.0.0.1:6101。原型6010仅只读比较。16份批准快照在启动前逐字节验证，2303份既有源文件在报告写入前均未改变。
- Profile consumer-ai-web@1.0.0保持锁定；没有重跑开发unit/lint/format/typecheck/build，也未把开发自测或旧轮结果算成本轮独立证据。复用的是已阅读的QA脚本，均在新候选、新数据上实际执行。
- 两个浏览器引擎Chromium/WebKit；两种界面语言en-US/zh-CN。具体宽度和状态按覆盖矩阵分别记录，不泛称每一页全断点通过。

## 已通过的两项修复

### CR030-R074-01：32字符详情

真实合法账号`abcdefghijklmnopqrstuvwxyz123456`、32个w，以及短名reader；覆盖320/390/720/721/900/901/1280/1440、双语、双引擎。姓名完整、原字号、状态徽章及搜索/详情/返回均保留，无页面横向溢出。[484项检查](./evidence/cr030-cr035-076/focus-results.json)、[几何](./evidence/cr030-cr035-076/focus-observations.json)。

另以长名账号拥有的两份真实短/长批次验证只读reader及焦点/滚动恢复，320/390/900/1440双语双引擎[160项通过](./evidence/cr030-cr035-076/long-reader-results.json)。[确认后的WebKit英文320截图](./evidence/cr030-cr035-076/screenshots/confirmed-detail-webkit-en-US-320.png)完整显示用户名和徽章。

### CR035：两组标题间距和文字对齐

四组、空/3个模型夹具、两引擎两语言，320/390/720/900/901/1440；两组实际gap均8px，标题文字相对选项偏移均0，fieldset/legend保留。[947项检查](./evidence/cr030-cr035-076/plans-results.json)、[测量](./evidence/cr030-cr035-076/plans-observations.json)。

真实保存/重新载入、键盘选择、清空与恢复、额度0/7/不限、禁用状态恢复均通过。字段布局通过不代表不可生成状态提示通过，后者单列以下缺陷。

## 新缺陷 CR-036：不可生成配置警告缺失

PAGE-102 / CAP-103、CAP-021 / DATA-006、DATA-008、DATA-018 / API-102。

复现：管理员打开Plans的Guest方案，取消全部模型与全部篇幅，关闭不限，将额度设为0或5，保存后刷新。真实PUT返回200，返回的models和allowed_lengths为空；页面未显示不可生成警告，`.notice-warning`实际为[]。

批准[页面需求](../product/pages/index.md)、[交互](../design/interactions.md)允许有意保存不可生成配置，但要求明确提示。当前[原型](../design/prototype/app.js)PAGE-102的invalid状态显示：

- English标题：Creation is paused for this plan
- English正文：Choose a model and a length to resume.
- 中文标题：当前方案已暂停生成
- 中文正文：选择至少一个模型和一种篇幅后即可恢复。

双引擎×双语×390/1440，每个额度变体均8次失败。额度5也复现，排除只因零额度引起的表述歧义。本轮明确复现的是“模型与篇幅同时为空”的两种额度，不冒称已独立测试零额度单独、仅模型空或仅篇幅空等所有组合。

[额度0原始结果](./evidence/cr030-cr035-076/plans-warning-results.json)、[观察](./evidence/cr030-cr035-076/plans-warning-observations.json)；[额度5原始结果](./evidence/cr030-cr035-076/plans-warning-finite-results.json)、[观察](./evidence/cr030-cr035-076/plans-warning-finite-observations.json)。

[英文390实际](./evidence/cr030-cr035-076/screenshots/plans-invalid-chromium-en-US-390-app.png) / [同态原型](./evidence/cr030-cr035-076/screenshots/plans-invalid-chromium-en-US-390-design.png)；[中文额度5实际](./evidence/cr030-cr035-076/screenshots/plans-invalid-finite-chromium-zh-CN-390-app.png)。实际页面在方案tabs下直接进入模型选项，缺少原型黄色提示区。

严重度MEDIUM：管理员可保存使整组无法生成的策略，却看不到已批准的后果提示。后端接受/存储这类配置符合契约；不要以禁止保存或任意补默认模型/篇幅规避问题。按既有数据转换→状态→presenter渲染边界补齐，并保留刚通过的8px间距及合法保存。

## 关联独立回归

Users初始/无结果/加载/失败全状态实时对照；45行三页、追加失败/重试/终页、精确优先和游标权限；返回40行结果和未提交搜索草稿；正确所有者/批次只读modal、旧URL/深链/前进后退/迟到请求；真实重置密码204及两旧会话失效；有限/0/无限/admin不适用额度；写后丢响应只有一次PUT和一次GET对账，均通过。

Review旧库/空库/全暂停仍保留日期；上海单日3批6词；非法范围不请求、空有切换、迟到/失败/422、创建与范围复用/单篇并存、刷新顺序不变；UTC闰日/上海/洛杉矶DST初始日期通过。日期空/非法/失败与1080断点实时对照通过。真实复习合成内容中的learn/learned/learning分别作答、重复提示全部挖空、同源颜色稳定、错误纠正/不重叠、两类成功总结通过。

首页Review、等高日期、注销文案/中性色、五类访客原地引导、认证返回/错误/语言优先与隐私隔离、Models标题/列表/弹窗/密钥背景、Library六个统计标签和空态均通过指定检查；不据此宣称完整生成—统计生命周期通过。

## 原始结果索引

数字是各脚本局部断言数，可能覆盖同一行为；不相加当作独立需求或端到端场景数。保留全部16个失败，0个执行错误。

| 原始结果 | PASS | FAIL | ERROR |
| --- | ---: | ---: | ---: |
| [users-matrix-neutral](./evidence/cr030-cr035-076/users-matrix-neutral-results.json) | 1312 | 0 | 0 |
| [focus](./evidence/cr030-cr035-076/focus-results.json) | 484 | 0 | 0 |
| [detail-capture](./evidence/cr030-cr035-076/detail-capture-results.json) | 24 | 0 | 0 |
| [long-reader](./evidence/cr030-cr035-076/long-reader-results.json) | 160 | 0 | 0 |
| [plans](./evidence/cr030-cr035-076/plans-results.json) | 947 | 0 | 0 |
| [plans-warning](./evidence/cr030-cr035-076/plans-warning-results.json) | 16 | 8 | 0 |
| [plans-warning-finite](./evidence/cr030-cr035-076/plans-warning-finite-results.json) | 16 | 8 | 0 |
| [api](./evidence/cr030-cr035-076/api-results.json) | 58 | 0 | 0 |
| [api-edge](./evidence/cr030-cr035-076/api-edge-results.json) | 5 | 0 | 0 |
| [flows](./evidence/cr030-cr035-076/flows-results.json) | 26 | 0 | 0 |
| [users-supplemental](./evidence/cr030-cr035-076/users-supplemental-results.json) | 184 | 0 | 0 |
| [visual](./evidence/cr030-cr035-076/visual-results.json) | 310 | 0 | 0 |
| [regression-final](./evidence/cr030-cr035-076/regression-final-results.json) | 148 | 0 | 0 |
| [models-list-corrected](./evidence/cr030-cr035-076/models-list-corrected-results.json) | 7 | 0 | 0 |
| [lost-response](./evidence/cr030-cr035-076/lost-response-results.json) | 3 | 0 | 0 |
| [range-flows](./evidence/cr030-cr035-076/range-flows-results.json) | 47 | 0 | 0 |
| [range-matrix](./evidence/cr030-cr035-076/range-matrix-results.json) | 240 | 0 | 0 |
| [review-regression](./evidence/cr030-cr035-076/review-regression-results.json) | 22 | 0 | 0 |

## 证据校准与限制

- focus原几何断言等待了真实详情，结果有效；但最终截图分支再次点击详情后未等待导航，部分`long-detail-*`截图实际是列表，不作详情视觉通过证据。保留原文件，另执行[detail-capture脚本](./evidence/cr030-cr035-076/detail-capture.mjs)，等待详情标题、完整文本、字体和两帧布局后产出`confirmed-detail-*`截图及24项通过。不是生产缺陷，也不删除误命名原始文件。
- 交付校验首次执行时，报告已经引用尚未生成的校验输出自身，因两处自引用暂不存在而失败；其他完整性检查通过。[首次原始结果](./evidence/cr030-cr035-076/delivery-validation-initial.json)完整保留，再以已落盘的交付包确认链接与完整性。不是第二个产品缺陷。
- 已人工查看新Plans实际/原型、中文额度5实际和修正后WebKit320长名详情。自动局部几何通过不等于整页像素完全相同。模型夹具数量/描述不同，不以整页高度判布局失败。
- BASELINE_VARIANCE继续单列：英文原型语言选项Chinese与实现中文存在控件宽度差异；实现遵循“本地称呼”规范。未擅改原型或语言规则。
- 定向键盘、焦点和页面作用域Axe检查通过；本轮未执行真实200%菜单缩放、Firefox、真机、VoiceOver，也不借用旧轮结果宣称已测。
- [本地API采样](./evidence/cr030-cr035-076/api-edge-observations.json)：列表20次p50=2.978ms、p95=5.779ms、max=5.876ms；详情20次p50=2.291ms、p95=2.793ms、max=3.053ms。仅同机诊断样本，不是公网SLA、负载或容量保证。
- 本轮未重跑完整新旧版本混合矩阵、全部DTO负向开发测试、真实账号删除或完整统计生命周期。配套升级后旧管理员常驻标签需刷新要求保留。
- 真实AI为NOT VERIFIED，发布门BLOCKED。0供应商凭证、0真实调用、4模型全部停用；14批次及6条generation_runs是人工合成数据，不代表AI生成自然度、概率质量或模型兼容性。

## 清理与交接

[清理记录](./evidence/cr030-cr035-076/cleanup.json)：删除本轮标签核验后的4个容器和2个网络；66账号、14批次、4复习会话、6合成计量及4停用模型所在tmpfs库不可恢复，但种子和结果可重建。没有用户数据。6101已释放；6001四容器ID/镜像/启动时间全部不变，6010原进程保留。

[交付完整性校验](./evidence/cr030-cr035-076/delivery-validation.json)检查QA报告/CR外的既有源、控制面、原型及开发记录未改，13份原有文档历史正文保留。CR029–035仅增加验证进展，仍open；新增CR036同为open，控制面的7项清单待下一次守门器同步为8项。

按agt-verify-milestone提交[质量交接](../handoffs/verification.md)后停止。不自行激活开发、不部署6001、不重发UAT。建议守门器依既有开发—测试授权有限返回frontend-claire，修复CR036后再独立复验。
