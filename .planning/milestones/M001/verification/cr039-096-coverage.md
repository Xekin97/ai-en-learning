---
milestone: M001
stage: verification
role: quality/base
agent_name: qa-quinn
date: 2026-09-08
status: awaiting_user_review
verdict: fail_QA096_01
---

# QA096 定向覆盖矩阵

范围来自 [096](../reviews/implementation-cr039-096-verification-approval.md)，结果依据实际候选 HTTP/DB 观察，不用开发单测 PASS 替代独立结果。完整方法偏差见 [报告](./cr039-096-report.md)。

| 组 | CAP / API / DATA / PAGE | 独立结果与证据 |
| --- | --- | --- |
| L01 重启保存 | QA094-01 当前版本部分；CAP-010；API-006；DATA-009/011/012；PAGE-004 | PASS；两次实际重启、payload/期限/摘要不变、201→200 同一批次、一次计量，api-results |
| L02 主体和令牌 | CAP-010；API-006；DATA-009/011/012 | PASS；错误主体、缺失/畸形/篡改/跨 run token，首次保存及草稿删除后均拒绝且不改数据 |
| L03 关联学习 | CAP-012/013/014/016/018/019；API-007/008；DATA-012–016；PAGE-005/006/008 | PASS（普通批次）；精确详情、词条搜索、他人拒绝、原词拼写、全部 hint/正文挖空、实际词形作答、结果幂等、删除后不恢复 |
| L04 放弃 | CAP-010；API-006；DATA-009/011 | PASS；重启后放弃、再次重启重复放弃，不可保存，生成计量保留 |
| L05 草稿/终态过期 | CAP-010；API-006；DATA-009/011 | PASS；合成 DB 时间边界下 410；不产生批次 |
| L06 并发保存/放弃 | CAP-010；API-006；DATA-011/012 | PASS；8 个并发保存恰一 201、七 200；4 轮保存/放弃均只有一个合法处置，无半批次 |
| L07/L07R 失败/取消 | CAP-008/009/010；API-005/006；DATA-009/011 | PASS（本轮抽样）；校验失败退款无资源、上游 503 退款无资源、活动生成不可保存、主动取消不可保存且保留计量 |
| L08/L08R 访客承接 | CAP-011/014/018/019；API-006/007/008；DATA-009/012–015/017；PAGE-002/004/006/008 | PASS；重启创建与消费 claim、重启后重复消费、错误访客/token/账号拒绝、访客直存 401、一次计量、两阶段复习 |
| L09/L09R claim 边界 | CAP-011；API-006；DATA-011/017 | PASS；claim 有效而草稿过期为 410、claim 自身过期为 410、放弃后不可消费 |
| L10 claim 并发 | CAP-011；API-006；DATA-009/012/017 | PASS（并发）；6 个同账号消费只有一批次；两个账号抢同 claim 只有首个成功 |
| L10/L14 承接批次删除 | CAP-011/016；API-006/007；DATA-012/013/015/017；PAGE-005/006 | **FAIL / QA096-01**；两个正常新批次删除 500，数据仍可读取，同镜像重启不解决 |
| L11 日志边界 | API 公共错误/隐私约定 | PASS（采样）；已采样令牌及合成 API key 未出现在应用日志；无候选映射字段泄漏 |
| L12 锁竞争 | CAP-010/011；API-006；DATA-011/012/017 | PASS；延迟 INSERT 控制场景以及两轮消费/放弃竞争无 500、无重复批次；concurrency-results |
| L13 实际清理 | DATA-009/011；当前生命周期 | PASS；启动清理跳过被锁 run，释放锁再次启动后移除过期草稿并 abandoned |
| 环境保护 | 096 写入边界 | PASS；3955 项保护文件无变化，UAT 四容器 ID/镜像/启动时间不变；closure |

## 复用与未执行项

- QA094 未受修改影响的词级派生映射/输入词库边界/Unicode/严格 DTO/前端浏览器/视觉证据继续引用 [QA094 覆盖](./cr039-094-coverage.md)，不重跑全站或完整 C39 矩阵。本文不重新判其为本轮独立 PASS。
- server_failed/stream_failed 等全部状态组合、令牌 fuzz、全部单元/race/lint/build 沿用 [095 开发证据](../implementation/backend-cr039-095-validation.md)，本轮没有逐一独立重跑。所执行活动/取消/上游/校验失败是风险抽样，不能声称穷尽全部故障组合。
- C39-15 及所有旧版草稿/批次/API/镜像兼容为 **OUT OF SCOPE / USER-COMPAT-001**，不是 PASS。
- 真正模型造文质量、性能预算、浏览器全矩阵、UAT 部署与发布均 **NOT EXECUTED 本轮**；合成流耗时不能代表真实模型响应时长。

## 原始结果解释

[api-results](./evidence/cr039-096/api-results.json) 109 PASS / 2 FAIL / 1 ERROR，其中两项 FAIL 是已纠正的响应形式/状态码预期，ERROR 是已纠正的过期夹具约束；原件保留。[supplement-results](./evidence/cr039-096/supplement-results.json) 20 PASS / 1 FAIL / 0 ERROR，唯一产品问题为承接批次删除。[concurrency-results](./evidence/cr039-096/concurrency-results.json) 19 PASS / 0 FAIL / 0 ERROR。[delete-claim-results](./evidence/cr039-096/delete-claim-results.json) 5 PASS / 3 FAIL / 0 ERROR，三项均为同一 QA096-01 的删除/仍可读/重启重试观察。不同重复断言不累加为独立需求通过数。
