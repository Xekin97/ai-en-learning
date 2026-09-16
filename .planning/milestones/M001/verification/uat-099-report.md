---
milestone: M001
stage: verification
role: quality/base
agent_name: qa-quinn
status: awaiting_user_review
date: 2026-09-08
verification_round: TRANSITION-M001-099
verdict: passed_for_scoped_uat_preparation
uat_handoff: UAT-M001-099
real_model_quality: not_verified_under_v3
release_readiness: blocked
---

# UAT099：候选已部署，有限冒烟通过

[本地入口](http://localhost:6001)可用。qa-quinn按[099授权](../reviews/verification-cr039-099-uat-preparation-approval.md)完成保留数据的后端替换及非破坏性冒烟。未改前端、源码、schema、工作流或任何旧版兼容实现；没有调用真实模型。本结论不替用户接受UAT，不关闭CR-039，也不放行发布。

## 候选、证据与范围

- 后端：`wordweave-backend:cr039-097`，`sha256:ab12e7dec0a6a8beb55df2ec6a8174d01d288681215c1108cec997e6f99f8eee`。
- 前端保持：`sha256:fd251e7439aad8e058656e2751ed84f40715fec570a872da53542688a6dd6904`；Frontend、Nginx、Postgres容器ID及数据库持久卷不变，仅必要重载Nginx。
- 原后端镜像保留：`sha256:642ed57ad0ed6c8a13e4bba1101d8b50188e8ea636791583a6ffb5eaa6917aac`。未触发恢复；恢复权限只限部署失败时应用镜像/配置，不是数据库恢复或旧版兼容承诺。
- [覆盖P01–Q01](./uat-099-coverage.md)，CAP-008/009及已测删除生命周期引用QA098；PAGE-001–006/101、API-001/002/004/007/101和DATA-001–017仅覆盖本轮列明的启动、只读和保持检查。
- [前置](./evidence/uat-099/preflight.json)、[部署](./evidence/uat-099/deployment.json)、[冒烟](./evidence/uat-099/smoke-results.json)、[搜索复查](./evidence/uat-099/dropdown-recheck-results.json)、[最终交付校验](./evidence/uat-099/delivery-validation.json)、[最终证据manifest](./evidence/uat-099/delivery-manifest.json)。

## 实际验证

1. 校验QA098的24份及DEV097的26份证据摘要和097两份修改源码摘要；候选与批准记录一致。当前6条迁移，最新`0006_hint_occurrences_enforce.sql`，未执行迁移。候选管理命令`verify`对现有DB只读检查通过。
2. 切换前无活动生成、有效草稿或承接记录，在途HTTP为0。通过Compose精确复用当前运行参数，禁用旧.env自动加载；`--no-deps --no-build --pull never`仅替换backend，约8.2秒完成替换及健康观察，不代表精确停机时长。
3. 13项部署断言通过：候选、健康、环境、网络/只读配置、其余容器身份、数据/密码/凭据/会话保持、无新增生成、代理live/ready均符合。
4. Chromium单视口1440检查首页SSR、造文工具台、Review/Library访客引导与登录意图；原专用`uat_admin`/`uat_learner`均可原密码登录；管理员只读模型列表与用户搜索、学习者Library与模型选项正常。没有启动复习、生成、保存、删除或更改密码/语言/组/模型。
5. 首次37项冒烟36 PASS、1 FAIL；只复查失败搜索断言及相关保护项，6 PASS / 0 FAIL / 0 ERROR。原37项最终有效结论全部通过，额外保护项不用于夸大覆盖量。原始FAIL保留并在下节解释。
6. 既有591账号、598会话、22批次、3模型、90条生成记录及业务表摘要均保持。仅创建并注销本轮两个登录会话；原会话、密码和加密凭据内部摘要一致，未输出敏感值。无新增账号、学习资源、生成run或真实调用。

## 保留的过程偏差

- 首次前置在`docker exec ... pg_restore --list`阶段出现工具传输异常，记录为exit 0但调用包装器抛错。原包装器未保留底层错误码，不能断言首次错误精确原因。[失败原件](./evidence/uat-099/preflight-failure.json)保留，部署当时尚未开始。
- 只读重读目录成功。恢复前置确认原备份、容器、数据、内部凭据摘要及保护文件均未变，复用原备份并重新执行只读verify。[恢复记录](./evidence/uat-099/preflight-recovery.json)保留。目录读取工具仅在进程成功退出且目录内容有效时允许stdin EPIPE；不对数据库写操作或部署命令宽松处理。
- 搜索断言只等listbox可见就读取文本，而该容器在loading时已存在（`frontend/app/pages/create.vue`）。首次断言后的截图已出现结果。定向复查改为等待具体搜索200及目标选项渲染，确认`vulnerable`可见且overlay为absolute。没有改产品代码或重复全站测试。
- 首次[收尾校验](./evidence/uat-099/closure.json)的“项目只能存在四个容器”断言失败：还存在9月4日成功退出的旧migrate容器，而非本轮执行了迁移。[只读观察](./evidence/uat-099/historical-migration-observation.json)确认其创建/结束时间均早于本轮，未重启或删除。最终校验改为四个预期运行服务加原退出容器保持；原收尾FAIL及其[当时manifest](./evidence/uat-099/manifest.json)保留，最终结果以delivery-validation为准。
- [工作台截图](./evidence/uat-099/learner-create-1440.png)已人工查看：品牌、工具台及两个模型可见，词条浮层不占文流。本次仅确认基础渲染，不声称重新完成设计逐项像素验收。

## 私有备份与清理

私有目录：`/var/folders/z9/99ckxr957v901zwwc8jdk8640000gn/T/wordweave-uat-099-hifxxi`，权限0700；其中运行快照、内部摘要、环境文件、custom数据库备份、应用恢复override均0600，不进入仓库。已验证备份目录可读与同期数据一致，未进行完整恢复演练。目录与旧镜像保留；这是临时路径，不替代长期备份策略。

一次性只读verify容器均由`--rm`移除；浏览器上下文已关闭，新增会话已注销；UAT四服务继续运行。无用户业务数据删除，旧后端容器由正常替换移除，原应用镜像/配置仍可追溯。

## 真实模型边界与下一步

原DeepSeek及GPT-oss仍启用，basic学习者可选择两者；访客目前无可选模型（`no_models`），是088以来保留的组配置，并非本次新故障。本轮不擅自给访客分配付费调用权限。检查读取现有配置，不将其称为v3模型质量通过。

**NOT VERIFIED**：`m001-v3` / `m001-v3-wn31-r1`下真实短文、词形映射、释义、短语、标签、供应商耗时及成本。旧088/090真实样本和QA098合成证据不能替代此项。0次chat、0次真实探针、0次重试/fallback。

建议后续单独确认最小预算：GPT-oss使用用户两组五词各生成1次，共2次真实调用；沿090的中文讨论中篇、英文新闻长篇，以便直接比较。客户端观察上限300秒，不改服务策略；不自动probe/重试/换模型，失败也计入两次预算。若必须追加探针或重新配置，停止另行说明，不隐式增加调用。有效内容及映射原件脱敏暂存供用户看，失败原文也保留；新有效资料是否保存到专用测试账号应列入下一授权。

按`agt-verify-milestone`交付到此停止awaiting_user_review。控制面仍为099 active、deployment_started:false是尚未由守门器接收的历史索引；实际部署以本轮运行证据为准，建议接收时同步，QA不越权改state/agents/history。原UAT086功能接受保持，当前候选未获用户接受，CR-039仍open、release仍BLOCKED。

模型编排请求strong / gpt-5.6-sol / high；实际模型与token usage不可观测，没有换模宣称、额外模型会话或子代理。
