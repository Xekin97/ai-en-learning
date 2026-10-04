# API-001/002/003/007/201 身份、资料与书架

共同 envelope、CSRF、分页及类型见 [index](index.md)。对应 DATA-003/004/005/012/013/016/017/018/204，CAP 与 PAGE 见索引。V=访客，L=本人学习者，A=管理员。

## 1. 认证和个人信息

`Actor` 为严格联合：访客 `{kind:"visitor"}`；账号 `{kind:"account",id:string,username:string,role:"learner"|"admin",plan_code:"basic"|"pro"|"plus"|null}`。id 是本人公开认证身份，专供本机草稿隔离，不返回其他对象 owner_id；admin.plan_code=null。`IdentityResult={actor:Actor,ui_locale:Locale,csrf_token:string}`。

| Method / 路径（/api/v1） | 权限与请求 | 成功 |
|---|---|---|
| GET /bootstrap | V/L/A，无 body | 200 `{actor,ui_locale,csrf_token}`；恢复既有会话/访客身份，不触发欢迎或提醒 |
| PUT /me/ui-locale | L/A，`{ui_locale:Locale}` | 200 `{ui_locale}`；访客仅本机保存 |
| POST /auth/register | V，`{username,password,password_confirmation,ui_locale}` | 201 IdentityResult；创建 basic 学习者、轮换 Cookie；不自动触发“登录提醒” |
| POST /auth/login | V，`{username,password,browser_ui_locale:Locale}` | 200 IdentityResult 加 `welcome:Welcome\|null`；admin 为 null |
| POST /auth/logout | L/A，`{}` | 204，删除当前会话；其他设备不退出 |
| GET /me/account | L | 200 `{account:Account}` |
| PATCH /me/account | L，`{nickname:string\|null,gender:"female"\|"male"\|null}`，两个字段完整提交 | 200 `{account:Account}` |
| PUT /me/password | L，`{current_password,new_password,new_password_confirmation}` | 204，保留当前会话、注销其他会话 |
| DELETE /me/account | L，`{current_password,confirmed:true}` | 204，永久删除且清 Cookie，无宽限/撤销 |

用户名3–32个ASCII字母数字下划线、大小写不敏感唯一、注册后不可变；密码8–128字符。注册不接收邮箱/手机号/角色/基础计划。用户名占用409 username_unavailable；登录不存在与密码错误统一401 invalid_credentials。改密/注销密码错误422字段错误，不泄漏哈希。注册、登录明确成功更新 last_login_at；资料读取和刷新不更新。登录保存账号已有语言优先，首次无偏好才采用 browser_ui_locale。

昵称去首尾空白，空值存 null，技术输入上限64 Unicode code points；性别不填为 null，无默认性别。未赋予公开个人主页。`Account={username,nickname:string|null,display_name:string,gender:"female"|"male"|null,ui_locale:Locale,base_plan_code:Plan,effective_plan_code:Plan,last_login_at:Time|null,last_learning_at:Time|null}`。display_name=昵称否则用户名；Plan=basic/pro/plus。读取与保存均使用此完整投影。计划详情另见权益接口，不允许个人资料写入计划/积分/经验。

`Welcome={kind:"no_learning"|"same_day"|"returning",display_name:string,days_since_learning:int|null,previous_learning_at:Time|null}`。no_learning 的后两值 null；same_day 的 days=0；returning 的 days≥1。按服务端当前北京时间04:00学习日减 previous_learning_at 所属学习日。先读取上次有效学习再更新登录；不得将本次登录误算学习。注册使用设计首次欢迎分支；历史未知 last_learning_at 为空，不用注册/登录/旧取消时间伪造。

显式登录返回的 Welcome 仅本次内存消费；bootstrap/续期不返回此字段。访客 claim 接续先结束，再展示欢迎及提醒；天数采用登录时快照，不被随后 claim 的学习时间覆盖。10秒、日期大字、淡入淡出与消息上方层级由 UI22/前端实现，服务端只给事实。通知内容独立获取，通知故障不回滚登录或保存。

注销覆盖 DB2-T13：用户关联的批次、会话、成长、卡、权益、最小分析明细即时删除；脱敏汇总无个人关联。客户端确认成功清理本账号本机草稿；离线浏览器不能远程擦除，重新访问先认证再验证资源。其他用户无读取/写入权限。

## 2. 六项统计、列表及详情

API-007 均为 L；A 仅通过 API-103 指定用户只读路径复用内容 DTO。

`GET /me/learning-summary` →200：

```json
{"data":{"generation_count":18,"unique_learned_entries":42,"participating_batches":7,"paused_batches":2,"successful_review_count":11,"batches_ever_reviewed_successfully":5},"meta":{"request_id":"..."}}
```

保留一期全量六项，均非负整数，不随列表筛选改变。generation_count 沿原计量（包含主动取消、有效后放弃、已删批次对应计量，排除已退款）；unique_learned_entries 是当前库不同原词，不是新增成长 mastered_total；后两项从迁移后的最小成功事实派生。删除库内容影响当前库统计，不回退二期成长累计。

`GET /me/batches?entry={exact_entry}&cursor=&limit=` →200 `data.items:BatchSummary[]`。entry 可省略，有值须为词库完整词条，精确大小写规范化匹配；不按标题搜索。排序 `(saved_at ASC,id ASC)`。

`BatchSummary={id,saved_at,title:string,title_revision:string,passage_preview:string,tags:string[],entries:string[],model:{name:string},meaning_language:MeaningLanguage,scenario:Scenario,length:Length,participates_in_range_review:bool}`。学习者列表再有 `single_batch_review:{action:"start"|"resume",session_id:string|null}`，start→null、resume→非空；管理员列表省略此操作字段。entries 保持输入顺序，model.name 保存时快照，tags1–3项，preview 是非空纯文本安全截取。

`GET /me/batches/{batch_id}` →200 `{batch:BatchDetail}`：

```text
BatchDetail = {
 id,saved_at,title,title_revision,
 configuration:{model:{name},meaning_language,scenario,length},
 participates_in_range_review:bool,passage:string,tags:string[],
 targets:Target[],
 review_summary:{completed_count:int,successful_count:int,last_completed_at:Time|null}
}
Target = {entry:string,entry_meaning:string,hint_phrase:string,
 hint_blanks:[{start:int,end:int}],
 occurrences:[{surface:string,start:int,end:int}]}
```

Target 数组非空、输入顺序；span 数组非空升序、不重叠，Unicode code point 0基半开区间，surface 等于正文子串。hint_blanks 无 surface；来源为已验证持久化位置，不由前端正则重算。后台同 DTO，无私有 token/答案或供应商成本。review_summary 只含计数/完成时间，不可据此回看逐题答案；没有完成记录时 last_completed_at=null。

## 3. 参与设置、标题、删除

`PATCH /me/batches/{id}` 接受严格互斥的两种 body，避免参与开关与标题 revision 互相阻塞：

- `{participates_in_range_review:bool}` →200 `{batch_id,participates_in_range_review}`。相同值幂等；只影响未来范围会话，不影响当前范围快照或单批复习。
- `{title:string,expected_title_revision:string}` →200 `{batch_id,title,title_revision}`。trim 后非空；技术上限取 `max(200,默认词条连接标题的code point长度)` 并通过详情额外 `title_max_length:int` 返回（列表不需要此字段）。这样保留超长合法默认标题，不借标题限制缩小管理员预设词数范围。按纯文本存取、不唯一、不翻译、不调用AI。revision 不符409 revision_conflict，用户刷新后决定是否覆盖，不能静默丢更新。相同revision相同当前标题可返回原值，无意义保存不增revision。

标题默认按输入顺序 ` · ` 连接；旧批次迁移回填，普通/预设/claim一致。当前本人所有批次可改；管理员无写入口。只更新 title/title_revision，不更新 saved_at、参与、正文或目标；复习题面不得附带默认或自定义标题，防止泄题。

`DELETE /me/batches/{id}` →204。账号锁下先删除该批次 consumed claim，再级联批次资源/会话关系/attempt，空会话删除；成长累计与掌握保留。不保留可恢复内容墓碑。明确删除后旧 claim 重试404，不重建批次；普通网络重试保存仍按 run 唯一。404 用于已删除/他人对象；请求失败不能清掉本机仍有效输入。UI 删除确认不替代服务端所有权检查。

## 4. 验证入口

继承 CAP-002–005/012–017/021/022/104–107；新增 CAP-209/220。重点验证大小写唯一注册、当前/其他会话撤销、管理员不能编辑用户短文、旧标题回填、保存顺序不变、03:59→04:00欢迎、空昵称、claim优先、账号删除与提交竞争。与 DB2-T02/10/12/13 和 BE2-V01/02/11 对齐。
