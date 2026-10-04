# QA16 CR019独立复验

授权TRANSITION-M002-043；质量角色qa-quinn。source/build输入见inputs.json，原型UI22/H01，前端frontend-cr019 / 后端backend-cr013。既有开发检查已核对不重跑，构建不重建。

## 运行

产品根目录使用`python3 .planning/milestones/M002/verification/evidence/qa2-016/control/run.py`；依赖此前Node24/Playwright浏览器及build_directory。端口3300/3330/3332/38080须空闲。run.py复用既有本地启动/停服逻辑，独立QA断言位于control/icon-retest.mjs；生产Nuxt经同源代理到现有契约mock，原型独立静态服务。不会连接真实DB或提供方。

有效结果为control/results.json的I16-zh/en-360/1440四项，8次区域axe均0违规/0incomplete，warning/error/pageerror0。本轮独立验证批准图标与直接界面风险；真实标题业务/权限/持久化依据QA15及其历史证据接续，不冒充本次新增集成测试。

## 原失败与修正

顶层run.py/icon-retest.mjs/results.json为首轮原件，4 FAIL/0 PASS。QA错误假定ariaSnapshot会保留重复同名text子节点；实际为单一命名button。control改以批准copy精确可访问名称和生产/原型真实快照一致性判断，图标资产/布局/装饰属性/键盘/点击/取消/保存断言保持。corrections.json解释边界；不改产品、预期文案或过滤告警，不覆盖原失败。

## 证据与接续

assessment.json只统计有效4项；audit.json核对19份旧证据及单行源码增量，复用QA15的11项标题/预设维度，追加图标维度；建议CR019/F16及CR002按原范围关闭，正式由守门登记。coverage.json保留49 CAP/25 PAGE/28视图/119 UIA，CAP220原验收与标题ICON10通过不代表整个CAP218/PAGE006或M002通过。

before-owned.tar.gz为QA15五份旧正文；其余166份artifact原hash保持，历史FAIL不改写。两轮runtime.json证明仅停止自身4服务，数据库未使用，本地/真实AI0。manifest/finalization记录保护、链接与恢复；UAT未执行，剩余覆盖与历史限制保持，新会话实验未执行，input/token unknown。
