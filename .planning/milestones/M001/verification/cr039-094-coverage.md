---
milestone: M001
role: quality/base
agent_name: qa-quinn
date: 2026-09-07
verdict: fail
---

# CR-039 / QA094 定向覆盖矩阵

来源：[批准方案 C39-01–18](../technical/backend-cr039.md)、[094 授权](../reviews/implementation-cr039-verification-approval.md)。A=[原始 API](./evidence/cr039-094/api-results.json)，S=[补测](./evidence/cr039-094/supplement-results.json)，B=[浏览器](./evidence/cr039-094/browser-results.json)，R=[重启](./evidence/cr039-094/restart-results.json)，D=[开发原件](../implementation/backend-cr039-validation.md)。每项只覆盖列出的样本，不把开发证据标为独立执行。

| 验收 | 追踪 | 本轮证据与结论 |
| --- | --- | --- |
| C39-01 | CAP-006/007；API-004/005；DATA-001/002 | PASS：独立单词表测试库，派生词输入 422/零调用；恢复 13,860 条，磁盘词库未改。A/closure |
| C39-02 | CAP-008/009；API-005 | PASS：未知普通词 Quazzleflorp 不阻塞合法目标。A |
| C39-03 | CAP-008/009；API-005 | PASS：仅 vulnerable 作为输入词表成员；vulnerability/vulnerabilities 验证和复习正常。A |
| C39-04 | CAP-008/018/019；API-005/008 | PASS（定向）：原词、learnt、agreed、dying、preferred、coups d'etat；learned/learning 重复提示由真实适配器合成探针覆盖。A/S |
| C39-05 | CAP-009；API-005 | PASS：无关、同义替代、伪屈折和未知派生分别拒绝，退款、无草稿。A |
| C39-06 | CAP-009；内部资源 | 部分独立覆盖：learn→study 不放行；伪词位指针、非目标 synset、多跳图构建细节接收 D 的专门断言，不重复开发单测，不宣称本轮完整独立穷举。 |
| C39-07 | CAP-009；API-005/101 | PASS：缺失/空/null/类型/多余字段/大小写伪装/129 项/重复 key/尾随对象拒绝；实际 provider schema 为严格必填数组。A/S |
| C39-08 | CAP-009/018/019；DATA-013 | PASS：大小写去重，提示/正文全量已知形式补扫，S2 sustainability 漏列仍记录全部位置。A |
| C39-09 | CAP-009；API-005/006 | PASS：声明只在提示或夹带错误声明均失败，补扫不洗掉坏声明。A |
| C39-10 | CAP-009/019；API-005/008 | PASS：十词逆序正文允许；固定输入而 metadata 乱序拒绝；learn/learning 跨目标碰撞拒绝，浏览器两组交错正确。A/S/B |
| C39-11 | CAP-009；DATA-013 | PASS：emoji 代理对分块、İ、组合标记、数字/词内边界、多词项；按原文 code point 复算。A |
| C39-12 | CAP-008/009；API-005 | PASS（定向）：确定性不齐块 SSE/JSON/emoji 完全拼回正文，畸形最终字段不可保存，浏览器正常接收；不是随机种子穷举。A/B；D 有随机切块证据 |
| C39-13 | CAP-008/009；DATA-009/010/011 | PASS：失败退款不累计，主动取消内部 user_cancelled 计数不退款，被动断线退款，无草稿/隐式重试。A/S；迟到内部 CAS 专门竞态接收 D |
| C39-14 | CAP-010/011/014/018/019；API-006/007/008；PAGE-004/006/008 | PASS：真实保存/承接幂等，原词与实际表面答案区分，全部提示/正文空、安全组与重试稳定、完整复习。A/S/B |
| C39-15 | CAP-010/018/019；API-006/007/008；DATA-011/012/013 | **FAIL / QA094-01**：跨 v2/v3 或同镜像重启未保存草稿 404；已保存批次反向读取/复习 PASS。A/S/R |
| C39-16 | CAP-008/009；API-101 | PASS（运行边界）：正常离线资产启动、无自动调用、一次合成探针、新旧资产镜像可运行。损坏/缺失嵌入资产失败接收 D；未重造损坏镜像。environment/S/R |
| C39-17 | CAP-009/018/019；API-005/007/008；PAGE-004/006/008 | PASS（定向）：原前端真实 strict decoder、SSR、题面投影/安全日志；未改变 DTO，无新增映射/proof/答案字段。A/S/B |
| C39-18 | CAP-008/009；API-005 | PASS（确定性样本）：用户十词、AQ090 S2 正文+明确合成 metadata、未知映射拒绝、16,001 词样本；真实模型质量仍 NOT VERIFIED。A/S |

不适用本轮重复全站 UI、管理员列表/文案、全配置模型矩阵、全量浏览器平台/无障碍或生产容量验证。唯一已确认产品阻塞是 QA094-01；矩阵中的开发证据/未测边界不被隐藏或外推为全覆盖。
