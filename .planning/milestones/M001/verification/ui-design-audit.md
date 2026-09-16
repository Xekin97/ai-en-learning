---
milestone: M001
stage: verification
role: quality/base
agent_name: qa-quinn
status: awaiting_user_review
date: 2026-09-07
verification_round: TRANSITION-M001-085
verdict: pass
functional_uat: ready_for_preparation_gate
release_readiness: blocked
---

<!-- QA085 CURRENT BEGIN -->
## QA085 当前UI增量审核：PASS

中英文390/1440错误态均在当前密码dialog内清晰可见、无重叠/裁切，字段/notice/footer层级正确；Chromium原生AX `ignored=false` / `alert`。qa-quinn实际查看了中英390、中文1440截图。

DEV084 Linux旧模型dialog失败已用同Linux Chromium/context的候选与批准原型直接比较：desktop双方`[20,20,16,24]`，mobile双方`[20,20,16,25]`；字体均loaded。旧固定23px是oracle方法差异，不是字体借口或实际偏离。[几何](./evidence/cr037-cr038-085/linux-geometry-comparison-recheck.json) · [人工查看](./evidence/cr037-cr038-085/manual-visual-review.json) · [报告](./cr037-cr038-085-report.md)。不外推为全站视觉或真机Safari通过。
<!-- QA085 CURRENT END -->

<!-- QA081 CURRENT BEGIN -->
## QA081 当前UI复验

认证卡片原始位置/语义、本人改密十组中英文文案已逐项对照原型，390/1440、Chromium/WebKit相关检查通过。不是仅检查文字存在；包含首元素、标题前顺序、role=status、局部几何/样式、溢出和共享注销说明。

**未通过：CR037-03改密错误态。** [桌面](./evidence/cr037-081/chromium-fixed-en-US-password-invalid.png)、[手机](./evidence/cr037-081/residual-password-error-390.png)、[原生AX证据](./evidence/cr037-081/modal-accessibility-observations.json)。错误提示在模态框外，不能用locator.isVisible或无Axe严重项替代错误可感知验收。

[完整报告](./cr037-081-report.md)、[矩阵](./cr037-081-coverage.md)。原生macOS WebKit完整账号中断保留；Linux补齐功能不代表Safari实机。没有重开无关已通过设计或把该问题解释为新设计需求。
<!-- QA081 CURRENT END -->

<!-- UAT079 FEEDBACK CURRENT BEGIN -->
# UAT079反馈：认证提示与改密文案审核FAIL

[完整实际/设计对照及截图](./uat-079-feedback.md)。登录/注册提示应位于卡片最上方标题之前，实际在标题/副标题之后且缺role=status；本人改密英文辅助说明、会话说明、提交按钮不一致。其余弹窗标题/标签/辅助说明/取消按钮不应概括为全部错误。

这两项已有清晰原型，责任是实现偏差，不是重新设计。已新建CR037，其他既有验证结果和已知语言选项基线差异保留。

以下此前正文完整保留为历史。
<!-- UAT079 FEEDBACK CURRENT END -->

<!-- QA078 CURRENT BEGIN -->
# 第078轮UI独立审核通过指定范围

CR036原型警告完整双语、padding/gap/border/背景色/文字色/radius/字形/行高/标题间距/24px下边距一致；四组双引擎双语390/1440全状态保存/重载、语言/500重试与Axe通过。[扩展证据](./evidence/cr036-078/plans-expanded-results.json)。

CR035空/3模型四组、双引擎双语6宽度仍8px/0偏移。Users全部搜索状态1312局部对照、长短名/只读reader及关联复习/访客/模型界面指定回归PASS。人工查看[WebKit英文390](./evidence/cr036-078/screenshots/expanded-webkit-en-US-390.png)，提示与选项层次清楚。

focus截图等待已在新脚本执行前修正，原076捕获问题不抹除。BASELINE_VARIANCE语言选项本地称呼保留，不宣称整屏像素完全一致。本轮真实200%/真机/读屏未测。[报告与限制](./cr036-078-report.md)。

以下第078轮之前正文完整保留为历史。
<!-- QA078 CURRENT END -->

<!-- QA076 CURRENT BEGIN -->
# 第076轮UI独立审核

- CR030-R074-01 PASS：双引擎双语320/390/720/721/900/901/1280/1440，合法32字符及短名详情全名/徽章/搜索保留，无页面溢出；另测长名拥有两篇资料的reader。
- CR035 PASS：四组、空/3模型、双引擎双语6宽度，两个fieldset的标题到选项均8px，文字偏移均0；未以不同夹具的整页高度比较。
- CR036 FAIL：Guest清空模型与篇幅，额度0或5保存并刷新后缺少批准警告。实际notice-warning为空，原型显示黄色提示。[问题与双语证据](../changes/CR-036.md)。
- BASELINE_VARIANCE保留：英文原型语言选项Chinese与实现中文的宽度不同，实现符合本地称呼规范，不擅改语言规则、不宣称整屏像素相同。
- 捕获校准：focus末尾部分long-detail截图未等待再次导航，实际是列表；不作详情视觉证明。另等待真实标题、字体、两帧后生成[确认截图](./evidence/cr030-cr035-076/screenshots/confirmed-detail-webkit-en-US-320.png)和[24项检查](./evidence/cr030-cr035-076/detail-capture-results.json)，原文件保留。

已人工查看Plans英文实际/原型、中文额度5实际以及修正后的WebKit320长名详情；其他局部测量/键盘/Axe、执行范围与限制见[报告](./cr030-cr035-076-report.md)。当前整体FAIL；真实200%、真机和VoiceOver不是本轮通过项。

---

以下为第076轮前的历史正文，保留原样，不代表当前结论。
<!-- QA076 CURRENT END -->

<!-- QA074 CURRENT BEGIN -->
# 第074轮UI独立审核

- 已闭合的指定问题：R072-01完整双语搜索失败说明；R072-02两种高度、8个宽度、双引擎/双语的搜索输入、空态位置、loading两行骨架。
- CR030-R074-01仍FAIL：32字符详情390px实际页面宽481px（en）；中英文320/390、Chromium/WebKit均失败。[几何](./evidence/cr030-074/long-detail-observations.json)、[实际截图](./evidence/cr030-074/screenshots/long-name-chromium-en-US-390.png)。
- CR035仍FAIL：Plans模型标题gap8正确；篇幅gap0应8，两legend文字+2px应0。[局部测量](./evidence/cr030-074/plans-gap-observations.json)、[问题单](../changes/CR-035.md)。
- BASELINE_VARIANCE：英文原型把语言选项中文译为Chinese，控件多25px；实现符合响应式2.4要求本地称呼。中文新context双方一致。不是当前Users外框/位置修复失败，也不能宣称全屏像素相同。
- 初始按钮hover/过渡造成的比较差异以中立鼠标重测澄清；Plans legend与span的margin差异必须看实际gap，不直接算错。没有删原始失败。

人工查看720空态/加载、390长名、Plans对照。Axe、键盘、reader与相关回归见[报告](./cr030-074-report.md)，本轮没有真实200%或真机测试；不沿用旧轮数量宣称本轮执行。

---

以下为第074轮前的历史正文，保留原样，不代表当前结论。
<!-- QA074 CURRENT END -->

<!-- QA072 CURRENT BEGIN -->
# 第072轮UI独立复验

正常态/访客/reader774项、日期断点矩阵510项通过，不等于所有状态逐像素通过。最终Users补测保留两组残余：

- R072-01：英文搜索失败说明shortly与批准in a moment不一致；[实际](./evidence/cr029-cr034-072/screenshots/CR030-R072-01-actual-1440.png) / [原型](./evidence/cr029-cr034-072/screenshots/CR030-R072-01-design-1440.png)。
- R072-02：720px搜索输入630px vs432px；390/720px搜索前卡片在1000px高视口上移32px。字体loaded、两帧布局稳定、scrollY=0、控制器隐藏后再现；[完整几何](./evidence/cr029-cr034-072/users-geometry-observations.json)、[实际](./evidence/cr029-cr034-072/screenshots/users-geometry-actual-en-US-720.png)、[原型](./evidence/cr029-cr034-072/screenshots/users-geometry-design-en-US-720.png)。1280px一致；不向所有状态推广固定32px。

CR-031中文重试准确，CR-032双方faint统一#596c6b，CR-034日期恢复与1080断点已通过。Chromium/WebKit reader、作用域Axe和双语真实200%通过。人工查看了真实200%日期/中文reader、Users结果和错误对照、两目标交错4空截图；自动几何仍能发现肉眼初检漏项，不删除失败。

[详细报告与限制](./cr029-cr034-072-report.md)。下一步仅前端按既有基线返工，若修改共享后台壳需复验Models/Plans。

---

以下为第072轮前的历史正文，保留原样，不代表当前结论。
<!-- QA072 CURRENT END -->

# 第 065 轮 UI 复验

## 当前结论

有明确前端文案残余和新发现空态交互遗漏，不能宣布 UI 全面闭合。

- **CR-031 / 实现偏差**：中文 reader 500 失败按钮“再试一次”≠原型及交互“重试”；英文和不可用提示通过。见 [最终对照](./evidence/cr029-cr033/regression-final-results.json)、[实际截图](./evidence/cr029-cr033/screenshots/reader-error-zh-CN.png)。
- **CR-034 / 设计遗漏**：零命中移除日期选择器，空态提示“换个日期范围”却没有操作入口。原型 PAGE-007 empty 与生产一致，故不能靠“与设计相同”通过。见 [问题单](../changes/CR-034.md)、[旧记录截图](./evidence/cr029-cr033/screenshots/review-old-only-en.png)。
- **BASELINE_VARIANCE / CR-032**：引导 h1 32px 的继承颜色为生产 `#596c6b`、原型 `#6d7f7e`。50 个组合只有这一 style 属性不同，其他本轮采集属性/完整消息一致。生产加深来自已批准 CR-010 全局弱文本修订；本轮不擅自回退或改原型，也不把 50 次差异当 50 个问题。建议 UI/UX 交付明确记录既有修订覆盖范围，避免继续存在两套 baseline。

## 已通过部分

- 首页 Review、注销两段文字/中性说明色；双語 × 320/390/720/1280/1440。From/To 在有命中数据时都为 44px，新增空态问题另列。
- 详情搜索保留可提交、返回/日期/View only/View 精确文案；不同批次 modal、query 不重建父页、关闭焦点/滚动和列表恢复。
- reader 宽度、圆角、首尾 padding、配置间距、阅读字体 18px/1.9/max68ch、资源留白；长文固定首尾，只有 body 滚动。材料语言不随界面翻译。
- Chromium/WebKit 双语手机/桌面 reader 与 axe；实际 Chromium 200% tab zoom 与关闭操作通过。
- Models/Plans 的本轮代表性既有控件、Library 六统计和空态回归；两模式复习输入不重叠及总结。

[手机 reader 实际](./evidence/cr029-cr033/screenshots/reader-app-en-US-390.png) / [批准原型](./evidence/cr029-cr033/screenshots/reader-design-en-US-390.png) 已人工查看。正文、用户名、保存日期、目标词和模型名来自各自不同合成数据，不能全图像素相等；原型显示 Short 而实际 Brief 对应不同 length 配置，不是翻译偏差。

[真实浏览器 200%](./evidence/cr029-cr033/screenshots/browser-real-zoom-200.png) 由专用临时扩展调用浏览器 tabs.setZoom(2)，读取 getZoom=2；未用 CSS zoom 截图冒充。只有英文 200% 直接操作；双语窄 CSS 视口与双引擎另有覆盖，不据此宣称双语真机全量完成。

## 防止错误结论

修正测试定位只根据实际 DOM/批准稿：输入默认 type=text、保存按钮为表单外的点击按钮、eyebrow 的 CSS uppercase 使用 innerText 比较。不得把 [] 与 [] 的“相等”当控件存在性。标题和输入均明确等待 dialog open 后取值。

当前失败不能通过修改基准或删除断言关闭。专业原型、生产代码和技术快照本轮完全未改。


---

## 历史记录：第 065 轮前（不代表当前结论）

# M001 UAT 新反馈 UI 复审

用户列出的差异已经复现，具体对照见 [证据表](./evidence/uat-detail-regressions-2026-09-05.md)。

- 日期输入：桌面 From 54px / To 44px；原型同为 44px。第二字段 margin-top 20px 是独立修复点，移动端也要归零。
- 首页：英文 learner 的 Start review 应匹配 Review；同时保留访客的独立文案。
- 账号：危险区副标题与正文均不逐字一致；红色说明来自旧可访问性返工，但未同步原型，需由设计统一。
- Users 详情：原型保留可用搜索，实际删除；返回文案、日期表达、Library 副标题和资料操作均偏离。
- 资料：实现跳独立页面，而原型为 modal。原型本身也被用户否决，notice→主题区域间距为 0；不能用旧图机械通过新实现。

## 设计/实现责任

[CR-029](../changes/CR-029.md)、[CR-030](../changes/CR-030.md) 修复已有明确基线的偏差；[CR-031](../changes/CR-031.md) 由 UI/UX 重做资料弹窗并同步账号危险区色彩。保持只读权限与既有内容边界，不添加管理操作或新学习能力。

设计修订须交付中英文、桌面/手机、短/长内容的可运行状态及间距规则；验证不能仅依赖像素相近，还需实际打开/关闭、内容正确、搜索与焦点保留及可读性检查。

本轮只复核与登记，没有修改批准原型；旧截图是缺陷证据，不是新的批准稿。
