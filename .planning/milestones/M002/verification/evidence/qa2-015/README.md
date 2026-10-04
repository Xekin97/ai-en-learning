# QA15 · 继承与标题验收

综合9项为8 PASS/1 FAIL。8项为双语×360/390/768/1440标题对照，I01为手工视觉/元素源对照发现的缺失pencil图标；见[assessment](assessment.json)和[CR019](../../../changes/CR-019.md)。29项继承审计及19份历史证据核对不计作新运行，见[audit](audit.json)。

## 当前输入

APPROVAL-M002-041 / PRODUCT03/UI22/H01/DB03/BE03/FE02；[inputs](inputs.json)定位前端282/后端288源文件和444份编译文件。与QA12前端基线仅4个文件有变化：标题页面、日期格式化及两项测试；其他复用证据的生产范围未改，变化点由QA14与本轮覆盖。CR001/002仍正式开放；CR017/018及FE2-R16-W1已沿041关闭。旧CR文档不改写。

## 有效用例选择与原始失败

| 原运行 | 原始结果 | 判定用途 |
|---|---|---|
| run | 8 FAIL | 长标题样本超过API007已批准title_max_length，被客户端拒绝；不是产品失败 |
| control | 4 PASS / 4 FAIL | 采用详情返回的最大code points；保留四项Chromium360/768 PASS；WebKit停止于普通Tab焦点假设 |
| keyboard-control | 4 FAIL | Option+Tab在原型/生产均成功到达保存/取消；末尾错误地比较了编辑器外BODY和原型专用演示SUMMARY |
| confirmed-control | 2 PASS / 2 FAIL | 保留两项WebKit1440 PASS；手机复习额外等待假定五字母，实际预设首词四字母 |
| final-control | 2 PASS | 仅重跑两项WebKit390，等待首输入可见，标题隐藏检查通过 |

[corrections](corrections.json)逐项记录误判原因、批准来源及修正范围。没有改变应用、宽松忽略警告或覆盖原失败。control/preflight.json另记一次TIME_WAIT端口探针失败；探针失败发生在服务启动前，修正临时bind的SO_REUSEADDR，未杀其他服务。

每个有效用例都对照相同语言/视口/标题值和编辑状态的UI22原型，检查短标题及200 code points长标题、原样文本、字号/行高/换行、无横向溢出、手机按钮位置、编辑区准确copy与顺序、Enter保存、取消、刷新、原批次非标题字段和同源另一批次不变。每项包含原型/生产的标题和编辑区域4次axe扫描，有效32次扫描0违规。仅区域自动检查，不等同人工读屏或真机。

普通/暂停预设批次在WebKit双语390/1440另进入真实单篇复习，检查单词页和概览、aria与会话API均不含自定义标题。复习没有提交，克隆库销毁后不保留这次测试会话。

## 视觉偏差

人工查看[手机生产标题](final-control/UI15-zh-390-production-title.png)与[同条件原型](final-control/UI15-zh-390-prototype-title.png)、英文桌面编辑区。标题排版及编辑区一致，但原型编辑按钮含pencil，生产只有文字。UIA-PAGE-006-ICON10及actionIcons明确该映射；[visual-check](visual-check.json)记录源位置和证据，不用自动布局/axe通过掩盖视觉遗漏。

## 本地运行与清理

每个子目录的run.py是该轮实际入口；例如在产品根执行：

```sh
python3 .planning/milestones/M002/verification/evidence/qa2-015/final-control/run.py
```

**冻结证据不可直接重跑覆盖。** 复现应复制对应脚本/input/harness与父级inputs到新的证据目录。依赖既有私有0600环境、可丢弃PostgreSQL18基库、已核对的QA14后端二进制、Node24/Playwright和当前Nuxt生产构建；脚本通过严格数据库URL保护只写本轮新克隆。原型3391、前端3331、代理3301、API38081、指标39081、PG63541均限本机。

五次运行均未调用本地或真实AI、未重建前后端、未重跑开发检查。各execution.json确认自己创建的数据库已移除、服务/集群已停止；原开发测试库未被测试写入。每轮数据均从相同基库克隆，前一轮标题变更不会污染下一轮。

QA14五份原稿保存在[before-owned](before-owned.tar.gz)，原其余38份artifact和所有旧失败保持；本轮仅更新QA五份正文、新建此证据与CR019。保护/版本/清理/链接及静态大小见[finalization](finalization.json)，哈希见[manifest](manifest.json)。新会话交接实验未执行，input/token unknown。
