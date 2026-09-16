---
milestone: M001
stage: implementation
role: backend-implementer/base
agent_name: backend-ethan
date: 2026-09-09
status: developer_checks_pass
---

# 当前有限诊断：身份和模型绑定

确认：[113用户许可](../verification/stream-failure-diagnosis.md#当前批准测试身份与模型绑定113)。仅本地UAT同测试身份/模型，最多下一份已结算内容校验失败，一小时、私有tmpfs和读取后清理。真实模型调用0，不修改prompt/validator、API/DB/额度/前端，不做旧版兼容。

单工作区顺序执行，不提交/重置、不派子代理或worktree。只修改failure_capture接口及uat实现/测试、generationStream传入服务端已解析身份、README；生成协议与校验源码不变。实际模型/usage未观测。

票据为expires_at/model_id/subject_hash；身份摘要使用固定用途前缀、kind和UUID，不存入样本/日志。不再接受旧票据字段，不以词组、场景、语言、长度过滤。输出增加白名单生成配置供离线重放，保留完整候选。绑定源为用户最近失败run，部署只读解析，不打印身份或密钥。

开发检查：[developer-113.json](./evidence/failure-capture/developer-113.json)。48种配置组合与隔离/权限/期限/单份race检查通过；7个隔离真实HTTP/模拟提供方场景通过；普通构建关联包race（缓存命中）、vet、build通过，普通构建排除uat实现。专用镜像b1e8de6a已构建。测试库仅tmpfs合成数据，无外部网络/模型。

交qa-quinn做不同方法的访客身份及离线重放核查，再按已授权范围部署6001后端。旧交付与源码完整保留于[快照](./evidence/failure-capture/pre-subject-scope.json)，旧developer.json/QA/部署及两次漏抓证据不改。
