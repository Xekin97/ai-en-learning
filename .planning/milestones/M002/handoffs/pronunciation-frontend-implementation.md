---
milestone: M002
stage: implementation
role: frontend-implementer/base
agent_name: frontend-claire
version: M002-FI-PRON-01-R1
status: ready_for_qa
date: 2026-10-16
actual_model: unknown
---

# 浏览器朗读前端实施交接

## 交付行为

- 首版只使用浏览器`speechSynthesis`，一次只有一个活动尝试；默认设备英语声音优先，否则稳定选择实际英语声音。只有实际语言地区用于英/美/中性分组，同口音只显示一个代表。
- 点击词卡标题旁18px裸图标才朗读entry。单项不显示来源；多项显示本词口音菜单。显式选择失效时保留失败口音，唯一替代也必须由用户打开菜单并选择。
- 计划、结果和library共用控件。选词区、trial、preset、admin、explore、review没有接入；没有FreeDictionary、录音、署名、后端字段或模型调用。
- 计划退场、surface/route/session变化、卸载和library删除会取消；晚事件按registration/control/attempt丢弃。计划焦点只在原本位于退出发音按钮时转到同entry结果按钮或workspace。
- R1修复`PRON-DEFECT-001`：启用词义卡省略`pronunciationActive`时明确默认true，计划退场仍显式false。结果按钮可操作；同entry焦点交接不会自动播放，也不会在原按钮未获焦时抢焦。

## 主要入口

- 协调器：`frontend/app/application/pronunciation/coordinator.ts`
- 原生端口：`frontend/app/infrastructure/pronunciation/browser-speech.ts`
- Nuxt组合：`frontend/app/plugins/pronunciation.client.ts`
- 控件：`frontend/app/presentation/components/WordPronunciation.vue`
- 生成接入：`GenerationWorkspace.vue` → `GenerationContent.vue` → `GenerationVocabularyList.vue`
- library接入：`frontend/app/pages/library/[batchId].vue`
- R4转换：`frontend/scripts/sync-design.mjs`、生成的`PronunciationIcon.vue`、locale/theme/source manifest

## 构建接收

- 输出目录：`/Users/xekinzhuo/Desktop/xekin_develop/ai-en-learning-development/ai-en-learning/frontend/.output-pronunciation-m002-fi01-r1`
- 启动入口：`/Users/xekinzhuo/Desktop/xekin_develop/ai-en-learning-development/ai-en-learning/frontend/.output-pronunciation-m002-fi01-r1/server/index.mjs`
- Node要求：24.x；本次使用`/Users/xekinzhuo/.npm/_npx/387698761821791d/node_modules/node/bin/node`（v24.21.0）。
- 构建文件数462；aggregate SHA-256 `a6437e56fe8a60781a7ec9b9ccbdc86272ae73a8cc734a8dc4ca4cd32066071a`。算法、23项实施源码hash和独立回归测试hash见`implementation/pronunciation/evidence/frontend/implementation-manifest.json`。
- 这是versioned隔离输出，没有覆盖3017当前目录。QA可用既定3018 frontend + 3019 candidate proxy启动该entry，验收后再由root决定是否备份/替换3017输出；本实施线程没有切换3016。

## 已完成检查

- Typecheck PASS；scoped ESLint PASS；Prettier PASS；dependency boundary PASS（294模块、318依赖）。
- 相关8文件71项PASS；发音核心4文件18项PASS；SSR稳定、口音菜单、有限等待、取消和晚事件均有定向断言。
- 真实learner/API文章 + fake speech浏览器自检PASS：5卡、18px、390无溢出、A→B取消、晚事件、显式单替代、0 console/page errors。
- 首版production build日志保留为`raw-checks/build.log`；R1 production build日志为`raw-checks/r1-build.log`。
- R1受影响复验PASS：定向unit 2/2、typecheck、scoped ESLint 0 error、Prettier及production build；隔离R1 build上的受控真实浏览器链16/16 PASS，包含结果enabled、同entry焦点、无自动播放、手动native start/end和旧计划cancel。日志为`raw-checks/r1-*.log`，结构化结果为`r1-controlled-plan-result.json`。

## QA/UAT建议

1. 按既定3018/3019候选拓扑启动上述entry，继续使用真实43331/PG和现有learner数据；不要启mock、不要改模型或数据库。
2. 先验library已存文章，再在普通create现有真实模型流程验计划与结果；确认选词无图标，trial/preset/admin无图标。
3. 用实际Chrome声音验证一次真实start/end和人工可听；再验A→B、同词重播、离页/logout、计划→结果和唯一替代。开发fake证据不能替代这一步。
4. 若QA通过，由root执行3017输出备份/替换与3016切换；M002仍保持开放，不在本交接收尾。

## 限制与保护

- R1浏览器链使用真实浏览器speech和真实后端session，但plan/result业务状态由浏览器内存注入；没有人工听音，也没有触发生成模型。最终真实生成链与人工可听性由用户实际UAT确认；QA只做候选技术接收，不替代听音，也无需为本项额外生成文章。
- 原始凭据、口令、cookie没有写入仓库或日志。临时43240/3019进程和/tmp代理副本已停止；3016/3017/43331保持原运行状态。
- 工作区原有CR313/M003脏修改受到保护。`baseline.json`是进入本任务时的相关文件hash，未覆盖或回退他人增量。
