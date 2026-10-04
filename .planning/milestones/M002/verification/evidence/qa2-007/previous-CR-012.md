---
id: M002-CR-012
status: open
milestone: M002
raised_by: qa-quinn
owner_stage: implementation
owner_role: frontend-implementer/base
finding: QA2-F08
severity: P2
date: 2026-09-22
---

# 详情页返回书架跳到页顶，未恢复原行位置

## 发现的问题与批准来源

UI22 的 [UIA-PAGE-005-LIBRARY18 / 005-01/02](../design/design-spec.md#ui-18-书架)、[书架交互](../design/interactions.md#书架--ui-18)明确：从详情返回时恢复原行焦点和滚动位置，保留搜索与已加载范围。涉及 CAP-012/013/014、PAGE-005/006。不是新增导航或用户偏好。

当前 frontend-cr010 + backend-cr011 中，点击详情页“Back to library / 返回书架”后查询与 21 行列表保留，原行获得焦点，但页面滚动位置归零，原行落在视口之外。浏览器历史后退对照可恢复，不能据此将页面内返回入口判为通过。

## 复现和独立重复

1. 用真实生成/保存得到超过一页的本人短文；书架搜索 LEARN，点击 Load more 得 21 行。
2. 滚到最后一行，打开其标题进入详情。
3. 点击详情页返回书架链接；期望保持原行可见和原阅读位置。
4. Chromium 1280×900：进入前 scrollY=3125，返回后=0，目标标题 top=3932.42（视口高度900）；21 行、查询 LEARN 与焦点均保留。
5. 新浏览器会话独立重复同样失败；相同准备改用浏览器后退，scrollY=3125、目标仍可见，作为导航路径对照。

首次 [L04](../verification/evidence/qa2-006/library-results.json)、[独立重复及几何](../verification/evidence/qa2-006/scroll-repro-results.json)、[复现脚本](../verification/evidence/qa2-006/scroll-repro.mjs)、[进入前](../verification/evidence/qa2-006/scroll-explicit-back-link-before.png)、[返回后](../verification/evidence/qa2-006/scroll-explicit-back-link-after.png)。无浏览器 pageerror 或 hydration 警告。

## 定向定位与路由

frontend/app/pages/library/index.vue 在 onMounted/requestAnimationFrame 中手动 scrollTo；详情的返回入口是 NuxtLink。实际页面返回归零与历史后退恢复的差异已确认；与路由默认滚动处理的时序关系是待前端确认的定位线索，不以推测替代修复证据。

交 frontend-claire 修复列表位置恢复与路由滚动协作；保留大小写搜索、已加载范围、原行焦点、正常直接进入书架及历史后退行为。无需产品/设计重新决策，不修改后端搜索或 API。至少按原四个视口、中英文及页面返回/浏览器后退复验；无对应原行时保持既有合理回退。

CR011 搜索修复本身已通过，本问题单独追踪。P2，阻塞这项已批准的 UI 接收；QA 不自行修前端或切换阶段。需要用户决定的问题：无。

## 解决记录

OPEN，待守门登记并激活 frontend-claire；QA06 原件冻结。
