---
milestone: M001
stage: implementation
role: frontend-implementer/base
agent_name: frontend-claire
status: awaiting_user_review
date: 2026-09-06
contract_version: v1.4
transition_id: TRANSITION-M001-073
verdict: development_checks_passed
change_requests: [CR-030]
---

# CR-030 Users有限返工与开发验证（073）

## 结论与范围

完成R072-01/02及Users状态回归中发现的同类加载骨架偏差。最终开发检查通过，提交审阅后由qa-quinn独立复验；不替代QA072的FAIL，不关闭CR029–034，不批准UAT或发布。6001未替换。

CONFIRMED授权：[073返工批准](../reviews/verification-cr030-users-rework-approval.md)。输入：[CR030](../changes/CR-030.md)、[072报告](../verification/cr029-cr034-072-report.md)、[响应式合同](../design/responsive-accessibility.md)、[批准原型](../design/prototype/app.js)、[主题](../design/theme.css)、[前端方案](../technical/frontend.md)、[Users增量](../technical/frontend-cr029-cr032.md)、[API v1.4](../technical/api/index.md)。

只改2个生产文件和2个测试文件；后台壳、页面/组件、DTO/schema/mapper/store/presenter、路由、后端/数据库、API、依赖及批准原型均未修改。保持接口→转换→应用状态→渲染边界，无客户端排序或原始响应渲染。

## 根因、取舍与修复

| 追踪 | 实测根因 | 最小修复 |
| --- | --- | --- |
| R072-01 / PAGE103 / CAP104、021 / API103 | 英文搜索错误说明为shortly，批准翻译为in a moment | 仅修改admin.searchErrorCopy；中文不变 |
| R072-02 输入 / PAGE103 / CAP104 | ≤720px额外max-width:none令720输入630px，批准432px | 删除该覆盖，沿用toolbar-search的27rem和容器约束；主按钮仍全宽 |
| R072-02 空态/纵向 | 原型后置.empty-state覆盖同优先级admin-user-empty，最终20rem；生产application.css后加载却把它覆盖回24rem | 删除多余24rem覆盖，继承共享空态20rem；不改网格或加32px补偿 |
| R072-02直接回归：加载态 | ≤720px实际三行骨架，原型首span跨列、后两span同一行；多出的内容再次改变网格剩余高度分配 | 恢复1fr 5rem两列、首span跨列；保留center对齐，取消额外start |

生产落点：[application.css](../../../../frontend/app/assets/css/application.css)、[en-US.json](../../../../frontend/i18n/locales/en-US.json)。

[空态根因实验](./evidence/cr030-073/root-cause-confirmed.json)在旧生产镜像、zh/en、390/720/1280及不同高度执行：1000px高时空态多64px导致搜索卡上移32px；720×800时差值仅13.203125px。浏览器局部实验将min-height恢复20rem即对齐，证明固定32px补偿不正确。

[加载态实验](./evidence/cr030-073/loading-root-cause.json)：720×1000搜索卡Y由305.921875恢复为批准351.515625；两行骨架一致。属已授权PAGE103全状态直接回归，无需更改上游决策。

最终720×1000：idle输入432×44、搜索卡Y380.78125；loading输入432×44、卡Y351.515625。390px输入300×44。详见[最终实测](./evidence/cr030-073/design-observations-final.json)。

## 新增测试与最终验证

[文案单测](../../../../frontend/tests/unit/admin-approved-copy.test.ts)固定双语失败说明。[新E2E](../../../../frontend/tests/e2e/cr030-073.spec.ts)新增6个逻辑用例×desktop/mobile=12项：zh/en空态/搜索宽度（5宽×2高）、错误说明/原查询重试、加载骨架两行布局/恢复。

| 本轮最终执行 | 结果与证据 |
| --- | --- |
| pnpm --dir frontend format:check | PASS；[命令](./evidence/cr030-073/quality-commands-final2.json) |
| Node24 typecheck / eslint / dependency-cruiser | PASS；114 modules / 86 dependencies；[构建完整日志](./evidence/cr030-073/build-final2.log) |
| Node24全量Vitest | 18 files / 157 tests PASS |
| Nuxt client + SSR + Nitro生产构建 | PASS；本轮实际执行质量/构建层，非缓存冒称重跑 |
| 全量Playwright契约Mock | 102/102 PASS，0skip/0flaky；[JSON](./evidence/cr030-073/e2e-full-final.json)、[命令](./evidence/cr030-073/e2e-command-final.json) |
| 新生产候选与实时原型 | 1040/1040局部断言PASS；[结果](./evidence/cr030-073/design-comparison-final-results.json) |
| 新生产候选真实API流 | 372/372断言PASS；[结果](./evidence/cr030-073/real-flows-final-results.json) |

Node24.8.0为Docker固定运行时；测试驱动使用本机Node22，保留engine/NO_COLOR警告。构建有Vite插件耗时提示，不是类型/lint/构建失败。无依赖升级。

### 设计对照覆盖与方式

Chromium/WebKit × zh-CN/en-US ×390/720/901/1280/1440；idle/empty另测800/1000两种高度。两端等待字体与布局，隐藏原型悬浮控制器，不改批准源文件。

- idle、empty、loading、error：匹配状态下后台栏/搜索卡/输入框（空态另含empty卡）的x/y/w/h在0.1px容差内一致；标题及状态文案准确。
- results/single：按用户名匹配整行文案（身份、日期、方案、状态、操作），同时单独确认顺序与真实API一致；不拿原型六行示例排列替代数据库合同。
- 搜索输入上限、主按钮全宽、无横向溢出、错误重试及终态均检查。
- 人工查看[英文空态](./evidence/cr030-073/screenshots/final-chromium-en-US-default-720-actual.png)、[中文空态](./evidence/cr030-073/screenshots/final-webkit-zh-CN-default-720-actual.png)、[英文错误](./evidence/cr030-073/screenshots/final-webkit-en-US-error-390-actual.png)、[加载态](./evidence/cr030-073/screenshots/final-loading-720-actual.png)及同名design截图，检查空间、断行、挤压和提示。此处不是整站逐像素diff的声明。

### 真实功能与受影响页面

隔离PostgreSQL+批准后端+新Nuxt生产包+Nginx，52个合成账号（45行分页集、6个原型同名样本、1个管理员），无学习批次。

- 两引擎/双语/5宽度：20→40→45行、追加等待/失败保留原行、重试、终态无重复。
- 第32行进入详情→未提交搜索草稿→Back to results：保留40行、已提交查询、原行焦点和滚动；详情重搜返回正确单条结果。
- 复用搜索组件的详情输入宽度、Models/Plans标题和无溢出、Guest标签通过；共享后台壳未改。
- 8组Users作用域Axe无serious/critical；无浏览器pageerror。
- 只读资料modal、密码/组别、认证/复习/学习库的已有路径由全量Mock E2E覆盖，不冒称本轮重新验证所有真实写接口或真实资料生命周期。

## 首次失败与证据保留

[证据索引](./evidence/cr030-073/README.md)记录所有首次失败和恢复：

1. 首次隔离DB探测误命中初始化socket，TCP尚不可用，migrate失败；加入-h db，重建仅本轮空库后成功，未影响UAT。
2. 第一候选98项E2E通过，设计对照876PASS/44FAIL。24项为真实加载骨架几何偏差，已修复；20项因整列表文本假定原型排序，改为按身份比文案并单独断言API顺序。原始[失败结果](./evidence/cr030-073/design-comparison-results.json)未覆盖。
3. 加载诊断脚本的括号笔误在执行前修复。最终构建证据脚本曾错误调用Docker build-final，退出125；[失败命令](./evidence/cr030-073/quality-commands-final.json)保留，纠正后[最终构建](./evidence/cr030-073/quality-commands-final2.json)重新成功。
4. 只采用最终候选的新1040/372/102/157结果，首次通过数字不累加，不用旧证据冒充最终运行。

## 交付与环境

最终前端：wordweave-frontend:cr030-073-final，摘要`sha256:18c9e266ed0bb74ee3d50d1f7aac8bb1c6f6945ee8e33460319ca86010552944`；配套后端`sha256:e8c4ee91a7c3265cda8c496ccc8fb485328d95b6c1662eaf2502011ce5d005a5`。[候选记录](./evidence/cr030-073/candidate-final.json)。

[单工作区计划](./frontend-cr030-073-worktree-plan.md)：仓库无HEAD，未创建worktree/分支/提交，未回滚用户文件。按标签和固定名称清理自建4容器/2网络；52个合成账号的tmpfs不可恢复，seed保留可重建等价夹具，资料/复习会话/生成/凭据均0。[清理与6001快照](./evidence/cr030-073/cleanup.json)。初次失败空库另已清理。6010 PID65630保留；E2E自建3300/38080已退出。

## 未决与下一步

- OPEN：CR029–034全部保留；当前实现阻塞/新增产品设计决定：无。
- BLOCKED：原独立FAIL未被开发自检取代，UAT未重新发出；真实AI/供应商兼容发布门保持。
- 未覆盖：本轮真实AI、真实资料/改密/换组/删除生命周期、混版、实际200%菜单缩放、Firefox/真机/人工读屏/公网压测。可参考历史证据但不计作本轮执行。
- 既有空查询提交保护保留（空草稿按钮禁用），原型默认示例按钮可点击；截图演示查询和动态账号信息并非业务固定文案，不据此宣称全屏像素相同。本轮只修已授权Users差异，不改全站控件或产品交互。
- PROPOSED：审阅交付后交verification / quality/base / qa-quinn；独立重建夹具复测R072-01/02（含loading）和Users全部状态、详情复用/返回，保留Models/Plans及既有开放项回归。通过后再交用户UAT。
- 依agt-frontend-implement，本交付不修改state/registry/history，不自动激活QA或关闭CR。

