# Q001 代码诊断与局部纠正验证

2026-10-19；执行者 root，串行履行 quality/base，未另行启动 QA agent，不属于独立 QA 或新里程碑验收。依据 [产品增量](../product/correction-routing.md)、[技术契约](../technical/correction-routing.md)与[项目 QA 政策](../../../agt/qa-scope-policy.md)。

当前结论：本次后端功能回归 PASS。有效命令原件为 [Quick check-4](../../../quick/Q001-code-driven-corrections/check-4.json)：`go -C backend test -race ./...` 和 `go -C backend vet ./...` 均退出0。使用本地 SSE/HTTP 替身；没有调用线上模型。普通与增强管线、接收、取消、用量、追踪等现有非 integration-tag 测试一并执行，未受影响包可复用 Go 缓存。

| 验收项 | 实际验证 |
|---|---|
| AC1 多错诊断与模板组合 | 缺目标/缺标注/外来标签/锚点错位/未知关系分别识别；重建、保留文字、只修剪互斥；多标签错误组合；70个重复类别错误不掩盖缺词；Unicode与多词半开区间；正文/短语不继承释义语言 |
| AC2 受限响应 | 键序互换接受；缺键、多键、错大小写、重复键、null、类型错误、路径对象、Markdown包装、尾随及畸形JSON拒绝；三协议×两输出模式确认只接收私有字段且记录tokens；旧OpenRouter路径保留实际cost |
| AC3 私有合并 | tags/meaning/hint三个字段同次纠正，失败hint带实际拒绝原因进入第二轮；已成功字段不重发也不被覆盖；空字符串仅导致本字段不合格；正文可见字符与hint模式不变量；最终完整校验仍拒绝局部无效结果 |
| AC4 预算与故障 | 完整但畸形纠正响应最多重试至总预算2；初稿schema失败、协议未结束、取消直接停止；既有纠正/续写混合与独立稿件共用预算；普通/增强生成与lastValid回归；全部后端竞态测试及vet通过 |
| AC5 范围检查 | 本次文件属于Q001声明路径；工作流控制面、锁定Profile、最终validator、公开接口、数据库与用户研究/部署资料没有本次改动；gofmt与git diff --check通过 |

核心用例在 `backend/internal/ai/correction_routing_test.go`、`correction_response_test.go`、原 `corrections_test.go` / `continuation_test.go`；管线回归在 `backend/internal/generation/pipeline_test.go`。维护时从这些行为用例及原 validator 规则共同检查，不能以简化诊断替代最终校验。

验证限制：没有真实模型成功率/自然度/语义正确率/费用节省评估；没有数据库 integration-tag、浏览器、生产部署或真实网络故障试验。本次未改变这些层的接口与策略，现有历史证据不提升为本次实测。独立新会话恢复检查 NOT_RUN；Quick 原件与静态完整性由 compact/validate 核验。

CR039-L1、CR042-L1、AI-QUALITY-90、W01、QA26-MINIMAX、PRON-MOBILE，以及环境/专项、CR313故障并发边界仍按[现有保留表](report.md#保留事项)执行，均不宣称解决。特别是本次原生纠正提示优化不等于多回复整包离线回放已补齐。

实现过程的编译适配与中间验证保存在 Quick 历史，不作为当前测试结论；本页只保留最终有效结果与回归入口。
