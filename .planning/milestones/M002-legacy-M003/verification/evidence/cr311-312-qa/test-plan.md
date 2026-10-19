# CR-311/312 independent QA execution plan

- Scope: QA07-CANDIDATES, WIRE, ACTIVITY, TYPING, CONTINUITY, TERMINALS, UI12, PREVIEW, ACCESSIBILITY, PERSISTENCE.
- Environment: QA-owned fresh PostgreSQL, Go backend, Nuxt frontend and deterministic local provider on unused ports. Never touch 3015/54882–54885 or its private files.
- Reused developer evidence: backend full 41-entry/random SQL matrix and deterministic v6/race coverage; frontend deterministic scheduler/unit/build checks and frozen 35-path submission. Independent QA adds actual API/SSE/DB and browser observations.
- Data: controlled provider fixtures are synthetic; representative visual comparison uses the approved six-word bookshop sample where possible.
- Evidence: raw commands/logs/JSON/screenshots remain in this directory. Preserve original failed method output and add corrected retest rather than overwrite.
- Screenshot budget: five saved, three visually inspected; increase only for a specific unresolved acceptance item or defect.
- Excluded: article/model semantic quality, live providers, UAT3015 refresh, historical migration, deployment, production edits and control-plane changes.
