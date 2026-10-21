# 历史测试截图恢复（Q007）

2026-10-21 用户要求清理 ai-en 测试截图并调整 AGT 规则。本批从当前工作树移出 **3,495 张历史测试截图，351,345,619 字节（约 335.07 MiB）**。原件均已与产品 Git 提交 `81aa8bb43fc8e762dee0702556ea2882b3821b75` 核对一致，逐文件路径、SHA-256、Git blob 和保留理由见[恢复清单](../reviews/evidence/screenshot-cleanup-20261021/index.json)。工作树中的原有已跟踪图片从 4,202 张降为 707 张；这不是 Git 历史体积或 token 节省计量。

## 保留范围与事实边界

- 全部设计目录、资源和当前 M003 待评审产物保持原样；不清理未提交或他人修改的图片。
- 43 张测试图片继续原地保留，覆盖 M001 后期 UAT、CR039 失败来源、W01 未决观察及 M002 相关最终验收/真实 UAT；具体理由在清单的 `retained_test_images`。
- 旧报告、失败记录、审批与哈希清单保留原字节。图片转入 Git 历史不表示对应问题已修复，也不改变 M001/M002 的验收结论、未验证项或 M003 的待评审状态。
- 当前文档从本页查找历史图片。旧文档中的图片相对链接、历史运行脚本和冻结清单按原版本解析；如需使用旧脚本/整组证据，先在独立临时目录恢复相应版本，不能在当前目录重跑以覆盖历史事实。

## 按原路径恢复一张图片

从产品仓库根目录执行，参数替换为清单中的 `path`。输出进入已忽略的 `tmp/recovered-test-screenshots/`，不会覆盖当前文档、设计或工作区修改：

```sh
python3 - '.planning/milestones/M001/verification/evidence/screenshots/cr023-return-matrix/desktop-standard.png' <<'PY'
import hashlib, json, subprocess, sys
from pathlib import Path
index = json.loads(Path('.planning/milestones/M002/reviews/evidence/screenshot-cleanup-20261021/index.json').read_text())
entry = next(item for item in index['files'] if item['path'] == sys.argv[1])
data = subprocess.check_output(['git', 'show', f"{index['source_commit']}:{entry['path']}"])
assert hashlib.sha256(data).hexdigest() == entry['sha256']
destination = Path('tmp/recovered-test-screenshots') / entry['path']
destination.parent.mkdir(parents=True, exist_ok=True)
with destination.open('xb') as output:
    output.write(data)
print(destination)
PY
```

如目的文件已存在，上述命令会拒绝覆盖。原提交中的报告也可用 `git show <完整commit>:<原路径>` 读取；较早的原目录名继续遵循 [M002 归属映射](../continuation.md)。保留这条 Git 历史或等价完整归档；仅删除当前文件不会缩小旧 Git 对象。

## 后续采集

日常前端截图和显式 JSON 报告使用仓库内已忽略的 `tmp/browser-evidence/`，Playwright 默认附件继续使用已忽略的 `test-results/` / `playwright-report/`。参见[前端运行约定](../../../../frontend/README.md#browser-artifacts-q007)。必要正式证据经挑选后提交，记录事项、版本与环境；临时过程图在诊断和复验结束后清理。新的 AGT 规则来自[兼容采用记录](../../../agt/evidence-retention-adoption.json)，没有升级 Profile 或切换里程碑。

## 本批核对结果

- [原件与补丁检查](../../../quick/Q007-clean-test-screenshots/check-1.json)：3,495 份 Git 原件逐字节读取并通过 SHA-256 核对；707 张保留图片与基线一致；恢复示例成功且拒绝覆盖既有文件；159 个当前入口链接可达。旧非图片证据及原有控制文件修改保持原样。
- 同一检查从锁定 revision 依次重放三份补丁，逐步核对摘要，Profile 仍为 `consumer-ai-web@2.0.0`；重建后的 Quick CLI 可读取任务。
- [前端检查](../../../quick/Q007-clean-test-screenshots/check-2.json)：Node 24 下 28 份文件通过 lint/格式检查，5 份脚本通过语法检查，8 份 Playwright 配置完成用例发现；44 个输出表达式均解析到 Git 忽略目录。Chromium 实际截图、嵌套目录和 JSON 写入通过。
- 首次配置发现因未提供 CR306 隔离源码路径而停止，原失败保留在 check-1；提供临时源码副本及 CR306/307 环境变量后，仅重验该检查。没有修改产品预期或执行应用全站用例。
- 收尾期间并行设计工作将 M003 更新为 U3-41 / formal13 整改中；本任务没有写入其状态、角色注册表、项目清单或设计产物。[最新复核](../../../quick/Q007-clean-test-screenshots/check-3.json)在更新后的控制上下文完成原件、输出和补丁检查，全部通过；保留并行会话的修改。

本批由当前 Codex 会话串行承担前端约定、实现、QA 记录与接续责任，任务入口为 [Q007](../../../quick/Q007-clean-test-screenshots/task.json)。内容与静态完整性已核对；独立新会话接续试验未执行，产品功能验收不在本批范围。未提交、推送、部署或重写 Git 历史。
