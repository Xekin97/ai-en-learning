# DEV075 开发验证证据

作者frontend-claire；非独立QA。批准范围只含CR030长名详情与CR035组标题。

| 文件 | 含义 |
| --- | --- |
| source-baseline.json、baseline.json | 修改前2214文件哈希、16个批准QA快照核对、6001容器快照 |
| setup.mjs、environment.json | 旧固定前端+固定后端+tmpfs PG+Nginx，6101，禁用供应商 |
| seed.mjs、fixtures.json | 初始合成账号、45行分页及资料 |
| seed-layout.mjs | 保留的失败示例：不可变username trigger拒绝UPDATE；不要作为重建步骤执行 |
| seed-layout-insert.mjs、layout-fixtures.json | 正确INSERT合法32字符账号及其两篇资料；没有关闭数据库约束 |
| layout.mjs、layout-before-* | 旧候选72项“预期缺陷复现”，非旧版PASS |
| quality-commands.json、format.log、build.log | 首次构建；随后修正测试locale隔离，不作为最终镜像 |
| quality-commands-final.json、format-final.log、build-final.log | 最终格式及固定Node24全部质量链，160 unit |
| candidate.mjs、candidate.json | 仅替换已验证属本轮的6101前端，固定最终镜像/UAT不变 |
| layout-after-* | 632最终断言，双引擎双语6宽度、长短名、空模型四组及实时原型对照 |
| flows.mjs、flows-*.json | 272真实导航/reader/Plans多模型保存断言 |
| plans-edge.mjs、plans-edge-*.json | 240多模型/清空配置/额度边界/键盘断言，含16组Axe |
| e2e.mjs、e2e-full.json、e2e-full.log、e2e-command.json | 完整110契约Mock desktop/mobile回归 |
| screenshots/ | 旧/新/原型；动态内容不同，整页高度不是局部字段的对照oracle |
| cleanup.mjs、pre-cleanup-data.json、cleanup.json | 仅清理本轮4容器/2网络，临时数据及释放端口/6001保护 |
| delivery-validation.mjs、delivery-validation.json | 最终范围、链接、结果和文件哈希核对 |

重建顺序：在全新证据目录调整保存路径后执行setup→seed→seed-layout-insert→layout before→quality final→candidate→layout after→flows→plans-edge→cleanup。脚本使用wx保留结果，不能直接在现有结果上重复运行。e2e单独使用3300/38080契约Mock，默认单worker。

结果不合并冒计：最终真实浏览器1144=632+272+240，单元160，Mock E2E110；旧候选72用于确认失败基线。全部原始结果保留，没有独立QA/UAT放行结论。
