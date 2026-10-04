# QA14 · CR017 / CR018独立复验

21项全部通过：核心13项、共享页面8项。内嵌午夜/中午样本不重复计数。判定见[assessment](assessment.json)，逐项原始值见[核心结果](run/results.json)及[共享结果](run/shared-results.json)。仅建议两项原缺陷限定关闭，正式状态与整期覆盖不由本证据改写。

## 输入与方法

授权TRANSITION-M002-040，PRODUCT03/UI22/H01/DB03/BE03/FE02保持。[inputs](inputs.json)记录前端282/后端288源文件与开发生产构建444文件。测试使用真实本地Go服务、PostgreSQL18和交付Nuxt生产构建，代理仅精确注入普通标题503；409/401/404使用真实后端状态。没有重跑开发单元/lint/类型/格式或重建前端；后端仅编译为此次本地运行服务。

[qa.mjs](run/qa.mjs)沿用QA13质量角色独立测试，并修正已确认的innerText测量问题，使用原始DOM textContent，不按大小写或忽略警告归一化。C01直接读批准copy.json的l.title.failed；QA13原型运行证据仍有效且文件未改。新增WebKit双语北京时间跨年午夜/中午显示，在洛杉矶浏览器时区核对，恢复saved_at并核对批次摘要。H01/H03截图为最后一个中午边界显示，初始及硬刷新原值另存结果JSON。

[shared.mjs](run/shared.mjs)独立编写，覆盖个人信息、道具到期、消息时间及后台用户详情，WebKit英文1440/中文390。先检查既有测试库的成长激活、等级1与签到配置，随后在新克隆库创建本轮专用消息、已发行卡和持有记录；未来到期为2027年1月1日00:00。不会为使测试通过而静默修改前置规则。卡定义受不可变保护，无删除或绕过触发器；销毁测试克隆库统一清理。

## 运行与复现

在产品根目录运行：

```sh
python3 .planning/milestones/M002/verification/evidence/qa2-014/run/run.py
```

[runner](run/run.py)依赖inputs中已冻结的本地前端构建、既有可丢弃PostgreSQL集群和私有0600运行配置、Node24/Playwright浏览器及Go工具链。配置在系统临时目录，不打包或打印敏感值；本证据不是可脱离前置环境运行的部署包。复现须在新的证据输出目录复制脚本并调整RUN/EVID路径，避免覆盖本次原件；测试数据库名称已删除可重新使用，但若同名库已存在则拒绝覆盖。

运行以wordweave_fe_m002为模板建立wordweave_qa14_date_copy；所有测试只写后者，原开发库不受测试写入。仅本地固定provider1次用于创建可删除批次，外部AI0。[execution](run/execution.json)确认克隆库删除及子进程/集群停止。私有env未入证据。

## 结果解释与限制

- R01–04共7项：失败回焦/直接键入/Enter重试、取消空白零写、真实409、身份失效UI与重新登录、删除404不复活，均通过。
- C01两语言：批准普通失败提示逐字一致，输入保留，均通过。
- H01–04共4项：三引擎日期直接/刷新，WebKit额外双语边界；没有hydration或页面异常。
- shared 8项：SSR与客户端日期逐字一致、可见、语言正确，无异常。

核心5条console.error仅为指定R用例的503/409/404 HTTP请求错误，按用例+URL+状态精确匹配，未过滤水合警告；日期与共享页面runtime为空。核心/共享原始日志均保留，无失败重跑或替代判定。本轮脚本/文档整理中的静态读取错误不计入产品用例。

人工查看中文手机失败态、英文详情和中文卡片截图，目标提示、日期、焦点可读；只作局部设计核对。没有证明真机Safari、人工读屏、全部UIA、生产代理、04:00结算实时时点或真实AI质量。历史W01保持未定位；当前代表页面通过不等于关闭历史观察。

## 原证据与维护

QA13原五份正文归档于[before-owned](before-owned.tar.gz)，其余原始失败、日期控制和manifest保持原件；本轮受保护文件清单见[protected-before](protected-before.json)。[coverage](coverage.json)保持49 CAP/25 PAGE/28视图/119 UIA，局部通过不提升整项PASS。

最终源文件/构建/旧证据/清理/相对链接/文档大小核对见[finalization](finalization.json)，完整哈希见[manifest](manifest.json)。新会话交接实验未执行，input/token unknown。没有修改工作流、关闭CR、部署或提交。
