---
milestone: M002
stage: implementation
role: frontend-implementer/base
agent_name: frontend-claire
version: M002-FI-PRON-01-R1
status: complete
date: 2026-10-16
requested_model: gpt-5.6-sol
requested_effort: high
actual_model: unknown
---

# 浏览器朗读前端实施计划

## 已确认基础

- 当前授权为 `TRANSITION-M002-144` 和 `USER-M002-PRON-THROUGH-UAT-20261016`；实现范围采用 M002-PRODUCT-08-R1、M002-UI-32-R4、M002-FE-PRON-02、API-402 v2，并定向修复`PRON-DEFECT-001`。
- 首版只用 browser `speechSynthesis`；无 FreeDictionary、录音、署名、服务端接口、模型/DB改动。PAGE-401选词无入口；仅 PAGE-402 计划/结果词义卡及 PAGE-403 library。
- 运行实际模型与路由锁请求值无法由本线程证明，`actual_model` 保持 unknown。

## 当前任务与验收

| ID              | 任务                                        | 完成条件                                                                       | 状态                             |
| --------------- | ------------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------- |
| FE402-1         | application 协调器与 browser speech 端口    | 单活动attempt、1.5/2/12秒、手势、取消/晚事件、实际口音和失效选择有定向测试     | 完成                             |
| FE402-2         | R4 WordPronunciation 控件及copy/SVG/CSS转换 | 18px裸图标、无可见状态/操作文字、菜单/焦点/单替代准确，SSR稳定                 | 完成                             |
| FE402-3         | PAGE-402计划/结果与PAGE-403接入             | 普通create和library启用；picker/trial/admin/preset排除；退场/session/route释放 | 完成                             |
| FE402-4         | 开发验证和UAT接入交接                       | unit/type/lint/format/boundary/隔离build通过；fake speech证据不冒充真实UAT     | 完成；真实声音UAT转QA            |
| PRON-DEFECT-001 | 计划→结果同entry焦点交接                    | 结果按钮enabled；仅原计划控件获焦时转焦；不自动播放；手动结果播放start/end     | R1定向开发复验完成，待QA独立接收 |

## 是否需要并行

协调器、共享控件、生成生命周期和三个入口互相依赖且共享文件多。本轮在当前工作区由 frontend-claire 单独集成，不创建子agent、分支或worktree。

## 实施顺序

1. 保存本轮相关文件hash基线并读取4175正式设计。
2. 完成纯TS模型/端口/协调器及fake clock测试。
3. 完成客户端适配器、Nuxt实例组合、runtime scope和展示控件。
4. 先在结果词卡核对代表区域，再接计划与library，维持排除入口。
5. 执行限定浏览器自检、静态检查和隔离production build；清理仅本轮资源并交接UAT切换建议。

## 完成说明

- R1源码和隔离构建已冻结到 `evidence/frontend/implementation-manifest.json`；未建立分支、worktree或commit。
- 真实learner/API文章仅用于页面集成；浏览器声音由开发fake驱动，所以不声称真实可听性或设备兼容性通过。
- 临时43240开发服务和3019代理已停止；3016/3017/43331、模型、数据库与原始凭据均未修改。
