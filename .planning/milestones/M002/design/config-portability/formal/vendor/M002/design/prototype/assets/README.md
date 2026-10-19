# UI-10 icon assets

Selected SVG data from the Iconify Lucide collection: https://icon-sets.iconify.design/lucide/

Downloaded on 2026-09-18 from the public Iconify API (`https://api.iconify.design/lucide.json?icons=…`). The selected names and exact paths are in `lucide.json`; `../icons.js` renders local SVG. The browser makes no request to Iconify, npm or a third-party CDN. No font glyph substitution.

Lucide license and notices: `lucide-LICENSE.txt`, fetched from https://raw.githubusercontent.com/lucide-icons/lucide/main/LICENSE . Preserve this notice with redistribution. Asset data uses original 24×24 geometry and currentColor.

Usage: 18–20px for buttons/navigation, 27px for empty/card states, 44px for authentication illustration. SVGs are decorative (`aria-hidden`, not focusable); text and button accessible names retain meaning. Shape icons in review remain anonymous, stable groups with localized shape names. The brand mark remains the existing bespoke SVG.

## UI23 additions (2026-10-01)

- Added `languages` from Iconify's Lucide package data: https://cdn.jsdelivr.net/npm/@iconify-json/lucide/icons.json . Direct Iconify API returned HTTP 403 before writing; package fallback and exact request metadata are recorded in `../../evidence/UI23-asset-notes.json`. Existing Lucide license remains applicable.
- Local `marked.esm.js` is Marked 15.0.12 from https://cdn.jsdelivr.net/npm/marked@15.0.12/lib/marked.esm.js ; license `marked-LICENSE.txt` from https://cdn.jsdelivr.net/npm/marked@15.0.12/LICENSE.md . This is a design prototype parser, not a production dependency recommendation or sanitizer.
- Markdown CSS is project-authored. Hierarchy reference: https://github.com/sindresorhus/github-markdown-css . Warm paper/green values are existing project tokens. Alternative researched: https://github.com/tailwindlabs/tailwindcss-typography ; not installed.
- Browser preview loads these assets locally and needs no CDN request. Keep both notices when redistributing the prototype. Actual production rendering keeps its existing backend parser and allowlist.
