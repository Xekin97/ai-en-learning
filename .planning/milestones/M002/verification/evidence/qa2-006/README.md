# QA06 冻结证据

TRANSITION-M002-030；frontend-cr010 / backend-cr011，13稳定场景为11 PASS、2 FAIL。CR011搜索修复通过待守门限定关闭；CR012页面返回滚动位置、CR013收录状态分类待实施。原结果不可覆盖。

## 复现环境

Node24.21.0、Go1.26.7、PostgreSQL18，新建一次性数据库；真实AI调用0。脚本会创建合成账号、管理模型/基础计划/道具、启用临时成长配置、生成和收录/删除内容。只能用于专门的本地隔离环境。**先复制.mjs到新输出目录，不要在本冻结目录重跑。** 私有env.json由/tmp/wordweave-fe-m002-current指向，不输出或提交。

1. 产品根运行 `python3 frontend/tests/integration/m002-local-stack.py start`。固定测试端口63541/38081/39081须空闲；模型仅loopback38082。
2. 用Node24启动implementation/evidence/frontend-cr010/production-server.mjs，HOST=127.0.0.1、PORT=3331、NUXT_BACKEND_INTERNAL_ORIGIN=http://127.0.0.1:38081；复用其build-location指向的完整生产输出，不改源码或重跑前端构建。
3. 依次运行复制后的library.mjs → scroll-repro.mjs → generation.mjs → generation-v2.mjs。共享3301代理及38082provider，**不可并行**；每份脚本finally关闭自有browser/proxy/provider。library和两份generation因实际断言失败退出1，仍有完整结果，不能用shell成功链跳过后续。scroll脚本记录FAIL但退出0，必须读其结果。
4. library通过真实API创建模型/计划配置与两名学习者，生成23篇并收录，删本人第22篇，留本人21篇和他人1篇。真实默认20行触发续载；无需篡改API分页响应。fixture.json仅合成公开ID与统计，不含密码/token。
5. scroll-repro读取同一夹具，用新会话复验页面返回与历史后退；先聚焦并定位末行，保留前后视口截图及scrollY/标题几何。页面内返回失败，浏览器后退对照通过。
6. generation第一版是原始失败轨迹。v2保留计量断言并将四种save状态码集中为G07；修正禁止JSON字段400及provider打开阶段503的测试期待，不接受save404为通过。v2注册另一独立账号，重设临时basic额度以隔离前轮配置，最后测试计划0次时的次数卡。
7. G04用原生fetch直连127.0.0.1:38081并带原同源鉴权，真实断开Go请求；简易Node代理不可靠传播断连，不能用它得出退款结论。其他浏览器操作仍经过3301同源代理。该测试不代替生产Nginx。
8. 停自有3331，执行local-stack.py stop；保留原3300/3330/38080/4186。private运行目录保留调试，API和PG已停止。

## 有效结果

- L01/02/03/05/06：library-results.json。五种规范化输入；精确搜索/签名分页与owner边界；双语言四视口，三种实际搜索输入×8组；20→21无重复；清除与六项统计；局部axe/runtime。
- L04：同文件首次FAIL + scroll-repro-results.json独立FAIL。页面返回scrollY3125→0，历史后退3125→3125。两条路径不合并成一个通过。
- G01–06：generation-v2-results.json。API预检和基础/次数卡真实账，取消与失败/中断的区分，放弃与自动签到。
- G07：同文件FAIL；save-state-evidence.json证明四种本人run仍存在、原请求404，API006要求409。
- generation-results.json保留首轮6个失败。其中400/503是测试期待错误，save404是实际缺陷；不能将初轮计为6个独立产品问题或覆盖其原件。

本地provider共36次=library24+初轮generation5+generation-v2 7；真实0。只有23次用于书架的有效生成进入复习库。业务测试有效后放弃不收录；预期错误/中断不计自然语言质量样本。

## 来源与保护

inputs.json含当前前端277/后端287摘要、6417份受保护原件、修改前6份QA自有文件及原端口状态。before-owned.tar.gz可恢复QA05摘要中的5份入口和CR011原稿；旧证据/失败与当前应用、上游、开发及控制面不变。当前5份QA入口、CR011复验与新增CR012/013的摘要在manifest；manifest不自哈希。

原型与copy/spec均为UI22/H01；原型搜索的includes只是演示夹具，真实精确词条要求沿CAP013/API007。本轮读源码/记录行为不等同修改应用或改变产品规则。未执行新会话交接实验、真实AI质量、用户UAT、部署、真机或生产代理验收。
