---
milestone: M002
version: M002-FE-PRON-02
agent_name: frontend-bob
status: submitted_under_continuation_authorization
---

# 浏览器朗读前端落地

按[产品08-R1](../../product/pronunciation/browser-only/overview.md)、[设计R4](../../design/pronunciation/browser-only/design-spec.md)与[API-402 v2](api/browser-speech.md)实现。用户B与持续推进至UAT授权已明确范围。原FE01及TA1的组件/生命周期/SSR/无障碍细节继续使用，本稿替换其双音源分支及旧产品/设计入口。

## 最小模块和边界

- application/pronunciation：纯TS状态模型、speech端口与单一协调器，负责注册、当前attempt、有限等待、选择及取消。无Vue/DOM/native voice对象。
- infrastructure/pronunciation/browser-speech.ts：封装getVoices/voiceschanged、utterance、speak/cancel及事件；将native voice映射为内部稳定句柄和lang/default/localService。句柄仅当前应用有效。
- plugins/pronunciation.client.ts：每个Nuxt客户端实例创建一次服务；不使用跨SSR模块单例；挂载后读声音能力不发声。
- runtime/pronunciation与presentation/pronunciation：订阅协调器状态、session epoch/route/surface变化取消、生成无障碍名称、向视图暴露纯模型/意图。
- WordPronunciation.vue：按R4精确图标、菜单和文案；只绑定模型/用户意图，不访问speechSynthesis/基础设施。useId提供SSR稳定ID；SSR首屏只出裸图标，客户端挂载后才显示实际菜单。

删除原计划中的free-dictionary适配器、录音DTO、fetch/Blob/Audio、CORS域名与录音计时器；不实现双路径以备未来。不新增依赖、DB、Go端点、SSE字段、配额或管理台。

## 接入及失效

GenerationVocabularyList和GenerationContent的发音开关默认false；GenerationWorkspace仅普通create明确打开（trial/admin/preset不打开）。PAGE-402计划/结果共用控件；PAGE-403 library明确启用。输入只取entry，不把phrase/form当成词。

计划有240ms退场DOM：planLeaving=true时立即使计划控件失效/inert、关闭菜单及取消，结果使用新surface；不能等卸载。draft/batch/route/session改变也取消，释义更新和正文token不取消仍有效播放。当前图标有焦点而计划退出时，DOM就绪后移至同entry结果图标或工作台焦点锚点，不自动播；焦点在其他位置不抢。

CAP-404始终一个活动utterance；取消先使attempt失效再调用cancel，以免同步canceled回调污染新播放。重播替换旧尝试，同目标准备中点击不排队。组件释放只能取消自身lease，不误取消新词；route与session边界由客户端协调层处理。

## 声音与时序

点击时已有适用voice直接同步speak，禁止调用前await；未就绪最多1.5秒，speak至start最多2秒，start至end最多12秒。超时进入原位失败并清理；voiceschanged不延长deadline。真实start/end才切状态；not-allowed进入可重试手势状态。用户下一次手势不查词、不延时、不创建第二份utterance。

默认优先默认英语voice，否则稳定选一项；同locale只取代表声音，不把190项设备目录变为设置页。只根据lang地区提供UK/US，其他地区/未知用中性。所选声音消失，若同实际地区有替换voice可复核使用；若只剩别的口音则记录failedSelection并显示TA1原位明确替代（即使只有一个），不静默切换。相关菜单键盘/焦点从R4源准确转换。

## 设计源转换

sync-design.mjs只合并R4 copy中zh/en.pron.*运行键，去除demo类键；编译到现有m002本地化资源，运行不读.planning。SVG必须来自R4 controller（speaker/preparing/playing/error/accent/chevron/check）；编译进现有图标产物或独立生成图标模块，保持原路径与18px样式。CSS只提取R3的pron-control/action/menu/live/word-heading及其动效/减少动效相关规则，不导入演示页外壳或重复全主题。补齐词卡dt/h3与图标同行，原释义/用法顺序不变。

## 实施与验收映射

| 任务 | 范围与充分验证 |
|---|---|
| FE402-1 | 纯协调器和speech端口：默认/单多口音、无声、voiceschanged、手势、1.5/2/12秒、晚事件、取消与重播；有界Vitest假时钟/端口测试 |
| FE402-2 | R4控件和生成链：来源copy/SVG/CSS精确转换，菜单键盘/单替代/焦点、无可见文字；浏览器结构和代表性视觉对照 |
| FE402-3 | 计划/结果/library三处接入；无选词/trial/admin扩散；planLeaving/draft/session/route清理；定向集成测试 |
| FE402-4 | 生产构建和本地真实UAT：不启mock、不改模型/数据库，至少本机Chrome实际start/end；说明未测真机与人工听音，不造成功率 |

开发执行相关单元、typecheck、lint/边界、格式和生产build；已有无关测试不机械重复。浏览器自检预算6～8组定向场景，截图最多3张（必要缺陷复验可追加）；QA复用基础检查，独立验真实操作，不评文章质量。

CR-316产品和设计均已接收，本前端映射补齐后可关闭范围接收。OPEN-401范围移除；OPEN-402/403的明确实现契约已可实施，真实集成、设备差异与人工听音属于验证/UAT待完成项，不谎报技术设计已证明全设备发声。当前单设备spike提供可行性，完整功能验证必须在实现后执行。

实现顺序：一个实现责任人负责共享模块和三个接入点，避免多工作树并改共享组件；现有工作区含大量未提交内容，保留他人修改，只记录本次增量。后端无需代码变更，沿DB01无迁移边界。
