---
milestone: M002
stage: verification
role: quality/base
agent_name: qa-quinn
status: awaiting_user_review
result: failed_requires_implementation_rework
version: M002-QA-07
date: 2026-09-23
---

# 二期独立验收第七轮

**CR012、CR013的原缺陷独立复验通过；新增CR014书架焦点不符合批准交互、CR015参与切换后统计滞后。** 本轮19个稳定场景16 PASS、3 FAIL，整体仍需前端返工。UAT未执行，不能宣布二期完成。

## 输入、方法与确认

TRANSITION-M002-033，verification / quality/base / qa-quinn。PRODUCT03、UI22/H01、DB03/BE03/FE02保持。前端[frontend-cr012](../implementation/evidence/frontend-cr012/manifest.json)278文件、后端[backend-cr013](../implementation/evidence/backend-cr013/manifest.json)288文件与当前源码匹配，见[inputs](evidence/qa2-007/inputs.json)。复用已交付生产前端，为独立环境构建当前后端；不重跑开发单元/lint/格式/类型或前端构建。

CAP008–016/021/211/216/220、API005–007/203/204、UIA-PAGE-005-01/02/LIBRARY18及[书架交互](../design/interactions.md#书架--ui-18)是验收来源。搜索回输入、加载更多移至首个新增标题、参与切换回同checkbox并同步统计均由UI22明示；不是测试新增要求。失败原来源退款、卡过期不复活与404/409/410均沿既有API；无待用户选择的新业务假设。

Node24.21.0、Go1.26.7、PostgreSQL18、真实生产Nuxt/Go/数据库。23次真实生成收录建立本人21篇有效库和他人1篇（本人22篇删1篇），含暂停项及长标题。供应商只绑定loopback；library24次（探针1+生成23）、generation10次，合计34本地确定性调用，真实AI0。成长初始配置及到期场景只作用于一次性测试库；token/私有env不进入证据。

## 缺陷闭环

| ID | 当前结论 | 证据/范围 |
|---|---|---|
| [CR012 / F08](../changes/CR-012.md) | verified_pending_gate | J01–04：中英四宽度、页面返回/历史后退16组合；查询/21行/原行焦点/位置保持，直接进入及改标题返回通过 |
| [CR013 / F09](../changes/CR-013.md) | verified_pending_gate | G07四真实终态409 state_conflict，G08错误凭证/他人/缺失/删除404和保存201/200，G09草稿到期410；原计量保持 |
| [CR014 / F10](../changes/CR-014.md) | OPEN / P2 / frontend-claire | J05搜索后焦点留按钮，J06加载更多后焦点落BODY；独立复现还确认参与切换后同样落BODY |
| [CR015 / F11](../changes/CR-015.md) | OPEN / P2 / frontend-claire | J07参与从20降19、暂停从1升2，API与持久记录正确，页面仍20/1，刷新才正确 |
| 既有关闭及观察 | 保持 | CR011沿031、CR010沿029、CR009沿027、CR007/008沿025、CR005/006沿022限定关闭；W01历史未定位观察保留，本轮runtime为空不能反证旧观察 |

## 有效结果

| 场景 | 预期/实际 | 证据 |
|---|---|---|
| J01/J02 | 中英320/390/768/1440px的页面返回、浏览器后退均恢复原scrollY（误差<3px）、原行焦点与可见位置；LEARN/21个ID顺序保留，无文档横向溢出 | [书架结果与几何](evidence/qa2-007/library-results.json)、[脚本](evidence/qa2-007/library.mjs) |
| J03/J04 | 详情→首页→菜单书架以及直接打开详情后返回，均正常从页顶进入；编辑标题后返回显示最新标题、保留原目标词/焦点/加载范围 | 同上 |
| J05/J06 | **FAIL**：搜索结果成功后未回输入；20→21加载完成移除按钮后焦点落BODY。中英×320/1440四组合均复现 | [独立重复](evidence/qa2-007/independent-repro-v2.json)、[脚本](evidence/qa2-007/independent-repro-v2.mjs) |
| J07 | **FAIL**：checkbox/PATCH200正确，统计等5秒仍旧值；独立重复GET得19/2、页面20/1、刷新19/2，同时记录checkbox焦点丢失 | 同上；[英文](evidence/qa2-007/v2-participation-en.png)、[中文](evidence/qa2-007/v2-participation-zh.png) |
| J08/J09 | 切换语言保留查询/21行；六统计准确标签、标题→统计→搜索→列表顺序符合源，书架区域axe违规0，runtime无pageerror/hydration | [axe](evidence/qa2-007/library-axe.json)、library-results |
| G01/G02 | 非法预检零调用/零扣；同主体active409、他人cancel404；主动取消只扣一次、不签到、重复cancel不重复扣 | [生成结果](evidence/qa2-007/generation-results.json)、[脚本](evidence/qa2-007/generation.mjs) |
| G03/G04/G05 | 提供方/校验/真实Go连接中断失败退回原基础来源；valid后放弃仍计次、已自动签到、无收录 | 同上 |
| G06 | 基础额度0、次数卡可生成；失败退原卡、到期不变；取消扣同卡一次 | 同上 |
| G07 | user_cancelled、validation_failed、stream_failed和valid/abandoned的原token收录均409 **state_conflict** | 同上，保留实际Problem/运行ID，无token |
| G08/G09 | 错误token/他人/缺失/删除404；合法保存201、重复200同一批；临时持久草稿过期410，无误存或计量副作用 | 同上 |
| G10 | 在途次数卡扣后让临时余额过期，再中断连接；退款回原卡余额且到期不变，可用extra仍0，重试429且无新provider调用 | 同上 |

J01/J02的16个尺寸/语言/返回组合分别归两个稳定场景，不重复加总通过数。独立重复使用两个新上下文（英文1440、中文320），确认新问题而非增加失败数。G01–07继承QA06的实际API复现方法，并将状态码及state_conflict同时断言；未放宽原期望。

已实际打开[UI22原型1440](evidence/qa2-007/prototype-library-1440.png)/320并读取learning.js、copy.json及交互/响应式来源；人工核对[生产英文320](evidence/qa2-007/J01-en-320.png)和[中文1440](evidence/qa2-007/J01-zh-1440.png)的长标题/行结构/操作。原型与生产动态数据不同，不逐像素对照夹具数值；原六统计按真实API。静态axe通过不能抵消动态焦点偏差，不以本次局部截图宣布全UIA通过。

## 测试自身问题与限制

首次independent-repro在reload后才读Playwright响应body，触发“response body no longer available”；初次脚本、日志/截图保留。v2只在导航前读取响应，另存全部证据，不改变焦点/统计期望；J05/J06/J07在首次主检查就已失败，两个新会话再次确认。没有修改应用来跑通测试。

G09仅调整一次性库的draft validated_at/expires_at，验证持久草稿到期；不声称实际等待了签名token自然到期。G10仅回拨一次性extra余额期限，不是实际跨日运行。断流直接访问独立Go API以保证上游连接关闭，不是生产Nginx验收。浏览器为Chromium模拟视口；三引擎开发自检可定位但不冒充本轮独立三引擎测试。

## 剩余范围与下一角色

[矩阵](coverage-matrix.md)及[机器索引](evidence/qa2-007/coverage.json)保留49 CAP/25 PAGE/28视图/119 UIA。新增两项前端问题应先返工；其余仍待独立验证：trial/visitor退款、生产SSE代理及更多失败UI、真实复习替换/提交并发、04:00实时时点、更多运营配置/并发、业务事件留存与90天物理清理、完整UIA/真机/读屏/性能/部署。CR001/002、CR039-L1、CR042-L1、AI-QUALITY-90保持，UAT未执行。

建议守门按本轮限定关闭CR012/013，登记CR014/015并交frontend-claire一并处理书架焦点与统计，然后QA独立复验。问题均有批准依据，无新增产品决策；QA不自行修改前端或切换阶段。

## 原件与环境保护

修改前五份QA文档及CR012/013在[before-owned](evidence/qa2-007/before-owned.tar.gz)，并保留可读previous副本。QA06原始失败/源码归属、历史批准和开发证据不改写；6603份受保护原件包括应用、上游、控制面和旧证据。版本、原件恢复、链接和文档大小见[manifest](evidence/qa2-007/manifest.json)，复现见[README](evidence/qa2-007/README.md)。

专用3331/3301/38081/38082/39081/PG均已停止，原3300/3330/38080/4186预览保留。仅更新QA正文、CR012/013复验记录、新CR014/015和本轮证据；无提交/部署/真实AI/委派/换模。新会话交接实验未执行，input/token未知。
