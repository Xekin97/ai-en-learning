---
milestone: M002
role: quality/base
agent_name: qa-quinn
version: M002-QA-05
date: 2026-09-21
---

# 覆盖矩阵

来源为 PRODUCT-03 / FE-02 的 [traceability](../technical/frontend-traceability.json)，批准状态以 TRANSITION-M002-016/018/028 为准，源文件冻结时的待审描述不覆盖审批。本文只定位验证去向，不重写能力语义。完整结果和限制见 [report](report.md)。

状态：FAIL=已确认缺陷；PARTIAL=部分独立场景通过，其他验收仍待覆盖；DEV_ONLY=只有匹配版本的开发证据；没有任何整项仅因路由存在标为 PASS。Q/U 来自第一轮，C 为前两轮回归，R 为第二轮，S 为第三轮，T 为第四轮，V 为第五轮；见报告。F01–05 已限定关闭，F06 原缺陷已复验、待守门关闭，当前失败为 F07；SETUP 是实际执行的预览/发布/访客注册收录与后台接入准备，不重复计测试数。DEV 指 [前端验证](../implementation/frontend-validation.md) 与 [后端验证](../implementation/backend-validation.md) 中对应能力/FE2/BE2 验证项。

## 49 项能力

| CAP / 当前职责 | PAGE | API（原索引记法） | 状态 | 证据 |
|---|---|---|---|---|
| CAP-001 首页/试用入口保留，静态首页不触发AI | PAGE-205, PAGE-217 | API-001/202 | PARTIAL | U01/U02 |
| CAP-002 注册basic、轮换会话 | PAGE-002, PAGE-003 | API-002 | PARTIAL | SETUP/Q03；S03 真实访客注册收录 |
| CAP-003 登录退出/角色路由 | PAGE-002, PAGE-003, PAGE-103, PAGE-205, PAGE-206, PAGE-218 | API-002 | PARTIAL | SETUP/Q09；S03 注销后两会话及旧登录失效 |
| CAP-004 本人改密/撤其他会话 | PAGE-206 | API-003 | PARTIAL | R07 前置改密/多会话断言；S02–04 注销部分另见 CAP-005 |
| CAP-005 注销全个人数据 | PAGE-206 | API-003 | PARTIAL | S02–04：确认/错密/19 类非空关联表清除/多会话/他人隔离；F03 原缺陷复验通过；并发/回滚复用 DEV |
| CAP-006 词表精确合法选词 | PAGE-204 | API-004 | DEV_ONLY | DEV |
| CAP-007 一份有效计划、合并模型、分别次数 | PAGE-204 | API-004 | PARTIAL | U04（布局）；V09/10 模型卡不改quota，计划覆盖与逐模型独立时长 |
| CAP-008 流生成/严格完整结果 | PAGE-204 | API-005 | PARTIAL | SETUP |
| CAP-009 取消/系统失败原来源退款 | PAGE-204 | API-005 | DEV_ONLY | DEV |
| CAP-010 完整收录/放弃、默认标题 | PAGE-204 | API-006 | PARTIAL | SETUP |
| CAP-011 访客认证claim一次绑定 | PAGE-002, PAGE-003, PAGE-204 | API-006 | PARTIAL | SETUP；S01/S03 两个真实访客注册 claim |
| CAP-012 原六项统计/旧到新库列表 | PAGE-005 | API-007 | PARTIAL | Q01/Q04/Q05/Q11 |
| CAP-013 完整目标词搜索，不搜标题 | PAGE-005 | API-007 | FAIL | DEV；V11/QA2-F07：小写分页/目标精确匹配通过，大写合法词422 |
| CAP-014 完整正文/词义/位置详情 | PAGE-006 | API-007 | PARTIAL | Q01/Q02 |
| CAP-015 参与范围开关，仅影响新会话 | PAGE-005, PAGE-006 | API-007 | PARTIAL | Q10；V05 当前2批快照不受参与开关修改影响 |
| CAP-016 永久删批次/claim，不回退成长 | PAGE-005, PAGE-006 | API-007 | PARTIAL | Q11；V08 删库保留掌握，随机重新允许已删原词 |
| CAP-017 浏览器日期范围/固定随机安排 | PAGE-007 | API-008 | PARTIAL | Q10/U04；V05/V07 洛杉矶日期边界、多批快照、空/旧版本替换保护 |
| CAP-018 替代索引→CAP-201原词填空 | PAGE-008 | API-008 | PARTIAL | Q04/Q05 |
| CAP-019 替代索引→CAP-201逐occurrence填空 | PAGE-008, PAGE-201 | API-008 | PARTIAL | Q04/Q05 |
| CAP-020 独立会话恢复/最小完成概况（DB2-R07/08 已接收） | PAGE-005, PAGE-007, PAGE-008 | API-008 | PARTIAL | Q06/Q07；V06/V07 多批进度、完成最小概况和旧替换会话失效 |
| CAP-021 账号语言持久/访客本机语言 | PAGE-002, PAGE-003, PAGE-005, PAGE-006, PAGE-007, PAGE-008, PAGE-103, PAGE-204, PAGE-205, PAGE-206, PAGE-217, PAGE-218 | API-001 | PARTIAL | DEV；V13 账号语言UI修改/刷新/新英语浏览器登录保持中文 |
| CAP-022 单批复习，忽略参与开关 | PAGE-005, PAGE-008 | API-008 | PARTIAL | Q07/Q10 |
| CAP-101 凭据脱敏/加密替换/探针 | PAGE-208 | API-101 | PARTIAL | SETUP |
| CAP-102 模型新增编辑启停，完整保留 | PAGE-208 | API-101 | PARTIAL | SETUP/C05 |
| CAP-103 四基础计划全权益配置 | PAGE-208 | API-102 | PARTIAL | SETUP/C04 |
| CAP-104 用户查询/详情/成长读投影 | PAGE-103, PAGE-211 | API-103 | PARTIAL | Q03/C04；V12/V14 实际用户库与密码管理 |
| CAP-105 指定用户base调整重置 | PAGE-103 | API-103 | PARTIAL | C04 |
| CAP-106 管理员重置密码/撤会话 | PAGE-103 | API-103 | PARTIAL | DEV；V14 确认校验/取消/实际重置撤目标两会话、旧密失效、新密有效 |
| CAP-107 管理员只读学习库 | PAGE-103 | API-103 | PARTIAL | DEV；V12 列表与完整阅读、无编辑动作、直接写/代复习拒绝及owner隔离 |
| CAP-201 整份匿名题面/本机移动/整批提交 | PAGE-008, PAGE-201 | API-008 | PARTIAL | Q04/Q05；R01/R02；V05/V06 两批题面与填写至完成 |
| CAP-202 本机概览/最新完整草稿提交 | PAGE-008, PAGE-202 | API-008 | PARTIAL | Q04/Q05/Q07；R01/R02；V06 两批概览提交 |
| CAP-203 当次对照/最小结算/重来 | PAGE-008, PAGE-203 | API-008 | PARTIAL | Q04/Q05/Q06；R01/R02/R04；V06 最终提交后刷新无答案、2批最小概况 |
| CAP-204 校验服务端状态后本机恢复 | PAGE-008, PAGE-201 | API-008 | PARTIAL | Q07；R01–05，F01 复验通过；V07 替换后旧草稿start/restart拒绝 |
| CAP-205 模型正式移除/计划解引用/卡资格 | PAGE-208 | API-101/204 | PARTIAL | C05；S05–07；T01–04 跨页下架引用、新建限制与即时退款 |
| CAP-206 设计布局/真实成功失败toast | PAGE-201, PAGE-204, PAGE-208 | API-004及各命令 | PARTIAL | U01/U03/U04 |
| CAP-207 首页示例/动效前端，公开预设读 | PAGE-205 | API-202 | PARTIAL | U01/U02 |
| CAP-208 排除已选/当前库的随机词 | PAGE-204 | API-004 | PARTIAL | R06：排除/上限/统计；未直接核对额度；V08 穷尽候选/他人及访客/无效词/实际额度账与成长不变/删库后可再随机 |
| CAP-209 本人资料/登录欢迎事实 | PAGE-206 | API-002/201 | PARTIAL | Q05/Q09 |
| CAP-210 独立平台消息/登录提醒（DB2-R09 标题已接收） | PAGE-207, PAGE-209 | API-205/207 | PARTIAL | Q09 |
| CAP-211 04:00学习日/有效生成自动签到 | PAGE-214 | API-005/006/203 | PARTIAL | S01 有效访客 claim 当日自动签到且复习不重复；04:00 边界仍待独立验 |
| CAP-212 补签/历史规则后续差额 | PAGE-214 | API-203 | PARTIAL | T08–10 跨月/历史差额/不补XP/复习不变/成就待领/幂等/30日与注册边界；04:00实时时点与其余并发仍待验 |
| CAP-213 owner+lexeme首次掌握/累计 | PAGE-203, PAGE-214 | API-008/203 | PARTIAL | Q04/Q11；S01 单 lexeme/三词形正确后 mastered_total=1；V06/V08 两批同lexeme仅新增1掌握、删库不回退 |
| CAP-214 动态等级/成就/手动全或无领取 | PAGE-210, PAGE-214 | API-203 | PARTIAL | S09–12 手动奖励全或无；T09 补签新成就达成但7分/11XP仍待手动领取 |
| CAP-215 兑换/库存/手动下架退积分 | PAGE-210, PAGE-215 | API-204 | PARTIAL | C01–05/C07；R09/R10；S05–07；T01–07 F05修复、当前退款及跨页编辑通过；未扩大为全权益通过 |
| CAP-216 逐模型加时/计划体验/额度组合 | PAGE-204, PAGE-208, PAGE-215 | API-004/204 | PARTIAL | C02/C04；V09/V10 AB3+BC6双顺序B9、幂等、计划全/部分覆盖及计时保持 |
| CAP-217 成长配置/类型道具/正数补分 | PAGE-210, PAGE-211 | API-103/206 | PARTIAL | C03；R09/R10；S05–07/S06-live/S09–12；T01–07 F05分页修复、增删/失败/并发保护通过 |
| CAP-218 预设目录/固定台/草稿预览发布 | PAGE-212, PAGE-216, PAGE-217 | API-202/208 | PARTIAL | SETUP/Q01 |
| CAP-219 访问/学习漏斗/留存/概览 | PAGE-213, PAGE-218 | API-209/900 | PARTIAL | T11–14 数值/聚合/权限/显示及周期切换通过；F06/T15 30天图表撑宽320/390px页面；V01–04 CR010图表修复通过：26组、三引擎、7/30天、完整数据/日期与无溢出 |
| CAP-220 本人新旧批次标题编辑 | PAGE-005, PAGE-006 | API-007 | PARTIAL | Q01/Q02（上一轮已有独立证据，纠正索引） |

## 25 PAGE / 28 视图与设计条目

119 个 UIA 沿架构逐页索引保留在 [machine coverage](evidence/qa2-005/coverage.json)。页面下有功能证据不表示所有 UIA 均已验。UI22/H01 为唯一设计来源，M001 精确样式及旧逐题判分协议不作为新期望。

| PAGE | 视图 / 生产路由 | 已执行相关证据 | 全部 UIA |
|---|---|---|---|
| PAGE-002 注册 | register /register | DEV, SETUP/Q03/Q09；S01/S03 真实访客注册收录 | 4 项，部分/待验 |
| PAGE-003 登录 | login /login | DEV, SETUP/Q03/Q09；S03 删除后旧登录失效 | 5 项，部分/待验 |
| PAGE-005 学习记录 | library /library | DEV, Q01/Q04/Q05/Q11, Q06/Q07, Q07/Q10, Q10, Q11 ；V11/QA2-F07大小写搜索FAIL，小写分页/标题排除通过；V13账号语言 | 6 项，搜索FAIL，其余部分/待验 |
| PAGE-006 批次详情 | batch /library/:batchId | DEV, Q01/Q02, Q10, Q11 | 8 项，部分/待验 |
| PAGE-007 复习范围 | range /review | DEV, Q06/Q07, Q10/U04 ；V05/V07 日期边界/多批/替换保护 | 4 项，部分/待验 |
| PAGE-008 复习会话容器与结束 | sessiondone /review/:sessionId | DEV, Q04–07, Q10；R01–05 ；V05–07 多批复习/最小概况 | 4 项，部分/待验 |
| PAGE-103 用户管理 | users /admin/users；userdetail /admin/users/:userId | C04, DEV, Q03/C04, SETUP/Q09 ；V12只读学习库及写权限；V14重置密码撤旧会话 | 4 项，部分/待验 |
| PAGE-201 复习填写 | review /review/:sessionId | Q04/Q05/Q07；R01–05 ；V05/V06 多批填写 | 4 项，部分/待验 |
| PAGE-202 当前批次概览 | overview /review/:sessionId | Q04/Q05/Q07；R01/R02 ；V06 两批概览提交 | 4 项，部分/待验 |
| PAGE-203 提交后总结 | summary /review/:sessionId | Q04/Q05/Q06/Q11；R01/R02/R04 ；V06 多批总结、唯一掌握、刷新不可回看 | 4 项，部分/待验 |
| PAGE-204 造文工具台 | create /create | C02/C04, DEV, SETUP, U04；R06 ；V08 随机API候选/额度；V09/V10模型卡权益API | 5 项，部分/待验 |
| PAGE-205 简洁首页 | home / | DEV, SETUP/Q09, U01/U02 | 7 项，部分/待验 |
| PAGE-206 个人资料 | profile /account | DEV, Q05/Q09；R07 改密前置；S02–04 注销复验；W01 未定位 console 观察 | 5 项，部分/待验 |
| PAGE-207 消息列表与正文弹窗 | notices /notices | Q09 | 5 项，部分/待验 |
| PAGE-208 模型管理、计划管理（两个独立模块） | models /admin/models；plans /admin/plans | C02/C04, C05, SETUP, SETUP/C04, SETUP/C05, U01/U03/U04 | 3 项，部分/待验 |
| PAGE-209 平台消息管理 | messages /admin/notices | Q09 | 3 项，部分/待验 |
| PAGE-210 成长运营配置 | operations /admin/growth | C01/C02/C03/C05/C07；R09/R10；S05–07/S06-live；S09–12；T01–07 F05修复通过 | 3 项，部分/待验 |
| PAGE-211 用户管理内的积分操作 | credits /admin/users/:userId#points | C03, Q03/C04 | 3 项，部分/待验 |
| PAGE-212 热门预设管理 | presets /admin/presets | SETUP/Q01 | 5 项，部分/待验 |
| PAGE-213 数据分析 | metrics /admin/analytics | T11–14；F06/T15 ；V01–04 CR010独立复验通过 | 3 项，COPY09响应式局部修复通过，其余部分/待验 |
| PAGE-214 账号成长 | growth /account/growth | DEV, Q04/Q11；S01 自动签到与掌握；S09–12 手动奖励/全或无/称号；T08–10 补签/成就待领 | 5 项，部分/待验 |
| PAGE-215 道具卡、兑换中心（两个视图） | bag /account/items；shop /account/exchange | C01–05/C07；R09/R10；S05；T01–07 分页/改价退款通过；T08–10补签 ；V09逐模型到期展示，V09/V10卡重叠/覆盖API | 5 项，部分/待验 |
| PAGE-216 独立预设造文工作台 | trial /trial/:presetId | SETUP/Q01 | 7 项，部分/待验 |
| PAGE-217 独立试用目录 | explore /explore | DEV, SETUP/Q01, U01/U02 | 10 项，部分/待验 |
| PAGE-218 后台概览 | adminhome /admin | DEV, SETUP/Q09 | 3 项，部分/待验 |

## API、数据与剩余工作

| 契约 | 本轮独立范围 | 尚待独立覆盖 |
|---|---|---|
| API-001/002/003/007/201 | 原登录/标题/资料/批次；S02–04注销；V11小写精确搜索/分页/标题排除；V13账号语言 | CR011大小写规范化修复；其余语言/失败分支，注销并发/回滚沿匹配DEV |
| API-004/005/006/202 | loopback预览发布/生成/认领；R06随机上限/统计；V08候选耗尽/他人及访客隔离/实际额度账本 | 供应商失败/取消计量、生产SSE代理 |
| API-008 | 单批全对/全空/恢复/返回/删除；R01–05存储/双标签；V05–07多批/时区/顺序状态冲突 | 替换与提交真实并发、真实BFCache、其余故障组合、真机输入 |
| API-203/204/205 | 既有兑换/分账/消息；S01自动签到、S05–12退款与手动奖励；T08–10跨月补差；V09/10部分重叠双顺序及计划覆盖 | 04:00实时时点、其余补签竞争、更多等级配置与奖励并发、其余时间组合 |
| API-101/102/103/206/207/208 | 既有真实配置/八模块、计划调整/补发；T01–07分页引用/并发保护；V12/V14只读库/写权限和密码重置 | 其他多管理员并发、所有运营可编辑状态、其余用户管理失败分支 |
| API-209/900 | T11–14真实事件幂等、UV/渠道/跳出、合成失败率、权限/隐私/观察中；T15旧FAIL→V01–04响应式复验通过 | 业务事件端到端留存/迟交队列、90天物理清理、Linux运行及容量 |

31 个活跃 DATA 与替代 DATA-015→DATA-202 沿原索引记录于 JSON；仅保留最小复习事实、本机草稿、04:00 学习日/滚动额度分离和基础/体验分账等既有约束。本轮没有引入新数据模型或兼容承诺。

CR009沿027限定关闭，CR010待守门按V01–04限定关闭；先由backend-ethan修复CR011（API007规范化词条与cursor绑定）并独立复验，其后按上述未验证范围和FE2-V01–20/BE2-V01–21继续，真机/人工读屏/生产环境不具备时明确保留未验证，不用静态存在或开发通过数替代。
