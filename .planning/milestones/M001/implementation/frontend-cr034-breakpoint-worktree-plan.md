---
milestone: M001
stage: implementation
role: frontend-implementer/base
agent_name: frontend-claire
status: completed
date: 2026-09-06
scope_authorization: TRANSITION-M001-071
---

# CR-034 第071轮有限实时复验计划

## 是否需要并行

单工作区；不派生子角色、不创建worktree或提交。仓库无已提交基线，原有未跟踪文件均视为用户工作。各界面对照共享测试账号、日期会话及浏览器证据，顺序执行；纯开发检查和独立端口的Mock套件可并行，不共享业务数据。

## 所有权与依赖

| 任务 | 责任路径 | 依赖 | 负责人 |
| --- | --- | --- | --- |
| 当前源码基线、命令记录 | implementation/evidence/cr034-071/ | 071批准的5份技术快照 | frontend-claire |
| 实时双语/双引擎几何文案对照及交互 | 同目录新脚本/结果/截图 | 只读6010新原型、当前前端候选、隔离6101栈 | frontend-claire |
| 开发验证与交接 | implementation/frontend-cr034-breakpoint-validation.md、frontend-validation.md、handoffs/frontend-implementation.md | BP01–04与原FR01–18 | frontend-claire |

没有预定生产代码改动；仅当新运行证明偏离批准方案时在既有实现权限内修正，并相应补测。设计、API、产品、后端、数据库、技术稿、workflow/registry/history及独立QA证据不改。CR-034如追加进展仍保持open。

## 执行顺序

1. 确认角色/071快照/工作树，保存原文件摘要；当前8项技术和已批准设计继续有效。
2. 运行格式、类型、lint、依赖边界、单元与当前frontend构建。记录构建缓存命中情况，不把缓存RUN谎称新运行。
3. 在空闲3300/38080运行既有90项Mock浏览器回归，新产物写本轮目录；不用VM stub替代契约测试。
4. 仅创建ww-dev-cr034-071及-edge网络、-db/-backend/-frontend/-nginx容器；6101绑定localhost，backend/database置内部网络，模型地址禁用且不种凭据。
5. 四个合成账号/八个批次的真实API与会话冒烟，再执行BP01–04、双语真实200%缩放及颜色/访客相关回归；新原始数据和失败独立保存。
6. 人工查看代表性生产/原型截图，追加本轮报告和交接。保留068与069所有历史失败，不能以旧computed记录对照冒充新运行。

## 合并及清理条件

无分支合并。所有旧源码/设计/API/测试证据摘要保持；若发生上游决策冲突，停止争议修改并说明。6001 UAT不更新，既有6010 PID65630只读使用。

本轮结束只清理由固定名称与wordweave.development=cr034-071标签双重核实的临时容器/网络。删除tmpfs前记录合成账号/批次/会话/生成及凭据数量，检查UAT容器ID/镜像/启动时间未变。浏览器上下文在finally关闭。临时浏览器profile保留在系统临时目录，记录路径，不进行广泛目录删除。

完成后提交用户审阅；按agt-frontend-implement不进入独立测试或切换状态。

## 执行收尾（2026-09-06）

已按单工作区完成，无生产源码改动；新结果、原始失败与复验说明见[本轮报告](./frontend-cr034-breakpoint-validation.md)。本轮临时栈已按名称/标签清理，6001和6010保持；无Git合并/提交、子角色或workflow迁移。计划完成不代表独立测试或UAT通过。
