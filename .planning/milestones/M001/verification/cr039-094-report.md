---
milestone: M001
stage: verification
role: quality/base
agent_name: qa-quinn
status: awaiting_user_review
date: 2026-09-07
verification_round: TRANSITION-M001-094
verdict: fail
blocking_findings: [QA094-01]
change_request: CR-039
prompt_version: m001-v3
validator_version: m001-v3-wn31-r1
real_model_calls: 0
uat_deployed: false
---

# CR-039 独立定向测试：FAIL，1 项阻塞

## 结论

**词形映射、重复定位和当前进程内生成→保存→复习链路通过定向测试；整体未通过。** 已批准 C39-15 的未保存草稿跨版本兼容不成立：v2→v3 与 v3→v2 保存均返回 404。同一个 v3 镜像仅重启进程，也会让仍在有效期内的已验证草稿无法保存。已保存批次的新旧镜像读取和复习正常。

问题详见 [QA094-01](./cr039-094-findings.md)。建议有限返回 implementation / backend-ethan 处理，不重开无关产品或 UI；涉及旧镜像能力的回滚策略若需调整，应交技术负责人确认，不能由 QA 删除验收条件。

本报告不是新 UAT 交付、真实模型造文质量通过或发布批准。既有 UAT086 功能接受保留，CR-039 保持 open。本角色不修改 workflow/registry、不自动返工或切阶段。

## 输入与方法

- [094 验证授权](../reviews/implementation-cr039-verification-approval.md)、[093 技术批准](../reviews/technical-cr039-implementation-approval.md)、[CR-039 方案 §11](../technical/backend-cr039.md)、[CR 原件](../changes/CR-039.md)、[开发报告](../implementation/backend-cr039-validation.md)、[实现交接](../handoffs/backend-implementation.md)。上游 proposed 是已由 093 批准的提交快照，不另改原稿。
- 依据 CAP-006/007/008/009/010/011/014/018/019，PAGE-004/005/006/008，API-004–008/101/102 与 DATA-001/002/006/009–015/017；UI 仅检查受影响题面，遵循设计 interactions 的全部挖空、匿名分组及逐空作答约定。
- 使用独立黑盒 HTTP、真实后端镜像、临时 PostgreSQL、真实 Nginx/Nuxt 和 Chromium；合成供应商通过模型正常适配链路返回可控 SSE，没有 mock 产品 HTTP 接口。
- [18 项覆盖矩阵](./cr039-094-coverage.md)逐项区分独立测试、已接收开发证据与未测边界。没有机械复跑 go test、lint、typecheck、构建或全站 UI 矩阵。

## 候选与隔离

| 项目 | 值 |
| --- | --- |
| 新后端 | `sha256:557782d0cfb1d551d3897abbbe22f74c369e4f309e58c202b54c7137f9e03a5e` |
| 实际旧后端镜像 | `sha256:642ed57ad0ed6c8a13e4bba1101d8b50188e8ea636791583a6ffb5eaa6917aac` |
| 原前端 | `sha256:fd251e7439aad8e058656e2751ed84f40715fec570a872da53542688a6dd6904` |
| PostgreSQL | `postgres@sha256:1c59e2c3c818eaa0f0628f695b36e7c9e362d6b219b36a54a32df645cbd7e1af`，18.6 |
| 测试入口 | 6194；6195 为本地替身控制入口，6196 为隔离旧后端入口；结束后均移除 |
| 网络 | 后端、旧后端、数据库、替身仅接 Docker internal 网络；只有 Nginx 与固定目的地测试入口连接 host ingress |
| 模型调用 | **0 次真实 AI**；44 次合成 chat 请求（包含 1 次合成兼容性探针及捕获工具重测），2 次合成 catalog 请求；不是供应商费用/用量 |

临时凭证是脚本内明确标识的合成字符串，不读取现有 OpenRouter key。正常启动及重启均无自动模型请求。UAT 的容器身份、镜像与启动时间一致；源码、冻结词库、批准设计/技术、workflow/registry 摘要不变。[环境](./evidence/cr039-094/environment.json)、[保护与清理证据](./evidence/cr039-094/closure.json)、[文件摘要](./evidence/cr039-094/manifest.json)。

## 核心结果

1. **原故障回归**：逐字使用 AQ090-S2 已观测正文，仅由 QA 合成标签、释义、提示和候选映射，得到 validated 并保存。`vulnerable→vulnerability` 成立；`sustainable` 漏列的 `sustainability` 也被补扫。[带来源说明的候选](./evidence/cr039-094/reconstructed-s2.json)。这不是恢复未观测的原始 metadata，更不是重新调用 GPT-oss 得到的内容。
2. **输入边界**：仅在新建测试库把词表缩到 `vulnerable` 一项，`vulnerability` 作为用户输入在调用前 422；作为生成表面形式则与 `vulnerabilities` 正常验证。任意普通正文词不触发词表限制。之后恢复同一临时库全部 13,860 行；磁盘冻结词库未改。
3. **关系与位置**：原词、learn/learnt、agree/agreed、die/dying、prefer/preferred、coup d'etat/coups d'etat 通过；banana、study 同义替代、vulnerabled、readed、childs、agreeed、prefered 与无资源关系的 vulnerableness 被拒绝。大小写冗余去重、漏列已知形式补齐、emoji/İ/组合标记/数字及词内边界正确；offset 可按原文 code point 子串复算。
4. **严格失败与结算**：缺失/空/null/错误类型/null item/未知字段/伪装字段/129 项/重复 JSON key/尾随对象、声明不存在、正确声明夹带错误、跨目标 span 碰撞均失败且无草稿、不累计、产品额度返还、不可保存。正文交错顺序允许，metadata 相对输入乱序拒绝。主动取消计数不退款，被动断线退款，均无迟到成功或隐式重试。
5. **保存和复习**：同进程重复保存得到同批次，访客承接重复消费不重调模型；短语全部挖空只回答原词，正文按各处实际词形作答；同目标多形态共组，不同目标不同组；错误只返回空标识，重试分组稳定；答对后成功，重复 action 不重复结算。
6. **真实浏览器链路**：通过造文台正常选词和四项配置，v3 SSE 被原前端 strict decoder 接收并渲染；保存、SSR 批次详情、两阶段复习、错误重试和完成总结全部走真实接口。7 个短文空分成 2 组，390/1440 下几何检查无输入框相交。10 项浏览器断言 PASS，无页面运行时错误。[结果](./evidence/cr039-094/browser-results.json)、[手机截图](./evidence/cr039-094/cloze-390.png)、[桌面截图](./evidence/cr039-094/cloze-1440.png)、[完成页](./evidence/cr039-094/cloze-completed.png)。已人工检查手机截图。
7. **草稿兼容 FAIL**：三组实际进程证据详见问题单；已保存 v2/v3 批次反向读取与复习 PASS。开发“旧源码读取快照”的证据不能代替真实进程的草稿鉴权生命周期。
8. **观测边界**：schema 在真实适配请求中带两个必填数组，公开目标 DTO 仍为原五字段；题面未新增答案字段；受控日志仅固定原因和目标序号，无候选数组、测试正文、映射字符串或合成密钥。16,001 词大样本为 152,014 字符，代理 HTTP 全链路单次约 40 ms；这含快速替身与本机网络，不是纯校验耗时、p95 或真实 AI 延迟。

## 测试自身修正（保留原始结果，不掩盖失败）

原始 [API 结果](./evidence/cr039-094/api-results.json)为 157 PASS / 5 FAIL / 1 ERROR；[补测](./evidence/cr039-094/supplement-results.json)为 39 / 3 / 0；[浏览器](./evidence/cr039-094/browser-results.json)为 10 / 0 / 0；[重启](./evidence/cr039-094/restart-results.json)为 5 / 1 / 0。**不把重叠断言累加成覆盖率或多个产品缺陷。**

- 初始 metadata 乱序夹具同时改变了请求 entries 顺序，产品合法通过；三条衍生 FAIL 属 QA oracle 错误。固定请求 entries 后定向补测拒绝、退款和不可保存均 PASS。
- 初始大样本文末有空格，触发既有规范化限制；仅去掉该夹具尾空格后 PASS，未改变生产校验器。
- 取消原始断言误把公共状态 `cancelled` 用于数据库；观测到的内部 `user_cancelled`、charged=true、counted=true、drafts=0 正确。由 schema/观测校正测试判断，不修改原始结果，也不重调一次冒充新证据。
- API suite 的后续 ERROR 是草稿跨版本 404 后仍尝试复习空 batch_id；补测拆分了这个控制流，保留真实兼容 FAIL，并补齐其他测试。
- Docker internal 网络首次无法发布本机端口；重建仅临时 QA Nginx 的 ingress 连接后恢复。首次浏览器读取已关闭的 SSE body 时 Chromium 丢弃捕获体；改为观察真实渲染和正常保存后的不可变 DTO，重测通过。对应错误原件保留，不列为产品缺陷。

## 尚未验证与下一步

- **真实模型 v3 结构兼容、自然度、释义/词性、搭配、提示质量、标签、实际响应时间和 usage/cost 未验证**。不能把合成样本 validated 当成 GPT-oss/DeepSeek 质量通过。
- WordNet 构建器伪造词位指针、损坏嵌入资产启动失败等底层检查接收已提交开发证据，未复制其单测；这轮独立运行正常离线镜像并验证可观察拒绝行为。不是穷尽英语派生关系或完整资源再认证。
- 未做全模型×三语言×四场景×四长度、真机 Safari、全站视觉/性能/无障碍回归或实际 UAT 部署排空切换。当前 Chromium 两宽度检查仅覆盖新增词形的既有 UI 链路。
- 专业建议：先处理 QA094-01，再仅重测受影响草稿/保存/兼容安全边界。之后以独立预算做用户两组词的真实模型造文质量复测，客户端容纳 1–2 分钟生成（300 秒窗口），不重跑全站。
- 按 agt-verify-milestone，提交本报告和交接后停止，待用户审阅。前端无需因本次缺陷重新实现；没有自动修改代码、部署或补充模型调用。
