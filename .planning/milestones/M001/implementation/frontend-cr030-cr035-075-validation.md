---
milestone: M001
stage: implementation
role: frontend-implementer/base
agent_name: frontend-claire
status: awaiting_user_review
date: 2026-09-06
contract_version: v1.4
change_requests: [CR-030, CR-035]
---

# 第075轮：Users长名详情与Plans分组标题有限返工

## 结论

按[075授权](../reviews/verification-cr030-cr035-rework-approval.md)完成两处局部CSS修复。开发自检通过，提交独立复验；**不关闭CR，不改QA074的FAIL，不代表UAT通过**。6001 UAT、6010原型、产品/设计/API及后端保持不变。

## 修复与追踪

| 问题 | 原因与实现 | 追踪 |
| --- | --- | --- |
| CR030-R074-01合法32字符用户名撑宽详情 | 列表的换行规则未覆盖详情；详情card-header中的文字flex子项补`min-width:0`，`.user-detail-name`补`overflow-wrap:anywhere`。保留完整文本、字体和状态标记，不截短/缩字/隐藏页面溢出 | PAGE-103 / CAP-104、107、021 / API-103 / DATA-003、006、012、013、018 |
| CR035篇幅标题缺8px间距，两标题偏右2px | 用`.admin-plan-form fieldset > legend.field-label`统一`margin-bottom:var(--space-2); padding:0`；移除旧模型专属补偿，避免叠成16px。保留fieldset/legend及完整替换保存 | PAGE-102 / CAP-103、021 / API-102 |

CR035原报告关联CAP-102原文保留；本实施追踪补充产品PAGE-102实际组配置能力CAP-103，不改需求。批准基线为design/interactions.md、responsive-accessibility.md 2.3/2.4及实时PAGE-102原型。只修改一个生产文件`frontend/app/assets/css/application.css`；Vue、i18n、DTO/schema/mapper/controller/store/presenter和API均未改。

按[工作区计划](./frontend-cr030-cr035-075-worktree-plan.md)单工作区实施，无子代理、worktree、Git提交。保留既有untracked资产及框架角色文件改动。

## 数据/渲染边界

新增`admin-layout-content.test.ts`的3例从严格v1.4 DTO经mapper、应用状态、详情及reader presenter校验abc32、W×32、短名均逐字保留。新浏览器测试通过接口返回注入合法长名再走真实客户端导航与既有转换链，不修改DOM制造通过结果。实现没有直接使用原始接口数据渲染界面。

## 本轮执行证据

| 检查 | 结果与范围 |
| --- | --- |
| 旧候选复现 | 72/72预期缺陷断言；两个引擎×双语×390/1440，390长名详情不容纳；Plans gap=[8,0]、text offset=[2,2]。这是“复现成功”，不是旧版验收通过 |
| 最终格式 | PASS，Prettier全量检查 |
| 固定Node24生产构建 | typecheck、ESLint、boundary、160 unit/19 files、Nuxt SSR/Nitro build全部重新执行PASS；114 modules/86 dependencies无分层违规 |
| 完整契约Mock E2E | 110/110 desktop/mobile，0失败/跳过/重试恢复；新增8例覆盖长短名和两fieldset分组全部四方案、双语及6宽度；其余102例本轮实际重跑 |
| 最终真实布局及原型对照 | 632/632；Chromium/WebKit×中英文×320/390/720/900/901/1440，长名/短名搜索到详情、完整文字/状态标记/页面容纳、空模型时四组的实际8px间距及0px偏移，字段分组语义保留 |
| 真实用户/Plans流程 | 272/272；双引擎×双语×390/1440：20→40行、详情返回原第31行焦点/滚动、详情再搜索、两篇不同正文reader、关闭/ESC恢复。Chromium另测3个模型下四组保存、完整PUT字段、服务端持久化与重新载入 |
| Plans边界/可访问性 | 240/240；双引擎×双语×390/1440，四组多模型布局、Space勾选、清空模型/长度保存、0/有限/无限quota及disabled、刷新/还原夹具；16组Plans/长名详情Axe检查无serious/critical |

最终真实浏览器断言合计1144；与旧版复现72、单元或Mock用例分开统计。[证据索引](./evidence/cr030-cr035-075/README.md)列出原始命令、JSON和截图。抽查了英文390 WebKit详情、中文1440 Chromium详情、英文390空模型Plans、中文390多模型Plans及对应原型；完整名称自然换行、状态徽标与操作可见，标题间距由真实几何断言确认。动态模型数量/描述、日期、额度不同，不按整页高度比较。

## 构建与环境

- 最终标签`wordweave-frontend:cr030-cr035-075`，固定摘要`sha256:22ae24c0c969f1653833968c81acbf2bde4248f4f998892a3d01b5934c314730`。
- 配套后端固定`sha256:e8c4ee91a7c3265cda8c496ccc8fb485328d95b6c1662eaf2502011ce5d005a5`，API v1.4。
- [candidate.json](./evidence/cr030-cr035-075/candidate.json)记录仅在本轮6101栈替换前端。生产质量链来自Node24.8.0 Docker，非缓存冒充重跑。主机Node22运行格式/Playwright；已知engine/颜色环境warning保留，构建plugin timing为非阻塞告警。
- 首次构建后发现新增测试的beforeEach位于locale循环外作用域，会让两组都使用最后一种语言，运行E2E前改为每例显式认证，并用最终构建重新检查全部文件。首轮与最终构建日志均保留，只有最终摘要用于交付。

## 原始问题、限制与清理

- 首次seed-layout尝试重命名已有合成账号，被数据库不可变用户名trigger拒绝，事务无写入。保留失败脚本；正确脚本`seed-layout-insert.mjs`插入新合法账号并建立独立资料。不关闭约束、不改后端。重建请使用正确脚本，勿执行失败示例。
- 英文原型的语言选择器将中文选项自动翻成Chinese，生产保留中文母语名称；这是QA074已识别的非阻塞基线差异。本轮不修改全站语言规则或原型，不把该差异算成像素失败。
- 本轮只使用合成资料、50个合成账号、6个合成批次与3个禁用展示模型；generation_runs、review_sessions、credentials、enabled_models均0。未调用真实AI、兼容性enable或历史密钥。
- [清理记录](./evidence/cr030-cr035-075/cleanup.json)：验证精确名称与`wordweave.dev=075`标签后，只移除本轮4容器/2网络。临时tmpfs数据库不可恢复，但setup/seed可重建等效夹具；证据、截图和候选镜像保留。6001四容器ID/摘要/启动时间不变，6010既有监听保留，3300/38080/6101已释放。
- 不宣称本轮重新验证真实AI质量、实际菜单200%缩放、真机/人工读屏、混版回滚、真实账号注销/改密/组变更或全部CR029–034真实场景。其既有门禁保留；完整Mock不是这些真实链路的替代。

## 下一步

PROPOSED：交qa-quinn独立复验CR030-R074-01和CR035及受影响Users/Plans回归，继续覆盖所有开放CR，再决定是否交UAT。CR029–035全保持open；无新需求/UI/API决策或实现阻塞。

按agt-frontend-implement在提交后停止；本报告不修改workflow、角色、审批及QA文件。实际控制面仍implementation/frontend-claire/active/TRANSITION-M001-075。
