# QA 职责与结论定向纠正 — CORRECTION-M003-084

用户：“漏判算作是模型问题，QA 角色不做文章质量测试”。决策 `USER-QA-MODEL-QUALITY-BOUNDARY-20261012` 已落实为项目级 [QA 职责规则](../../../agt/qa-scope-policy.md)，覆盖旧验收中与之冲突的职责分配。

这是用户直接批准的职责纠正，不是新的阶段门禁或用户 UAT 接受。[083 检查](cr306-qa-submission-gate-083.md) 保持历史原件，其内容质量阻塞结论由本决定替代。

qa-quinn 已按相同实际证据更新 [报告](../verification/report.md)、[覆盖矩阵](../verification/coverage-matrix.md)、[交接](../handoffs/verification.md) 与 [UAT 清单](../verification/uat.md)：AC-317～322 功能 QA PASS。API21/21、管线10/10、焦点复验5/5和两次真实完整链路事实均未变。

- CR-307 维持 resolved。
- CR-308 撤销 QA 缺陷及阻塞，resolved 表示重分类为非阻塞模型能力观察，不声称漏判被修复；撤销自动回技术/实现返工建议。
- CR-306 功能 QA 通过，用户 UAT 未开始/未接受，暂保留 open 等待用户验收。
- 当前阶段仍 verification、qa-quinn、awaiting_user_review；无角色或阶段迁移、提示词/代码改动、模型切换或新增调用。
- QA 继续验证 AI 审稿、返修的调用和控制逻辑；文章质量与模型判断准确率不属于 QA。

修订前文件留存 [before.tar.gz](evidence/qa-scope-correction-084/before.tar.gz) 与 [哈希清单](evidence/qa-scope-correction-084/before-manifest.json)。原始 R1/R2、首次与修后浏览器记录、历史内容意见及083原件未改。当前记录依据用户明确决定和既有证据更正，未重新测试或重新生成文章。本记录不批准用户 UAT、里程碑完成或部署。
