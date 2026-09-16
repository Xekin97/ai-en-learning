---
milestone: M001
stage: verification
role: quality/base
agent_name: qa-quinn
status: awaiting_user_review
date: 2026-09-06
verification_round: TRANSITION-M001-072
verdict: fail_rework_required
---

# 第072轮覆盖矩阵

依据为批准产品/交互/API及当前可运行原型。按页面×身份×状态×语言×宽度×行为核对，不以正常态代替错误态。以下结果仅指实际范围；原始失败与修正归因见[报告](./cr029-cr034-072-report.md)，脚本和JSON均在[evidence目录](./evidence/cr029-cr034-072/PLAN.md)。

| 追踪 | 独立场景 | 证据脚本/结果 | 结论 |
| --- | --- | --- | --- |
| CR029；PAGE001；CAP001/021 | 首页Review；zh/en五宽度 | visual | PASS |
| CR029；PAGE007；CAP017 | 日期44px等宽、无额外margin | visual、range-matrix-corrected | PASS |
| CR029/031；PAGE009；CAP005/021 | 注销完整文案/说明色/布局 | visual | PASS；未执行账号删除 |
| CR032；PAGE005–009；CAP012/014/017/020/021 | 5类原地引导×zh/en×320/390/720/1280/1440；品牌、完整文案、准确颜色、SSR无私有数据、无私有请求 | visual | PASS，旧faint差异已闭合 |
| CR032；PAGE002/003；CAP002/003/011/021；API001/002 | login/register/错误/语言/刷新/安全redirect/管理员优先；三入口一致；普通认证不创建 | flows、review-regression | PASS；有效生成claim未重做 |
| CR030；PAGE103；CAP104；API103 | 空查询/初始/加载/20行/40行/45终页/无结果/失败/重试/追加失败保持旧行；zh/en×390/1440 | users-supplemental | 功能PASS；英文搜索失败说明FAIL R072-01 |
| CR030；PAGE103；CAP104/021 | 搜索框及卡片精确几何，zh/en×390/720/901/1080/1280/1440；再以干净栈复现390/720/1280 | users-search-geometry、geometry-confirmation | FAIL R072-02；width与32px偏移不能用Axe通过替代 |
| CR030；PAGE103；CAP104；API103 | trim/大小写/精确优先/45唯一/排序/跨查询cursor拒绝 | api、users-supplemental | PASS |
| CR030；PAGE103；CAP104/105/107 | 40行返回/焦点/精确scrollY/保留搜索/详情再搜索/ISO日期/Library和View文案 | flows、visual | PASS，正常详情不代替搜索前几何 |
| CR031；PAGE103；CAP107；API103 | 正确用户/不同batch/短与220句重复压力长文/query深链接/旧URL/前进后退/刷新/关闭焦点 | api、flows、visual | PASS |
| CR031；PAGE103；CAP107/021 | 固定首尾/单正文滚动/无重叠/readonly/500重试/404不可用/关闭迟到；中文重试准确 | flows、users-supplemental | PASS；旧中文重试残余闭合 |
| CR033；PAGE103；CAP104/105；API103 | limited/0/unlimited/admin null，严格DTO；窗口外/退款/取消标记/他人/降额/换组重置；权限 | api | PASS；手工计量≠AI调用 |
| CR033；API103；FQ05/07 | 原生PUT200、真正提交后响应丢失；1PUT+1GET、不重放、未知状态保留错误 | mutation-diagnostic、lost-response | PASS；原flows注入前403保留 |
| CR030；PAGE103；CAP106；API103 | UI密码确认不匹配禁用；重置204；旧密码拒绝、新密码成功；2旧会话由200→401 | users-supplemental、password-session-corrected | PASS；正确端点/me/account |
| CR033；API103；FQ08/11 | 新新/新旧/旧新/旧旧，SSR/客户端；常驻旧标签明确刷新恢复 | versions、version-resident-diagnostic | 配套PASS；常驻页旧缓存限制保留 |
| CR034；PAGE007；CAP017/020；API008；BP01 | zh/en；Chromium14宽度，WebKit901/1080/1081；empty/invalid/failed准确文案与几何 | range-matrix-corrected，510项 | PASS |
| CR034；BP02/03 | 两引擎901/1080/1081 ready/loading/resume；连续1081→1080→901→900→1081与locale；节点/草稿/焦点/无新增业务请求 | range-independent、zoom-and-boundaries | PASS；缺失输入通过原生fill，非真机日期弹层 |
| CR034；API008；FR01–18 | 旧库/真空/全不参与/当前无命中；同日上海边界3批6词；缺失/反向无GET/POST；有→无→有；失败重试/迟到响应 | range-independent | PASS |
| CR034；CAP017/020/022；API008 | 显式UI创建201；随机批次/目标顺序跨刷新固定；范围复用200保持原日期；single并存；独立resume；422重查不重放 | range-independent | PASS |
| CR034；API008 | 浏览器本地7天：UTC闰日/上海跨日/洛杉矶DST，初始唯一正确请求 | range-independent | PASS（3例，不是所有IANA时区） |
| PAGE008；CAP018/019/020/022；API008 | 两种成功总结；短语所有重复位置隐藏；learn/learned/learning；wrong后correct；颜色不变；输入不重叠 | review-regression | PASS |
| PAGE008；CAP019/022；API008 | 两目标交错4空/2组、不泄露拼写；两阶段跳过；最终1未成功/1跳过 | final-supplement | PASS |
| PAGE101/102；CAP101–103 | 标题/副标题；模型Add/Edit/Key样式和文案、同停用状态/0方案引用；Plans标签/保存 | regression、models-list-corrected | 指定场景PASS；共享后台壳若改需复验 |
| PAGE005；CAP012/013 | 六统计标签/空态/真实已存批次可读 | regression、api | PASS；未穷举统计生命周期 |
| 可访问性/响应式 | reader Chromium+WebKit zh/en×390/1440；范围/Users/配置/Library实际状态Axe serious/critical；真实200%双语review/reader | users-supplemental、regression、range-independent、zoom-and-boundaries | 所测PASS；无人工读屏/真机/Firefox结论 |
| 性能 | 20次顺序本地详情HTTP，p95 3.891ms | final-supplement、local-performance | 局部PASS；非并发/公网负载 |
| AI；CAP006–011；API004–006 | 当前真实供应商、模型概率质量、3×4×4生成 | ai-evaluation（历史边界） | 本轮NOT VERIFIED；发布门BLOCKED |
| 环境/范围 | 固定镜像、1557基线无改、UAT ID/镜像/启动时间不变；临时栈清理 | cleanup、geometry-cleanup、delivery-validation | PASS；未部署6001 |

CR029/031/032/033/034本轮指定验收项已通过，仍不自行关闭；CR030包含两组残余。下一步为有限implementation返工，再独立复验；不请求用户现在执行UAT。

