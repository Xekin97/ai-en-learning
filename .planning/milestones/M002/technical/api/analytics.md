# API-209 分析与 API-900 运行状态

关联CAP-219、DATA-005/009/014/202/213/214、PAGE-213/218及前台最小访问事件。管理员预览仅独立用量，不进入学习指标。90天约束来自DB2-Q03，不重新增加追踪数据类别。

## 1. 浏览器事件与服务端业务事实

`POST /api/v1/analytics/events`，V/L、同源CSRF；A不采集（204无业务写入）。body：

```text
{event_id:UUID,kind:"page_view"|"key_action",page:FrontendPage,
 action?:"select_word"|"start_generation"|"submit_registration"|"start_review",
 source?:{utm_source?:string,utm_medium?:string,utm_campaign?:string,referrer_host?:string}}
```

FrontendPage是当前产品前台PAGE-ID固定白名单（不含后台）；page_view不允许action，key_action必填action。source仅入口访问可用，每值≤128 Unicode code points，剥离控制符，referrer_host必须host无path/query/userinfo；不接受任意attributes、URL、username、account_id、正文/答案、客户端timestamp。未知字段422/格式400；204成功（含event_id重复），服务端时间和认证主体决定事实。

第一方随机browser标识独立于访客额度身份，安全Cookie携带、数据库HMAC；同浏览器登录前后保留，清标识即新UV，不指纹推断跨设备。traffic_session按服务端最近活动30分钟；同事件ID只记一次，不因HTTP重试/重渲染增加PV。当前注册请求关联同浏览器活动会话，真实注册成功由identity事务记；无法关联单列。key_action只影响跳出，不能制造有效生成/注册成功/复习完成/成长。

选词/注册提交的key_action客户端报；成功生成、收录、复习开始/提交、注册成功均由对应业务事务直接写幂等analytics事实。开始复习须是真正新attempt，恢复不算；系统预检拒绝与取消分开记录。客户端上报失败可以同event_id有限重试，不阻止学习，不用发送私密表单重建。服务端学习事实不能“提交成功后尽力发消息”而丢失；沿DB2-T01–03事务。

## 2. 管理查询共同结构

仅A，GET只读/no-store。query=`start_day:Date,end_day:Date`，含起止，北京时间04:00，end≥start且不晚于today；无任意owner/browser维度。管理员不导出用户明细、不增加事件回放界面。

每个200 `data`含：

```text
{range:{start_day,end_day},learning_day:Date,updated_at:Time|null,
 freshness:"current"|"delayed"|"no_data",
 detail_available_from:Time,
 ...各指标}
Metric={value:number|null,numerator:int|null,denominator:int|null,
 status:"ready"|"no_sample"|"observing"|"unavailable",
 reason:"detail_expired"|"source_unavailable"|null}
```

比率value为0..1（客户端格式化%），分母0→no_sample/value=null，不显示0%。observing保留当前观察事实但value=null，防未成熟当零；不存在来源则unavailable。计数使用number非负，分子分母不适用为null；updated_at显示最后成功聚合的时刻。分钟聚合超过2个完整调度周期显示delayed（技术状态，不是用户行为指标）；无记录updated_at=null。source_unavailable允许该部分失败，其余独立指标保留，不全页假零。

## 3. 流量、漏斗、留存及概览

`GET /api/v1/admin/analytics/traffic` →共同字段+

```text
{pv:Metric,uv:Metric,bounce_rate:Metric,
 series:[{day,pv:Metric,uv:Metric,bounce_rate:Metric}],
 channels:[{source_type:"utm"|"referrer"|"direct_unknown",pv:Metric,uv:Metric}],
 clarity:{available:bool,url:string|null}}
```

PV按实际page_view，UV为browser去重非自然人；范围UV在90天内按细节去重，不能sum日UV。跳出分母仅期间开始且已结束session，pageviews=1且无key_action为分子；未结束排除。渠道按入口UTM优先、外部host其次、直接/未知，不跨设备推断。长期匿名汇总只粗类别，不永久保留自由UTM文本。Clarity URL由服务器部署配置生成固定项目入口，不接受浏览器任意重定向；未配置available=false/url=null，不造假图。热力图脚本仅首页/介绍/试用入口，私有造文/复习/账号/后台不载入，前端架构须接收此边界。

`GET /admin/analytics/funnel` →共同字段+

```text
{registration:{converted_visitor_uv:Metric,anonymous_uv:Metric,rate:Metric,new_accounts:Metric,unattributed_accounts:Metric},
 activation:{within_7_days:Metric,same_day:Metric,cohorts:[{registration_day,rate:Metric}]},
 review:{started:Metric,submitted:Metric,successful:Metric,completion_rate:Metric,success_rate:Metric},
 generation:{valid:Metric,failed:Metric,cancelled:Metric,ongoing:Metric,precheck_rejected:Metric,failure_rate:Metric}}
```

注册按每学习日未登录UV转化口径；范围rate使用“逐日UV分子和/逐日UV分母和”并在指标说明明确，不伪称整个范围自然人去重转化，series若需要日点复用请求单日。激活按注册日及后6学习日收录，未成熟cohort observing；同日辅助另列。复习started按范围内新attempt，submitted/successful截至updated_at回归该开始队列，迟交更新原cohort；success_rate=successful/submitted，completion=submitted/started≤1。生成按逻辑run开始队列，failure=failed/(valid+failed)，cancelled/ongoing/precheck分列，内部纠正/续写不增加分母。3成功1失败1取消1在途→25%。

`GET /admin/analytics/retention` →共同字段+

```text
{cohorts:[{registration_day,accounts:int,d1:Metric,d7:Metric,d30:Metric}],
 series:[{day,wau:Metric,valid_generations:Metric,saved_passages:Metric,
 review_submissions:Metric,successful_reviews:Metric,reviews_per_active_learner:Metric}]}
```

D1/7/30按注册cohort指定日学习活跃，不是滚动首次活跃；WAU每day最近7学习日去重L，不含visitor/admin。有效生成或有输入的提交为活跃；全空提交计频次但不活跃；失败/取消/登录不活跃。篇数以valid完成，收录以实际保存，复习频次以提交发生日。访客claim关联原run不再生成一篇；不把一期带取消的库generation_count当valid篇数。

`GET /admin/overview` 无query →共同结构以today及最近7学习日范围，增加 `{today:{pv,uv,valid_generations,saved_passages,review_submissions},last_7_days:{wau,registration_rate,activation_rate,generation_failure_rate},preview_usage:UsageSummary}`，指标类型Metric，usage同API-208。只复用上述聚合服务/定义，无新增业务指标或个人正文。preview_usage清楚单列管理员。

## 4. 90天与删除

读查询当场过滤occurred_at+90×24h≤now的个人细节，维护随后物理分批清；过期字段不能因job延迟继续展示。到期前聚合日/cohort/粗渠道；长期只匿名计数。超90天可返回已有日PV/日UV/成熟cohort曲线，但范围精确UV不可由日UV相加，返回uv.status=unavailable/reason=detail_expired；WAU仅返回当时已存日WAU，缺点不可从长期个人成长表重建。禁止为了图表完整而隐性延长保留或保存可逆“匿名ID”。

账号注销同事务删除events/cohort身份/session关联及可识别的访问链；不能仅owner=NULL而保留可重连browser/session键。完全匿名旧聚合保留，不作为账号恢复来源。复习迟交允许用批准保留的最小attempt计数修正匿名开始cohort，不带个人维度，不能恢复历史答案；已删attempt没有内容重建。

## 5. API-900 运行状态

- `GET /health/live`：进程可响应即200，不依赖DB/OpenRouter。
- `GET /health/ready`：配置、冻结词库/词法资产、迁移版本匹配、DB可查询、实例未停止→200，否则503。OpenRouter不是全站readiness依赖，不使其故障阻断登录/书架。
- `GET /internal/metrics`：Prometheus仅内部监听或既有平台鉴权，不通过公网Nginx代理；不带username、entry、run/batch/account ID、正文、答案或provider错误文本标签。

验收BE2-V14/15：UV登录关联/跨设备、重复PV去重、30分钟跳出、零分母/未成熟、晚交归开始队列、生成多call单run、90天边界/过期job停摆、删除关联链、Clarity私有页面不加载、后台未授权拒绝。
