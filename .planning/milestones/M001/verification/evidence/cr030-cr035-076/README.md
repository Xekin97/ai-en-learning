# QA076证据索引

当前结论见[独立报告](../../cr030-cr035-076-report.md)和[覆盖矩阵](../../cr030-cr035-076-coverage.md)。产品结果FAIL，CR036需前端返工；不能把交付文件完整性校验PASS理解为产品PASS。

- PLAN、source-baseline、baseline和environment记录授权、快照、固定候选与隔离环境。
- 18份*-results.json均为本轮独立执行，不混入开发单测/旧轮结果；plans-warning与plans-warning-finite中各8次FAIL属于同一个缺失警告。
- *-observations.json保存局部几何、真实响应、原型文本或性能采样；screenshots保留全部捕获。
- focus末尾部分long-detail截图因再次导航未等待而实际捕获列表，不能用作详情视觉证明；detail-capture的confirmed-detail截图和结果为确认后证据。
- delivery-validation-initial.json保存首次完整性校验结果：两处链接指向尚未写出的校验文件本身。文件落盘后重新核验。首次归档末尾新增换行触发了字节保护，没有替换任何文件；随后按解析JSON一致性核对归档，仅允许替换这次已完整保留的自引用失败结果。delivery-validation.json为最终交付核验。
- cleanup与pre-cleanup-data记录仅删除本轮标签资源。66账号/14批次/4会话/6合成计量所在tmpfs已销毁，原数据不可恢复；种子可重建，但不应直接复用原结果目录覆盖wx证据。

测试脚本使用独立6101栈和6010只读原型。setup/seed/actors/range-seed/long-seed提供可重建输入；执行前应分配新的证据目录/容器标签/账号和端口，并核对脚本依赖顺序，禁止改向6001或真实数据。4模型停用、供应商凭证0、外部提供方禁用，任何合成资料均不代表真实AI验证。
