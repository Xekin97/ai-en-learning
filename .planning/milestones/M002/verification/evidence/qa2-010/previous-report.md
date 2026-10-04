---
milestone: M002
stage: verification
role: quality/base
agent_name: qa-quinn
status: awaiting_user_review
result: scoped_verification_passed_remaining_coverage
version: M002-QA-09
date: 2026-09-28
---

# 二期独立验收第九轮

**访客／体验计划的原来源退款，以及固定预设的发布、权限例外与真实浏览器认证收录，通过本轮限定验证。** 最终15个稳定场景PASS，无新增产品缺陷。两次环境准备失败和首轮两项脚本/样文错误原件保留；针对性控制通过后才形成上述结论。二期仍有矩阵待验范围，UAT未执行。

## 输入与验收依据

APPROVAL-M002-036保持verification / quality/base / qa-quinn，已正式限定关闭CR014/015；不是新的实现授权。PRODUCT03、UI22/H01、DB03/BE03/FE02保持。[输入记录](evidence/qa2-009/inputs.json)核对前端frontend-cr014-015的280源文件、后端backend-cr013的288源文件，与交付摘要相符。复用已交付生产Nuxt构建，独立启动真实Go/PostgreSQL；未机械重跑单元、lint、类型、格式或前端构建。

依据为[CAP009/011/216/218及AC218](../product/abilities.md#cap-218-热门预设展示固定配置试用与后台管理)、[API004/005/006/202](../technical/api/generation-presets.md)、[API208](../technical/api/administration.md#6-api-208-热门预设管理)、UI22的PAGE212/216/217、SETTINGS15和[交互](../design/interactions.md#试用配置摘要--ui-15)。预设可超出当前计划配置，但仍按本人额度计量；失败退原来源，预览单独计量、手动发布、标题不分语言，均是已批准规则。没有待确认的新业务解释。

Node24.21.0、Go1.26.7、PostgreSQL18，Chromium模拟320/390/768/1440视口。本地两模型：普通计划仅基础模型/1词/short，主预设使用另一模型/3词/medium，验证例外不放开普通权限。所有数据在一次性库，供应商只绑定loopback；共29次本地调用（两次准备各1、API主轮20、控制4、浏览器3），真实AI0。管理员/账号凭据与生成/claim token不进入证据。

## 结果与原件

| 场景 | 预期与实际 | 证据 |
|---|---|---|
| P01 | 访客/basic额度设0，管理员仍可重复预览；预览不自动发布、不增加用户charge；手动发布后可见。用量新增3逻辑run/3provider调用，缺token/cost为null、unknown_calls增3 | [API控制](evidence/qa2-009/api-controls.json)、[控制脚本](evidence/qa2-009/api-controls.mjs)；原P01部分失败保留 |
| P02 | 仅改标题保存草稿不改线上，手动发布复用完整样文/配置，不调用AI；旧published_version开始返回409 preset_changed且不计次 | [API结果](evidence/qa2-009/api-results.json)、[脚本](evidence/qa2-009/presets-refunds.mjs) |
| P03 | 生成配置改动后无新预览不能发布；故意无效预览不改线上；有效预览仍不自动上线，手动发布后完整正文与配置一起更新 | 同上 |
| P04 | 访客普通请求仍被计划限制、预设参数注入400不调用；合法预设超出模型/词数/篇幅限制仍可生成，只扣visitor一次；认证claim201/200同批、完整正文/默认标题保留，账号额度不扣，同日签到认领 | 同上 |
| P05 | 学习者预设只扣本人base额度，visitor账不变，普通可选模型仍仅基础模型；账号额度0返回429且无新调用 | 同上 |
| P06 | 生成开始后下架预设，新入口404；已开始run按原快照完成并保存201，目标词完整 | 同上 |
| P07 | 预设模型临时禁用后仍可读完整样文和原模型，availability不可用、新生成422 preset_unavailable，不替换、不扣次 | API控制；初次脚本错误路径405另存 |
| R01/R02 | 访客供应商/内容失败退原visitor来源；主动取消计一次且重复cancel不再扣；真实Go连接中断退款，与取消区分 | API结果及charge/额度记录 |
| R03 | pro体验的供应商/内容/连接失败退原plan/trial来源，基础和体验额度、体验到期时间均保持；未误签到 | 同上 |
| R04 | trial在途时管理员将base调整为同一pro并重置；失败仍退原trial账，重置后base额度不受影响，原trial到期时间不变 | 同上 |
| U01 | 中英×四宽度：目录完整正文/词条/配置与准确标签一致；释义筛选、无匹配、键盘Home、焦点有效；单条前后禁用；试用跳转不生成，配置语义只读、无随机/编辑，details键盘可收展，无文档横溢 | [UI结果](evidence/qa2-009/ui-results.json)、[脚本](evidence/qa2-009/presets-ui.mjs) |
| U02 | 手机真实浏览器：提供方503→可见错误/重试、退款→显式重试有效生成→登录转注册→一次收录详情；共失败1/成功1调用，认证不再生成，默认标题learn · weave · book，账号额度4保持 | 同上；[收录截图](evidence/qa2-009/U02-browser-claimed.png) |
| U03 | 旧版本页面点击开始得409，页面刷新显示新标题及重试入口，不自动再次调用；模型禁用后明确反馈、禁用开始，保留原模型名 | 同上；[失效截图](evidence/qa2-009/U03-disabled-model.png) |
| U04 | en1440/zh320的目录与工作台稳定后4次区域axe扫描0违规；运行时仅故意503与409，无pageerror或其他异常 | UI结果与axe文件 |

P01–07、R01–04共11个API场景，U01–04共4个浏览器场景；尺寸/语言/故障子项和控制复查不重复加总。初次API主轮9 PASS/2 FAIL，控制仅重验P01/P07，未重跑已通过的9项。

实际核对[生产中文320试用](evidence/qa2-009/production-zh-320-trial.png)、[批准原型中文320](evidence/qa2-009/prototype-trial-zh-320.png)、[生产英文1440目录](evidence/qa2-009/production-en-1440-gallery.png)。只读模型区域、三项摘要、长模型名换行和完整样文符合本批来源；动态内容不同不逐像素比较。U01使用减少动效以稳定内容核对，本轮不声称验证8秒自动轮播、中断全部组合、真机或人工读屏。管理员新增API覆盖不冒充后台UI已全部通过。

## 测试准备错误与纠正

1. 初次模拟探针未提供其要求的固定重复词形短语，启用422；补齐指定hint后通过。第二次用相同provider ID创建两个模型被409拒绝，改为两个不同ID。两次都发生在业务场景前，分别保留setup-initial/setup-second脚本、日志和结果；各使用1次本地调用。
2. 首轮P01中文预览仍输出英文tag，按原AI契约被拒绝，无法发布。主预设的重复预览/手动发布已执行；控制为中文提供中文tag，在新草稿中完整复验P01。原provider.mjs保留，修正仅在provider-fixed.mjs，不修改产品校验器。
3. 首轮P07误用未定义的GET /admin/models/{id}，405发生在禁用前。控制改用批准的GET /admin/models读取revision，保留其余不可用/不扣额期望。

源失败不改写为通过；[初次API结果](evidence/qa2-009/api-results.json)、[控制结果](evidence/qa2-009/api-controls.json)分别保留。这些是夹具/验收脚本问题，没有建立产品CR或降低验收标准。

## 剩余覆盖与下一动作

[矩阵](coverage-matrix.md)与[机器索引](evidence/qa2-009/coverage.json)保持49 CAP/25 PAGE/28视图/119 UIA，不把局部通过等同整项通过。访客/trial本轮故障退款已补；生产SSE代理、多故障UI/真实离页中断、04:00实时时点、更多运营/奖励并发、业务事件端到端留存与90天物理清理、全UIA/真机/读屏/性能/部署仍待覆盖。直接Go中断不冒充生产Nginx验收。

下一批由qa-quinn沿现有授权继续API209/900的业务事件留存与90天清理，并按实际证据收敛剩余范围；本轮无新CR需先返工，也不要求为相同角色继续工作新增一次审批。CR001/002、CR039-L1、CR042-L1、AI-QUALITY-90、W01保留，最终UAT未执行。CR014/015沿036、CR012/013沿034及更早限定关闭保持。

## 原件、环境与边界

仅更新五份QA正文及本轮证据；修改前原件在[before-owned](evidence/qa2-009/before-owned.tar.gz)和previous副本。6815份受保护文件含控制面/应用/原CR/上游与旧证据；QA08的63原件中58原位保持、5份旧正文可按摘要从归档恢复。版本、链接、同口径文档大小见[manifest](evidence/qa2-009/manifest.json)，复现见[README](evidence/qa2-009/README.md)。

开始时相关端口全关闭；本轮创建的前端/Go/PG/原型/代理/本地provider已全部停止。无应用修改、控制面变更、提交、部署、真实AI、委派或换模。新会话交接实验未执行，input/token未知。
