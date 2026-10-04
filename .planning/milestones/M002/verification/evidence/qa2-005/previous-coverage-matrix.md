---
milestone: M002
role: quality/base
agent_name: qa-quinn
version: M002-QA-04
date: 2026-09-21
---

# 覆盖矩阵

来源为 PRODUCT-03 / FE-02 的 [traceability](../technical/frontend-traceability.json)，批准状态以 TRANSITION-M002-016/018/026 为准，源文件冻结时的待审描述不覆盖审批。本文只定位验证去向，不重写能力语义。完整结果和限制见 [report](report.md)。

状态：FAIL=已确认缺陷；PARTIAL=部分独立场景通过，其他验收仍待覆盖；DEV_ONLY=只有匹配版本的开发证据；没有任何整项仅因路由存在标为 PASS。Q/U 来自第一轮，C 为前两轮回归，R 为第二轮，S 为第三轮，T 为第四轮；见报告。F01–04 已限定关闭，F05 原缺陷已复验、待守门关闭，当前失败为 F06；SETUP 是实际执行的预览/发布/访客注册收录与后台接入准备，不重复计测试数。DEV 指 [前端验证](../implementation/frontend-validation.md) 与 [后端验证](../implementation/backend-validation.md) 中对应能力/FE2/BE2 验证项。

## 49 项能力

| CAP / 当前职责 | PAGE | API（原索引记法） | 状态 | 证据 |
|---|---|---|---|---|
| CAP-001 首页/试用入口保留，静态首页不触发AI | PAGE-205, PAGE-217 | API-001/202 | PARTIAL | U01/U02 |
| CAP-002 注册basic、轮换会话 | PAGE-002, PAGE-003 | API-002 | PARTIAL | SETUP/Q03；S03 真实访客注册收录 |
| CAP-003 登录退出/角色路由 | PAGE-002, PAGE-003, PAGE-103, PAGE-205, PAGE-206, PAGE-218 | API-002 | PARTIAL | SETUP/Q09；S03 注销后两会话及旧登录失效 |
| CAP-004 本人改密/撤其他会话 | PAGE-206 | API-003 | PARTIAL | R07 前置改密/多会话断言；S02–04 注销部分另见 CAP-005 |
| CAP-005 注销全个人数据 | PAGE-206 | API-003 | PARTIAL | S02–04：确认/错密/19 类非空关联表清除/多会话/他人隔离；F03 原缺陷复验通过；并发/回滚复用 DEV |
| CAP-006 词表精确合法选词 | PAGE-204 | API-004 | DEV_ONLY | DEV |
| CAP-007 一份有效计划、合并模型、分别次数 | PAGE-204 | API-004 | PARTIAL | U04（布局） |
| CAP-008 流生成/严格完整结果 | PAGE-204 | API-005 | PARTIAL | SETUP |
| CAP-009 取消/系统失败原来源退款 | PAGE-204 | API-005 | DEV_ONLY | DEV |
| CAP-010 完整收录/放弃、默认标题 | PAGE-204 | API-006 | PARTIAL | SETUP |
| CAP-011 访客认证claim一次绑定 | PAGE-002, PAGE-003, PAGE-204 | API-006 | PARTIAL | SETUP；S01/S03 两个真实访客注册 claim |
| CAP-012 原六项统计/旧到新库列表 | PAGE-005 | API-007 | PARTIAL | Q01/Q04/Q05/Q11 |
| CAP-013 完整目标词搜索，不搜标题 | PAGE-005 | API-007 | DEV_ONLY | DEV |
| CAP-014 完整正文/词义/位置详情 | PAGE-006 | API-007 | PARTIAL | Q01/Q02 |
| CAP-015 参与范围开关，仅影响新会话 | PAGE-005, PAGE-006 | API-007 | PARTIAL | Q10 |
| CAP-016 永久删批次/claim，不回退成长 | PAGE-005, PAGE-006 | API-007 | PARTIAL | Q11 |
| CAP-017 浏览器日期范围/固定随机安排 | PAGE-007 | API-008 | PARTIAL | Q10/U04 |
| CAP-018 替代索引→CAP-201原词填空 | PAGE-008 | API-008 | PARTIAL | Q04/Q05 |
| CAP-019 替代索引→CAP-201逐occurrence填空 | PAGE-008, PAGE-201 | API-008 | PARTIAL | Q04/Q05 |
| CAP-020 独立会话恢复/最小完成概况（DB2-R07/08 已接收） | PAGE-005, PAGE-007, PAGE-008 | API-008 | PARTIAL | Q06/Q07 |
| CAP-021 账号语言持久/访客本机语言 | PAGE-002, PAGE-003, PAGE-005, PAGE-006, PAGE-007, PAGE-008, PAGE-103, PAGE-204, PAGE-205, PAGE-206, PAGE-217, PAGE-218 | API-001 | DEV_ONLY | DEV |
| CAP-022 单批复习，忽略参与开关 | PAGE-005, PAGE-008 | API-008 | PARTIAL | Q07/Q10 |
| CAP-101 凭据脱敏/加密替换/探针 | PAGE-208 | API-101 | PARTIAL | SETUP |
| CAP-102 模型新增编辑启停，完整保留 | PAGE-208 | API-101 | PARTIAL | SETUP/C05 |
| CAP-103 四基础计划全权益配置 | PAGE-208 | API-102 | PARTIAL | SETUP/C04 |
| CAP-104 用户查询/详情/成长读投影 | PAGE-103, PAGE-211 | API-103 | PARTIAL | Q03/C04 |
| CAP-105 指定用户base调整重置 | PAGE-103 | API-103 | PARTIAL | C04 |
| CAP-106 管理员重置密码/撤会话 | PAGE-103 | API-103 | DEV_ONLY | DEV |
| CAP-107 管理员只读学习库 | PAGE-103 | API-103 | DEV_ONLY | DEV |
| CAP-201 整份匿名题面/本机移动/整批提交 | PAGE-008, PAGE-201 | API-008 | PARTIAL | Q04/Q05；R01/R02 |
| CAP-202 本机概览/最新完整草稿提交 | PAGE-008, PAGE-202 | API-008 | PARTIAL | Q04/Q05/Q07；R01/R02 |
| CAP-203 当次对照/最小结算/重来 | PAGE-008, PAGE-203 | API-008 | PARTIAL | Q04/Q05/Q06；R01/R02/R04 |
| CAP-204 校验服务端状态后本机恢复 | PAGE-008, PAGE-201 | API-008 | PARTIAL | Q07；R01–05，F01 复验通过 |
| CAP-205 模型正式移除/计划解引用/卡资格 | PAGE-208 | API-101/204 | PARTIAL | C05；S05–07；T01–04 跨页下架引用、新建限制与即时退款 |
| CAP-206 设计布局/真实成功失败toast | PAGE-201, PAGE-204, PAGE-208 | API-004及各命令 | PARTIAL | U01/U03/U04 |
| CAP-207 首页示例/动效前端，公开预设读 | PAGE-205 | API-202 | PARTIAL | U01/U02 |
| CAP-208 排除已选/当前库的随机词 | PAGE-204 | API-004 | PARTIAL | R06：排除/上限/统计；未直接核对额度 |
| CAP-209 本人资料/登录欢迎事实 | PAGE-206 | API-002/201 | PARTIAL | Q05/Q09 |
| CAP-210 独立平台消息/登录提醒（DB2-R09 标题已接收） | PAGE-207, PAGE-209 | API-205/207 | PARTIAL | Q09 |
| CAP-211 04:00学习日/有效生成自动签到 | PAGE-214 | API-005/006/203 | PARTIAL | S01 有效访客 claim 当日自动签到且复习不重复；04:00 边界仍待独立验 |
| CAP-212 补签/历史规则后续差额 | PAGE-214 | API-203 | PARTIAL | T08–10 跨月/历史差额/不补XP/复习不变/成就待领/幂等/30日与注册边界；04:00实时时点与其余并发仍待验 |
| CAP-213 owner+lexeme首次掌握/累计 | PAGE-203, PAGE-214 | API-008/203 | PARTIAL | Q04/Q11；S01 单 lexeme/三词形正确后 mastered_total=1 |
| CAP-214 动态等级/成就/手动全或无领取 | PAGE-210, PAGE-214 | API-203 | PARTIAL | S09–12 手动奖励全或无；T09 补签新成就达成但7分/11XP仍待手动领取 |
| CAP-215 兑换/库存/手动下架退积分 | PAGE-210, PAGE-215 | API-204 | PARTIAL | C01–05/C07；R09/R10；S05–07；T01–07 F05修复、当前退款及跨页编辑通过；未扩大为全权益通过 |
| CAP-216 逐模型加时/计划体验/额度组合 | PAGE-204, PAGE-208, PAGE-215 | API-004/204 | PARTIAL | C02/C04 |
| CAP-217 成长配置/类型道具/正数补分 | PAGE-210, PAGE-211 | API-103/206 | PARTIAL | C03；R09/R10；S05–07/S06-live/S09–12；T01–07 F05分页修复、增删/失败/并发保护通过 |
| CAP-218 预设目录/固定台/草稿预览发布 | PAGE-212, PAGE-216, PAGE-217 | API-202/208 | PARTIAL | SETUP/Q01 |
| CAP-219 访问/学习漏斗/留存/概览 | PAGE-213, PAGE-218 | API-209/900 | FAIL | T11–14 数值/聚合/权限/显示及周期切换通过；F06/T15 30天图表撑宽320/390px页面 |
| CAP-220 本人新旧批次标题编辑 | PAGE-005, PAGE-006 | API-007 | PARTIAL | Q01/Q02（上一轮已有独立证据，纠正索引） |

## 25 PAGE / 28 视图与设计条目

119 个 UIA 沿架构逐页索引保留在 [machine coverage](evidence/qa2-004/coverage.json)。页面下有功能证据不表示所有 UIA 均已验。UI22/H01 为唯一设计来源，M001 精确样式及旧逐题判分协议不作为新期望。

| PAGE | 视图 / 生产路由 | 已执行相关证据 | 全部 UIA |
|---|---|---|---|
| PAGE-002 注册 | register /register | DEV, SETUP/Q03/Q09；S01/S03 真实访客注册收录 | 4 项，部分/待验 |
| PAGE-003 登录 | login /login | DEV, SETUP/Q03/Q09；S03 删除后旧登录失效 | 5 项，部分/待验 |
| PAGE-005 学习记录 | library /library | DEV, Q01/Q04/Q05/Q11, Q06/Q07, Q07/Q10, Q10, Q11 | 6 项，部分/待验 |
| PAGE-006 批次详情 | batch /library/:batchId | DEV, Q01/Q02, Q10, Q11 | 8 项，部分/待验 |
| PAGE-007 复习范围 | range /review | DEV, Q06/Q07, Q10/U04 | 4 项，部分/待验 |
| PAGE-008 复习会话容器与结束 | sessiondone /review/:sessionId | DEV, Q04–07, Q10；R01–05 | 4 项，部分/待验 |
| PAGE-103 用户管理 | users /admin/users；userdetail /admin/users/:userId | C04, DEV, Q03/C04, SETUP/Q09 | 4 项，部分/待验 |
| PAGE-201 复习填写 | review /review/:sessionId | Q04/Q05/Q07；R01–05 | 4 项，部分/待验 |
| PAGE-202 当前批次概览 | overview /review/:sessionId | Q04/Q05/Q07；R01/R02 | 4 项，部分/待验 |
| PAGE-203 提交后总结 | summary /review/:sessionId | Q04/Q05/Q06/Q11；R01/R02/R04 | 4 项，部分/待验 |
| PAGE-204 造文工具台 | create /create | C02/C04, DEV, SETUP, U04；R06 | 5 项，部分/待验 |
| PAGE-205 简洁首页 | home / | DEV, SETUP/Q09, U01/U02 | 7 项，部分/待验 |
| PAGE-206 个人资料 | profile /account | DEV, Q05/Q09；R07 改密前置；S02–04 注销复验；W01 未定位 console 观察 | 5 项，部分/待验 |
| PAGE-207 消息列表与正文弹窗 | notices /notices | Q09 | 5 项，部分/待验 |
| PAGE-208 模型管理、计划管理（两个独立模块） | models /admin/models；plans /admin/plans | C02/C04, C05, SETUP, SETUP/C04, SETUP/C05, U01/U03/U04 | 3 项，部分/待验 |
| PAGE-209 平台消息管理 | messages /admin/notices | Q09 | 3 项，部分/待验 |
| PAGE-210 成长运营配置 | operations /admin/growth | C01/C02/C03/C05/C07；R09/R10；S05–07/S06-live；S09–12；T01–07 F05修复通过 | 3 项，部分/待验 |
| PAGE-211 用户管理内的积分操作 | credits /admin/users/:userId#points | C03, Q03/C04 | 3 项，部分/待验 |
| PAGE-212 热门预设管理 | presets /admin/presets | SETUP/Q01 | 5 项，部分/待验 |
| PAGE-213 数据分析 | metrics /admin/analytics | T11–14；F06/T15 | 3 项，COPY09响应式FAIL，其余部分/待验 |
| PAGE-214 账号成长 | growth /account/growth | DEV, Q04/Q11；S01 自动签到与掌握；S09–12 手动奖励/全或无/称号；T08–10 补签/成就待领 | 5 项，部分/待验 |
| PAGE-215 道具卡、兑换中心（两个视图） | bag /account/items；shop /account/exchange | C01–05/C07；R09/R10；S05；T01–07 分页/改价退款通过；T08–10补签 | 5 项，部分/待验 |
| PAGE-216 独立预设造文工作台 | trial /trial/:presetId | SETUP/Q01 | 7 项，部分/待验 |
| PAGE-217 独立试用目录 | explore /explore | DEV, SETUP/Q01, U01/U02 | 10 项，部分/待验 |
| PAGE-218 后台概览 | adminhome /admin | DEV, SETUP/Q09 | 3 项，部分/待验 |

## API、数据与剩余工作

| 契约 | 本轮独立范围 | 尚待独立覆盖 |
|---|---|---|
| API-001/002/003/007/201 | 原登录/标题/资料/批次证据；R07 改密前置；S02–04 注销成功/确认保护/清除/多会话/他人隔离 | 完整搜索分页、全部语言与其余失败分支；注销并发/回滚沿匹配 DEV，不冒充独立浏览器覆盖 |
| API-004/005/006/202 | loopback 预览发布/生成/认领；R06 随机排除/上限/统计 | 供应商失败/取消计量、无候选/他人隔离与随机额度账本、生产 SSE 代理 |
| API-008 | 单批全对/全空/恢复/返回/删除；R01–05 存储故障、未知版本、确认、双标签、清理 | 多批次/替换竞争、真实 BFCache、其余故障组合、真机输入 |
| API-203/204/205 | 掌握保留、兑换/叠时/分账/消息；R09/R10；S01 自动签到；S05 完整改价→新预览退款；S09–12；T08–10跨月历史补差、幂等和日期边界 | 04:00实时时点、其余补签竞争、更多等级配置与奖励并发、部分重叠模型/所有时间组合 |
| API-101/102/103/206/207/208 | 真实配置/八模块接入、计划调整、正数补发、卡定义/移除及通知；S05–07/S06-live 原卡表单修复通过；S09–12；T01–07分页引用/失败/并发保护 | 其他多管理员并发、所有运营可编辑状态、后台只读用户库全流程 |
| API-209/900 | T11–14 真实事件幂等、跨日UV、渠道/跳出、合成run失败率、权限/隐私/观察中/过期UV、页面周期切换；T15布局FAIL | F06响应式修复；业务事件端到端留存/迟交队列、90天物理清理、Linux运行及容量 |

31 个活跃 DATA 与替代 DATA-015→DATA-202 沿原索引记录于 JSON；仅保留最小复习事实、本机草稿、04:00 学习日/滚动额度分离和基础/体验分账等既有约束。本轮没有引入新数据模型或兼容承诺。

CR009已独立通过待守门关闭，先修复/复验CR010（PAGE213/VIEW metrics/2种周期动态布局）；其后按上述未验证范围和 FE2-V01–20/BE2-V01–21 选择相关场景继续，真机/人工读屏/生产环境不具备时明确保留未验证，不用静态存在或开发通过数替代。
