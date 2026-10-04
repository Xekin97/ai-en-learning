---
milestone: M002
stage: verification
role: quality/base
agent_name: qa-quinn
status: awaiting_user_review
result: failed_requires_implementation_rework
version: M002-QA-06
date: 2026-09-22
---

# 二期独立验收第六轮

**CR011搜索修复独立通过；新增CR012页面返回位置丢失、CR013收录错误状态协议不符。** 本轮13个稳定场景中11 PASS、2 FAIL，整体仍需实现返工。用户UAT未执行，不能宣布二期完成。

## 输入与方法

TRANSITION-M002-030，verification / quality/base / qa-quinn。PRODUCT-03、UI22/H01、DB-03、BE-03、FE-02保持。前端[frontend-cr010](../implementation/evidence/frontend-cr010/manifest.json)277文件、后端[backend-cr011](../implementation/evidence/backend-cr011/manifest.json)287文件与源码匹配，见[inputs](evidence/qa2-006/inputs.json)。复用已交付生产前端输出，为执行当前后端新建一次性Go/PostgreSQL环境；不重复开发单元、lint、类型、格式或前端构建。

依据CAP006/008–010/012–014/211/216、API004–007/203/204、UIA-PAGE-005-01/02/LIBRARY18及[书架交互](../design/interactions.md#书架--ui-18)。准确固定文案来自copy.json，原型learning.js只作结构/交互来源，词条匹配仍按批准产品/API精确规则，不采用原型夹具的includes算法扩大搜索范围。无新增产品解释或授权。

Node24.21.0、Go1.26.7、PostgreSQL18；实际前端/API/数据库，23篇短文通过真实生成/收录构造两名用户的库。其中本人22篇删除1篇，21篇足以触发实际默认分页，另1篇属于他人。模型仅loopback38082；成长启用/初始规则仅在临时库设置。总本地provider调用36次（library24、generation初轮5、v2轮7），真实AI为0，不计算自然语言质量成功率。

## 缺陷闭环

| ID | 当前结论 | 范围 |
|---|---|---|
| [CR011 / QA2-F07](../changes/CR-011.md) | **verified_pending_gate** | L01/02/03/05/06通过，建议守门限定关闭搜索规范化缺陷 |
| [CR012 / QA2-F08](../changes/CR-012.md) | **OPEN / P2 / frontend-claire** | L04：页面内返回书架后scrollY归零，原行不可见；浏览器后退对照正常 |
| [CR013 / QA2-F09](../changes/CR-013.md) | **OPEN / P2 / backend-ethan** | G07：本人未过期、原token、非valid或已放弃run再次save返回404，契约要求409 |
| CR010及更早缺陷 | 限定关闭保持 | CR010沿029、CR009沿027、CR007/008沿025、CR005/006沿022，不重开或扩大范围 |
| W01 | 历史未定位观察保留 | 本轮浏览器runtime为空，不能反证旧版本未定位观察 |

## 本轮有效结果

| ID | 预期与实际 | 原始证据 |
|---|---|---|
| L01 | learn/LEARN/Learn/ASCII及Unicode首尾空白均200同21批；原大小写互换cursor可连续读取前两批，暂停批包含在内 | [书架结果](evidence/qa2-006/library-results.json)、[脚本](evidence/qa2-006/library.mjs) |
| L02 | 换词/清空筛选复用cursor、跨账号cursor和伪造cursor均422；非法前缀/内部空白/通配符/纯空白拒绝；仅标题book/仅标签study不命中；他人、删除资源404，管理员403、访客401，全库统计不变 | 同上；[非空夹具](evidence/qa2-006/fixture.json) |
| L03 | 实际中英文×320/390/768/1440px，LEARN/Learn/带空白learn搜索200，加载更多20→21且ID顺序完整无重复；六项统计与准确标题可见，页面无横向溢出 | library-results及L03八张截图，如[320中文](evidence/qa2-006/L03-zh-320.png) |
| L04 | **FAIL**：进入最后一批后点页面返回，保留LEARN、21行和焦点，却从scrollY3125回0；目标top3932超出900px视口。新会话重复失败，浏览器后退恢复3125作为对照 | [独立重复](evidence/qa2-006/scroll-repro-results.json)、[进入前](evidence/qa2-006/scroll-explicit-back-link-before.png)、[返回后](evidence/qa2-006/scroll-explicit-back-link-after.png) |
| L05 | book无结果，清除后恢复20行第一页；所有六项界面统计及全库API统计不变 | library-results、[清除后](evidence/qa2-006/L05-cleared.png) |
| L06 | 书架区域axe WCAG2A/AA/2.1AA无违规，runtime无pageerror/hydration；不代表人工读屏或整站通过 | [axe](evidence/qa2-006/library-axe.json)、library-results |
| G01 | 选词大小写查到learn；重复/非法词/非法长度422，禁止字段400 malformed_request；均未调用provider、未扣次数 | [计量结果v2](evidence/qa2-006/generation-v2-results.json)、[脚本](evidence/qa2-006/generation-v2.mjs) |
| G02 | 同主体active第二请求409、他人cancel404；本人主动cancel终态唯一，基础来源consumed一次、余额减1、累计生成加1；重复cancel不再扣，不签到 | generation-v2-results |
| G03 | 提供方打开失败503及流后内容校验失败均退回基础来源，统计/额度恢复，未签到；校验失败只一条run/charge，不把内部尝试计多次 | 同上 |
| G04 | 原生HTTP读取中断使实际Go请求结束，charge refunded，累计及基础余额恢复；与主动cancel有不同计量 | 同上；直接访问临时Go API，未声称生产代理断流已验 |
| G05 | valid后discard204，原来源仍consumed、累计加1；自动签到已发生、不因放弃撤销，书架仍空 | 同上 |
| G06 | 当前计划0次但已启用次数卡5次仍可生成；提供方失败回原item、余额仍5且到期不变；随后主动取消消费原卡1次、剩余4，未转为计划次数 | 同上，含实际generation_charges与extra_credit_balances前后投影 |
| G07 | **FAIL**：G02/G03/G04/G05的本人run用原token再save均404 not_found；库中仍存在user_cancelled、validation_failed、stream_failed、valid/abandoned记录，契约均要求409 state_conflict | [状态与响应](evidence/qa2-006/save-state-evidence.json)、generation-v2-results |

L03的24次搜索组合只计一个稳定场景，scroll重复不额外计通过数。计量以generation-v2为有效完整结果；G07错误码失败没有因计量通过而被移除。所有生成token仅在脚本内存使用，证据不保存token或私有环境凭据。

## 测试自身问题与限制

- 初次generation把禁止额外字段也统一期望422，实际是400 malformed_request；公共严格JSON格式错误允许400，v2按输入分类纠正。提供方打开阶段尚未建立SSE，初次助手统一等待200；v2读取真实503 Problem和数据库一次退款，不伪造SSE事件。这两项是测试期待过宽。
- 初轮G02/04/05在save状态码409/404处失败属于真实协议缺陷；v2将计量断言完整执行，保留同一save观察并集中到G07仍FAIL。初轮脚本、日志和结果全部保留，不把404加入成功预期。
- G04绕过测试用简易Node代理，直接连独立Go API，确保AbortController关闭真实上游连接；生产Nginx、网络条件和页面离开分支仍待验，不从此结果外推。
- 初始前端进程误继承本机Node22，任何场景执行前已替换为项目Node24；未升级依赖。当前浏览器验收仅Chromium，四宽度是模拟视口，未覆盖真机输入法/读屏/全部键盘流程。

## 剩余范围与下一角色

[矩阵](coverage-matrix.md)保持49 CAP /25 PAGE /28视图 /119 UIA；CAP013搜索恢复PARTIAL，CAP012返回位置和CAP010错误协议FAIL；CAP006/009新增独立部分证据。其余未验继续保留：更多词条/语言与失败UI分支，trial/visitor及过期次数卡退款、生产SSE代理，复习替换真实并发、04:00实时时点、更多运营配置/竞争，业务事件留存与90天物理清理，全量UIA/人工辅助技术/性能/部署。CR001/002、CR039-L1、CR042-L1、AI-QUALITY-90保持；UAT未执行。

建议守门限定关闭CR011并登记CR012/013，先激活backend-ethan处理API-006状态分类，再交frontend-claire处理详情返回位置，两者完成后qa-quinn独立复验。各角色独立提交匹配版本开发证据；本报告不切换阶段或提前关闭控制面。

## 原件与环境保护

修改前五份QA文档和CR011原稿在[before-owned](evidence/qa2-006/before-owned.tar.gz)，可按旧QA05摘要恢复；[原报告](evidence/qa2-006/previous-report.md)与所有早期失败保持。6417份受保护原件含应用、控制面、上游、开发交付和历史证据未变；[manifest](evidence/qa2-006/manifest.json)记录版本、结果、恢复核对和文档读取大小，[README](evidence/qa2-006/README.md)提供复现入口。

本轮仅更新五份QA入口、CR011复验记录并新增CR012/013及新证据。自有3331/3301/38081/38082/39081/PG已停止，原3300/3330/38080/4186保留；无提交/部署/真实AI/委派/换模。新会话交接实验未执行，静态核对不冒充独立接续，input/token计量unknown。
