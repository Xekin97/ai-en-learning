## 当前增量 BE4-I01 / CR027

2026-10-01，backend-ethan，068 已接收 BE04/FE04，按既有 API004 限制修复 limit 转换前校验。仅 catalog_handlers.go 与定向测试；单工作区顺序执行，无委派/合并，保留所有既有未提交改动。验证 BE4-V01–03：真实隔离数据库/HTTP 的管理员搜索与非法输入、角色隔离及 provider 0 调用；复用既有 harness，不改运营数据或调用正式模型。先保留失败，再修复并运行针对性 race/vet。当前 implemented_developer_verified：定向 HTTP/race、vet通过，交接到前端与QA；原失败与准确改动见 evidence/backend-cr027。

---
milestone: M002
stage: implementation
role: backend-implementer/base
agent_name: backend-ethan
status: awaiting_user_review
date: 2026-09-23
---

## CR026 backend-ethan

单工作区，service+0014迁移及现有notice集成测试；不委派，不触碰真实数据库或模型。DB04/BE05用户功能范围已明确。验证：服务层保存读取/投影/更新冲突，隔离库默认false；目标go test/race+vet。

# M002 后端实施计划

## 当前返工：M002-CR-013

TRANSITION-M002-031已激活backend-ethan，按CAP008–011/API006/DATA009/011–013/017修复[生成收录状态分类](../changes/CR-013.md)。本人有效凭证、运行存在且未过期时，非valid/已放弃返回409 state_conflict；错误凭证、他人、缺失/已删除仍404，有效草稿/终态到期仍410。保存条件、事务锁序、幂等和原来源计量保持。没有新业务解释。

单工作区顺序实施，无独立可并行任务，不委派/创建worktree。生产范围learning/service.go及HTTP错误映射，补实际HTTP/PG回归并将旧生命周期测试的状态冲突断言按现行API纠正；只维护本角色三份文档和backend-cr013新证据。风险high（权限、状态及并发），不改API/schema/前端/QA/控制面；修改前原件见[inputs](evidence/backend-cr013/inputs.json)及[归档](evidence/backend-cr013/before-owned.tar.gz)。

| 任务 | 状态 | 验收与下一动作 |
|---|---|---|
| BE2-R13 | 开发检查通过，待独立QA | 11组定向HTTP红绿、7项相关SQL集成及单元race/vet/build通过；[报告](backend-validation.md#cr013)。后续前端先接CR012，再由QA复验原四种状态及边界 |
| BE2-R11 | QA06通过，031限定关闭 | 搜索规范化、分页及本人边界；原证据[backend-cr011](evidence/backend-cr011/manifest.json)，滚动位置另属前端CR012 |
| BE2-R07 | QA03复验，025限定关闭 | [backend-cr007](evidence/backend-cr007/manifest.json) |
| BE2-R06 | QA02复验，022限定关闭 | [backend-cr006](evidence/backend-cr006/manifest.json) |

以下BE2-I01–08保留开发基线；当前API006缺口以BE2-R13处理，CR012等待前端独立接收。

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

本计划完成范围是后端开发自检，不是整期验收。当前 backend-cr013、frontend-cr010；QA06结论仍为11 PASS / 2 FAIL，剩余范围以[质量报告](../verification/report.md)为准。CR013开发完成、待独立QA；CR012待前端，CR011已于031限定关闭；CR-005/006 已于 022、CR-007/008 于 025、CR-009 于 027、CR-010 于 029 限定关闭。CR001/002、CR039-L1、CR042-L1、AI-QUALITY-90 保持既有状态。无新增产品决策待确认，运营配置由管理员设置。


## CR029 工作区策略

本次串行角色交接、单工作区实现；保留既有未提交变更，不重置/清理/自动提交，也未启动子代理。新增文件和改动源按generic-models29证据绑定；原型、契约服务和3302运行目录相互隔离。
