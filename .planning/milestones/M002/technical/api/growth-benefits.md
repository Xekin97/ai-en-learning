# API-203/204/205 成长、道具与消息

学习接口均为L本人，消息为已认证L/A；无访客成长账户或管理员代领入口。DATA-003/008/203–211；CAP-209–217；PAGE-206/207/214/215。Amount、分页、幂等header见 [index](index.md)。所有列表展示字段为服务端按ui_locale选择的纯文本；双语后台原值另见管理契约，缺译回退另一语言，不调用AI。

## 1. API-203 成长与签到

`GET /api/v1/me/growth` →200：

```text
{
 learning_day:Date,growth_started_at:Time,
 points:Amount,experience:Amount,
 level:{id,number:int,name:string,min_experience:Amount},
 next_level:{id,number:int,min_experience:Amount,reward:Reward}|null,
 mastered_total:int,saved_total:int,successful_review_total:int,
 checkin:{signed_today:bool,current_streak:int,highest_streak:int,today_points:Amount,today_experience:Amount},
 review_streak:{current:int,highest:int},pending_reward_count:int
}
Reward={points:Amount,experience:Amount,item:{definition_id,name,kind,count:int}|null}
```

初始等级不含升级奖；满级next_level=null，experience继续增长；level.name从本地化级数生成，不新增数据库运营字段。后台门槛调整后首次读取即按当前配置重算，可降级；分子experience不减，pending可暂停，不把积分花费当降级原因。GET只记录资格不发奖。签到今日积分为按当前连续状态的可得/已得值，已签用实际settlement；绝不按后来配置重算已付款。

`GET /me/growth/checkins?start_date=&end_date=` →200 `{learning_day,makeup_earliest_day:Date,days:[{day:Date,state:"normal"|"makeup"|"missing"|"future"|"before_start",points_paid:Amount,can_makeup:bool}]}`；查询按日期升序，end≥start，单次最多一个日历季度用于日历分页（技术查询保护，不扩大可补范围）；future无签到，can_makeup只对[today-30,today-1]漏签且不早于注册/成长启用。日期列表只本人，无任何文章/答案来源。

正常签到没有POST签到按钮接口：有效生成完成/合格同日claim自动结算，失败/取消不签。北京时间04:00学习日与滚动24小时额度分开。

`POST /me/growth/makeup-preview` `{item_id,learning_day:Date}` →200 `{can_use:bool,reason:ItemBlock|null,points_added:Amount,affected_days:[{day,before_points:Amount,after_points:Amount,difference:Amount}],experience_added:"0",confirmation_token:string|null}`。按每个日期历史规则计算，预览不扣卡。can_use=false时新增值为0、affected_days为空、token=null。有效期内卡、合法补日才可用。

`POST /me/growth/makeups`，Idempotency-Key；`{item_id,learning_day,confirmation_token}`→200 `{receipt:SettlementReceipt,affected_days:[{day,points_added:Amount}],checkin:{current_streak,highest_streak}}`。同账号锁内核对最新状态、原日期规则、预览源版本和卡有效性。状态变化409 preview_stale重算确认；目标已签422 day_already_checked_in且不扣卡。恢复连续段、补受影响后续已签日期差额，非负差额幂等；experience_added=0（新达成的成就仍只待领）。不补成功复习日期。

## 2. 等级、成就、手动领取

`GET /me/growth/level-rewards?cursor=&limit=` →200 `{items:LevelAward[]}`，level.number ASC,id ASC。

`GET /me/growth/achievements?kind=&cursor=&limit=` →200 `{items:Achievement[]}`，kind固定签到/复习/掌握/收录顺序、threshold ASC,id ASC。kind=`checkin_streak|review_streak|mastered_words|saved_passages`，省略全部；不引入每日/每周任务。

```text
AwardState="unachieved"|"claimable"|"blocked"|"claimed"
RewardBlock="tier_disabled"|"reward_unavailable"|"level_required"
LevelAward={id,level_id,level_number:int,min_experience:Amount,
 state:AwardState,block_reason:RewardBlock|null,achieved_at:Time|null,claimed_at:Time|null,
 reward:Reward,settlement_id:string|null}
Achievement={id,tier_id,kind,name:string,title:string,description:string|null,threshold:int,progress:int,
 state:AwardState,block_reason:RewardBlock|null,achieved_at:Time|null,claimed_at:Time|null,
 reward:Reward,settlement_id:string|null}
```

成就 description 字段必返且可为 null：从当前 achievement_tiers 的 description_zh/en 逐字段按本人 ui_locale 选值，缺当前语言回退另一语言，两种都空则 null，前端省略说明块。名称/说明/称号分别选译，不套用通知完整语言对规则；未达成和已达成都按当前配置读说明，只有已达成 title 用原称号快照。显示为纯文本（含尖括号也不按 HTML 执行），不自动翻译、不保存说明历史。管理读写的两个实际语言槽见 API-206；改说明不改变已达成/已领状态或积分经验。此处对应 FE2-G01 / DB2-R10 / BE2-V18。

未达成返回achieved_at/claimed_at/settlement_id=null；初始等级没有level reward行；已达成称号用达成时快照，不以是否领取控制显示。未领奖励显示最新配置；claimed显示实际settlement奖励及实际时间，不随配置改写。多阻塞优先tier_disabled→level_required→reward_unavailable；未达成不伪称blocked。

`POST /me/growth/level-rewards/{level_id}/claim`、`POST /me/growth/achievements/{tier_id}/claim`，body `{}`+Idempotency-Key →200 `{receipt:SettlementReceipt,growth:{points:Amount,experience:Amount,level_number:int,pending_reward_count:int}}`。以(owner,稳定档ID)二重唯一，即使用新键也不重复发。未达成/当前等级不足/档位停用/奖品失效422对应 `reward_not_achieved|level_required|tier_disabled|reward_unavailable`；重试已领取返回实际receipt，不按最新奖品再算。

领取事务读取最新配置并一并发积分、经验和定义的卡，任何一张不可发整档拒绝；商城listed=false不等于奖品无效。奖励发经验升级只新增待领资格，不递归自动发等级奖励。动态档不限数量，稳定ID不因改门槛重建；跨级各保留一份，降低门槛/新增高等级用已有经验判断，提高后上级未领暂停。成就已达成不撤销，已领从不收回或重发。

`SettlementReceipt={id,kind:string,settled_at:Time,points_delta:SignedAmount,experience_delta:Amount,points_after:Amount,experience_after:Amount,items:[{item_id,definition_id,kind,activation_deadline:Time}]}`。SignedAmount为十进制有符号字符串，负数只有兑换；零变动不必产生ledger行但receipt保留。receipt只含结算和奖品，不能含短文/复习答案或可恢复已删内容引用。

`GET /me/points-ledger?cursor=&limit=` →200 `{balance:Amount,items:[{id,settlement_id,kind,delta:SignedAmount,balance_after:Amount,created_at:Time}]}`；created_at DESC,id DESC；仅积分流水，不展现原词明细或全文来源。管理员同投影读取指定用户，另可看补发者管理身份。

## 3. API-204 兑换与道具背包

`GET /api/v1/shop/items?kind=&cursor=&limit=` →200 `{balance:Amount,items:ShopItem[]}`；只listed且定义有效，按created_at DESC,id ASC。`ShopItem={id,name,description:string,kind:ItemKind,price:Amount,activation_ttl_seconds:int,effect:Effect,available:bool,unavailable_reason:ItemBlock|null}`。模型失效可在已上架列表显示available=false，禁止兑换；不能凭客户端price扣分。

```text
ItemKind=makeup|extra_credit|model_trial|plan_trial
Effect={kind:"makeup"}
      | {kind:"extra_credit",extra_count:int}
      | {kind:"model_trial",models:[{id,name,status:"enabled"|"disabled"|"retired"}],trial_seconds:int,retirement_points:Amount}
      | {kind:"plan_trial",target_plan_code:Plan,trial_seconds:int}
```

类型分支严格，不允许model_trial次数或plan_trial自定义计划权益。启用期限和体验时长独立；model retirement_points每次读当前定义，其他已发参数用发放快照。

`POST /shop/exchanges` body `{definition_id,quantity:int}`+Idempotency-Key；quantity>0，无每日/每周/累计限购，数值/请求体溢出保护与无业务限购区分。200 `{receipt:SettlementReceipt}`。读取当前价格、有效定义、listed并条件扣余额，一次发quantity份库存；不足422 insufficient_points，下架422 item_unlisted，不发不扣。并发与definition删除受同一锁顺序约束，ever_issued不可回退。重复同键同quantity返回实际receipt；改quantity409。

`GET /me/items?state=&kind=&cursor=&limit=` →200 `{items:OwnedItem[]}`，issued_at DESC,id DESC；state可省略或 `unused|active|ended|refundable|refunded`。

```text
OwnedItem={id,definition_id,name,description,kind:ItemKind,effect:Effect,
 issued_at,activation_deadline,activated_at:Time|null,
 state:"unused"|"active"|"ended"|"refundable"|"refunded",
 use_block:ItemBlock|null,
 model_times:[{model_id,name,contribution_starts_at,contribution_ends_at,aggregate_ends_at:Time|null}],
 plan_trial:{plan_code,ends_at:Time}|null,
 extra_credit:{remaining:int,expires_at:Time}|null,
 refund:{eligible_at:Time,points:Amount}|null,
 refunded_at:Time|null,refund_receipt_id:string|null}
```

非model卡model_times=[]；对应类型未启用权益值为空；refund只可退时非空。refundable优先于active/ended，过期不吞掉退积分入口，refunded之后不能再用。expiry按时钟判断，不依赖job。商城下架不改变owned可用性；有使用历史的定义不删除。

`ItemBlock=expired|already_used|already_refunded|model_unavailable|plan_already_covers_models|plan_not_above_base|lower_than_current_trial|invalid_target_day|day_already_checked_in|configuration_invalid`。当前计划包含卡内所有模型时use_block=plan_already_covers_models，显示用户指定文案；比较不含其他模型卡权限。仅临时禁用不会产生退积分资格。

## 4. 使用效果预览、确认与下架退款

`POST /me/items/{id}/activation-preview` body `{}`，补签卡转专用日期预览，其余→200：

```text
{can_activate:bool,reason:ItemBlock|null,
 effect:Effect,model_times:[{model_id,added_seconds:int,result_ends_at:Time}],
 plan_result:{plan_code,result_ends_at:Time}|null,
 discarded_trial:{plan_code,ends_at:Time,remaining_seconds:int}|null,
 extra_result:{added_count:int,expires_at:Time}|null,
 confirmation_token:string|null,token_expires_at:Time|null}
```

token是5分钟服务端签名，绑定本人/卡快照/配置revision/现有trial身份和ends/相关模型贡献末尾；只表示当前预览，不能独立授权。预计结束按预览now计算，首次启用实际开始为事务now；续期接现有tail。当前基础与trial相同取base；高档覆盖必须先看清discarded_trial。无可用操作token=null。

`POST /me/items/{id}/activate` body `{confirmation_token,confirm_discard:bool}`+Idempotency-Key →200 `{receipt:SettlementReceipt,item:OwnedItem}`。只有discarded_trial非空才要求true，false则422 replacement_confirmation_required；状态与预览不一致409 preview_stale，不能拿旧确认覆盖刚续期的低档时长。关弹窗不请求、不消耗。

- 次数卡：原启用截止即启用后余额到期；不延长、不重置计划。
- 模型卡：卡内模型分别 `max(now,本人该模型卡授权tail)+duration`，部分重叠也累加，所有贡献/activated一次提交。正式retired的身份只保留来源关系，不给可调用授权；卡仍有实际可用模型时，不把其他模型的下架扩大为整卡退换。模型启用规则不把其他模型卡当计划覆盖；后续计划覆盖不暂停时长。返回逐模型实际到期，不返回一个错误统一到期。
- 计划卡：目标须高于base；低于未结束trial拒绝，同目标续期，高于trial确认作废其剩余时间；只一份trial。trial额度复用同plan/trial历史，不重置base/trial；实际权益取计划最新配置。管理员提高base覆盖trial时trial继续计时。
- 只有真实新启用增加时长；重试读取第一次receipt。已用卡重新换键也不加时，返回对应已用状态/原receipt供核对。

`POST /me/items/{id}/refund-preview` body `{}`→200 `{eligible:bool,reason:"models_not_all_retired"|"expired_before_retirement"|"already_refunded"|"wrong_item_kind"|null,points:Amount|null,confirmation_token:string|null}`。资格依据发放模型快照、正式retired_at与当时有效期，不用当前listed或临时故障。预览有效时5分钟token绑定当前下架积分/configrevision；金额变化提示重新确认。

`POST /me/items/{id}/retirement-refund` body `{confirmation_token}`+Idempotency-Key →200 `{receipt:SettlementReceipt,item:OwnedItem}`。事务重读最新下架积分，一次到账，撤销仅本卡授权；若预览金额旧409 preview_stale，再确认最新金额。已成功重复返回原实际金额，不因后台改价补差；资格在过期后仍可用。赠送/兑换、已用/未用相同。下架前自然过期不获资格。

## 5. API-205 平台消息

`GET /api/v1/notices?reminders_only=&cursor=&limit=`（L/A）→200 `{items:Notice[]}`，reminders_only默认false；可见优先过滤，remind DESC,published_at DESC,id ASC；true仅可见且提醒开启。同一登录的提醒分页拉完再由一个弹窗切换，不推断读状态。

`GET /notices/{id}`（L/A）→200 `{notice:Notice}`；隐藏/已删404。

`Notice={id,title:string,body_html:string,content_locale:Locale,remind:bool,remind_once:bool,published_at:Time,revision:string}`。title 是 UI22 独立编辑的消息标题，已接收 [DB-02 §4.3](../database.md#43-平台通知) / DB2-R09。content_locale 指出标题和正文整套的实际语言：优先当前界面语言的完整 title+body，否则取另一完整对；一侧缺失即回退整套，不能中标题配英正文或从正文取首行补标题。先选语言再渲染正文，title 仍为纯文本由前端文本节点展示。后端Markdown禁原始HTML、白名单清洗后输出安全HTML；不支持脚本、iframe、样式或事件属性，链接限http/https、rel=noopener noreferrer，禁止javascript/data。正文原Markdown仅管理接口给出，不在用户接口附带隐藏另一版本。无read/unread/is_personal字段，无已读写接口。

列表、详情和登录提醒共用同一语言选择/可见性规则；visible=false 且 remind=true 仍不公开。游标使用同一 `(remind DESC,published_at DESC,id ASC)` 排序键并绑定 reminders_only 与当前语言，翻页时改语言须从第一页读；编辑标题/正文/开关不修改 published_at。未新增逐用户提示记录。

自动弹窗由前端显式login成功标记驱动；刷新/bootstrap/会话续期不触发，注册不当作显式login。访客原文收录完成优先；列表查询失败不会撤销认证/收录，下次明确登录按当前可见提醒重试。关闭只结束本次内存提醒，不保存个人已读状态。多条内容按时间倒序，一个弹窗显示位置；欢迎toast在其上层。

验收BE2-V08/09/12：补差按历史规则、跨级/降级/停档全或无领奖、同模型6+3及甲乙3+乙丙6、覆盖确认竞争、下架过期资格、完整语言对回退/独立标题/同时间稳定翻页、脚本/URL净化、刷新不弹消息；通知数据边界对应 DB2-V19。
