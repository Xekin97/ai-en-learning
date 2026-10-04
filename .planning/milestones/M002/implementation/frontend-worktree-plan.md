## CR026 / frontend-claire

单工作区顺序实现，不委派。负责notice模型/映射/schema、后台开关、storage适配器、store队列和dialog shown事件；sync-design消费UI28 copy，原样式保持。只修改对应fixtures与测试，保留其他变动。检查账号隔离/再登录/多条提前关闭/手动与预览不计/语言切换/存储失败/隐藏，后台保存刷新、手机英文说明不溢出；最多4张局部图。开发基础检查与1组浏览器生命周期后QA再补跨边界，旧Markdown/欢迎样式未变部分复用。

## 当前CR028（077 / frontend-claire，开发通过）

用户搜索固定两词+优化加载态。单工作区顺序执行，不委派；业务文件WordPicker、同步theme/manifest，测试文件mock-backend/专项浏览器脚本；不改真实后端/词表/API/其他既有修改。来源UI27/FE04-SEARCH27，普通/后台共享视觉延迟250ms，网络防抖180ms不变。复现证据design/evidence/search-loading27/search-before.json。

浏览器前范围：实际fixture查询garden/learn/zzzz/完整短语/大小写/limit，真实词表输出；两入口在1440/390及英语/中文的慢请求加载、快响应无闪现、改查询/清空/Escape/离开、错误/重试/空态、reduced-motion；原乱序3单测及原选词/生成收录回归按影响复用。软预算4张局部截图，结构化信号优先。生产构建后重启3310/38080测试服务供3311使用，3302正式模型不改、0真实AI调用。

本轮实际9HTTP、6浏览器、1回归和24既有单测通过；保存2张实现局部图，未超预算。完整来源见frontend-validation.md#search27。

## 当前页头语言修复（072 / frontend-claire，开发通过）

用户指出UI26页头未同步，范围UIA-GLOBAL-SELECT23/FE3-V03：AppHeader/admin两处真实消费、LocaleSwitch及旧局部样式。单工作区顺序处理，不委派；保留所有无关修改。设计采用原型app.js localeControl与admin.js header、theme .locale-control、语言名称中文/EN和copy language。无需新产品决定或接口。

开发前证据为reproduction.json；浏览器前计划：访客/学习者/管理员两套页头，1440/390/320代表视口，Chromium/WebKit；检查准确样式/标签、展开选项、方向键/Enter/Escape、偏好写入/刷新、无横溢。最多4张页头局部视觉，复用其他UI26已验结果。实施/构建及18场景+2回归已通过，3311本轮预览已更新；3302原正式模型入口未授权切换，不改数据库/模型。范围外CR026与旧遗留保留。

## 当前 UI26 增量（069 / frontend-claire）

按批准UI26/FE04实施FE3-I01–06，具体来源/接口/验收见technical/frontend.md#ui26。共享CSS、copy、组件顺序在本工作区实现；不委派、不建worktree，不动现有未提交无关工作。先代表性普通台与后台预设，再替换其余原生选择器（盘点18单选+1多选）；保留BE4修复与原UAT流程。

当前implemented_developer_verified，FE3-I01–06完成，待质量接收。浏览器前范围：FE3-V01文案/版本静态与运行；V02/03选择器键盘、必填、19处与窄屏/弹窗；V04/05消息结构几何/滚动/Markdown；V06/09两处选词及请求乱序/退出；V07释义同快照；V08首页与受影响文案。复用未改业务测试；代表构图最多6张，需要时才追加失败截图。浏览器模拟不能替代真机/读屏。先使用现有契约mock，后定向真实API；不调用正式模型。原源见implementation/evidence/frontend-ui26/before.tar.gz。

# CR024前端实施计划

frontend-claire单工作区负责[CR024](../changes/CR-024.md)，仅GenerationWorkspace模板，还原UI22资料区。无并行工作树、无委派；已有未提交修改与用户数据保留。原型/CSS/文案复用，不新增产品规则。

开发已验证：1440中文/390英文普通和预设4项完成结果/收录检查通过，目标lint/格式、类型和生产构建通过，必要视觉已对照。小型模板修复未新增单测；手机原型初次方法错误原件保留，修正只补验手机。下一步QA定向验证实际结果与放弃操作，不重跑开发检查；详见[交付](frontend-validation.md)及[范围](evidence/frontend-cr024/inputs.json)。


## CR029 工作区策略

本次串行角色交接、单工作区实现；保留既有未提交变更，不重置/清理/自动提交，也未启动子代理。新增文件和改动源按generic-models29证据绑定；原型、契约服务和3302运行目录相互隔离。
