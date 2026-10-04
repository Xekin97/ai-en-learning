# QA13：CR016独立复验与日期警告确认

授权TRANSITION-M002-038，角色qa-quinn。前端281/后端288文件及生产构建摘要见inputs.json；UI22/H01、FE02与API007未变。五份QA12正文先存before-owned.tar.gz，全部旧失败/脚本/manifest原路径保留；未改应用、开发交接、CR016或控制面。QA13新建CR017/018是问题记录，不自动切角色或注册到state。

## 有效结论

以assessment.json为当前唯一综合判定：13个限定检查，10 PASS / 3 FAIL。run中的7项R检查全部通过，CR016 F12/F13可提交限定关闭；2项C检查对应同一双语文案偏差F15/CR018。date-control的4项H检查中3 PASS / 1 FAIL，H01对应F14/CR017/开发FE2-R16-W1。原始run共8 PASS/5 FAIL不得改写；其H02/H04是假失败，下述控制提供最终判定。

- R01（Chromium英文1440、WebKit中文390）：真实待提交禁用态、完整Problem503及service_unavailable、输入/已存值保留、回焦后直接键入、Enter显式重试成功、非标题字段不变、两次且仅两次PATCH。
- R02（同两组）：取消/空白不写，真实API并发标题revision冲突409保留本地输入并显示新已存值，再次显式保存成功。
- R03（同两组）：数据库撤销真实会话，页面保存安全转认证边界；无标题PATCH、直接写401、无假成功/误写/console异常；真实UI重新登录后仍见原已存标题。
- R04（Chromium）：新建一篇可删除测试短文，编辑时另一请求删除，保存404且不复活，刷新不可用。
- C01：R01原状态采样与批准l.title.failed逐字比较；prototype.mjs独立打开中英save-error并确认源文案/回焦。C01自动失败截图是延迟比较时的后续页面，不用于证明错误态，使用R01的ordinary-failure截图。
- H01–04：同批次同身份，直接URL与硬刷新，分别读取HTTP首屏日期、DOM textContent、CSS可见innerText、HTML lang和console/pageerror。WebKit英文逗号/at差异真实，其他三组对照一致。

仅当前用例、当前批次URL、明确预期的HTTP状态资源错误可以放行；console.error/warning及pageerror均核对，未过滤hydration/TypeError。原型/实现数据不同不做整页像素等同比较；标题区域结构、焦点及手机宽度单独断言，中文原型/实现截图已人工查看。

## 脚本限制与原件

第一轮H使用innerText，被CSS text-transform:uppercase影响：SSR Sep/PM与渲染后SEP不同，Chromium/Firefox误报FAIL。date-control只改为比较真实DOM textContent并同时保留innerText，没有放宽水合一致性条件；WebKit英文仍失败且有两条实际console.error。没有因脚本失败修改产品。首次run的R/C结果不受此测量问题影响，不重复无关业务用例。

另澄清QA12 control-valid：虽然Problem正文已完整，但其响应头仍是application/json；不能据此宣称服务故障映射已验证。QA12的失败焦点和会话TypeError原事实保留，QA13 R01已用完整正文及正确application/problem+json覆盖真正服务错误，并验证用户看到service_unavailable。

## 运行与来源

产品根目录运行：

```sh
python3 .planning/milestones/M002/verification/evidence/qa2-013/run/run.py
python3 .planning/milestones/M002/verification/evidence/qa2-013/date-control/run.py
/Users/xekinzhuo/.npm/_npx/387698761821791d/node_modules/node/bin/node .planning/milestones/M002/verification/evidence/qa2-013/prototype.mjs
```

前两命令因已记录产品FAIL返回1，仍在finally停止自建服务；prototype返回0。启动器/代理/API小工具及固定provider沿既有本地支持代码，验收场景和判定由QA重新编制，没有重跑开发单元/lint/typecheck/build。保留QA12隔离数据库作合成运行数据，不接生产；private env.json不进入产物。run/input.json定位QA12保留数据，frontend-cr016/build-location.json定位已验证生产构建。临时目录销毁后需从QA12 runner准备新数据并更新fixture ID及构建定位，不能原样复用失效ID。

run创建并删除一篇合成短文：本地provider1、真实AI0；date-control与prototype均0。检查保护/构建未变与端口停止结果见finalization.json。真实SSE生产代理、真机、读屏、04:00实时时点与AI-QUALITY-90不在本轮结论内。

## 交接

本轮结果属于独立QA，但未进行用户UAT，未宣布里程碑完成或关闭CR。CR017日期警告、CR018固定文案交前端同批修复；CR016限定通过建议由下一次守门正式登记。CR001建议及CR002/一期遗留/历史W01继续保留，W01与确定性的F14不自动视为同根因。文档/问题单当前入口见report.md、coverage-matrix.md、handoffs/verification.md和manifest.json。
