# CR-307 pre-fix source freeze

Captured before the bounded CR-307 source change on 2026-10-12.

| Source                                               | SHA-256                                                            |
| ---------------------------------------------------- | ------------------------------------------------------------------ |
| `frontend/app/presentation/components/AppDialog.vue` | `98cd2dd116541ecf757bf9bed6b1748015b9d9c6bec5782e5a0541688633f640` |
| `frontend/app/pages/admin/models.vue`                | `5cbb6aea478f289af41b7e9d2dc86f656d09cf5beb82cd3f2df20797114a76e4` |
| `frontend/tests/e2e/m003-cr306-models.spec.ts`       | `85c6436b5cdb74b035aff10d285927d7a736936c0fdc20a5d3080ce25d2aad8e` |

The independent QA failure is preserved unchanged at
`.planning/milestones/M003/verification/evidence/cr306-qa/browser.json`; its
SHA-256 is `f3fe6eaca8876e24a75f56565a0e4c8fdbefa60e1666e405c4aac56a039222dc`.
The frozen entry-gate copy has the same digest.
