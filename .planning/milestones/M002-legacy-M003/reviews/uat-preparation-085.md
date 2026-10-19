# M003 用户 UAT 准备完成 — PREPARATION-M003-085

用户“给我 UAT 相关的测试准备”已记录为 `USER-M003-UAT-PREPARE-20261012`。backend-ethan 准备后端/账号/模型/测试场景，qa-quinn 完成前端、浏览器就绪检查与功能验收指南；QA职责遵守已确认的项目范围，不测试文章质量。

主入口为 [3014 造文台](http://127.0.0.1:3014/create)，当前整套环境保持运行。访客无需登录；Basic/Pro/Admin 使用本地独立账号文件，通过正常密码表单登录。当前访问事实见 [access.json](../verification/evidence/uat-local-002/access.json)，用户步骤见 [UAT 指南](../verification/evidence/uat-local-002/UAT-GUIDE.md) 与 [验收清单](../verification/uat.md)。

旧环境缺少当前CR306所需字段，因此本次使用新空PG18和独立3014/54872–54875端口，未迁移或更改旧3013/54672–54675服务/数据库。已加载唯一保存的0731真实连接及上轮成功配置；准备没有真实probe/generation，用户可以主动选择真实模型开始验收。六个明确标记的合成场景供无外部请求的功能检查。

浏览器readiness 5/5 PASS：游客模型可见、Basic/Pro/Admin密码登录、管理员参数保存读回恢复、中文五词合成完整流、无页面错误。冒烟只产生2次合成调用，真实调用仍0；原功能QA证据沿用。本次没有代码、prompt或新架构改动。

根代理核对整体status为ready、账号文件0600且无后端密钥字段，并将指南的计数表述统一为21接口+10管线+5焦点=36项；区分后台Pro配置与用户侧无需展示审稿次数的要求。统一控制脚本stop只停本次服务并保留数据，环境保持运行供用户使用。

当前阶段保持verification，QA及UAT准备通过不代表用户已经接受。用户结果待填写 [反馈模板](../verification/evidence/uat-local-002/feedback-template.md)，不自动关闭CR-302/306、不完成里程碑、不部署。
