---
milestone: M001
role: quality/base
agent_name: qa-quinn
date: 2026-09-04
verdict: fail_return_position_matrix
---

# CR-023 独立返回位置复验证据

## 环境

- 真实链路：`http://localhost:6001`，Nginx → Nuxt → Go → PostgreSQL。
- 前端镜像：`sha256:308d5ac2e7fe9fd4a7e7eea51771c06f3eb96d6bc433401df2e36a92340631ad`。
- 后端镜像：`sha256:b704e386cafdf7be1f973e792c08a9726d544a267dc9d75622cee0987284a7ba`。
- 隔离账号查询：`cxtmo1fgc`，46 条结果，20+20+6 三页。
- 复验脚本：[cr020-cr022-retest.mjs](./cr020-cr022-retest.mjs)、[cr023-return-matrix.mjs](./cr023-return-matrix.mjs)。

## 综合返工复验

校正 cursor 篡改方法后，综合专项为 **4/5 PASS**：

| 范围 | 结果 | 证据 |
| --- | --- | --- |
| API exact tier 与三页全序 | PASS | 20+20+6；精确项第一；46 个 ID 无重复/遗漏；仅批准字段 |
| normalized query 与 cursor scope | PASS | 大小写等价可复用；篡改、畸形、旧版、跨 query、跨管理员均为统一 422；无 cursor 重启成功 |
| 追加、失败重试、布局与详情返回 | **FAIL** | 追加、重试、焦点、12 个响应式/语言状态与 Axe 通过；详情返回 scrollY 失败 |
| 前端单次 invalid-cursor 恢复 | PASS | 请求序列为带 cursor → 无 cursor，恰好两次，无循环 |
| Replace key surface | PASS | actual/prototype × zh/en × 390/1440px 共 8 个值均为纯白 |

首次运行把 Base64URL 最后一个字符替换为另一字符；该位置可能只改变未使用的 padding bits，因而可能解码为相同字节。验证脚本已改为替换 cursor 中部字符，校正后真实篡改被后端正确拒绝。该报警属于测试方法问题，不是产品缺陷。

## CR-023 视口矩阵

每个用例均重新登录、加载 46 条真实数据库结果，从第 31 条进入详情，再通过页面返回操作回到列表；返回后等待 500ms，并同时检查查询、结果、scrollY、焦点与目标可见性。

| 视口 | 源 scrollY | 返回 scrollY | 偏差 | 原操作焦点 | 原操作可见 | 结果 |
| --- | ---: | ---: | ---: | --- | --- | --- |
| 390×320 | 5747 | 4344 | -1403 | 保留 | 否，top=1545 | FAIL |
| 390×844 | 5405 | 4210 | -1195 | 保留 | 否，top=1679 | FAIL |
| 1440×600 | 2295 | 2174 | -121 | 保留 | 是 | FAIL |
| 1440×1000 | 2440 | 2019 | -421 | 保留 | 是 | FAIL |

矩阵为 **0/4 PASS**。四项的查询、46 条结果及原 View 焦点都恢复，但没有一个视口在允许的 ±2px 内恢复源位置；两个移动视口中，获焦操作仍完全位于视口之外。

截图：

- [390×320](./screenshots/cr023-return-matrix/mobile-short.png)
- [390×844](./screenshots/cr023-return-matrix/mobile-standard.png)
- [1440×600](./screenshots/cr023-return-matrix/desktop-short.png)
- [1440×1000](./screenshots/cr023-return-matrix/desktop-standard.png)

## 判定与归责

- CR-023 的实现改善了“稳定回到 0”的原表现，但尚未满足精确恢复合同。
- 偏差随视口高度变化，且移动端恢复后焦点仍在视口外，说明恢复仍发生在页面布局或浏览器滚动状态尚未稳定的时序中；这是基于可观察结果的推断，最终根因由实现角色确认。
- 产品、UI、API 和技术合同无新增歧义。责任阶段仍为 `implementation / frontend-implementer/base`。
- CR-022、CR-023 继续保持 open，并阻塞最终 UAT。
