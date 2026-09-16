---
milestone: M001
stage: implementation
role: backend-implementer/base
agent_name: backend-ethan
status: awaiting_user_review
date: 2026-09-07
change_request: CR-039
approval: TRANSITION-M001-093
contract_version: v1.4
prompt_version: m001-v3
validator_version: m001-v3-wn31-r1
independent_qa: not_performed
real_model_calls: 0
uat_deployed: false
---

# CR-039 后端开发交付

## 结论与范围

后端实现与本轮开发检查通过，可提交独立测试门禁。**这不是独立 QA、真实模型造文质量通过、UAT 更新或发布批准。** CR-039 保持 open。

依据 [093 批准](../reviews/technical-cr039-implementation-approval.md)、[冻结方案](../technical/backend-cr039.md)、DEC-036/A，完成同次 AI 候选映射、本地关系验证、全量已知形式补扫与可信快照投影。上游八项批准文件的 SHA-256 与 093 完全一致，未改写其 proposed 提交快照。

- 输入词库只限制所选原词。正文普通词、经证明的派生与屈折词形不要求出现在输入词库。
- `passage_forms` / `hint_forms` 是必填内部数组；校验严格字段名、类型、非空、长度、重复 JSON key、null、未知字段和尾随内容。大小写冗余声明去重；一个错误声明使整批失败，无 v2 candidate 回退。
- 同一只读 Lexicon 注入普通生成与兼容性探针；实际源/目标词索引限制 WordNet 直接派生边，拒绝同义、语义图、多跳、无依据后缀。保留原词、经审阅例外、POS 正向屈折与至多一次派生。
- 独立补齐遗漏的已知形式和重复位置，按原文 Unicode code point 定位；组合标记边界、多词项、同目标最长匹配与跨目标碰撞保持保守策略。
- Prompt/schema 为 m001-v3，validator 为 m001-v3-wn31-r1。ValidatedBatch、API v1.4、数据库 schema、保存/复习结构不变；未修改 frontend/nginx、冻结词库、Go 依赖或已有迁移。
- 校验可取消；T3 使用上游 context，取消/断线不会借后台 context 发布迟到结果。错误日志只记固定原因和目标序号，不记录映射或答案原文。
- SSE 补上分块 UTF-16 surrogate pair 的稳定解码，避免尚未完整的 emoji 被提前渲染成替代字符。没有新增 AI 总生成时限。

## 实现位置与资产

完整变更文件摘要见 [source-manifest.json](./evidence/cr039/source-manifest.json)，单工作区决策见 [worktree plan](./backend-cr039-worktree-plan.md)。源码改动集中在 backend/internal/ai、generation/service、httpapi 的构造/生成处理、bootstrap、对应开发测试和离线构建工具。

| 项目 | 固定值 |
| --- | --- |
| 输入词库 | 13,860 项；SHA-256 `de75e77fdff529b4e6726730c80c11415abbce215ec7852a6c4a670b061dea75`，未修改 |
| 词法来源 | Princeton `https://wordnetcode.princeton.edu/wn3.1.dict.tar.gz` |
| 原始归档 SHA-256 | `3f7d8be8ef6ecc7167d39b10d66954ec734280b5bdcd57f7d9eafe429d11c22a` |
| 构建工具链 / parser | Go 1.26.7 / wn31-word-level-r1 |
| 资产 SHA-256 | `8ae86f814d468630986270171c1c09a86a96556c8a71f90da1a4ef4b03ad4b4a` |
| 压缩大小 | 1,855,973 bytes |
| 投影记录 | 155,467 个 word/POS；77,933 条带词位证据的原始直接指针；6,053 个异常对 |
| 运行时词键 | 147,478 个；不等于输入词库覆盖率 |
| 许可 | assets/lexicon/NOTICE.txt 保留八份 index/data 的完整原始许可头及来源 |

运行时不联网下载，不安装额外 NLP 服务，不调用第二个 AI。构建工具显式校验官方归档 hash，并固定 Go 版本，防止不同压缩实现产生不同资产。记录了离线重建，四份生成文件（gzip、manifest、digest.go、NOTICE）逐字节 `cmp` 相同。

## 开发检查与复现命令

工具镜像为 `golang@sha256:e8c859f5632dcfde7b32d2012b4351728f6437930887c2f6a91ea242459e5514`，实测 Go 1.26.7 linux/arm64。PostgreSQL 使用 `postgres@sha256:1c59e2c3c818eaa0f0628f695b36e7c9e362d6b219b36a54a32df645cbd7e1af`，实测 18.6。

以下 Go 命令均在 backend 根目录的固定工具镜像执行；挂载 backend 到 /src，使用已有 Go 模块/构建缓存。普通检查 `--network none` 并设置 `GOPROXY=off GOSUMDB=off`；数据库测试仅连接本轮新建的 `wordweave-cr039-pg18`，不复用项目/UAT 数据库。

| 命令 / 动作 | 实际结果 |
| --- | --- |
| 修改前 `go test ./internal/ai` | PASS，旧基线 |
| 受影响 Go 文件 `gofmt`；`go vet -tags=integration ./...` | PASS |
| `go test -race ./... -count=1` | PASS；全后端开发单测，未启用 liveintegration |
| `go test -race -tags=integration ./internal/httpapi -run 'TestCR039\|TestM001EndToEnd' -count=1` | PASS；最后一轮 14.531 s，含真实 HTTP 断开测试 |
| 修改前源码执行同一 `TestCR039StoredSnapshotCompatibility` | PASS，v2 与 v3 快照均能保存、读取、两阶段作答；HTTP 包 1.539 s |
| `go mod verify` | PASS：all modules verified |
| 固定 Go 执行 `go run ./cmd/build-lexicon -download -save-source /rebuild/wn3.1.dict.tar.gz` | PASS，只下载公开词法源，不是 AI 调用 |
| 无网络执行 `go run ./cmd/build-lexicon -source /rebuild/wn3.1.dict.tar.gz -out /rebuild/offline` | PASS，与提交资产逐文件相同 |
| `docker build --network=none -t wordweave-backend:cr039-dev .` | PASS；Go 模块缓存就绪，RUN 阶段无网络；Docker 仍解析镜像元数据，不宣称首次空缓存构建可完全断网 |
| 候选镜像在 Docker `--internal` 网络启动，仅连接新建测试 DB | PASS：`GET /health/ready` → 200 / `ok`，无宿主端口绑定；库内 credential/model/run 均为 0 |
| 词库、DB、learning/review 原文件及 093 输入比较 | PASS；被冻结内容不变，learning/review 不需要源码变更 |

隔离集成命令的数据库参数为 `TEST_DATABASE_URL=postgres://postgres:cr039-test-only@wordweave-cr039-pg18:5432/postgres?sslmode=disable`（仅合成临时密码）。测试辅助函数创建随机命名数据库、迁移合成基线，完成后删除自己的库。单词库测试只在其独立测试库里将词表缩到 vulnerable 一项，以证明生成表面词不依赖输入词表。

本轮未调用 `make test-integration` 的默认 Compose 启动动作，避免误复用已有环境；未重跑全站 UI、用户管理 UAT 或真实模型矩阵。

## C39 定向覆盖

| ID | 开发证据 / 结论 |
| --- | --- |
| 01 | 单词库 stub 中非输入成员在 Start 前置校验被拒绝，0 run；冻结文件 hash 不变 |
| 02–03 | ordinary fictional word 不触发词库错误；vulnerability/vulnerabilities 在仅含 vulnerable 的 DB 中通过、补扫、保存 |
| 04 | 原词未知于 WordNet 仍成立；learn 多种例外、agree/agreed/agreeing、die/dying、prefer/preferred、coup d'etat 重复与全词边界通过 |
| 05 | banana、learn→study、vulnerabled/vulnerabling、readed、childs、agreeed、prefered、plantes 不放行 |
| 06 | parser fixture 只连指定词位，拒绝越界 source/target；不把 0000、形容词 pertainym、反义变成派生；最多一个派生边 |
| 07 | 缺失、空、null/null item、类型错误、额外/大小写伪装字段、重复 key、尾随对象、越界数组/字符串均拒绝 |
| 08–10 | 大小写重复、漏列原词/复数、单个坏声明、错误段落、十目标交错顺序与完整候选碰撞均有断言 |
| 11 | emoji、İ、日文标点、组合标记、单词内部、数字边界、多词项；保存位置可按原文 rune 子串复算 |
| 12 | 20 组确定随机 SSE 切块、escaped JSON/换行/引号/UTF-16 emoji、passage 首字段；畸形最终映射真实 HTTP 失败且不可保存 |
| 13 | 映射失败退款/0 draft、真实 HTTP body 关闭退款、主动取消保留额度、迟到 CompleteValid 与重复失败均受终态 CAS 拒绝；无隐式调用重试 |
| 14 | v3 保存/重复保存、派生批次访客承接/重复承接、重新打开复习；hint 全挖且原词作答，正文派生表面作答，同组匿名 key 一致 |
| 15 | 新旧存储快照在当前源码与修改前 v2 源码均通过；v3 golden 与本轮实际 Validator 输出深度一致。未替换/运行 UAT 旧镜像，部署时的旧镜像回滚演练仍属后续 QA/部署门 |
| 16 | 缺失/篡改资产加载拒绝，构造器复用只读实例；离线候选真实启动；显式探针恰好 1 次 catalog + 1 次假 chat，启动 0 次，不改 enabled |
| 17 | 候选数组/proof 不在草稿或 public generation DTO；实际 HTTP 日志为固定 reason + target_index；public DTO 映射函数及 frontend 未改。未重跑浏览器 strict decoder |
| 18 | 十个目标代表关系与交错样本、未知/错误关系拒绝、短/中/长/特长和接近原 2M rune 防护边界均测量；不是自然语言质量评分 |

所有新增文本和 metadata 都是开发合成 fixture。没有冒充取得 QA090 的完整原始候选，也没有将本轮测试样本写入用户复习库。

## 开发期测量

固定 Go 1.26.7 / linux arm64 / Docker 的单次非 race 测量（不是稳定 p95、生产容量或 AI 延迟承诺）：

- 冷加载约 349 ms，GC 后保留堆增量 38,223,784 bytes，进程复用同一只读实例。
- 50 / 100 / 200 / 350 词：约 35 / 31 / 49 / 100 µs。
- 10,000 词：2.031 ms；300,000 词：48.791 ms。
- 999,990 词、1,999,998 rune：155.161 ms，未新增产品词数上限。
- 样本是可控重复普通词/少量目标；高词汇多样性、许多多词目标及极端重复目标的性能不是这些数据的保证。扫描接受取消，关系只沿本地邻接，未按每个目标遍历整词典或全输入词库建闭包。

## 修正记录与剩余边界

开发期间修正过：旧 POS 无关词尾规则、Unicode byte/rune 混用、SSE 高代理项提前输出、Go JSON decoder 的大小写字段别名、日志高基数错误串；对应新增回归已通过。一次“缺失位置”测试误选了资源未知的 vulnerableness，改为已知 vulnerability 在正文中缺失，以单独检验位置错误；未知关系测试保留。构建器 unkeyed literal 的 vet 报错已修正。

初次使用主机 Go 1.27 构建得出的压缩摘要与项目 Go 1.26.7 不同；正式资产已用固定工具链重建，且完成断网复现。曾误启动的未使用 latest PostgreSQL 临时容器已移除，正式测试始终使用固定 18.6 容器。首次 shell locale/hash 与未引用 `?` 参数的诊断命令错误已修正，未触及用户数据。

剩余限制遵循 DEC-036：有语义联系但本地资料无法证明的声明仍可能失败；WordNet 关系不能证明上下文释义、词性用法、搭配或整篇短文自然。多目标共享关系仍保守拒绝。真实 GPT-oss/DeepSeek 的 v3 输出兼容性、造文质量、实际延迟和 usage/cost 未验证，不以原 v2 探针通过替代新证据。

## 候选、环境与交接

- 开发候选镜像：`wordweave-backend:cr039-dev`，`sha256:557782d0cfb1d551d3897abbbe22f74c369e4f309e58c202b54c7137f9e03a5e`；已做内部离线启动检查，**未部署 UAT**。
- UAT backend 保持 `sha256:642ed57ad0ed6c8a13e4bba1101d8b50188e8ea636791583a6ffb5eaa6917aac`；frontend 保持 `sha256:fd251e7439aad8e058656e2751ed84f40715fec570a872da53542688a6dd6904`。未停止 UAT 四个容器，未使用现有凭据。
- 本轮专用容器、临时数据库及两个网络已清理；删除的只有可由 fixture 重建的合成数据。候选镜像、无密钥源码基线 `/tmp/wordweave-cr039-baseline.xm1Ggt` 与公开归档缓存 `/tmp/wordweave-cr039-rebuild.ozTfzt` 保留。
- 按 agt-backend-implement 提交本报告与后端交接，不切阶段、不关闭 CR、不代替 qa-quinn。建议状态 awaiting_user_review；正式 workflow 中启动前的 implementation_started/current_code_started 索引由后续守门器依据本次交付更新，不能把历史 false 误读为尚无实现。
- 模型路由请求 strong / gpt-5.6-sol / high；当前会话实际模型与用量未观测，未声称换模或启动额外代理。

下一步为独立定向验证。若随后安排真实模型造文质量复测，应单独明确模型、调用次数和 300 秒客户端窗口，仅评阅用户两组词的映射、释义、搭配、提示和标签，不恢复已耗尽的历史调用预算或全站重复测试。
