---
milestone: M001
stage: verification
role: quality/base
agent_name: qa-quinn
status: awaiting_user_review
date: 2026-09-06
verification_round: TRANSITION-M001-078
verdict: passed_for_functional_uat
functional_uat: ready_for_local_preparation
release_readiness: blocked
---

# 第078轮独立验证：可交功能UAT

## 结论与边界

本輪指定独立验证PASS，CR029–036在所列修复/回归范围内均通过，未发现新增实现缺陷。依据用户[连续批准](../reviews/verification-cr036-continuous-rework-approval.md)，质量记录将8项问题标为resolved；不表示用户UAT、完整里程碑或真实AI发布已通过。建议守门器检查后在保留数据与运行参数的前提下更新本地6001，并完成更新后冒烟。

[078批准](../reviews/implementation-cr036-independent-verification-approval.md)、[计划](./evidence/cr036-078/PLAN.md)、[覆盖](./cr036-078-coverage.md)。只使用新ww-qa-078栈、新账号和数据库，真实Go/SQL/Nuxt/Nginx。固定前端8fe04108b523cce73820017069ba0509e7bee03589b0fdc9218a4397770274c0，配套后端e8c4ee91a7c3265cda8c496ccc8fb485328d95b6c1662eaf2502011ce5d005a5。[环境](./evidence/cr036-078/environment.json)。

没有重跑或累计开发unit/lint/type/build，开发174单元/110 Mock E2E不算本轮独立证据。19份本轮原始结果全部无FAIL/ERROR；表内数字是局部断言，可重复验证同一要求，不相加冒称独立需求数。

## CR036独立复验

- 原问题：双引擎×双语×390/1440，Guest清空模型与篇幅，额度0及5真实保存/刷新；现与原型invalid完整提示一致，两组各24检查PASS。
- 扩展：四组、两引擎、两语言、390/1440，分别仅无模型、仅无篇幅、仅零额度、有限有效、不限有效、双空不限。编辑态、完整替换PUT200、服务器投影与刷新恢复全部正确；无模型/篇幅时完整提示，仅零额度显示批准标题，恢复有效则提示消失。
- 警告padding/gap/border/背景色/文字色/radius/字形/行高/标题间距/24px下边距与实时原型一致，role=status，无页面横向溢出。
- 实际语言切换保留未保存选项；受控保存500保留草稿与警告且服务器未变，解除故障重试200；两引擎双语均无运行时错误，警告态Axe无serious/critical。
- [扩展1304项](./evidence/cr036-078/plans-expanded-results.json)、[原始观察](./evidence/cr036-078/plans-expanded-observations.json)、[WebKit英文390实际](./evidence/cr036-078/screenshots/expanded-webkit-en-US-390.png)。人工查看该截图，正文自然换行，提示和后续选项不拥挤。
- CR035字段仍gap8/文字偏移0；四组空/3模型、两引擎双语320/390/720/900/901/1440，选择/键盘/真实保存/0/7/不限与恢复[947项PASS](./evidence/cr036-078/plans-results.json)。

## 保留关联回归

Users全部搜索前/无结果/加载/失败，双引擎双语8宽度×800/1000高度，实时原型局部几何/文案1312项PASS；合法32字符/32个w/短名详情、徽章/无溢出/返回，长名拥有两份短长文reader全部通过。分页45行三页、追加失败/重试/终页、精确优先/SQL、游标篡改/跨查询/跨管理员拒绝、权限/所有权、40行返回/焦点/滚动、深链/旧URL/前后退/迟到、只读modal、真实改密204及旧会话失效通过。

真实额度有限/0/不限/admin不适用、计费/active/退款/降额、换组投影、丢响应仅一次PUT+一次GET对账通过。Models标题/列表/状态/引用/弹窗/密钥输入背景，Library六统计标签与空态，首页Review/注销、五类访客引导/认证返回/账号语言优先/SSR与请求隐私隔离通过。

Review旧库/空/全暂停仍可改日期；上海单日3批6词，空有切换、失败重试/迟到/422、实际会话创建/范围复用/单篇独立、跨刷新顺序和UTC/上海/洛杉矶初始范围通过。空/非法/失败的关键1080断点对照通过。重复短语全部挖空、learn/learned/learning独立作答、同源颜色稳定/错误纠正/不重叠、两类成功总结通过。

## 原始结果

| 文件 | PASS | FAIL | ERROR |
| --- | ---: | ---: | ---: |
| [api-edge-results.json](./evidence/cr036-078/api-edge-results.json) | 5 | 0 | 0 |
| [api-results.json](./evidence/cr036-078/api-results.json) | 58 | 0 | 0 |
| [detail-capture-results.json](./evidence/cr036-078/detail-capture-results.json) | 24 | 0 | 0 |
| [flows-results.json](./evidence/cr036-078/flows-results.json) | 26 | 0 | 0 |
| [focus-results.json](./evidence/cr036-078/focus-results.json) | 484 | 0 | 0 |
| [long-reader-results.json](./evidence/cr036-078/long-reader-results.json) | 160 | 0 | 0 |
| [lost-response-results.json](./evidence/cr036-078/lost-response-results.json) | 3 | 0 | 0 |
| [models-list-corrected-results.json](./evidence/cr036-078/models-list-corrected-results.json) | 7 | 0 | 0 |
| [plans-expanded-results.json](./evidence/cr036-078/plans-expanded-results.json) | 1304 | 0 | 0 |
| [plans-results.json](./evidence/cr036-078/plans-results.json) | 947 | 0 | 0 |
| [plans-warning-finite-results.json](./evidence/cr036-078/plans-warning-finite-results.json) | 24 | 0 | 0 |
| [plans-warning-results.json](./evidence/cr036-078/plans-warning-results.json) | 24 | 0 | 0 |
| [range-flows-results.json](./evidence/cr036-078/range-flows-results.json) | 47 | 0 | 0 |
| [range-matrix-results.json](./evidence/cr036-078/range-matrix-results.json) | 240 | 0 | 0 |
| [regression-final-results.json](./evidence/cr036-078/regression-final-results.json) | 148 | 0 | 0 |
| [review-regression-results.json](./evidence/cr036-078/review-regression-results.json) | 22 | 0 | 0 |
| [users-matrix-neutral-results.json](./evidence/cr036-078/users-matrix-neutral-results.json) | 1312 | 0 | 0 |
| [users-supplemental-results.json](./evidence/cr036-078/users-supplemental-results.json) | 184 | 0 | 0 |
| [visual-results.json](./evidence/cr036-078/visual-results.json) | 310 | 0 | 0 |

## 限制与证据保护

- 新环境重用已验证QA脚本，原断言不放宽。076已知focus末尾截图等待遗漏在执行前修正，078等待实际姓名/字体/两帧再拍；另有detail-capture确认24項。long-seed不再错误打印45行新账号。历史076及开发077失败记录完整保留。
- 英文原型语言选项Chinese与实现中文仍为已记录BASELINE_VARIANCE；实现依本地称呼规范，未改全站规则，不能宣称全屏像素完全一致。
- 本轮定向Axe/键盘/焦点通过；没有真实200%菜单缩放、真机/VoiceOver、Firefox或公网负载验证。没有重跑全部新旧版本混合矩阵、真实账号注销或生成到统计的完整生命周期；升级后旧管理员标签需刷新。
- [API本地采样](./evidence/cr036-078/api-edge-observations.json)：列表20次p50=2.556ms、p95=4.788ms、max=5.108ms；详情20次p50=2.109ms、p95=2.509ms、max=2.696ms，仅同机诊断，不是容量或公网SLA。
- 真实AI仍NOT VERIFIED / 发布BLOCKED：无供应商凭证与真实调用，4模型全部停用，14批次和6计量均手工合成，不代表真实模型自然度/概率质量/兼容性。功能UAT可继续，但不因此放行真实AI发布。

## 环境与后续

[清理](./evidence/cr036-078/cleanup.json)：报告前2688份既有源未变，12份078接收快照启动前核对。精确清理4个本轮容器、2网络；66账号/14批次/4会话/6合成计量/4停用模型所在tmpfs不可恢复，可由种子重建。6101释放，6001四容器ID/镜像/启动时间仍不变，6010原进程保留。

UAT只读预检发现现有数据库有6个已应用迁移，与本候选一致且无active生成。配置文件部分参数与运行容器不同，更新必须保留现有数据库连接、会话/CSRF/cursor参数和数据，仅替换通过验证的前后端镜像；不能直接加载旧.env覆盖运行参数。质量报告本身没有部署权限扩张，依连续批准另做UAT交付门与冒烟。

[质量交接](../handoffs/verification.md)、[待执行UAT清单](./uat.md)。保持verification阶段，不转milestone-complete。当前独立PASS不替代用户最终验收。
