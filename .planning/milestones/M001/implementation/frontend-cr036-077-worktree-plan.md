# CR036有限前端实现计划

责任frontend-claire；TRANSITION-M001-077。PAGE-102 / CAP-103、021 / DATA-006、008、018 / API-102。只实现批准不可生成配置警告，保持完整替换保存和所有合法空值/零额度行为。

单工作区顺序实现：任务共享Plans表单、双语和状态派生，无独立可合并模块，开worktree无收益。仓库应用文件目前均未跟踪，保留所有既有内容，不commit/reset/clean，不删除worktree。

所有权：application/admin/plan-policy.ts纯规则和草稿类型；presentation/admin/admin-plan-presenter.ts本地化VM；pages/admin/plans.vue只装配VM和渲染；application.css局部24px提示间距；两份locale静态已批准文案；新单元/浏览器回归。后端、API、原型、依赖和历史证据不改。

空模型或空篇幅使用原型完整标题/正文；仅零额度使用同一已批准“当前方案已暂停生成”标题，不错误建议重新选择已经存在的模型和篇幅。不新增未经批准文案，不禁止保存。Unlimited空字符串不是零；负数/非法输入仍由既有字段/后端规则处理。

先冻结源，再实现→单元/format/type/lint/boundary/build→固定镜像上的目标浏览器检查。开发交接之后独立QA重新建立测试环境和结果，不把开发测试当独立证据。每次gate分别处理，依用户连续批准继续；独立通过前6001不动。无需外部AI或密钥。
