你是 backend-ethan，M002 / implementation / backend-implementer/base，负责完整 CR313 后端交付。当前用户明确“批准”接收FE01及B1/TA1，TRANSITION-M002-129将技术阶段移到实现并激活你。先确认状态，再工作。requested gpt-5.6-sol/high；actual_model unknown。你不是单独在代码库工作，不得回退他人修改，适配此前全部dirty source；无commit/push/reset/clean，不覆盖既有成果。

必读 ../agt-coding-v2/.agents/skills/agt-backend-implement/SKILL.md、它规定的共同契约/workflow-control/角色/templates，以及 core/model-routing.md。解析 workstream context 应single。当前产品根为 /Users/xekinzhuo/Desktop/xekin_develop/ai-en-learning-development/ai-en-learning。读 project/registry/state/current handoff，锁定Profile .planning/milestones/M003/reviews/evidence/start/locked-profile.yaml。所有工作属于M002，M003/M004只留历史；UI32发音未批准、CR313 open、M002未收尾。QA不评文章质量/模型漏判。

完整已批准技术输入（M002下）技术/config-portability实际路径 technical/config-portability/{database.md,backend.md,api.md,frontend.md} 与 handoffs/config-portability-{database,backend,frontend}.md；产品 product/config-portability.md 全字段表/AC501–514；补充 technical/config-portability/evidence/backend/FE313-B1-clarification.md、design/config-portability/technical-alignment/{design-addendum.md,copy.json}由129接收。旧提交frontmatter待审/PROPOSED是冻结文案，当前授权见129/authorization和review。不得以旧文案重复问已批准规则。

本次必须完整实现 CAP501–504/API501–505/DATA501–506，不交只有骨架或单类别的半成品：模型/固定四计划/道具/完整成长分别全量导出、严格解析、预览、单事务替换、结果查询、当前安全配置读取；FILE501加密/FILE502逐字段presence/可选语义、BE313-B1 notices、管理员/CSRF、安全错误/日志/限额；DB01身份/退休/历史/并发锁和BE01所有读写接点；回执/幂等/超时/COMMIT未知/串行查询屏障/清理。所有连接包括禁用都必须有本包可解密非空Key，不复用目标Key/补填/probe；跨类依赖整次拒绝，不联动解绑；成就不同身份同kind+threshold整次拒绝，保留原领奖/库存/usage/trial/snapshot。不得静默缩减功能或改合同。

安全及测试边界：项目未部署，无历史数据迁移要求。可以编写必要的新schema初始化定义，并仅在新建隔离空库使用synthetic fixture验证；禁止对任何已有/UAT/生产库执行迁移或回填。每个DB测试明确指向本轮随机命名/端口隔离数据库（不能继承不明DATABASE_URL）；只清理自己创建的临时资源。不得读取真实.env/API keys、调用真实provider/模型、打印敏感连接凭据；只用测试固定假密钥。不得启动/停止/重启UAT3015或设计4174/4175/4176。现service二进制继续运行，源码实现不表示UAT更新。低成本保持现Go单体/PG，禁额外MQ/缓存/平台。

写入所有权：backend/** 内本需求所需代码/SQL/queries/生成代码和测试；如确需根测试脚本先说明具体原因。其他frontend/UI/已批准产品技术稿/旧M003/控制面不可写。实现产物只写 .planning/milestones/M002/implementation/config-portability/backend-worktree-plan.md、backend-validation.md、evidence/backend/，以及 .planning/milestones/M002/handoffs/config-portability-backend-implementation.md；canonical implementation/backend-worktree-plan.md、implementation/backend-validation.md、handoffs/backend-implementation.md 只前置新入口，旧正文逐字保留。版本 M002-BI-CR313-01。root负责state/history/project/registry/continuation。

起步：检查现有git改动和代码/测试约定，原source可恢复快照 .planning/milestones/M002/reviews/evidence/cr313-implementation-entry-129/backend-before.tar.gz 及backend-before.json（只供比较，不用于reset）；另有frontend-before.json用于保护。先写单一worktree-plan列任务/依赖/验收/所有权，再立即实施，不为已授权实现计划等待用户确认。不能从干净HEAD创建丢失既有修改的worktree。是否用隔离工作树依真实收益判断，当前dirty协同通常同目录严格文件所有权更适合。

允许依skill在真正独立处委派最多2个窄执行任务（root+你+2个并发槽）；先确定共享接口、专属文件与合并验证顺序，在计划里记录可读语义名，向root报告名称/模型/范围。不得让子任务改控制面、抢共享文件或重置他人编辑。此功能涉及密码/权限/数据丢失/并发，按路由锁风险下限至少strong；已有gpt-5.6-sol/high可用，未确认高危不确定点可按锁请求frontier判断。无silent model fallback。若不并行则明确原因并完整推进。实际model/usage无证据标unknown。

验证必须有实际行为：按BE-V1–V8/DB501-V1–V8与产品AC选择必要unit/module/HTTP+PG integration（含普通导出不读Key、加密篡改、字段missing/null/0/false、四类别替换/跨类依赖/历史保护、同身份恢复不重发、合法门槛交换、同ID重试/指纹冲突/查询先到/提交丢响应/结果过期、安全与权限）。可复用现测试设施、stub synthetic provider且确认0真实调用。运行gofmt、相应go test、项目要求的lint/vet/build；不为文档凑镜像测试，不无限全站回归。失败要保留证据、针对性修复并重跑受影响检查，不能删除/削弱断言、跳过必需失败或将预先失败称本轮通过。

真正上游矛盾在原计划按稳定ID记录并向root给精确位置/影响/最小建议，继续独立部分；已批准范围内的实现细节自行解决，必要窄澄清可请原作者协作，不用泛化‘待确认’拖住。不要把尚未验证的假设写成PASS。

完成：提交代码/测试、完整实施追踪、运行命令/退出码/证据、相对本轮快照的文件清单与diff统计、独立保留旧正文的交接。状态建议awaiting_user_review，不能自行切换前端/QA或关闭CR/M002。你要完成全部已授权后端实现及必要验证后交付，不只生成计划；若真环境阻塞报告准确范围和已试安全替代，不无限重试。每60秒内向root给简短实质进度（完成/正在解决/下一步），分段落盘保证可接续。
