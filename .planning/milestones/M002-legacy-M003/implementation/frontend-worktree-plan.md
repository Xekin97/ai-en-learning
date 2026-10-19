---
milestone: M003
stage: implementation
role: frontend-implementer/base
agent_name: frontend-claire
status: cr306_implemented_developer_verified
date: 2026-10-12
source_version: M003-TECH-04 / M003-FE-03 / M003-UI-10-R1.1 / API-306
transition: TRANSITION-M003-078
---

# M003 CR-306 前端实施工作区计划

## 输入、范围与所有权

- 当前输入为 078 门禁、PRODUCT09、TECH04 的 BE07/DB04/API-306/AI7、FE03、已接受 UI10-R1 及 R1.1 澄清、已接收后端实现。
- 所有权限于 `frontend/**`、本文件、`frontend-validation.md`、`handoffs/frontend-implementation.md`、`implementation/evidence/cr306-frontend/**` 与 CR-306 前端实施记录。
- 保留共享 dirty 工作树及他人修改；不提交、不修改后端、控制面、产品/技术/设计原件或冻结旧证据。
- 真实 UAT Nuxt 3013、backend 54673、PostgreSQL 54672 及其配置保持运行。浏览器/build 使用临时源码副本、独立 `.nuxt` 与独立端口；不迁移旧库、不调用真实模型。

## 任务与依赖

| 任务                    | 实施内容                                                                                                                               | 完成状态 |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| FE3-T01 typed contract  | `customParameters` 应用模型、严格 Admin schema/mapper、single create/update、batch、provider aggregate、probe 全部 typed body/readback | 完成     |
| FE3-T02 strict raw JSON | 解码重复键、RFC8259、Unicode 代理/NUL、根对象、深度8、数学安全整数、compact UTF-8 16,384 bytes，共享同一向量                           | 完成     |
| FE3-T03 draft/conflict  | 每模型 raw/stable key；409 三方合并；保留本地非法 raw、双方冲突及远端删除；稳定 server pointer/413 整单归属                            | 完成     |
| FE3-T04 probe/save      | 任一配置编辑使在途结果 stale，迟到结果不翻新；保存不要求 probe、0 自动 probe、完整成功后关闭                                           | 完成     |
| FE3-T05 UI10-R1.1       | 复用真实 AppDialog showModal/Teleport/top layer/body scroll/focus；错误顺序、字节计数、dirty confirm、移动 44px/无横溢                 | 完成     |
| FE3-T06 验证/交接       | 纯单测、typecheck/lint/boundaries、全量 Vitest、隔离 build、桌面/移动 contract 浏览器、正式隔离后端跨层、恢复包/清单                   | 完成     |

依赖方向为 parser→DTO/schema/mapper→repository→draft/page→浏览器/跨层，因此在单工作区串行完成，未创建分支、worktree、子任务或提交。

## 实际执行与收敛

- 新增纯 parser 与 presenter；修改 model/provider draft、Admin DTO/schema/mapper/repository/problem mapper、模型页、设计同步产物、mock fixture 和定向测试。
- 复用现有 AppDialog，没有重画或新建编辑器/能力目录/推理专用控件。生成 adapter 只补窄屏 counter 换行与关闭按钮最小宽度；UI10-R1.1 原件未改。
- contract 浏览器最终从临时源码副本在 3316/38106 跑桌面/移动；正式跨层从临时 Nuxt 5176 同源代理到正式隔离 backend binary 54783。
- 代表生产图最终为 `desktop-model-dialog.png`（desktop/zh-CN）与 `mobile-invalid-json.png`（Pixel 7/en-US）。它们核对生产布局关系，不与不同 viewport/locale/data 的设计图做像素等同声明。

## 当前状态与历史边界

- CR-306 前端开发实现完成，等待新独立 QA；CR-306 保持 open。
- CR-302 的实现与独立 QA 已完成，只剩用户 UAT；CR-304、CR-305 已 resolved。当前事实以 state 065 / QA02 与[验证报告](../verification/report.md)为准。
- 旧 TECH03/CR305 开发历史在 078 前态归档及既有 `frontend-tech03/`、`cr305-fix/` 冻结证据中保留，不再作为本文件的当前行动项。
