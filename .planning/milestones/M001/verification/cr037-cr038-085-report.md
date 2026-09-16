---
milestone: M001
stage: verification
role: quality/base
agent_name: qa-quinn
status: awaiting_user_review
date: 2026-09-07
verification_round: TRANSITION-M001-085
verdict: pass
functional_uat: ready_for_preparation_gate
release_readiness: blocked
---

# QA085 CR037/CR038 独立验证报告

## 结论

**PASS。CR037-03 与 CR038 的批准功能边界均已独立通过，CR037、CR038 可按连续授权记为 resolved。** 当前没有需返回 implementation 的产品发现；可以由主会话另办 086 UAT 准备门，但本任务未部署或改动 6001，也不替用户接受 UAT。

- CR037-03：错误当前密码真实返回 422；中英文安全错误位于当前 dialog 内，仅一份、清晰可见且原生 Chromium AX `ignored=false` / `role=alert`。字段保留，可直接改正；取消、Escape、关闭重开、新尝试、Enter 重试、焦点和成功状态均正确。
- 改密事务：失败时当前与其他会话均保留；成功时当前会话保留、其他会话撤销，旧密码拒绝、新密码可登录。成功响应为 204、0 字节、无 Content-Type、`Cache-Control: no-store`。
- CR038：固定后端经真实 Nginx 代理验证六类共享 no-content 消费者；401/403/400/422 负向行为及 no-store 未回归。批次/账号删除、注销、管理员 reset 只作用于本轮 tmpfs 合成数据。
- CR037-01/02：本轮重新以实际候选对批准原型逐类覆盖历史 125 项范围，并执行 Review/Library 返回、登录/注册、错误、语言、claim、管理员分流和共享注销文案关联回归。
- DEV084 两个 Linux Mock 像素失败不是实际设计偏离：本轮在同一个 Linux Chromium/context 内直接比较候选与批准原型，desktop 双方间距 `[20,20,16,24]`，mobile 双方 `[20,20,16,25]`。旧固定 `23px` oracle 与该平台真实批准原型不一致；没有归咎字体、放宽断言或用宿主结果覆盖 Linux。

## 输入、候选与独立环境

已读取 085 任务包、两份连续/独立批准、QA081 原始报告/覆盖、DEV083/084 原始交付与候选摘要、API v1.4、前端约定、批准原型/交互、产品能力与页面追踪。开发结果仅用于确认交付，不计作本轮通过。

- frontend：`sha256:fd251e7439aad8e058656e2751ed84f40715fec570a872da53542688a6dd6904`
- backend：`sha256:642ed57ad0ed6c8a13e4bba1101d8b50188e8ea636791583a6ffb5eaa6917aac`
- 独立栈：`ww-qa-085`，`127.0.0.1:6101`，真实 Nginx→固定 frontend/backend，PostgreSQL `/var/lib/postgresql` 为 tmpfs。
- Linux 浏览器使用既存固定本地镜像 ID `sha256:caa6083aa787e4cfcaa661c73dd6244e4fa38d754dab0cc3b472156b277b0394`；有效运行没有使用新镜像。
- 外部 AI 为 0 次；仅隔离网络内的确定性合成 provider。未读取历史真实密钥。

[基线](./evidence/cr037-cr038-085/baseline.json)、[环境](./evidence/cr037-cr038-085/environment.json)、[最终结果索引](./evidence/cr037-cr038-085/result-summary.json)。基线与清理确认指定候选源、设计、API、开发证据、state/agents/project/model lock 未漂移。

## 有效执行结果

结果文件存在交叉覆盖，**不相加为独立需求总数**。带原始失败的文件只取未受错误方法影响的检查，并与单独修正文件一起解释；详见[首次失败索引](./evidence/cr037-cr038-085/first-failures.json)。

| 执行 | 原始计数 | 有效结论 |
| --- | ---: | --- |
| [Chromium 改密](./evidence/cr037-cr038-085/password-chromium-darwin-results.json) | 62 / 0 / 0 | 中英、390/1440、422/dialog/字段/焦点/AX/会话/成功头全部 PASS |
| [Linux WebKit 改密](./evidence/cr037-cr038-085/password-webkit-linux-results.json) | 56 / 0 / 0 | 同一功能矩阵 PASS；响应空体由代理 API 独立读取 |
| [macOS 原生 WebKit 有效复验](./evidence/cr037-cr038-085/password-wk3_20260907z-results.json) | 56 / 0 / 0 | 唯一合成账号完整流程 PASS；这不等于 Safari 真机认证 |
| [真实代理 no-content 首轮](./evidence/cr037-cr038-085/no-content-proxy-results.json) | 63 / 5 / 0 | 五项仅来自 batch DELETE 请求缺 Content-Type；其他五类成功和全部负例有效 PASS |
| [batch DELETE 契约修正](./evidence/cr037-cr038-085/batch-delete-contract-recheck2-results.json) | 9 / 0 / 0 | 对同一保留 fixture 加批准的 JSON Content-Type 后 204/头/cascade/404 全 PASS |
| [关联认证回归](./evidence/cr037-cr038-085/auth-regression-chromium-darwin-results.json) | 110 / 0 / 1 | 110 项有效；唯一管理员 ERROR 为误用学习者密码 |
| [管理员分流修正](./evidence/cr037-cr038-085/admin-role-recheck-results.json) | 2 / 0 / 0 | 使用独立管理员凭据后角色优先与页面 ready PASS |
| [QA081 原范围 Chromium](./evidence/cr037-cr038-085/original-scope-chromium-darwin-scope-results.json) | 63 / 0 / 0 | 候选对批准原型的认证/copy/共享消费者/会话范围 PASS |
| [QA081 原范围 Linux WebKit](./evidence/cr037-cr038-085/original-scope-webkit-linux-scope-results.json) | 63 / 0 / 0 | 同一语义范围在 Linux WebKit PASS |
| [Linux 同平台几何](./evidence/cr037-cr038-085/linux-geometry-comparison-recheck.json) | 10 / 0 / 0 | 候选与批准原型精确相等；字体均 loaded、UA/platform 相同 |

## QA081 原始 125 项范围的本轮覆盖

历史计数的组成不是新 oracle；本轮按语义逐类覆盖，避免只引用旧 PASS：

| QA081 原始类别 | 历史数量 | QA085 有效覆盖 |
| --- | ---: | --- |
| login/register：text、标题前、首元素、role、style、安全 return；双引擎×中英×390/1440 | 96 | original-scope 两份各 48；实际候选与批准原型同 context 比较 |
| 本人改密：title、labels、helpers、notice、buttons；双引擎×390/1440 | 20 | original-scope 两份各 10；另由 password 三引擎矩阵验证动态错误/行为 |
| 专用学习者认证 | 2 | original-scope 的两个真实注册认证会话；auth-regression 另以真实登录覆盖返回目标 |
| account locale 保留 | 2 | original-scope 两引擎各 1，另有双语 password/context 验证 |
| 本会话 logout | 2 | original-scope 两引擎各 1，均同时断言 204/0字节/无CT/no-store；代理矩阵再覆盖 |
| 源/工作流不变、UAT 不变、无浏览器运行错误 | 3 | cleanup 指定哈希与 UAT 前后身份；两份 original-scope pageErrors 均空 |

两份 63 项文件各增加了共享账号删除本人确认 helper，对应 QA081 扩展覆盖；因此不能把本轮 `63+63` 机械称为“复跑 125”。

## CR037-03：错误可见性、操作与安全

真实 PUT `/api/v1/me/password` 错当前密码为 422，页面只渲染安全本地化文本 `Check the information you entered.` / `请检查填写内容。`，不回显密码或原始 Problem。错误节点在 `dialog:modal` 内，页面后方没有第二份错误。Chromium CDP 原生 AX 节点 `ignored=false`、角色 `alert`；不是用 DOM 存在、Axe 或 ariaSnapshot 替代平台树证明。

浏览器矩阵保留失败字段；Escape 后触发焦点恢复，重开字段/错误清空；新一次错误与修正后的 Enter 提交均工作。成功后 dialog 关闭、错误消失、焦点回到 Change password。390/1440 的中英文截图均验证 error、三个字段、notice 和 footer 无重叠/裁切。

qa-quinn 已用 `view_image` 实际查看英文 390、中文 390/1440及 Linux dialog 对照，不是仅保存文件；结论见[人工视觉记录](./evidence/cr037-cr038-085/manual-visual-review.json)。

## CR038：六类成功与负向矩阵

通过真实 QA Nginx 代理检查：退出登录、本人改密、丢弃 generation、删除学习批次、管理员重置密码、删除本人账号。六类最终均为 204、body 0、无 Content-Type、`Cache-Control: no-store`；批次删除同时验证 review-session cascade 与之后 GET 404。不可恢复动作只作用隔离 tmpfs 的合成账号/批次/会话。

负向矩阵保留既有业务语义：未认证 401、缺 CSRF 403、非法 JSON shape 400、错误当前密码 422；均是安全 Problem code/no-store，未回显测试密码或 provider key。batch 首轮 400 是 QA 请求违反 API 全局 JSON 写头约定，且数据库行仍在；以同一行正确重试证明产品成功路径，不将 400 静默算 PASS。

## DEV084 Linux 旧失败的独立判断

DEV084 的 `120 PASS / 2 FAIL` 原始结果、首失败、trace 和截图继续保留。本轮没有修改其文件或把 host PASS 当 Linux PASS。独立重建后，actual/design 在相同 Linux Chromium 151、同 context、同 DPR、字体均 `loaded`：desktop 两边均 `[20,20,16,24]`，mobile 两边均 `[20,20,16,25]`。因此可重复因果是旧测试以固定 `23px` 比较，而批准原型在该平台取整为 24/25；产品与原型没有差值。截图人工查看也未发现 dialog 内部结构偏离。

## 首次失败、修正与过程偏差

所有原始文件未删除或改写：[完整归因](./evidence/cr037-cr038-085/first-failures.json)。包括 macOS WebKit `Response.body()` 协议限制、截断用户名碰撞、batch DELETE 缺请求 Content-Type、两次 SQL 表/列猜测、管理员误用学习者密码、Linux 几何 UI 登录 origin 方法错误。

另有一次 QA 过程偏差：命令误写不存在的 Playwright tag，Docker 开始解析/pull 后被立即中断；没有安装该 tag，也没有用它测试。后续全部 Linux 有效运行只使用基线已存在的固定 image ID。此偏差在[过程记录](./evidence/cr037-cr038-085/process-deviations.json)和[清理检查](./evidence/cr037-cr038-085/cleanup.json)如实保留，不影响产品候选身份。

## 清理、UAT 与未验证边界

[清理](./evidence/cr037-cr038-085/cleanup.json)八项检查全 true：本轮五容器、两网络已精确移除，6101 释放；19 个合成账号、34 个会话、2 个 generation run、1 个合成 credential、1 个合成 model 所在 tmpfs 已销毁且不可恢复，脚本和证据保留。候选镜像保留。UAT6001四容器 ID/镜像/创建/启动时间测试前后完全一致，6010仍为200；未改UAT密码、数据或配置。

当前 macOS Playwright WebKit 功能流有效复验通过，但不声明真实 Safari 设备/VoiceOver认证。未做全站视觉、压力、Lighthouse、公网或真实AI质量测试。确定性 provider/claim fixture对应 API-006 访客承接，只证明 HTTP→DTO/mapper→state→页面承接，不能证明真实AI或服务端claim事务。真实AI仍 NOT VERIFIED，发布门继续 BLOCKED。

UAT086只负责配套部署/冒烟，硬约束是不修改任何现有UAT密码；报告中的改密人工流程仅是用户可选择、使用其明确授权专用账号自行执行的验收项，不授权QA代为修改。

实际模型/usage运行时回执均未观察到：`actual_model=not_observed`，`usage=not_observed`。
