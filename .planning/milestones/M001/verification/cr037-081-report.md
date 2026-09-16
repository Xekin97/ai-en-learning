---
milestone: M001
stage: verification
role: quality/base
agent_name: qa-quinn
status: awaiting_user_review
date: 2026-09-07
verification_round: TRANSITION-M001-081
verdict: fail_rework_required
functional_uat: changes_requested
release_readiness: blocked
---

# QA081 独立验证报告

## 结论

**FAIL，有限返回 implementation；不交付新 UAT、不发布。**

- CR037-01 认证提示位置/语义和 CR037-02 本人改密三处英文已通过原始断言复测，125 PASS / 0 FAIL / 0 ERROR。
- 关联异常态发现 CR037-03：当前密码错误时，错误提示位于原生模态框背后的页面，视觉被遮罩模糊，且被 Chromium 原生可访问性树忽略。CR037 保持 open，不能因原两项通过而整体关闭。
- 新建 [CR038](../changes/CR-038.md)：成功改密的204响应缺少既有契约要求的 Cache-Control: no-store。较低严重度的后端契约偏差，不是改密失效或已发生泄露。
- Chromium 与 Linux WebKit 的完整输入、取消、成功改密和会话规则已执行；macOS WebKit 完整账号复验仍被原生异常中断，**不等于 macOS/Safari 实机通过**。
- 这是漏检补齐后的实现问题，不是新产品需求、设计审美变更或已证实由DEV080引入的回归。无需返回产品/设计/技术重新定义规则。

## 输入与候选

[081批准](../reviews/implementation-cr037-independent-verification-approval.md)、[QA079必验项](./uat-079-feedback.md)、[DEV080交付](../implementation/frontend-cr037-080-validation.md)、[原型](../design/prototype/app.js)、[认证交互](../design/cr031-cr032-interaction-contract.md)、[产品能力](../product/abilities.md)、[页面追踪](../product/pages/index.md)、[前端技术约定](../technical/frontend.md)、[API v1.4](../technical/api/index.md)。

已核验 gate081 的23份审批摘要及Profile锁、唯一active角色qa-quinn。首次记录3398个既有文件摘要；报告落盘前全部保持一致，包括源码、设计、开发证据、控制面和历史。

- frontend: sha256:170b8f2c58a2792b21cfe71244f80f263beb825a55fb84d5c2c0dec72adb0e3b
- backend: sha256:e8c4ee91a7c3265cda8c496ccc8fb485328d95b6c1662eaf2502011ce5d005a5
- QA独立部署：127.0.0.1:6101，Go + Nuxt + Nginx + tmpfs PostgreSQL。
- macOS Playwright1.62.1；Linux WebKit使用同版本官方arm64镜像，固定digest sha256:941cc91e5022880ac1d14ae90b476b624deb6399dbbc28d612d5d5bd7928fcbd。
- Linux仅挂载只读测试依赖与本轮证据目录，通过回环代理访问同一候选；未安装/升级项目依赖或系统。
- [环境](./evidence/cr037-081/environment.json)、[测试计划](./evidence/cr037-081/PLAN.md)、[覆盖矩阵](./cr037-081-coverage.md)。

## 执行结果

下表为原始报告计数；复跑存在重复场景，不相加为“独立用例总数”，重复FAIL不是多个产品缺陷。

| 独立执行 | PASS / FAIL / ERROR | 实际结论 |
| --- | --- | --- |
| [原始QA079断言重测](./evidence/cr037-081/original-retest-results.json) | 125 / 0 / 0 | 原两项差异已修复，macOS双引擎 × 中英 ×390/1440 |
| [Chromium扩展最终](./evidence/cr037-081/independent-chromium-fixed-results.json) | 333 / 2 / 0 | 两种语言均复现同一个错误提示遮挡问题；其余认证/账号/会话检查通过 |
| [Linux WebKit扩展首次](./evidence/cr037-081/independent-webkit-linux-results.json) | 313 / 2 / 2 | 认证子集251 PASS；账号的两个ERROR来自读取204响应体的Playwright协议限制 |
| [Linux WebKit账号补测](./evidence/cr037-081/independent-webkit-recheck-results.json) | 85 / 2 / 0 | 原中断后的成功/会话检查补齐；仍是同一个错误提示缺陷 |
| [Chromium实际认证跳转](./evidence/cr037-081/flows-chromium-results.json) | 45 / 0 / 4 | 真实登录/注册/角色/语言45项通过；4个claim场景受初版脚本定位器错误影响 |
| [Chromium claim修正重测](./evidence/cr037-081/claims-chromium-results.json) | 48 / 0 / 0 | 中英×390/1440有效claim优先、往返和刷新失效通过 |
| [Linux WebKit实际认证及claim](./evidence/cr037-081/flows-webkit-results.json) | 93 / 0 / 0 | 与Chromium相同验收；claim使用契约传输fixture，认证使用真实后端 |
| [真实API负向/会话](./evidence/cr037-081/account-api-results.json) | 36 / 1 / 0 | 401/403/400/422、204空体、保留/撤销会话通过；缺少no-store |
| [两项定点补证](./evidence/cr037-081/residual-proof-results.json) | 6 / 1 / 0 | 保留手机截图与204实际响应头；DOM派生ariaSnapshot不能证明原生AX可用 |
| [Chromium原生AX补证](./evidence/cr037-081/modal-accessibility-results.json) | 2 / 1 / 0 | 错误节点ignored=true，原因activeModalDialog，确认不可访问 |
| [macOS WebKit账号重试](./evidence/cr037-081/independent-webkit-macfull-results.json) | 10 / 0 / 1 | NSInvalidArgumentException导致浏览器退出，剩余未验证，不记PASS |

未机械重跑DEV已通过的unit、lint、format、typecheck、build或全量旧E2E。没有把管理员Reset password替代为本人Change password。

### 首次失败与测试方法修正

全部首次结果保留，不修改结果为PASS：

1. Chromium初版 [325 PASS / 6 FAIL](./evidence/cr037-081/independent-chromium-darwin-results.json)：4项使用不存在的 .locale-switcher；根据实际控件改为 .app-header .locale-switch 后重跑。另2项真实产品失败原样保留。
2. claim初版：390宽度的桌面导航按既有响应式规则隐藏；改点首页可见CTA。保存栏真实名称为 .result-action-bar，不是 .output-actions。只修QA脚本，未修改应用DOM、注入store或放宽产品断言。
3. Linux WebKit无法读取204的Network.getResponseBody。补测仍要求204和无Content-Type，并以独立真实APIRequestContext读取0字节响应证明空体；未绕过成功改密、旧/新密码及双会话校验。
4. Playwright body.ariaSnapshot仍列出了背后的alert；这是DOM派生快照，不足以证明平台可访问性。改用Chromium CDP Accessibility.getPartialAXTree检查真实节点，记录ignored原因。没有把前一个快照的PASS当成错误可感知的证据。
5. [原生简易输入控制](./evidence/cr037-081/native-webkit-control.json)通过，说明不能声称所有macOS输入均崩溃；完整账号复验在当前原生WebKit中仍触发NSTextInputContext textInputClientDidUpdateSelection异常。Linux功能结果不能替代macOS平台兼容性结论。

## 发现项

### QA081-01 / CR037-03 — P1，改密失败提示被模态框隔离

追踪：CAP-004/021、PAGE-009、DATA-003/004、API-003；QA079“错误提示、取消和焦点”必验项；前端技术§15的键盘/模态框/错误可访问性。

复现：学习者打开 /account → Change password，填错误当前密码以及两份相同的合规新密码，提交。后端正确返回422，弹窗保持打开，但 .app-error 在账号页原位置，不在dialog中。用户看不到清晰失败原因；Chromium原生AX忽略此节点，原因activeModalDialog。

证据：[桌面英文](./evidence/cr037-081/chromium-fixed-en-US-password-invalid.png)、[手机英文](./evidence/cr037-081/residual-password-error-390.png)、[Linux中文](./evidence/cr037-081/webkit-recheck-zh-CN-password-invalid.png)、[原生AX](./evidence/cr037-081/modal-accessibility-observations.json)。Chromium/Linux WebKit × 中英文均复现；手机单独补证。

PROPOSED：frontend-claire将改密失败放在当前弹窗内可感知的错误区域，沿用既有AppError/本地化错误模型。保留字段、成功/取消清空、焦点、当前/其他会话语义；避免页面层重复或陈旧错误。不要把原始Problem/凭据直接渲染。无需改全局dialog或新增设计方案。

验收：错当前密码→422且弹窗内有清晰错误；原生AX不因modal而忽略；键盘可继续改正提交，失败不改变会话；取消重开状态合理；中英/390/1440/双引擎；正确改密和焦点不回归。

### QA081-02 / CR038 — P2，成功改密204缺少no-store

追踪：CAP-004、PAGE-009、API-003及API§1.3/1.6。真实请求正确返回204、0字节、无Content-Type，但缺少Cache-Control。由两个独立合成账号重复确认，[实际响应头](./evidence/cr037-081/residual-proof-observations.json)、[API原始结果](./evidence/cr037-081/account-api-results.json)。

只读定位显示 backend/internal/httpapi/response.go 的 writeNoContent 删除Content-Type后直接WriteHeader，未像JSON/Problem helper设置no-store。此后端在DEV080未改，属于本次发现的既有契约缺口；没有响应正文泄露证据。

PROPOSED：backend-ethan按既有约定补齐204响应缓存策略，继续保持空体/无Content-Type。因共享helper有其他消费者，开发和后续独立QA应检查受影响的204端点；不可恢复删除仅用独立可重建数据。详见CR038，不在QA轮修实现。

## 通过范围与明确限制

- 认证提示文字、DOM首元素、标题前顺序、role=status、局部几何和样式逐项对照；中英、390/1440无横向溢出。
- Review、Library、批次详情、Account、复习会话安全返回；登录/注册往返、错误和语言切换保留目标；无/非法目标不显示提示；注册/登录成功回安全地址，不自动创建复习；管理员进/admin/models。
- claim通过真实页面操作，经HTTP契约fixture→schema/mapper→状态→页面，未注入store。只替代生成选项、词表、SSE和领取claim响应；验证的是认证卡片优先级/内存生命周期，**不是服务端claim消费事务或真实AI质量**。
- 改密十组文本对照中英原型，按钮空值/不一致禁用、字段无重叠、弹窗可容纳、Tab/初始焦点/Escape/取消/重开清空/成功返回焦点通过；适用Axe没有serious/critical报告，但Axe不能替代错误态原生AX验证。
- 真实改密成功保留当前会话，撤销其他会话，旧密码拒绝，新密码可登录；失败不改变已有会话。共享注销本人确认说明与原型一致，未执行注销。
- 未重新进行全站视觉审核、全部既有CR、Lighthouse/压力测试、真实AI质量/流式供应商评估或实际Safari设备测试；本次增量不据此更新发布结论。
- 真实AI仍NOT VERIFIED；无供应商凭据、模型或生成运行；后端禁用外呼且内网隔离。不调用历史测试密钥。

## 数据、环境与交付边界

[清理证据](./evidence/cr037-081/cleanup.json)：4个专用容器和2个网络已核验标签后移除，6101释放；27个本轮合成账号所在tmpfs数据库已销毁且不可恢复，可用脚本重建。学习批次、复习会话、生成运行、模型、凭据均为0。官方浏览器缓存镜像和所有证据保留。

UAT6001四容器身份/镜像/启动时间均不变，6010原型仍可用，未改UAT密码/数据。源码、设计、API、数据库定义、开发交付未修改。只提交本轮QA证据、报告、交接和CR发现；旧报告正文逐字保留，完整性见 [delivery-validation-final.json](./evidence/cr037-081/delivery-validation-final.json)。

当前workflow仍在verification/qa-quinn；CR038是待守门器接收的新增索引项，不自行同步state/registry/history。CR029–036不重开。下一步建议有限回implementation处理CR037-03与CR038，再独立验证；新UAT和发布仍需后续明确交付与用户验收。
