---
milestone: M001
stage: implementation
role: frontend-implementer/base
agent_name: frontend-claire
status: active
date: 2026-09-02
changes: [CR-013, CR-014]
---

# M001 前端 UI 返工执行计划

## 工作区策略

- 使用当前单一工作区串行实施，不创建 worktree。
- 仓库尚无初始提交，全部文件仍为未跟踪状态；本次同时修改共享壳层、图标、国际化、全局样式和全部页面，拆分工作树没有稳定合并基线且会放大冲突。
- 保留现有 API → schema/mapper → store → presentation 边界，不修改 backend、API v1.2 或用户现有 UAT 数据。

## 实施顺序

1. 建立批准 SVG 品牌与通用图标组件，修复公开/管理员壳层、导航和控件链接样式。
2. 按批准原型重构 PAGE-001–009 的 DOM、文案、布局与按需 dialog。
3. 按批准原型重构 PAGE-101–103，恢复模型/密钥 dialog、单组页签和用户管理视觉层级。
4. 同步 `zh-CN` / `en-US` 文案，补齐桌面/移动端和焦点、dialog、图标按钮语义。
5. 更新 E2E 回归，运行 format、lint、边界、typecheck、unit、browser、build，并在保留数据卷的前提下重建 UAT frontend/nginx。
6. 生成实现侧中英文及桌面/移动端截图，更新 CR、验证记录与实现交接单，提交用户复评。

## 完成定义

- CR-013、CR-014 的所有验收条件均有代码和自动化证据。
- PAGE-001–009、PAGE-101–103 的默认态与批准原型在结构、可见文案和视觉层级上无实质偏差。
- 生产页面不出现 `W`、`☰`、`⌕` 等替代图形；视觉控件无浏览器默认下划线。
- 所有质量命令通过，UAT 入口可访问，现有 UAT 数据不丢失。
