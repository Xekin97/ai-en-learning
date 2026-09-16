---
milestone: M001
stage: verification
role: quality/base
agent_name: qa-quinn
status: active
date: 2026-09-06
verification_round: TRANSITION-M001-074
---
# QA074 独立复验计划

依据[074批准](../../../reviews/implementation-cr030-users-reverification-approval.md)、[CR030](../../../changes/CR-030.md)、[原型](../../../design/prototype/index.html)、[API v1.4](../../../technical/api/index.md)和[开发交接](../../../handoffs/frontend-implementation.md)。沿用qa-quinn，不创建子代理。只写verification、验证交接与CR验证进展；不改生产/设计/API/开发记录/控制面。

| 编号 | 追踪 | 本轮独立检查 |
| --- | --- | --- |
| U1 | R072-01；PAGE103/CAP104、021/API103 | 标准500错误、双语完整文案/重试、原查询不丢 |
| U2 | R072-02；PAGE103 | idle/empty/loading/error实际原型几何和样式，320/390/720/721/900/901/1280/1440，两个高度；两引擎双语 |
| U3 | PAGE103/CAP104/API103 | 实际SQL顺序、trim/大小写/精确优先、20→40→45、游标隔离/非法、首次/追加失败、终态、迟到 |
| U4 | CR030/031；PAGE103/CAP104、107 | 40行返回/焦点/滚动、详情持续搜索、32字符名称、正确用户/批次modal、短长文/错误/关闭/深链/旧URL |
| U5 | CR033；PAGE103/CAP105、106/API103 | 当前组和限额分支、换组真实PUT、改密204/旧会话失效；访客401/学习者403；只读边界 |
| R1 | CR029/032；PAGE001/003/005–009 | 首页、日期、注销文案、访客一致引导、登录错误；严格区分静态文案与动态内容 |
| R2 | CR034；PAGE007/CAP017、020/API008 | 旧批次空范围→修改日期命中，错误/重试/恢复，901/1080/1081布局保留 |
| R3 | PAGE101/102；CAP101–103 | Model列表/弹窗/Key表面、Plans副标题/Guest/保存/间距 |
| A1 | PAGE103及直接回归 | 两引擎键盘、焦点、Axe、浏览器错误；局部GET延迟记录，无公网负载结论 |

固定前端sha256:18c9e266ed0bb74ee3d50d1f7aac8bb1c6f6945ee8e33460319ca86010552944，后端sha256:e8c4ee91a7c3265cda8c496ccc8fb485328d95b6c1662eaf2502011ce5d005a5。不build，不复跑开发unit/lint/format/type/E2E。

创建独立ww-qa-074四端栈，标签wordweave.qa=074；6101仅本机，后端内部网络，PG tmpfs。6010只读批准原型。合成账号/资料独立重建，供应商禁用、凭据0、真实AI调用0。不触碰6001和真实用户/历史密钥。结束按精确名称/标签清理本轮资源，保留baseline/脚本/原始失败；原型和开发产物哈希不变。

结果按新独立证据判定，不复制开发PASS。CR029–034保留open至本轮交付处理，发现差异路由实际责任阶段，QA不自行修复。完成本轮报告、覆盖、UI审查、AI边界、UAT清单、handoff；不切换workflow或宣布里程碑完成。只有本轮适用范围通过，才建议审批更新UAT，不直接改6001。

