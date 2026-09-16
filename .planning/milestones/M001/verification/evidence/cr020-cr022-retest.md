---
milestone: M001
role: quality/base
agent_name: qa-quinn
date: 2026-09-04
verdict: pass_after_cr023_second_rework
---

# CR-020～CR-022 独立复验证据

## 环境

- 真实链路：`http://localhost:6001`，Nginx → Nuxt → Go → PostgreSQL。
- 批准原型：`http://localhost:6010/prototype/index.html`。
- 本地确定性 OpenRouter 协议替身：`http://localhost:6002`；未使用历史泄露密钥。
- 后端镜像：`sha256:b704e386cafdf7be1f973e792c08a9726d544a267dc9d75622cee0987284a7ba`。
- 前端镜像：`sha256:d80db759530b397c99a7c7f4dad5a29e9eaabf259f9d450de95c248c1fdd6969`。

## 结果

| 测试组 | 结果 | 关键证据 |
| --- | --- | --- |
| 既有 PAGE-103 列表专项 | 15/15 PASS | 精确置顶、延迟追加保留行、720px 宽操作、语言保持、Axe |
| API v1.3 综合返工 | 5/5 PASS | CR-020 白色输入面、访客门、cloze 分组与响应式回归 |
| CR-020～023 扩展专项 | 5/5 PASS | CR-020～023 全部闭合 |

扩展专项使用 46 个隔离测试账号形成 20+20+6 三页：

- 精确账号始终第一，其余账号顺序稳定，46 个 ID 无重复/遗漏，成功 DTO 只含批准字段。
- 大小写等价查询与 cursor 正常；中部字符篡改、畸形、旧格式、跨查询、跨管理员 cursor 均统一 422；无 cursor 重启成功。
- 浏览器收到一次 cursor-invalid 时只发出一次恢复请求，无循环。
- 延迟追加保留旧行；503 追加失败保留 40 行与 cursor；重试后末页首个新增 View 获焦。
- 中英文 × 320/390/720/721/900/1440 共 12 个布局状态通过；≤720px 为三段式布局，无水平溢出，Axe 无 serious/critical。
- New API Key 在实际页/原型、中英文、390/1440px 共 8 个对照均为 `rgb(255, 255, 255)`。

## 最终复验

第二轮 CR-023 返工后，本脚本使用新隔离查询 `cxtmov8d7` 再次执行，5/5 全部通过。390px 下详情返回同时保留查询、46 条结果、源 scrollY、原 View 焦点与可见性。

独立四视口矩阵 4/4 且全部 `delta=0`，普通新搜索和跨管理页进入 2/2 正常置顶；详见 [CR-023 最终复验](./cr023-final-retest.md)。

结论：CR-020、CR-021 保持关闭；CR-022、CR-023 可以关闭。
