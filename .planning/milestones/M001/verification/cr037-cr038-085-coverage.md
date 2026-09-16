---
milestone: M001
stage: verification
role: quality/base
agent_name: qa-quinn
status: awaiting_user_review
date: 2026-09-07
verification_round: TRANSITION-M001-085
verdict: pass
---

# QA085 CR037/CR038 覆盖矩阵

只声明本轮实际增量覆盖。原始计数有重叠，方法/fixture失败保留但由独立修正文件解释，不相加为需求数量。完整结论见[QA085报告](./cr037-cr038-085-report.md)。

| 追踪 | 场景/矩阵 | 独立证据 | 结论 |
| --- | --- | --- | --- |
| CAP004/021；PAGE009；API-003；DATA003/004 | 错当前密码真实422；中英安全规范化错误只在dialog内；字段保留 | password Chromium/Linux WebKit/macOS WebKit | PASS |
| CAP004/021；PAGE009；前端§15 | 原生Chromium AX ignored=false/alert；390/1440无重叠、可见、无裁切；实际人工查看中英390与中文1440 | password-chromium、manual-visual-review | PASS |
| CAP004；PAGE009；API-003 | 新尝试、Enter修正、取消/Escape、关闭重开、旧错误清除、初始/关闭/成功焦点 | 三份有效password结果 | PASS |
| CAP004；API-003；DATA003/004 | 失败保留两会话；成功保持当前、撤销其他；旧密码401、新密码200 | 三份有效password结果 | PASS |
| CAP004；API-003；API§1.3/1.6 | 本人改密204 / 0 byte / no Content-Type / no-store | password Chromium；no-content真实代理 | PASS |
| API§1.3/1.6；API-002/003/006/007/103 | 六类共享no-content消费者：logout（API-002）、自改密与account delete（API-003）、generation discard（API-006）、batch delete（API-007）、admin reset（API-103） | no-content-proxy + batch-delete-contract-recheck2 | PASS |
| API全局错误约定；CAP004/012/101 | 401/403/400/422业务/权限/格式错误，Problem安全、no-store，无密码/key回显 | no-content-proxy | PASS |
| CAP002/003/021；PAGE002/003/007；API-001/002 | 认证提示逐字、首元素、标题前、role=status、局部style；Chromium/Linux WebKit×中英×390/1440 | original-scope 两份，共覆盖历史96类检查 | PASS |
| CAP004/005/021；PAGE009 | 改密title/labels/helpers/notice/buttons两引擎×390/1440；共享账号删除本人确认helper | original-scope 两份，共覆盖历史20类检查并加共享helper | PASS |
| CAP002/003/021；PAGE002/003/005/007 | Review/Library安全返回；login/register往返、非法/管理员目标降级、无自动review、错误保留提示 | auth-regression 110个有效检查 | PASS |
| CAP011/021；API-006；DATA017/018 | 有效claim优先、login/register往返、token不进URL/storage、刷新丢失回普通Library提示 | auth-regression；HTTP contract fixture经真实页面状态链 | PASS；API-006保存/放弃/访客承接，非AI/服务端事务证明 |
| CAP002/003；API-002 | 管理员认证分流优先进入/admin/models | admin-role-recheck | PASS；只证明API-002认证/角色分流，不外推API-101模型管理权限 |
| CAP101；PAGE101；API-101 | 已认证管理员通过凭证/模型配置接口建立隔离合成fixture | no-content-proxy | PASS（仅本轮fixture准备的管理员成功路径；与API-002分流及六类204结论分开，不宣称完整权限矩阵） |
| QA081原始125语义范围 | 认证96、改密copy20、专用认证2、locale2、logout2、完整性3 | original-scope两份 + cleanup；逐类映射见报告 | PASS；不机械声称126=125 |
| PAGE101；CAP101/102/021 | DEV084 Linux管理员model dialog：实际与批准原型同平台/同context几何 | linux-geometry-comparison-recheck + actual/design截图 | PASS；desktop 24/24，mobile 25/25 |
| 平台 | 原生macOS Playwright WebKit唯一账号完整功能流 | password-wk3_20260907z | PASS；不等于Safari实机认证 |
| 安全/边界 | 固定候选/指定源与批准物不漂移；真实AI 0；UAT不变；tmpfs精确销毁 | baseline、environment、cleanup | PASS |
| 未覆盖 | 真实AI质量/供应商可靠性、服务端claim消费事务、全站视觉、真机Safari/VoiceOver、压力/Lighthouse/公网 | 无本轮证据 | NOT VERIFIED；发布门保持BLOCKED |

## 有效 UAT 准备清单（尚未部署/执行）

1. 主会话经单独 086 门将已测配套候选部署到6001，保留原数据库、运行参数和账号；部署后先做身份/健康/契约冒烟。
2. 用户强制刷新后，从 Review 与 Library 进入登录/注册：提示在标题前、是首元素、语义为 status，返回目标正确。
3. 学习者 Account 打开 Change password：中英文说明与按钮正确；取消/Escape/重开清空并恢复焦点。
4. 输入错误当前密码：dialog 内出现清晰安全错误，字段保留；直接修正后成功。
5. 用户可选择使用其明确授权的专用 UAT 测试账号，自行验收成功改密后的当前/其他会话与旧/新密码语义；这不是 UAT086 的自动任务。UAT086 部署/冒烟硬约束为不修改任何现有 UAT 密码，QA也不得代用户执行此可选改密。
6. UAT 功能接受不替代真实AI质量、Safari真机/VoiceOver或发布认证；这些继续独立标明。
