# CR-030 / TRANSITION-M001-073 开发证据

身份：implementation / frontend-implementer/base / frontend-claire。只覆盖批准的Users残余及直接回归，不是独立QA/UAT。

## 执行与证据

- baseline.json：1782份既有文件摘要和6001四容器快照，敏感环境文件及生成缓存排除。
- setup.mjs / environment.json：独立6101、内部后端网络、临时PostgreSQL，无供应商密钥或调用；6010仅访问既有批准原型。
- startup-attempt1.json：首次初始化socket就绪但TCP未就绪，migrate失败；只清理本轮空tmpfs和网络。后续探测-h db，保留两次环境快照。
- diagnose.mjs初次因服务尚未启动失败，root-cause-observations.json为空；有效定位来自diagnose-confirmed.mjs / root-cause-confirmed.json。
- root-cause-confirmed.json：原镜像empty-state实际384px vs原型320px；局部浏览器实验恢复搜索卡位置。不同viewport高度证明不是固定32px补偿。
- design-comparison-results.json：第一候选876PASS/44FAIL。24项loading几何差异为真实Users骨架布局缺陷；20项整列表文本比较因真实SQL排序与原型样本排序不同而失败，需按身份比较静态行文案并独立确认UI保留API顺序。不修改后端或在客户端重排。
- diagnose-loading.mjs / loading-root-cause.json：局部实验验证720px加载搜索卡Y从305.921875恢复351.515625；只恢复批准两行骨架，非修改共享后台网格。诊断脚本初稿括号语法错误在运行前修正，未产生产品结果。
- quality-commands.json / build.log：第一候选Node24质量及157unit、SSR build成功；e2e-full.json为98PASS。
- quality-commands-final.json / build-final.log：证据脚本错误将Docker build子命令改成build-final，退出125，没有构建最终代码；quality-final2.mjs已纠正命令，保留首次错误原文。
- 最终质量/矩阵/功能结果见[开发报告](../../frontend-cr030-073-validation.md)：157unit、102E2E、1040设计对照、372真实流程通过；候选为candidate-final.json，清理为cleanup.json。不得用首次检查替代最终候选。

## 运行方式与边界

各脚本输出使用wx防止覆盖历史证据，同目录不直接重复运行；重跑应采用新输出名和自有容器名。setup要求6101空闲且无ww-dev-073容器；数据库初始CLI创建1个管理员，seed仅写本轮52个合成账号，无学习资料或计量。candidate脚本只替换已核实标签/旧摘要的本轮frontend并重启本轮nginx。清理以固定名称+标签双重确认，不操作6001或6010。

新增前端E2E位于frontend/tests/e2e/cr030-073.spec.ts，API mock遵循v1.4 envelope/Problem；生产矩阵使用真实后端，加载/错误用受控延迟/标准500，不调用AI。Playwright本机Node22只用于测试驱动，Node24构建容器为质量/SSR权威环境；所有输出保留engine warning，不更新依赖。
