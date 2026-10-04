---
milestone: M002
stage: implementation
role: backend-implementer/base
agent_name: backend-ethan
status: awaiting_user_review
date: 2026-09-21
---

# M002 后端实施计划

## 当前返工：M002-CR-007

TRANSITION-M002-022 已激活 backend-ethan，接收 [QA2-F03](../changes/CR-007.md)。按 CAP-005 / API-003 / DB2-T13 修复已消费游客 claim 阻断账号注销；在原事务和账号锁内删除相关 claim，不改变 API、数据结构、权限或个人数据删除规则。无待确认业务解释。

单工作区顺序实施；身份删除与事务验证紧密相关，不使用子代理或 worktree。仅修改 identity/service.go、新增定向 HTTP/PG 回归，以及本角色计划/报告/交接。保留前端、QA 原件与其他未提交工作。原件及保护摘要见 [backend-cr007/inputs](evidence/backend-cr007/inputs.json)。风险 high（注销、隐私、并发与回滚），未切换运行模型。

| 任务 | 状态 | 验收与下一动作 |
|---|---|---|
| BE2-R07 | 开发检查通过，待 QA | 修复前 500 已复现；3 个新增与 8 个相关真实 PG 回归、race 单元、vet/build/格式通过。证据见 [CR007 报告](backend-validation.md#cr007)；交前端处理 CR-008，再由 QA 独立复验 |
| BE2-R06 | 已由 QA02 复验，022 正式关闭 | 既有下架模型卡 API 改价；原证据沿 [backend-cr006](evidence/backend-cr006/manifest.json)。CR-008 是独立前端表单缺陷，不重新打开原后端问题 |

以下 BE2-I01–08 保留完整开发基线；BE2-I02 的注销继承存在 QA2-F03 缺口，以本轮 BE2-R07 的有效证据补充，不沿旧整体开发通过声称该路径已通过。

## 已确认基础

TRANSITION-M002-016批准进入implementation。输入：DB-03、BE-03/API、FE-02、PRODUCT-03、UI22/H01，准确批准来源见[技术交接](../reviews/technical-design.md)。冻结文档中的待审描述不覆盖正式批准。CR003/004仅设计接收关闭，运行验证仍待做；CR001/002继承与标题实施开放。USER-COMPAT-001、USER-CLAIM-DELETE-001和AI-QUALITY-90保持。当前无新增业务解释需要用户选择；发现实质缺口再按责任边界处理。

本机复习草稿、不保留历史答案、base/trial分账、学习日北京时间04:00、90天分析明细、不用原型值初始化运营配置均沿批准方案。旧0001–0007不可修改，保留旧账号/短文/全部资源和统计；不得沿用一期一次性清库命令。真实AI/生产迁移/部署不在本次操作范围。

## 工作区与并行

单工作区main，backend-ethan负责backend/及本里程碑implementation/后端实施交接。共享配置锁、生成结算、迁移和HTTP组合根耦合，不使用worktree或派生agent。原有planning/docs未提交修改受保护；输入摘要见[evidence/backend-inputs.json](evidence/backend-inputs.json)。不得清理、stash、reset这些修改。没有待合并分支或清理任务。

## 当前任务与验收

| ID | 输入与责任范围 | 状态 | 完成条件/后续动作 |
|---|---|---|---|
| BE2-I01 | DB2-M01–07；增量SQL、迁移器/隔离数据库验证 | 后端自检通过 | 旧资源和统计等价、词表稳定身份、最小复习事实、成长/权益/预设/分析结构及最小授权；DB2-V01–23对应结构检查 |
| BE2-I02 | identity/learning/vocabulary；API001–003/007/201/202 | 后端自检通过 | 资料/欢迎、标题revision、随机当前库外词；BE2-V01/02/21 |
| BE2-I03 | entitlement/generation/maintenance；API005/202/204 | 后端自检通过 | 全局配置锁顺序、base/trial/extra/visitor扣额与退款、有效生成签到/分析、用量；BE2-V06/08/16 |
| BE2-I04 | review；API008、DB2-T03/14 | 后端自检通过 | 稳定题面、整批提交、一次性对照、重来/替换/最小概况；BE2-V03–05 |
| BE2-I05 | growth/items；API203/204/206 | 后端自检通过 | 签到补差/手动奖励/库存兑换启用退换/一次保存；BE2-V08–11/18–20 |
| BE2-I06 | admin/presets/notices；API101–103/205/207/208 | 后端自检通过 | 原后台继承、模型移除/优先级/用户、管理员预设独立生成、公告清洗；BE2-V01/07/12/13/21 |
| BE2-I07 | analytics/maintenance；API209/900 | 后端自检通过 | 固定事件、真实指标、成熟/未知状态、清理/注销隔离；BE2-V14/15 |
| BE2-I08 | 跨模块并发/隔离库迁移恢复/构建race/vet/契约 | 后端自检通过 | 逐项记录实际证据、未覆盖保留，不以单测代替真实SQL/AI质量；BE2-V01–21 |

## 验证方式

Go沿项目批准工具链1.26.7，unit/race/vet/build和原integration harness；数据库仅一次性隔离实例，不使用现有运行库。启动时Docker不可连接，本机Go1.27；先使用GOTOOLCHAIN=go1.26.7。不运行Makefile中默认wordweave compose/migrate以免触及旧库。按变化运行有效检查，证据保留实际退出码及范围；设计fixture不进入生产。完成后创建backend-validation.md与后端实施交接，不自行批准或切角色。

## 实施结果与后续范围

BE2-I01–08 已完成后端实现和开发验证，详细范围、代码及失败修复证据统一在 [backend-validation.md](backend-validation.md)，接续入口为[后端交接](../handoffs/backend-implementation.md)。单工作区未提交，没有待合并 worktree；控制面和前端不变。

已实现身份/欢迎/标题、整批复习与最小事实、基础/体验/次数卡分账、签到补签/成长/手动领奖/四类道具、后台原管理能力、独立预设预览和发布、通知与分析。已完成 SQL 迁移/角色约束、完整 race 集成、诊断构建、未知提交及延迟约束失败、真实隔离备份恢复、格式/vet/build/漏洞检查。0001–0007 字节不变；4,972 个受保护文件不变。

本计划完成范围是后端开发自检，不是整期验收。前端已完成实施交付，QA02 结论仍 FAIL；剩余范围以[质量报告](../verification/report.md)为准。本轮只修复 CR-007，CR-008 待前端处理；CR-005/006 已按 QA02/022 的限定范围关闭；CR001/002、CR039-L1、CR042-L1、AI-QUALITY-90 保持既有状态。无新增产品决策待确认，运营配置由管理员设置。
