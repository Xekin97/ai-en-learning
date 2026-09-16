---
milestone: M001
role: quality/base
agent_name: qa-quinn
date: 2026-09-04
verdict: pass
---

# CR-023 最终独立复验证据

## 环境与隔离数据

- 真实链路：`http://localhost:6001`，Nginx → Nuxt → Go → PostgreSQL。
- 前端镜像：`sha256:d80db759530b397c99a7c7f4dad5a29e9eaabf259f9d450de95c248c1fdd6969`。
- 后端镜像：`sha256:b704e386cafdf7be1f973e792c08a9726d544a267dc9d75622cee0987284a7ba`。
- 本轮现场创建隔离查询：`cxtmov8d7`，46 条账号结果，20+20+6 三页。
- 脚本：[综合专项](./cr020-cr022-retest.mjs)、[返回与导航矩阵](./cr023-return-matrix.mjs)。

## 综合专项：5/5 PASS

| 范围 | 结果 | 证据 |
| --- | --- | --- |
| API exact tier 与三页全序 | PASS | 20+20+6；精确项第一；46 个 ID 无重复/遗漏；仅批准字段 |
| normalized query 与 cursor scope | PASS | 大小写等价可复用；中部字符篡改、畸形、旧版、跨 query、跨管理员均统一 422；无 cursor 重启成功 |
| 追加、失败重试、布局与详情返回 | PASS | 延迟追加保留行；503 保留 40 行/cursor；12 个语言/视口状态、焦点、返回与 Axe 全通过 |
| 前端单次 invalid-cursor 恢复 | PASS | 带 cursor → 无 cursor，恰好两次请求，无循环 |
| Replace key surface | PASS | actual/prototype × zh/en × 390/1440px 共 8 个值均为纯白 |

## 详情返回矩阵：4/4 PASS

每项均重新登录，加载本轮新建的 46 条结果，从第 31 条进入详情，再通过页面操作返回；500ms 后同时检查查询、结果、scrollY、原 View 焦点和目标可见性。

| 视口 | 源 scrollY | 返回 scrollY | delta | 焦点 | 可见 | 结果 |
| --- | ---: | ---: | ---: | --- | --- | --- |
| 390×320 | 5667 | 5667 | 0 | 原 View | 是 | PASS |
| 390×844 | 5405 | 5405 | 0 | 原 View | 是 | PASS |
| 1440×600 | 2295 | 2295 | 0 | 原 View | 是 | PASS |
| 1440×1000 | 2375 | 2375 | 0 | 原 View | 是 | PASS |

截图：

- [390×320](./screenshots/cr023-return-matrix/mobile-short.png)
- [390×844](./screenshots/cr023-return-matrix/mobile-standard.png)
- [1440×600](./screenshots/cr023-return-matrix/desktop-short.png)
- [1440×1000](./screenshots/cr023-return-matrix/desktop-standard.png)

## 非返回导航作用域：2/2 PASS

| 路径 | 源 scrollY | 目标 scrollY | 结果 |
| --- | ---: | ---: | --- |
| 深位置提交新搜索 | 3276 | 0 | PASS |
| Models 深位置进入 Users | 1200 | 0 | PASS |

这证明特殊恢复只作用于用户详情返回意图；普通新搜索和跨管理页进入仍正常置顶。

## 验证方法说明

- Cursor 篡改继续修改 Base64URL 中部字符，避免尾部未使用 bits 造成等价编码。
- 测试源位置使用 `behavior: "instant"` 设置，避免验证脚本自身继承产品 smooth-scroll 后在动画未完成时记录错误基线。
- 两项校正只消除测试准备动作的不确定性，没有放宽产品的 ±2px、焦点或可见性标准。

## 结论

- CR-023 的保存位置、稳定布局、即时恢复和 preventScroll 聚焦形成完整闭环。
- CR-022 的追加、重试、分页焦点与响应式基线未回归。
- CR-022、CR-023 均通过独立验证，可以关闭。
- PAGE-103 功能自动验收完成，可进入最终用户 UAT。
