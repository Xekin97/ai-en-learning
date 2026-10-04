# API-008 复习范围、题面、整批提交与重来

权限均为本人学习者 L；数据 DATA-012/013/014/201/202/203/206–209/213；页面 PAGE-007/008/201–203，CAP-017–020/022/201–204/213。公共规则见 [index](index.md)。数据依据为已批准 [DB-02 §5](../database.md#5-复习草稿与最小结算事实) / [011 批准](../../reviews/database-revision.md)；[CR-003](../../changes/CR-003.md) 数据接收已完成，本契约随 BE-02 待审。

## 1. 会话与进度

`Range={start_date:Date,end_date:Date,timezone:IANA}`；起止含当天，范围按浏览器时区 saved_at 查询，默认最近7天由前端给值，不用北京时间04:00替换。`Progress={completed_batches:int,total_batches:int,successful_batches:int,unsuccessful_batches:int,skipped_batches:int}`。按会话内仍存在的批次计 distinct；完成以第一次提交为准，成功/未成功/包含未答按该批最新 submitted 的最小事实投影；重来草稿不抹掉上次已完成进度。successful+unsuccessful=completed≤total，skipped≤unsuccessful。重复成功的累计复习次数独立，不累加到会话 total。

最新 submitted 明确按同 session/batch 的 attempt_no 最大值选择，不按可能同值的时间；进度/最新概况在一个 SQL 语句快照读取。skipped_batches 统计 has_unanswered=true 的批次，不是空题数量，也不包含从未提交批次。M001 用旧 skip_count>0 迁移；不向前端暴露具体空题号。例：4 批中未做/全对/全填有错/部分留空各一批，返回 total=4、completed=3、successful=1、unsuccessful=2、skipped=1；留空批重来处于 draft 时不变，随后全对提交更新为 4/3/2/1/0。

`Session={session_id,mode:"range"|"single_batch",status:"active"|"completed"|"abandoned",date_range:Range|null,progress:Progress,current_batch:SafeBatch|null,current_attempt:{attempt_id,revision,state:"draft"}|null}`。SafeBatch 只有 `{batch_id,saved_at,scenario}`，没有 title、词条、正文或 target ID。数据库 in_progress 映射 active、single 映射 single_batch；abandoned 只用于被替换的 range。range.date_range非空，single为null；completed/abandoned 的 current_* 为null。active 优先当前draft所属批次，否则固定批次序中第一个 pending。全部批次 completed 且无 draft 时自动标 completed。

| Method / 路径（/api/v1） | 请求 | 响应与语义 |
|---|---|---|
| GET /me/review-range/preview | Range query | 200 `{batch_count:int,entry_count:int,empty:bool}`，按当前参与设置查；两计数均0才empty |
| GET /me/review-sessions/active-range | 无 | 200 `{session:Session\|null}`，只发现唯一未完成范围，不混入单批 |
| POST /me/review-sessions | `{mode:"range",...Range}` 或 `{mode:"single_batch",batch_id}` | 201 `{session:Session,reused:false}`；存在同模式活跃安排则200 reused=true返回原安排、不按新日期重建 |
| POST /me/review-sessions/{id}/replace | 仅 range；`{confirmed:true,expected_session_revision:string,range:Range}` | 201 `{session:Session,replaced_session_id}`；旧安排已非active返回409 session_replaced，客户端读active-range核对，不盲目重放；原子边界 DB2-T14 |
| GET /me/review-sessions/{id} | 无 | 200 `{session:Session,session_revision:string}`；历史只能看最小概况，无答案接口 |
| POST /me/review-sessions/{id}/attempts | `{}` | 201 `{attempt:DraftAttempt}`；已有draft复用200，开始固定顺序的第一个pending；completed无draft则409 |

新建批次和词序由服务端安全随机并固定；单批忽略 participates 开关，模式互不覆盖。空范围422 empty_review_range，日期/时区非法422；他人/已删404。会话版本由模式、状态、关系和 attempt revision 的签名投影产生，不为此新增数据库游标。前端展示替换确认前 GET 原 session 取得 session_revision，确认后携原值提交；不能仅凭 active-range 投影猜版本。

replace 只接收当前唯一 active 范围，按 DB §11 配置→账号→会话顺序加锁后核验：先所有权/当前状态，再旧版本与新范围命中。单批模式、confirmed 不为 true、版本格式/签名非法返回422 validation_failed；合法旧版本与当前不同409 revision_conflict，重新读取并确认。新范围为空422 empty_review_range，所有上述拒绝均保留旧安排。

条件成立后，同事务把旧 draft 置 restarted/revision+1、旧范围置 abandoned/completed_at=NULL/更新 updated_at，再建立新 session 及固定批次/题序；任一步失败全部回滚。保留旧关系、已提交 attempt、首次进度及既有成长，单批会话不变。旧范围不能重新打开；替换不发完成事件或成长。

并发提交先完成会改变旧版本，替换请求409 revision_conflict（若已终结则 session_replaced）；替换先完成则旧页 start/submit/restart 均409 session_replaced。两次替换只有一个成功。response 丢失先 GET active-range 核对，不再以旧版本替换新会话；读取不能返回旧答案。批次删除后会话数量重新派生，空会话404。

## 2. 题面与本机草稿

`GET /me/review-attempts/{id}` →200严格联合：

- draft：`{state:"draft",attempt:DraftAttempt}`；重签短期token，不创建新attempt/开始事件。
- submitted：`{state:"submitted",receipt:Receipt,session:Session}`，绝不返回答案或上次标准对照。
- restarted：`{state:"restarted",session:Session}`，本机清旧草稿；不能继续提交。

```text
DraftAttempt={attempt_id,session_id,batch_id,revision:string,
 attempt_token:string,token_expires_at:Time,
 words:[{question_id:string,entry_meaning:string,
         slots:[{kind:"letters",count:int}|{kind:"separator",text:string}],
         hint:{segments:[{kind:"text",text:string}|{kind:"blank"}]}}],
 passage:{segments:[{kind:"text",text:string}|{kind:"blank",blank_id:string,group_key:string}]}}
```

words按会话固定随机序。letters.count为原词真实字母槽数，separator仅空格/标点；这是CAP-201授权的长度提示。hint的blank不用真实词形长度；passage的blank无长度、surface、offset或原词。所有目标的所有 occurrence 都替换为空，按已验证span切片，不全局replace。group_key同原词相同，其他原词不同，只表达同源、不编码题序。

question/blank/group IDs 使用现有 capability 密钥以不同域名 HMAC(attempt_id,内部ID) 截取128位并base64url，不以原词作输入、不暴露内部ID；同attempt稳定，服务进程重启不变化。前端只在本机以题目ID为键保存用户输入；group_key为题面视图状态、不进入分析或提交。题集被服务端重新构造后校验键归属，HMAC本身不是授权。

token沿既有能力签名与2小时有效期；**到期的是token，不是草稿事实**。会话仍认证且attempt为draft时GET重新获取，保留原题序和本机输入。保留配置密钥在正常部署中稳定；计划性密钥轮换需要在实施时提供旧验证密钥过渡或明确重建本机题目映射，不能把进程内随机映射当可恢复方案。不得日志输出密钥/题目答案。

前端IndexedDB键为当前认证account_id/session_id/attempt_id，内容仅用户答案、导航和本地revision；详情读取成功验证仍draft后才询问恢复。上/下/跳过/概览/修改是前端本机操作，均不调用判分API。部分输入可前进；全空通过跳过，不阻止从任何步骤到概览并直接提交。跨设备没有答案同步；本机冲突/写失败交前端契约处理。

## 3. 提交、回执与当次总结

`POST /me/review-attempts/{id}/submit`，需CSRF和`X-Review-Attempt-Token`：

```json
{"expected_revision":"1","words":[{"question_id":"q_opaque","answer":"lear"}],"passage":[{"blank_id":"b_opaque","answer":"learning"}]}
```

两个数组必填，可为空；缺少的已知题视为空，重复或未知键422。answer 是字符串，安全体积上限沿全局请求限制；不因比槽数短/长或错误拒绝提交，不用技术限额悄悄只截取正确长度。trim并忽略英文大小写比较，原词对原词、短文对该处surface。所有题正确且非空才successful；至少一项trim后非空则has_answer，任一词题或短文空仍未答则has_unanswered。两个标志都由服务端完整题集计算，不接受客户端传入；部分作答可以同时为 true。

新提交成功200：

```text
{outcome:"submitted",receipt:Receipt,session:Session,
 comparison:{words:[{question_id,input:string,correct:string,result:"correct"|"incorrect"|"unanswered"}],
 passage_segments:[{kind:"text",text:string}|{kind:"answer",blank_id,input,correct,result}]},
 growth:{new_masteries:int,experience_added:Amount,points_added:Amount}}
Receipt={attempt_id,batch_id,revision:string,submitted_at:Time,successful:bool,has_answer:bool|null}
```

input是本次用户输入（显示用trim后文本），correct是对应原词或原位置词形；服务端只在新鲜成功提交响应中返回。正确只画一次拼写，错误划线+正确值，空白显示设计“未作答”。comparison有完整当次文本但不持久化，不写缓存、通用幂等payload或分析。growth只报这一次实际增量，不将已有掌握计为新增。

Receipt.has_answer 对 M002 提交总为 bool；仅 M001 迁移事实为 null（未知），不能映射 false、据此补记学习或拒绝已完成状态。has_unanswered 只用于服务端最小事实及 Progress 投影，不额外增加逐题查询接口。

写入顺序先鉴权/所有权和 session 状态；abandoned 一律409 session_replaced，包括已提交 attempt 的 POST 重试，不在该分支返回写成功。其余允许的 active/completed 会话中，已submitted重复200：`{outcome:"already_submitted",receipt:Receipt,session:Session}`，不带comparison/growth，不重判分、不重领奖；在这些会话中优先识别已结算，再处理旧revision，防止成功重试被误报未提交。其他状态或尚draft但revision冲突409 state_conflict。服务端失败原子回滚，客户端保留本机答案；COMMIT不明先GET状态，draft可原键重试，submitted清本机残留并走已完成提示，restarted/abandoned清对应旧草稿并转当前安排。不为了重建总结去保存“最后一次结果”。

同事务：最小submitted（含 has_answer / has_unanswered）/首次进度→成功时lexeme首次掌握→成长/学习日/资格→分析事实，按DB2-T03；全部已完成且无 draft 时同事务置 completed/completed_at。全空也完成但不活跃；错但有输入更新last_learning；成功才增加成功复习、掌握、当日成功连续记录。提交不会自动开始下一批。

## 4. 重来与完成状态边界

`POST /me/review-attempts/{id}/restart`：`{expected_revision:string}`，需当前认证、CSRF和本人归属，不要求已过期的作答token。200/201 `{attempt:DraftAttempt,session:Session}`；新draft从原批第一题，无答案。旧draft→restarted；旧submitted保持事实不改。重试对同原attempt复用已创建的直接后继draft，不重复造开始；若后继已被再次提交/重来则409，前端重新读会话。

- 对draft只允许当前活跃draft；对submitted只允许会话最新一次提交且未开始下一批，不能把任意历史attempt当重来入口。用服务端已持有attempt事实判断，不依赖用户点击位置。
- 最后一批提交后 session 可自动completed；当次总结点击重来先检查不存在新的同模式active会话，再同事务重新置in_progress、清completed_at并创建draft。若新会话已建立，409 review_session_conflict，保留它；不覆盖另一会话。abandoned 永远不能进入该重新打开分支。非末批重来优先当前新draft，不跳到pending下一批。
- 下一批按钮调用 `/sessions/{id}/attempts`，仅开始固定序中下一个pending；完成按钮只离开本次内存总结（服务端已在末批提交完成），不增加“第二次完成”事件。刷新submitted后只显示最小状态与继续入口，不重建总结。
- 开始下一批或离开总结后前端丢弃comparison；下次从书架进入已完成单批创建新session。范围内已完成批次不会自动重做；只有当次显式重来例外。
- 被替换的abandoned会话不再允许start/submit/restart。账号/批次删除404，删除与提交按账号锁串行，不能复活内容。

验收 BE2-V03/04/05、DB2-V17/18：半填提交、全空、完整成功、匿名多位置、同词不同词形、本机恢复/重启token续取、响应丢失、双击、多标签页、末批重来与新范围冲突、替换回滚/并发、M001 未知值和删除竞争。上述为实施验收要求，本轮完成契约接收而未运行这些场景。
