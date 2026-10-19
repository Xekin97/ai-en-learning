---
milestone: M003
stage: implementation
role: backend-implementer/base
agent_name: backend-ethan
status: awaiting_user_review
date: 2026-10-14
---

# CR311/312 后端实施交接

- CR311 Search/Random 现在由后端唯一 41 项精确目录过滤，大小写无关且在 SQL 排序/随机/LIMIT 前执行。旧已选/Resolve/预设/历史保持；前端继续直接消费 API 候选，不复制目录或追加本地规则。
- CR312 普通生成和 preview 已切 `m003-stream-v6`。公开事件新增真实发送驱动的 `activity` 与显式 `draft` 生命周期；`edit` 的 draft/version/rev 保持连续约束。Review 不公开，`body_complete` 不授予保存资格，只有最终 `validated` 整包可保存。持久 pipeline 仍为 `m003-content-v5`。
- 换稿完整段才公开，首片替换对应完整旧段，旧尾保留到 body_complete；长段按最多 2048 码点 edit 分片。首稿保留原安全增量合并。same-version continuation 使用新 draft_id 和 append，append 完成后重建准确段索引，后续 V+1 rewrite 可按“分隔符归左”替换；空/纯空白前稿的首个续写段索引为 0。
- safe passage close 是 body_complete 的唯一来源；delta 先于 close，元数据可继续到达，坏元数据仍会使整次失败。Close/error/cancel/EOF/adapter return 不冒充 close。跨 chunk markup 前缀在公开前拒绝。
- 开发验证已覆盖全 41 目录、生产 Random SQL、v6 generation/preview 顺序、初稿/段落/长 Unicode/CRLF/删尾、metadata 迟到与坏 JSON、fixed/rewrite/native continuation、Q02 restore/discard、cancel/disconnect/stream boundary、预算/调用数回归。全后端 race、vet、build 通过；未调用真实 provider。

前端接续按 FE04 直接切 v6 源码：严格按当前 epoch、draft_id、content_version、base_rev/rev 消费；initial 可显示增量，replace/append 分片只在 paragraph_complete/body_complete 后发布；body_complete 后继续等待 validated/failed/cancelled；Plan 保留到最终整包。Search/Random 不复制 DATA307。具体命令、限制、失败记录、恢复包和源码哈希见 [`backend-validation.md`](../implementation/backend-validation.md) 与 [`evidence/cr311-312-backend`](../implementation/evidence/cr311-312-backend/)。

CR311/312 保持 open。本交接建议 `awaiting_user_review`，等待 root 独立核验及后续前端实施/独立 QA；本角色未自批、未切控制状态、未部署、未刷新 UAT3015。

## 历史索引

CR306/TECH03 的旧版完整交接已冻结在 [`implementation-entry-101/before.tar.gz`](../reviews/evidence/cr311-312-implementation-entry-101/before.tar.gz)；旧证据保留于 `implementation/evidence/cr306-backend/` 与 `implementation/evidence/tech03/`，不构成当前待办。
