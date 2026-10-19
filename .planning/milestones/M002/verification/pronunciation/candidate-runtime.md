---
milestone: M002
stage: verification
role: quality/base
agent_name: qa-quinn
version: M002-QA-PRON-01-R1
status: completed_candidate_stopped
date: 2026-10-16
---

# 发音候选运行记录

R1 曾以 production Nitro `127.0.0.1:3018` 和 real proxy `http://localhost:3019` 连接真实 backend `127.0.0.1:43331`。源/构建接收和定向复验通过后，R1 已安装到 3016 UAT；候选 3018/3019 进程已停止且端口释放。

当前用户入口、回滚备份和进程事实见 `evidence/run-145/switch-receipt.json`。候选脚本仍保留在 `evidence/harness/` 供审计；不要用它操作 3016、backend 或 PostgreSQL。
