---
milestone: M001
stage: verification
role: quality/base
agent_name: qa-quinn
status: awaiting_user_review
date: 2026-09-08
verification_round: TRANSITION-M001-098
verdict: pass_scoped_QA096_01_resolved
functional_uat: user_accepted_UAT086_unchanged
real_ai_quality: not_verified_under_v3
release_readiness: blocked
---

# QA098：删除修复独立定向复验通过

QA096-01 在候选097上独立复验通过，未发现本轮范围内的新产品缺陷。有效完整执行 **196 PASS / 0 FAIL / 0 ERROR**。这不是全站重测、真实模型质量通过、UAT部署完成或里程碑验收。

## 输入与候选

- [098独立验证授权](../reviews/implementation-cr039-098-verification-approval.md)、[主动删除保留例外](../reviews/claimed-batch-delete-retention-exception.md)、[首版不兼容决定](../reviews/first-release-compatibility-policy.md)。
- [097开发交付](../implementation/backend-cr039-097-validation.md)、[源码摘要](../implementation/evidence/cr039-097/source-manifest.json)、[原QA096报告](./cr039-096-report.md)、[原QA096-01](./cr039-096-findings.md)。
- API v1.4、prompt m001-v3、validator m001-v3-wn31-r1；CAP-011/016，API-006/007及关联008，DATA-012/013/015/017，PAGE-005/006。
- 唯一被测后端：`wordweave-backend:cr039-097`，`sha256:ab12e7dec0a6a8beb55df2ec6a8174d01d288681215c1108cec997e6f99f8eee`。
- 沿用前端镜像 `sha256:fd251e7439aad8e058656e2751ed84f40715fec570a872da53542688a6dd6904` 仅作为合成提供方/固定网关的Node运行时；没有启动前端应用或声称浏览器验证。

## 独立方法与结果

采用新建隔离网络、tmpfs PostgreSQL和实际候选镜像，后端使用受限的 wordweave_app / wordweave_ai 数据库角色。复用QA096的基础设施/HTTP客户端，不导入或重跑开发测试。通过真实HTTP完成注册、合成模型配置、SSE生成、承接、复习与删除；只在本轮一次性数据库设置行锁或时间夹具。

| 验收面 | 有效结果 |
| --- | --- |
| 自然承接→复习→删除 | 所有者DELETE 204/0字节；原claim、批次及六类关联数据消失；详情/搜索/新复习均不可恢复 |
| 权限/CSRF | 访客401、管理员403、其他学习者404、缺失/错误CSRF403、跨源403；拒绝前后数据无变化 |
| 重试/重启 | 再次DELETE404；原claim对原账号和其他账号均404；当前同镜像重启仍不能恢复 |
| 计量与无副作用 | 生成记录、charged/counted/credit及累计generation_count保留；删除/重试无新增合成推理；未删对照claim保持原批次 |
| 复习级联 | 已完成复习结果和单篇会话移除；非空日期会话保留，最后一篇删除后空会话移除 |
| 普通批次回归 | 普通学习者保存→删除204，生成计量保留，重启后不能重新保存 |
| 事务原子性 | 人为取消进入批次删除阶段的SQL，HTTP预期500；claim/批次/子资源完整回滚、原claim可重试；正常再删204 |
| 并发 | 2个确定性锁顺序及8轮自然并发通过；两次DELETE一204一404，claim为原批次200或404，无部分提交/恢复 |
| 保留/清理 | 未删consumed claim在23h59m保留，25h清理；真实启动清理跳过锁定过期claim，解锁后清除但不删批次；主动删除例外及active 30分钟期限通过 |

自然删除观测4ms，仅是本地合成单次观测，不是性能SLA或生产压测结论。时间保留测试采用一致的合成时间戳，不是24小时实际浸泡。

[覆盖与断言对应](./cr039-098-coverage.md)、[完整有效结果/锁观察](./evidence/cr039-098/api-results.json)、[结果摘要](./evidence/cr039-098/result-summary.json)、[缺陷复验结论](./cr039-098-findings.md)。

## 测试方法偏差（原件保留）

1. 初次环境启动时，pg_isready通过了PostgreSQL临时初始化进程的Unix socket检测，但最终TCP尚未监听；migrate收到connection refused。改为TCP readiness，并在标签、空schema、保护摘要均确认后从迁移前恢复；未重复创建或覆盖基线。
2. 首次DELETE客户端没有JSON body/Content-Type，公共入口校验正确返回400。产生42 PASS / 17 FAIL / 1 ERROR，后续“未删除”及锁超时为该方法偏差的连带结果，不代表候选删除执行失败。修正客户端为既有应用约定的JSON请求，未修改服务器或降低状态码预期。
3. 恢复同一个合成数据库时，重复创建同一模型，以及用公开DTO字段名查询存储列，各造成一次初始化ERROR（两次均0业务断言、无推理）。更正为复用本轮模型与schema中的provider_model_id。
4. 有效运行使用新注册的owner4/other4及新访客。初次运行生成的4篇临时资料一直保留到整套QA环境清理，未为通过而手工修改产品数据。完整范围重跑后196项通过。

[偏差明细](./evidence/cr039-098/harness-deviations.json)、[初次结果](./evidence/cr039-098/api-results-initial.json)、[模型重复](./evidence/cr039-098/api-results-setup-collision.json)、[列名错误](./evidence/cr039-098/api-results-setup-column.json)、[初次setup](./evidence/cr039-098/setup-initial.mjs)、[初次suite](./evidence/cr039-098/suite-initial.mjs)均保留。有效运行的1次500是明确注入DB取消以验证回滚，不是残余产品500。重跑仅本次定向范围，没有开发unit/lint/build或全站覆盖。

## 环境、数据与AI边界

- 本轮共23次chat：21次合成生成（首轮4次、有效轮17次）+2次合成启用探针；6次合成模型目录读取。均指向内网固定合成提供方，真实供应商调用0，无费用性真实调用或真实配置变化。
- 合成账号9个、generation run 21个，收尾active run 0；余下4批次/3claim为初次方法偏差的残留合成资料，随一次性tmpfs数据库清除。冻结词库13860条，仅由原迁移初始化。
- [清理记录](./evidence/cr039-098/closure.json)：移除仅带本轮标签的4容器、2网络及临时数据；场景可由脚本重建，原始临时内容未备份。候选镜像与证据保留，未删除任何已有用户资料。
- 4021项保护文件摘要不变；UAT四容器ID、镜像、启动时间一致。开发097与QA096原始证据、生产源码、上游规划、workflow/registry/history均未修改；汇总索引的历史正文另校验保留。
- 应用stdout日志未出现本轮生成/claim凭证或合成API key；此为本轮应用日志观察，不是全面日志安全审计。

[环境](./evidence/cr039-098/environment.json)、[提供方调用](./evidence/cr039-098/provider-final.json)、[完整性检查](./evidence/cr039-098/self-check.json)、[证据SHA-256](./evidence/cr039-098/manifest.json)。

## 结论、限制与下一步

- QA096-01：**resolved_in_independent_verification**；历史FAIL原件保留。QA094-01当前版本已通过结论沿用，不重开；旧版兼容按USER-COMPAT-001退出范围，不记为PASS。
- 本轮无新产品/设计/技术待决，无实现返工建议。CR-039控制面仍open，交守门器接收本次结果；质量角色不直接关变更或切阶段。
- 原UAT086功能接受继续有效，但候选097尚未部署至UAT。推荐下一步单次交接至UAT准备：保留原数据和配置，仅部署已验证候选并做受影响链路冒烟。
- v3下DeepSeek/GPT-oss的真实造文自然度、释义、短语、标签、时延和供应商成本仍NOT VERIFIED。UAT质量专项需明确样本与调用预算后执行，不重跑已接受全站功能，不自动真实probe/重试/fallback。[定向人工清单](./cr039-098-uat.md)。
- 未覆盖浏览器视觉/响应式/a11y、真机、压力/生产性能、跨版本兼容或真实模型。未使用其历史PASS来扩大本轮结论；未发布、未代用户接受里程碑。

按agt-verify-milestone提交专业交接后停止，状态建议awaiting_user_review；正式workflow保持verification / qa-quinn / active。模型路由请求strong / gpt-5.6-sol / high，actual_model/usage未观测；没有声称当前会话换模或启动子代理。
