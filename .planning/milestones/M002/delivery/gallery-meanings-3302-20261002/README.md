# 精选词义前端修复 · 3302

2026-10-02，最终 release 为私有工作目录下 frontend-gallery-meanings-20261002-r2。F01恢复左侧配置区词义、移除重复词签，F02使用原型语言原名。后端进程、backend_binary、0016数据库、账户与模型配置保持。

`deployment-final.json`及`implementation/evidence/gallery-meanings-fix/delivered-visual.json`记录最终部署和实际双视口复验。deploy.py为首轮、update-language-label.py为补充，两者是已执行的一次性脚本，不重跑。

恢复使用现有 `../provider-workspace-3302-20261002/preview.py status|stop|resume`，读取私有current指针和processes.json中的当前release；不得重跑seed/后端迁移。旧版本文档/实现存于本轮before-documents.tar.gz，首轮证据存于before-language-label.tar.gz。此次没有数据库回滚需求。
