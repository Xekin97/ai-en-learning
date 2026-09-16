---
milestone: M001
stage: verification
agent_name: qa-quinn
status: awaiting_user_review
date: 2026-09-08
---

# QA098 缺陷复验记录

## QA096-01：已独立验证修复

原责任：implementation / backend-ethan；关联CAP-011/016、API-006/007、DATA-012/013/015/017、PAGE-005/006。

原问题：访客有效生成→注册认领→DELETE本人批次返回500；claim consumed约束与批次删除外键SET NULL冲突。[原件](./cr039-096-findings.md)保留，不改写历史结论。

当前候选097与[用户明确批准的窄例外](../reviews/claimed-batch-delete-retention-exception.md)一致：

1. 独立生成新批次、认领并完成两阶段复习，不设置锁或过期时间。
2. 所有者DELETE返回204/0字节；再次DELETE404。
3. 对应claim、批次、目标/短语/正文位置、复习关联与结果均不可访问；原claim重试404，不能换账号或重启恢复。
4. 未删除claim仍保持24小时保留；计量不退，普通批次删除不回归。
5. 权限、CSRF、两种确定性并发顺序、八轮自然竞态、事务失败回滚与实际启动清理均通过。

证据：[有效完整结果D01–D07](./evidence/cr039-098/api-results.json)、[报告](./cr039-098-report.md)、[覆盖](./cr039-098-coverage.md)。状态：**resolved_in_independent_verification，待守门器接收索引**。

## 新产品缺陷

本次限定范围内未发现。测试脚本/合成环境方法偏差单独保留在[偏差记录](./evidence/cr039-098/harness-deviations.json)，没有改实现或把失败删掉。1次故障注入的HTTP500是原子回滚断言的预期。

## 不外推的结论

CR-039尚未由控制面关闭，真实v3造文质量尚未测，候选097尚未部署UAT。已有功能UAT接受和QA094-01当前版本通过不重开；首版兼容退出范围不算测试通过。
