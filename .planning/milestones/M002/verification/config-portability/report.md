---
milestone: M002
stage: verification
role: quality/base
agent_name: qa-quinn
version: M002-QA-CR313-01
status: awaiting_user_review
date: 2026-10-16
result: pass_with_retained_limits
---

# CR313 配置可移植性独立质量报告

## 验收结论

CR313 的批准范围在当前699文件实现快照上 **PASS**，等待用户评审；未发现需要回传实现人的产品缺陷，也未执行里程碑关闭。QA在隔离的一次性PostgreSQL、当前Go后端和外置Nuxt构建目录上实际完成四类别API、数据历史边界和代表性桌面/移动界面验收。源码快照复核 `checked=699 mismatch=0`，清单SHA-256为 `2d5683ebc9ae5a7815068621f27fd2bba6e239d90a862de1b0aa112a79d7b25c`。

## 独立结果

| 范围 | 实际结果 | 证据 |
|---|---|---|
| 权限与四类别 | models/plans/items/growth current/export均200；导出包含2连接、4计划、4道具、2等级；匿名401、普通learner 403、缺CSRF 403。包不含用户、预设、公告或历史；普通models包无Key。 | `run-01`～`run-05` 的 `QA313-01-*` |
| 模型凭据 | 2连接的显式加密包用正确口令可preview并成功import；错口令和密文篡改均422 `decryption_failed`，普通无Key包422 `credentials_required`，失败无token/写入/秘密回显。 | `run-01`～`run-05`、`history-focused-02` |
| 全类替换与字段边界 | 四类别均在真实后端得到`applied`；preview不改revision，相同operation返回相同结果revision，stale为`revision_changed`；显式0/false/empty/null保留，固定计划缺项和必填遗漏均422。 | `run-01`～`run-05`、`history-focused-02` |
| 依赖与历史 | 删除已发放且被引用道具返回`active_reference`和`ever_issued`，无token/import。计划usage/trial/charge、库存/模型时长、achievement award/settlement、签到与成长事实均保持。 | `run-01`～`run-05`、`history-focused-02/db-after.out` |
| 未知结果 | 丢失submit响应后只有1次import请求；读取current没有被当作操作证明；resolve终态为`not_applied`。无自动重放。真实非法恢复token返回403。 | `ui-focused-01/qa-ui-focused-results.json`、`run-05` |
| UI与可访问交互 | 中文1440×950 unknown结果与英文390×844 blocker均符合批准文案/顺序；移动对话框374×828、无横溢、普通按钮≥44px、footer动作48px、焦点在modal内。原priority popup保持top-layer、草稿、backdrop、12次Tab封闭和Escape回焦。 | `ui-focused-01/*`、`run-01` |
| 调用与延迟 | fixture所有provider调用计数为0：`ai_call_usage=0`、`preset_preview_runs=0`、无非seed generation run，HTTP日志无probe/generation/preset-preview路由。代表API步骤18–263ms，丢响应UI链2.53s；此为观察值，不新增性能SLO。 | fixture owner只读核对、结构化run结果 |

## 历史方法修正

最初以整行fingerprint判断历史不变，`9389c4f303e32dfd23c885567fdc0cfd` 变为 `2b814715539ec1cc59b8ecccaa1b9a54`；把变化仅归因于learner登录并不完整。完全重建fixture后，在无learner session的config-only运行中，初始 `333be8d7b7404a1018c9717e4210ac13` 立即保持一致，后台正常重算后整行hash才改变。唯一业务字段差异是 `user_growth.config_revision_seen` 从2→7，随后匹配 `growth_settings.recompute_target_revision=11` 异步推进到11。

这一变化由批准的 [DB501-06](../../technical/config-portability/database.md#db501-06-提交事务竞态与响应丢失) 第5步保留 `recompute_target_revision` 和 [BE501-06](../../technical/config-portability/backend.md#be501-06-退役读取写入闭环) 既有后台recompute游标要求产生；[DB501-03](../../technical/config-portability/database.md#db501-03-全类读写与历史边界) 要求保护的是个人事实。QA只允许这个派生marker变化：五项事实始终精确为 mastered=9、saved=4、successful_review=7、highest_checkin_streak=3、highest_review_streak=2；其余11类受保护表仍为seed `xmin=1075`。排除marker/xmin但保留全部事实后的规范fingerprint为 `f95c6279a3d3495e6b8b0ebbd975471b`。详见 [方法修正](evidence/history-method-correction.md)。

## 首次失败与定向复验

`run-01`语言控件locator匹配3个元素；`run-02`对丢响应结果复制的断言定位错误；`run-03`登录导航方法超时；`run-04`locale残留导致英文priority locator找不到；`run-05`误把全部按钮要求为48px；`run-06`在连续全链复跑后命中管理员KDF限流。六次**整套runner状态均为FAIL**，不能称为整套通过；其中已经完成的独立case仍有结构化PASS事实。它们都是测试方法或环境状态问题，没有降低批准预期。`ui-focused-01`按批准的44px普通控件/48px footer门槛定向通过；fixture完全重建后 `history-focused-01/02`定向通过。相同699文件版本、相同当前后端与同一合成fixture使未受影响case可复用，无需为获得全绿外观重复变更链；首次失败原始JSON保留。

## 复用与保留边界

QA没有机械复跑FI01的Node24 type/lint/boundary/Prettier/build/61 unit，也没有复跑BI01全量Go unit/vet/build；其实现清单属于同一699文件快照，故仅复用确定性等价边界。真实TCP COMMIT ACK丢失、进程kill、发放/导入双时序barrier、北京时间04:00跨界、KDF RSS压力、全部多tab/多管理员组合仍保留为非阻塞限制。结果保留窗口的真实24小时410未等待，403已真实执行；410/superseded/refresh failure使用FI01确定性合同证据。AI-QUALITY-90与文章/模型语义评测继续UNVERIFIED，与CR313功能通过无冲突。

## 命令与隔离

使用缓存原生Node `v24.21.0`，以任务专用`PATH`启动隔离Nuxt；核心命令为 `node evidence/harness/qa-functional.mjs`、`node evidence/harness/qa-ui-focused.mjs`、`node evidence/harness/qa-history-focused.mjs`，运行时只source外部0600秘密文件且不输出值。只读数据库核对使用fixture的 `qa-readonly.sql`。应用源码校验遍历 `implementation-before.json` 的699个SHA-256条目。完整地址、进程和清理见 [环境回执](evidence/environment-receipt.md)。

## 后续

请按 [UAT清单](uat.md)做人工验收并记录结论。当前状态仅为 `awaiting_user_review`，不得据此关闭CR313、M002或自动进入下一门禁。
