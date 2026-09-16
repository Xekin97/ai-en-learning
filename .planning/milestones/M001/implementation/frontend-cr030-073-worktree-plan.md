---
milestone: M001
stage: implementation
role: frontend-implementer/base
agent_name: frontend-claire
status: awaiting_user_review
date: 2026-09-06
---
# CR-030 / 073 有限返工工作区计划

授权：[073返工批准](../reviews/verification-cr030-users-rework-approval.md)。仅处理R072-01英文搜索失败说明、R072-02搜索输入宽度和纵向偏移，以及PAGE103直接回归；不改批准原型、API v1.4、后端或工作流控制文件。

## 所有权与工作区

frontend-claire独占本轮必要的Users呈现/CSS、英文翻译、相关前端测试、新增implementation/evidence/cr030-073证据与开发报告/交接；CR030只追加进展、不关闭。既有文件全部属于用户，当前仓库无HEAD且均未追踪，采用单工作区顺序实现，不创建worktree、分支、子代理或提交，不撤销无关修改。生产数据仍沿DTO→mapper→应用状态→presenter/渲染；本轮不新增数据路径。

## 执行和验证

1. 固定源码、批准稿、QA/控制面摘要及6001容器快照，读既有失败证据。
2. 在独立6101栈用前轮生产镜像复现，读6010批准原型；等待字体和稳定布局，对比390/720/901/1280/1440和不同高度。先定位实际内容/网格差异，不增加任意32px补偿。
3. 按批准真源最小修复，增补英文文案与响应式/错误重试回归。
4. format、typecheck、lint、分层检查、全量unit/E2E及Node24生产构建；新候选上复验双语Users各状态、分页/详情返回，并按共享CSS影响检查Models/Plans。
5. 保存真实测量、截图、命令与失败记录；开发证据不冒称独立QA或UAT。

## 环境/合并/清理

单工作区无合并。临时栈统一ww-dev-073前缀、wordweave.development=cr030-073标签；DB为tmpfs，使用合成账号和随机临时会话密钥，禁用供应商并将后端置internal网络。不开真实AI，不读取历史密钥，不替换6001；6010仅只读使用。结束按精确名称和标签清理自建容器/网络，记录删除数据和UAT前后快照；浏览器finally关闭。历史QA、原型和控制面保持不变，CR029–034仍open。提交开发报告等待审阅，不自行切阶段。

## 执行收尾

完成两处CSS覆盖/一处翻译修正及Users加载态同类根因修复，新增对应测试。[开发报告](./frontend-cr030-073-validation.md)记录最终结果、原始失败及边界。仅2个生产文件、2个测试文件变化；无需共享后台壳或业务层修改。自建4容器/2网络已清理，52个合成账号tmpfs不可恢复、seed保留；6001/6010未改。单工作区无Git合并、提交、子代理、阶段迁移或CR关闭。
