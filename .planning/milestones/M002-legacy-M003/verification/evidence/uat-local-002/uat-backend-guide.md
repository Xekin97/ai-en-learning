# UAT local backend guide

This UAT uses a new empty PostgreSQL 18 database initialized with the current schema. It does not migrate or modify the older UAT database.

- Frontend: `http://127.0.0.1:3014` (owned by QA)
- API: `http://127.0.0.1:54873`
- Private browser-login accounts: `/tmp/wordweave-m003-uat-local-002/uat-accounts.json` (mode `0600`; account credentials only)
- Account fields: `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `BASIC_USERNAME`, `BASIC_PASSWORD`, `PRO_USERNAME`, `PRO_PASSWORD`
- Runtime controls: `/tmp/wordweave-m003-uat-local-002/start`, `/tmp/wordweave-m003-uat-local-002/status`, `/tmp/wordweave-m003-uat-local-002/stop`

Use the five-word Chinese Story/Brief sample: `machine`, `preclude`, `interim`, `juvenile`, `retroactive`.

The `UAT 合成｜成功` model is the no-fee normal path. `UAT 合成｜审校故障 Q02` exercises preservation of the last valid draft. `UAT 合成｜可取消等待` exercises cancellation. `UAT 合成｜规划格式失败` exercises fenced-plan rejection before writer. `UAT 合成｜参数快照可编辑` may be edited and read back safely from the admin model dialog; saving configuration does not call the provider.

For two conditional repairs, sign in as admin, open Plans, set Pro `content_repair_limit` from its initial value 1 to 2 while content review remains enabled, then sign in as the Pro learner and choose `UAT 合成｜两轮返修`. Restore Pro to 1 after the check. The accepted configuration range remains 0–99.

`UAT 真实｜DeepSeek V4 Flash 0731` is available to visitor, Basic, Pro, and Plus with `output_mode=json_schema` and `custom_parameters={"reasoning":{"enabled":false}}`. It makes a real external paid request only when the user manually starts generation. Preparation performed no probe or generation call.

The start/stop scripts own only ports 54872–54875. They do not manage frontend 3014 or the older UAT services on 3013/54672–54675. Keep this stack running until the user finishes UAT.
