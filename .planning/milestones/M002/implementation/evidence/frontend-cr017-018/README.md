# CR017/018 开发交付

授权TRANSITION-M002-039，frontend-claire。基线frontend-cr016的281文件全部匹配；本轮282文件仅两生产文件、两测试变化，见source.json/source-diff.patch及frontend-source.tar.gz。批准UI22/H01、FE02及后端backend-cr013保持。before-owned保存六份改前文件，protected-before覆盖7184份其余现有文件。

## 实现与依据

CR017：Intl的dateStyle/timeStyle在Node和WebKit产生不同literal；显式选取年月日、时分、hourCycle，formatToParts后按既有中英文文本结构组合，固定Asia/Shanghai。没有缓存、CSR回退、时间存储或学习日更改。改前缺陷复用匹配版本QA13/date-control结果；当前browser/H01等记录SSR与DOM实际文本。

CR018：普通标题保存失败使用l.title.failed，沿原型learning.js/saveTitle及copy.json。保留冲突附带标题、epoch/批次检查、失败回焦和显式重试。没有改全站failed或新增文案。

## 命令与结果

在产品根目录，Node24二进制在 /Users/xekinzhuo/.npm/_npx/387698761821791d/node_modules/node/bin/node；将该bin置于PATH执行既有pnpm。

- 原型：Node24运行本目录prototype.mjs；中英1440/390精确copy、焦点通过，截图与prototype-check.json保存。
- 目标：pnpm --dir frontend test tests/unit/library-title-editor.test.ts tests/unit/display-formatters.test.ts；unit-red为改前单文案断言1失败6通过，unit-green为修复后16通过。
- python3 本目录/checks.py：类型、lint、format:check、lint:boundaries及全量32文件333单元全部通过，checks.json定位日志。
- frontend目录用Node24运行本目录build.mjs：Nuxt隔离输出；build-location/build-source给路径和444份编译摘要，build-result与build.log保留。
- python3 本目录/browser/run.py：真实本地Go/PG18及本次Nuxt构建，核心13项通过；同时执行首轮共享检查，原失败不覆盖。
- python3 本目录/shared-control/run.py：只重查原失败六项，四项后台通过，两项道具仍受成长未启用影响。
- python3 本目录/items-diagnostic/run.py：只读真实API，/me/items=200、/me/growth=503，记录合成数据，无登录响应/凭据。
- python3 本目录/items-control/run.py：补齐隔离库成长启用、签到配置后道具中英两项通过。脚本使用首轮遗留合成道具ID，清理后重跑需要按首轮种子重建或改为新隔离夹具；源码不含生产凭据。

有效判定assessment.json为27 PASS：core13 + 首轮共享8 + shared-control4 + items-control2。原结果8/6及4/2的FAIL均保留，不当作应用回归或偷改为PASS。全部共1次本地供应商（删除测试所需），真实0；execution.json记录停服。

## 夹具失败与恢复

首轮额外回归使用原本只验证标题的临时数据库：无level1、growth activated_at、checkin_rules；未配置成长不会提供正常道具/等级投影。/admin/users无query按产品规则不自动搜索。依次补本地首级、all=1查询、启用成长及生效签到基线后通过；应用源码和生产构建在这几轮之间未改。此结论仅用于本次测试前提，不新增产品初始化需求。

首轮误试删除ever_issued定义被数据库拒绝，清理事务回滚；后续按精确测试ID删除临时消息/卡/结算，保留已发定义不上架，不关闭触发器。测试库仍有本轮用于显示的level1、零奖励签到规则和启用状态；都是可重建的隔离测试数据，没有业务库修改。新QA应以自身场景明确配置前提，不依赖未说明的共享夹具。

## 判定边界

日期比较使用DOM textContent，避免CSS uppercase造成假差异；所有warning/error/pageerror均收集，只允许明确故障注入URL/状态对应的资源错误。Shared测试在洛杉矶浏览器时区比较SSR和客户端，北京时间保持。日历04:00规则没有更改，单测跨04:00只是显示时刻检查，不能称实时时点结算验证。

代码自检未发现超范围修改；两处修复复用现有应用模型与copy，不绕过API/SSR映射。查看手机原型/实现失败态、英文详情和手机道具；动态正文/时间不同，不声明整页像素等同。未覆盖真机、人工读屏、完整卡组合、生产代理或整个UIA。历史个人页W01不能只凭本次共享格式修复自动关闭。

三角色正文接续，旧版前端manifest中对应三份文档可由before-owned按原摘要恢复；旧证据、QA13和控制面保持。没有提交、部署、真实AI、子代理、运行时换模或阶段迁移；新会话交接实验未执行，input/token unknown。交qa-quinn独立复验，CR017/018仍OPEN。
