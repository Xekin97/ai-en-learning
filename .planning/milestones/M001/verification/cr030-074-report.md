---
milestone: M001
stage: verification
role: quality/base
agent_name: qa-quinn
status: awaiting_user_review
date: 2026-09-06
verification_round: TRANSITION-M001-074
verdict: fail_rework_required
functional_uat: not_reissued
release_readiness: blocked
---

# 第074轮独立测试报告

结论：FAIL，暂不重新交UAT。073修复的Users英文搜索失败文案、空态高度/位置、输入宽度及移动加载骨架已独立通过；全状态及极端内容补测发现两项仍须前端处理。没有重新打开产品能力或设计方案。

| 问题 | 严重性 | 证据与责任 |
| --- | --- | --- |
| CR030-R074-01：32字符用户名详情撑宽页面 | MEDIUM | Chromium/WebKit、中英文、320/390px均复现；英文390px页面实际宽481px。列表正常不能证明详情正常。[CR030](../changes/CR-030.md)、[几何](./evidence/cr030-074/long-detail-observations.json)、[截图](./evidence/cr030-074/screenshots/long-name-chromium-en-US-390.png)。implementation / frontend-claire |
| CR035：Plans篇幅标题间距与对齐 | MEDIUM | Available lengths到chip-list实际0px、批准8px；两处legend文字相对内容右移2px、批准0。中英文390/1440px均复现；Available models下方实际8px已正确，不能把margin属性不同直接判失败。[CR035](../changes/CR-035.md)、[几何](./evidence/cr030-074/plans-gap-observations.json)。implementation / frontend-claire |

另有非阻塞BASELINE_VARIANCE：英文原型全局翻译把语言选项“中文”替换为Chinese，使语言控件宽108.59375px；实现保留中文、宽83.59375px。批准[响应式规范2.4](../design/responsive-accessibility.md)明确语言名称用本地称呼或短标签，因此不能直接把实现改为Chinese来追求像素相同；新独立context确认中文双方一致。该差异单列，不算新的Users位置缺陷，不声称全屏像素一致，也不在本轮擅改原型。

## 对象、授权与方法

依据[074批准](../reviews/implementation-cr030-users-reverification-approval.md)、073交付、API v1.4、批准设计和CR029–034。[计划](./evidence/cr030-074/PLAN.md)先于运行建立。

- 固定前端sha256:18c9e266ed0bb74ee3d50d1f7aac8bb1c6f6945ee8e33460319ca86010552944；后端sha256:e8c4ee91a7c3265cda8c496ccc8fb485328d95b6c1662eaf2502011ce5d005a5。
- 独立Go API、PostgreSQL tmpfs、Nuxt production和Nginx，127.0.0.1:6101；6010原型只读。实际HTTP/SQL、浏览器原生操作与受控失败/迟到分别记录；没有重跑开发unit/lint/type/build或开发E2E。
- Users空/无结果/加载/失败：Chromium和WebKit，中英文，320/390/720/721/900/901/1280/1440，两种高度800/1000。字体完成、双RAF、scrollY=0、鼠标中立后比较位置与computed styles。
- 真实数据库45个分页账号、独立精确匹配组、32字符合法账号；真实换组/改密/会话及合成学习材料。仅QA数据库写入。
- 18c9固定候选没有任何生产修补。归因后补验只修测试前提；原始FAIL/ERROR文件均保留。

## 本轮实际覆盖

详见[覆盖矩阵](./cr030-074-coverage.md)。

- R072-01/02通过：完整双语错误/重试原查询、432×44输入（720px）、300×44输入（390px）、20rem空态、不同高度纵向位置、两行loading骨架。不以固定32px补偿解释不同高度。
- Users真实三页20→40→45、无重复/终页、追加失败保留列表、40行详情返回滚动/焦点、详情再搜索、SQL精确优先/trim/case、非法/跨查询/跨管理员cursor、旧请求离页后不能替换新查询通过。
- 正常短名详情的完整文案、ISO日期、Plan/额度、正确用户/不同长短资料modal、旧URL/深链接/前进后退、只读边界、500/404/重试/关闭迟到、键盘焦点圈定及Axe通过。32字符详情明确FAIL。
- CR033真实GET/PUT有限/0/不限/admin null、取消/退款/窗口外/他人/降低额度、换组原子投影、真实密码重置204与两旧会话在受保护/api/v1/me/account返回401通过；丢响应已提交200且SQL已变，只1PUT+1GET，无自动重放。
- CR029/032：首页Review、同高日期、注销说明、五类访客原地引导及私有请求/payload隔离、登录注册返回、安全redirect、错误消息、账户语言优先、无自动复习创建通过。
- CR034：空库/旧库/全不参与均保留日期、上海单日边界3批6词、有→无→有、失败重试、迟到忽略、真实201创建、会话复用/单篇并存/恢复、422重新查询、不因resize/切语言自动提交；Chromium390/901/1080/1081/1440及WebKit901/1080/1081双语空/错/失败几何通过。
- Models标题/列表停用文案/零plan引用、Add/Edit/Key样式文案，Plans标题/Guest/保存文案，Library六统计文案/样式和空态通过；Plans字段局部几何单列CR035，不再称整页对齐。
- 单篇/日期复习实际作答：提示重复全部隐藏、learn/learned/learning三个空、同源颜色稳定、错误后纠正、输入不重叠及对应成功总结通过。不是实际AI生成质量样本。

## 原始结果及归因

不把不同脚本/补验重复断言相加为“全量通过”。以下计数仅是各文件断言数量，不是独立需求数。

| 新证据（均在本轮目录） | 原始PASS / FAIL / ERROR | 解释 |
| --- | --- | --- |
| [api](./evidence/cr030-074/api-results.json) | 58 / 0 / 0 | 真实权限、额度、分页、只读、20次本地GET的p95低于1秒；不是公网负载SLA |
| [users-matrix](./evidence/cr030-074/users-matrix-results.json) | 1196 / 116 / 0 | 80条按钮背景差异来自不对等鼠标hover及140ms过渡；48条共享语言控件内部分栏差异，二者在12条重叠。没有删除原结果 |
| [users-matrix-neutral](./evidence/cr030-074/users-matrix-neutral-results.json) | 1312 / 0 / 0 | 鼠标移出并等待160ms；侧栏内部列宽不与Users布局混算，而在long-detail-confirmation单独观察。仍精确比较侧栏外框、搜索/空态/骨架/错误几何及样式 |
| [users-supplemental](./evidence/cr030-074/users-supplemental-results.json) | 183 / 1 / 0 | 唯一FAIL为遗留QA072_EXACT查询新qa074夹具；users-edge以真实SQL期望补验通过。密码测试使用正确/me/account |
| [flows](./evidence/cr030-074/flows-results.json) | 21 / 0 / 1 | 前序已把账号偏好改中文，原脚本错误期待英文。随后末项logout前登录429；该项未执行，不能由此算通过。users-edge固定账号偏好并用独立账号补验登录/注销 |
| [users-edge](./evidence/cr030-074/users-edge-results.json) | 63 / 6 / 0 | 4条实际长名详情溢出；2条语言对照（其中文context被原型保存偏好污染）。后续全新context确认只有英文基线差异 |
| [long-detail-confirmation](./evidence/cr030-074/long-detail-confirmation-results.json) | 14 / 10 / 0 | 8条32字符详情溢出真实FAIL；2条英文语言控件基线差异；双引擎中文语言控件PASS |
| [visual](./evidence/cr030-074/visual-results.json) | 310 / 0 / 0 | 双语390/1440、访客/首页/日期/注销/正常详情/reader |
| [range-matrix](./evidence/cr030-074/range-matrix-results.json) | 240 / 0 / 0 | 两引擎指定断点、日期空/错/失败 |
| [range-flows](./evidence/cr030-074/range-flows-results.json) | 47 / 0 / 0 | 旧记录真实边界及恢复、日期/会话流 |
| [regression-final](./evidence/cr030-074/regression-final-results.json) | 148 / 0 / 0 | Models/Plans文案及dialogs/Library/reader错误；不覆盖后来发现的legend间距 |
| [shared-style](./evidence/cr030-074/shared-style-results.json) | 20 / 4 / 0 | 4条Plans legend计算样式差异，只作线索；Available models的8px margin是fieldset布局补偿，最终应看实际几何 |
| [plans-gap-confirmation](./evidence/cr030-074/plans-gap-confirmation-results.json) | 0 / 8 / 0 | 四组合分别确认篇幅gap缺8px、两个legend文字右移2px，真实FAIL |
| [lost-response](./evidence/cr030-074/lost-response-results.json) | 3 / 0 / 0 | 安全请求头保留，真实提交后丢响应 |
| [models-list](./evidence/cr030-074/models-list-corrected-results.json) | 7 / 0 / 0 | 同停用状态比较，不混用原型激活模型 |
| [review-regression](./evidence/cr030-074/review-regression-results.json) | 22 / 0 / 0 | 两种复习和总结、无自动建会话 |

人工查看了720px空态/加载实际与原型、390px长名详情、Plans对照截图。Plans截图夹具模型数量/描述与原型不同，不能比较整页高度；CR035依据同字段局部gap/文字起点，不把动态数据差异当Bug。初始辅助脚本误放到框架同名相对目录，在执行任何应用请求前发现；用apply_patch移到产品并移除本次误建脚本，没有删用户文件。

## 保留边界

真实AI调用0、供应商凭证0，发布门仍BLOCKED/NOT VERIFIED；本轮不读取或使用历史密钥。历史3×4×4生成矩阵、后台微秒/锁竞态、全量DTO负向及旧新配套版本矩阵只沿用原记录，不冒称本轮重测。保留“升级/回滚配套，管理员刷新/关闭旧常驻标签”要求。

本轮没有真实200%浏览器缩放、Firefox、真机/软键盘/人工读屏、公网负载、真实账号注销、模型概率质量；过去轮次200%证据仅历史参考。Axe无serious/critical不是全部可访问性合规证明。

## 环境与交接

[清理](./evidence/cr030-074/cleanup.json)：1881份既有文件在报告前全部未变；6001四容器ID/镜像/启动时间不变。仅删除本轮4容器和2网络，tmpfs中60个合成账号、11批次、4会话、6手工计量不可恢复，seed/截图/结果保留；6010既有服务未动，无真实用户数据。

按agt-verify-milestone，只交付质量产物、问题与[handoff](../handoffs/verification.md)。不迁移state/registry/history，不直接开发或更新UAT，不关闭CR或宣告里程碑完成。CR029–034保持open，新增CR035；下次守门器必须读取新问题单并同步开放项，不能以控制面旧6项列表漏掉CR035。

建议按既有开发—测试授权有限回frontend-claire修长名详情与Plans局部间距，再独立复测；现有规范足够，不返回需求/设计/API。语言名称保持本地称呼的明确规范，原型翻译差异单列保留，不在此次返工中顺手改全站语言规则。
