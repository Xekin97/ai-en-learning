# CR020 / FE2-R20 开发证据

输入为TRANSITION-M002-045、QA17/F17、批准UI22/H01 NAV11及FE02。用户已明确“前端相关实现问题一律批准”，已确认范围内无需逐项询问。独立QA和最终UAT仍按实际结果判断。

生产改动仅AppHeader.vue：外部click/focusin关闭、Escape回summary、普通账号链接选择后待Nuxt目标route渲染完聚焦既有右侧h1；同页选择也聚焦，修饰键点击沿NuxtLink原行为。卸载清理事件。没有新UI、copy、CSS、API或状态数据模型。

- `source.json` / `frontend-source.tar.gz`：283源文件；`source-diff.patch`为相对frontend-cr019的差异。
- `checks.json`及原日志：修改文件lint/格式、全项目类型、7项组件行为测试、隔离Nuxt生产构建通过；Node24、pnpm10.33.0。
- `build-location.json` / `build-source.json`：可复用生产构建目录与444文件摘要，不能以旧CR019构建验证此次修复。
- `browser-check.mjs` / `browser-results.json`：8个组合（Chromium/WebKit × 中英 × 320/1440）全部PASS、runtime0；每个组合在生产和批准原型分别验证四链接顺序/Tab、Enter/Space、Escape回头像、外部点击、焦点移出、四分区及同页再选落焦、当前页标识、无横向溢出。生产成长GET故意延迟300ms，验证异步渲染后标题焦点。
- `visual-check.json`：人工查看中320 WebKit及英1440 Chromium的菜单成对截图；对应区域样式相同，保留不同合成昵称。截图不证明整个产品通过。
- 浏览器使用已有严格契约mock，不改响应结构。纯UI修复，不重做Go/DB或首页/欢迎等无关矩阵；未调用提供方。原QA17证据原样保留。
- `runtime.json`：本轮自建3300/3330/3332/38080全部停止。
- `before-owned.tar.gz`保留改前AppHeader及三份前端正文；`protected-before.json`与最终manifest验证其他原件不改动。

复现：在产品根用Node24运行`python3 .planning/milestones/M002/implementation/evidence/frontend-cr020/run-browser.py`（其脚本已固定Node24路径），先确认端口空闲；脚本读取此处build-location，启动自身服务并在finally停止。这会覆盖本目录运行证据，后续独立复验应复制脚本到新的证据目录并读取此构建，不能覆盖已冻结的开发原件。

开发结果为implemented_pending_qa；CR020不由开发关闭。正式阶段变动以守门记录为准。未部署、提交、真实AI评测或新会话交接实验。
