# M003 本地 UAT 环境

- 状态：运行中，留给用户手动验收。
- 造文台：http://127.0.0.1:3013/create
- 管理台：http://127.0.0.1:3013/admin/plans
- 测试账号：`uat_basic`、`uat_pro`、`uat_plus`、`uat_admin`；本地测试密码已直接提供给用户。
- 普通无内容审校；Pro 内容返修上限 1；Plus 上限 2。每账号初始额度 100。
- 模型：`UAT 正常生成`、`UAT 审校故障`、`UAT 两类原因返修`。均为本地模拟，非真实模型质量评测。
- 建议选词：`grape`、`young`，可覆盖所有固定模拟场景。
- 为验收 busy，本环境容量特意设为 1；不代表生产并发上限。
- 独立新数据库，只初始化空库；没有修改已有数据。
- 四账号浏览器登录与对应页面加载通过，用户验收结果仍待记录。
- 停止：在产品仓库运行 `python3 .planning/milestones/M003/verification/evidence/uat-local-001/local-stack.py stop`。
