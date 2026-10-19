import { format, resolveConfig } from "prettier";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
const root = new URL("../../", import.meta.url);
const design = new URL(".planning/milestones/M002-legacy-M003/design/", root);
const m002Design = new URL(".planning/milestones/M002/design/", root);
const source = JSON.parse(await readFile(new URL("copy.json", design), "utf8"));
const portabilityDesign = new URL("config-portability/", m002Design);
const portabilityCopy = JSON.parse(
  await readFile(new URL("copy.json", portabilityDesign), "utf8"),
);
const portabilityAlignmentCopy = JSON.parse(
  await readFile(
    new URL("technical-alignment/copy.json", portabilityDesign),
    "utf8",
  ),
);
const pronunciationDesign = new URL("pronunciation/browser-only/", m002Design);
const pronunciationCopy = JSON.parse(
  await readFile(new URL("copy.json", pronunciationDesign), "utf8"),
);
const pronunciationMessages = Object.fromEntries(
  Object.entries({
    ...pronunciationCopy.static,
    ...pronunciationCopy.templates,
  }).filter(([key]) => key.includes(".pron.") && !key.includes(".pron.demo")),
);
const compiledCopy = {
  ...source.static,
  ...source.templates,
  ...portabilityCopy.static,
  ...portabilityCopy.templates,
  ...portabilityAlignmentCopy.static,
  ...portabilityAlignmentCopy.templates,
  ...pronunciationMessages,
};
const digest = (data) => createHash("sha256").update(data).digest("hex");
const escapeMessage = (value) =>
  value
    .replaceAll("{}", "{'{}'}")
    .replace(/@/g, "{'@'}")
    .replace(/\|/g, "{'|'}");
for (const [prefix, locale] of [
  ["zh", "zh-CN"],
  ["en", "en-US"],
]) {
  const url = new URL(`frontend/i18n/locales/${locale}.json`, root);
  const messages = JSON.parse(await readFile(url, "utf8"));
  messages.m002 = Object.fromEntries(
    Object.entries(compiledCopy)
      .filter(([key]) => key.startsWith(prefix + "."))
      .filter(([key]) => !key.startsWith(prefix + ".m003.harness."))
      .map(([key, value]) => [
        key.slice(3).replaceAll(".", "__"),
        escapeMessage(value),
      ]),
  );
  await writeFile(url, JSON.stringify(messages, null, 2) + "\n");
}
const fixtures = JSON.parse(
  await readFile(new URL("prototype/fixtures.json", m002Design), "utf8"),
);
const itemTypeNames = Object.fromEntries(
  fixtures.items.map((item) => [
    {
      count: "extra_credit",
      model: "model_trial",
      plan: "plan_trial",
      makeup: "makeup",
    }[item.type],
    item.title,
  ]),
);
await writeFile(
  new URL("frontend/app/presentation/admin/item-type-names.ts", root),
  "// Fixed item type labels used by UI26 selectors; no card prices, effects or inventory.\nexport const itemTypeNames = " +
    JSON.stringify(itemTypeNames, null, 2) +
    " as const;\n",
);
const stories = fixtures.hero.stories.map((story) => ({
  ...story,
  meaning: fixtures.dictionary[story.meaningWord].meaning,
}));
await writeFile(
  new URL("frontend/app/presentation/home/sample-stories.ts", root),
  "// Fixed public samples from approved M002-UI-26. No user or operations fixtures.\nexport const sampleStories = " +
    JSON.stringify(stories, null, 2) +
    " as const;\n",
);
const icons = JSON.parse(
  await readFile(new URL("prototype/assets/lucide.json", m002Design), "utf8"),
);
Object.assign(icons.icons, {
  alert: {
    body: '<path d="M12 3 2.5 20h19z" />\n      <path d="M12 9v4M12 17h.01" />',
  },
  clock: {
    body: '<circle cx="12" cy="12" r="9" />\n      <path d="M12 7v5l3 2" />',
  },
  globe: {
    body: '<circle cx="12" cy="12" r="9" />\n      <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />',
  },
  menu: { body: '<path d="M4 7h16M4 12h16M4 17h16" />' },
  settings: {
    body: '<circle cx="12" cy="12" r="3" />\n      <path\n        d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1z"\n      />',
  },
  info: {
    body: '<circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7h.01" />',
  },
});
const aliases = {
  arrow: "arrow-right",
  book: "book-open",
  close: "x",
  key: "lock-keyhole",
  logout: "log-out",
  spark: "sparkles",
};
const productionTheme = (value) =>
  value
    .replace(/^@import[^;]+;\s*/m, "")
    .split("\n")
    .filter((line) => !line.includes(".m003-harness-controls"))
    .join("\n");
const pronunciationThemeSource = await readFile(
  new URL("../theme.css", pronunciationDesign),
  "utf8",
);
const pronunciationControlTheme =
  pronunciationThemeSource
    .slice(
      pronunciationThemeSource.indexOf(":root {"),
      pronunciationThemeSource.indexOf("/* Formal page:"),
    )
    .replace(/body\.pronunciation-design\s*\{[^}]+\}\s*/s, "")
    .replace(/\.pron-formal \.skip-link:not\(:focus\)\s*\{[^}]+\}\s*/s, "") +
  pronunciationThemeSource.slice(
    pronunciationThemeSource.indexOf("@keyframes pron-spin"),
    pronunciationThemeSource.indexOf("@media (max-width: 980px)"),
  ) +
  pronunciationThemeSource.slice(
    pronunciationThemeSource.indexOf("@media (prefers-reduced-motion: reduce)"),
  );
for (const name of Object.values(aliases))
  if (!icons.icons[name]) throw new Error(`Missing icon ${name}`);
const keys = [
  ...new Set([...Object.keys(icons.icons), ...Object.keys(aliases)]),
];
const vue = `<script setup lang="ts">\nconst props = defineProps<{ name: ${keys.map((k) => JSON.stringify(k)).join(" | ")} }>();\nconst aliases: Partial<Record<typeof props.name, string>> = ${JSON.stringify(aliases)};\nconst glyph = computed(() => aliases[props.name] ?? props.name);\n</script>\n<template>\n<svg class="ui-icon icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">\n${Object.entries(
  icons.icons,
)
  .map(
    ([key, item], index) =>
      `<template v-${index ? "else-if" : "if"}="glyph === '${key}'">${item.body}</template>`,
  )
  .join("\n")}\n</svg>\n</template>\n`;
await writeFile(
  new URL("frontend/app/presentation/components/AppIcon.vue", root),
  vue,
);
await writeFile(
  new URL(
    "frontend/app/presentation/pronunciation/PronunciationIcon.vue",
    root,
  ),
  `<script setup lang="ts">
defineProps<{ name: "speaker" | "preparing" | "playing" | "error" | "gesture" | "accent" | "chevron" | "check" }>();
</script>
<template>
  <svg class="pron-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <template v-if="name === 'speaker'">
      <path d="M11 5 6 9H3v6h3l5 4V5Z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
      <path d="M18.5 5.5a9 9 0 0 1 0 13" />
    </template>
    <path v-else-if="name === 'preparing'" d="M20 12a8 8 0 1 1-5.5-7.6" />
    <path v-else-if="name === 'playing'" d="M4 10v4M8 6v12M12 3v18M16 7v10M20 10v4" />
    <template v-else-if="name === 'error' || name === 'gesture'">
      <path d="M3 10a9 9 0 1 1 2.6 8.4" />
      <path d="M3 4v6h6" />
    </template>
    <template v-else-if="name === 'accent'">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v6M12 17h.01" />
    </template>
    <path v-else-if="name === 'chevron'" d="m7 10 5 5 5-5" />
    <path v-else d="m5 12 4 4L19 6" />
  </svg>
</template>
`,
);
await writeFile(
  new URL("frontend/public/licenses/lucide.txt", root),
  await readFile(new URL("prototype/assets/lucide-LICENSE.txt", m002Design)),
);
await writeFile(
  new URL("frontend/public/licenses/lucide-source.md", root),
  await readFile(new URL("prototype/assets/README.md", m002Design)),
);
await writeFile(
  new URL("frontend/app/assets/css/theme.css", root),
  (
    (await readFile(new URL("theme.css", m002Design), "utf8")) +
    "\n" +
    productionTheme(await readFile(new URL("theme.css", design), "utf8")) +
    "\n" +
    (await readFile(new URL("theme.css", portabilityDesign), "utf8")) +
    "\n/* M002-UI-32-R4 browser-only pronunciation controls, extracted from the approved source. */\n" +
    pronunciationControlTheme +
    `
/* UI10-R1.1 production adapter: keep the exact byte counter inside narrow dialogs. */
#cr313-dialog[open] {
  display: flex;
  flex-direction: column;
}
#cr313-dialog .dialog-close {
  z-index: 3;
}
#cr313-dialog .selected-file,
#cr313-dialog .change-list,
#cr313-dialog .notice,
#cr313-dialog code {
  overflow-wrap: anywhere;
}
#priority-editor:modal {
  position: fixed;
  inset: 0;
  width: min(600px, calc(100vw - 32px));
  max-width: none;
  max-height: calc(100dvh - 32px);
  margin: auto;
  overflow: auto;
}
#admin-model .custom-json-field .field-label-row {
  flex-wrap: wrap;
}
#admin-model .custom-json-field .field-counter {
  max-width: 100%;
  margin-left: auto;
  overflow-wrap: anywhere;
  white-space: normal;
  text-align: right;
}
#admin-model .dialog-close {
  min-width: var(--m003-target);
}
@media (max-width: 520px) {
  #admin-model .custom-json-field .field-counter {
    width: 100%;
    margin-left: 0;
    text-align: left;
  }
}
/* UI13-R4 production adapter: Vue owns region lifetimes while the approved
   motion tokens and visual treatment continue to come from the design source. */
.m003-live-draft,
.m003-plan-preview {
  overflow-anchor: none;
}
.m003-plan-leave-active {
  overflow: hidden;
  pointer-events: none;
  transition:
    opacity var(--m003-motion-final) var(--m003-motion-ease),
    transform var(--m003-motion-final) var(--m003-motion-ease);
}
.m003-plan-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
.m003-paragraph-leave-active {
  position: absolute;
  width: 100%;
  pointer-events: none;
  transition:
    opacity var(--m003-motion-exit) var(--m003-motion-ease),
    transform var(--m003-motion-exit) var(--m003-motion-ease);
}
.m003-paragraph-leave-to {
  opacity: 0;
  transform: translateY(-3px);
}
.m003-story-paragraph.is-replacing::before {
  content: none;
}
.m003-replacement-ghost {
  position: absolute;
  inset: 0 0 auto 10px;
  z-index: 1;
  padding-right: 10px;
  background: var(--paper);
  color: var(--ink);
  white-space: pre-wrap;
  pointer-events: none;
  animation: m003-paragraph-out var(--m003-motion-replace)
    var(--m003-motion-ease) both;
}
@media (prefers-reduced-motion: reduce) {
  .m003-plan-leave-active,
  .m003-paragraph-leave-active {
    transition: none;
  }
  .m003-replacement-ghost {
    display: none;
    animation: none;
  }
}
`
  )
    .replaceAll("#dialog:has(.generic-model-form)", "#admin-model")
    .replaceAll("#dialog>.generic-model-form", "#admin-model>.dialog-body")
    .replaceAll("#dialog.notice-dialog", "dialog.notice-dialog")
    .replaceAll("#dialog .notice-heading", "dialog .notice-heading"),
);
await mkdir(new URL("frontend/design/", root), { recursive: true });
await writeFile(
  new URL("frontend/design/source-manifest.json", root),
  JSON.stringify(
    {
      version: "M003-UI-13-R4",
      handoff:
        "M003-UI-13-R4 / accepted R4 typing and R2 continuity / M002 visual baseline",
      copySha256: digest(await readFile(new URL("copy.json", design))),
      themeSha256: digest(await readFile(new URL("theme.css", design))),
      prototypeSha256: digest(
        await readFile(new URL("prototype/app.js", design)),
      ),
      sourceManifestSha256: digest(
        await readFile(
          new URL(
            "evidence/cr312-r4/M003-UI-13-R4-source-manifest.json",
            design,
          ),
        ),
      ),
      excluded: [
        "m003.harness.* copy",
        ".m003-harness-controls styles",
        "prototype timingProbe/query fixtures",
      ],
      iconsSha256: digest(
        await readFile(new URL("prototype/assets/lucide.json", m002Design)),
      ),
      portabilityVersion: "M002-UI-33-R3-TA1",
      portabilityCopySha256: digest(
        await readFile(new URL("copy.json", portabilityDesign)),
      ),
      portabilityAlignmentCopySha256: digest(
        await readFile(
          new URL("technical-alignment/copy.json", portabilityDesign),
        ),
      ),
      portabilityThemeSha256: digest(
        await readFile(new URL("theme.css", portabilityDesign)),
      ),
      pronunciationVersion: "M002-UI-32-R4",
      pronunciationCopySha256: digest(
        await readFile(new URL("copy.json", pronunciationDesign)),
      ),
      pronunciationThemeSha256: digest(
        await readFile(new URL("theme.css", pronunciationDesign)),
      ),
      pronunciationControllerSha256: digest(
        await readFile(new URL("controller.js", pronunciationDesign)),
      ),
      copyKeys: Object.keys(compiledCopy).length,
      iconCount: Object.keys(icons.icons).length,
      publicStoryCount: stories.length,
    },
    null,
    2,
  ) + "\n",
);

// Keep generated bytes deterministic under the project's formatter too.
for (const relative of [
  "i18n/locales/zh-CN.json",
  "i18n/locales/en-US.json",
  "app/presentation/admin/item-type-names.ts",
  "app/presentation/home/sample-stories.ts",
  "app/presentation/components/AppIcon.vue",
  "app/presentation/pronunciation/PronunciationIcon.vue",
  "app/assets/css/theme.css",
  "design/source-manifest.json",
]) {
  const path = new URL("frontend/" + relative, root);
  await writeFile(
    path,
    await format(await readFile(path, "utf8"), {
      ...(await resolveConfig(path.pathname)),
      filepath: path.pathname,
    }),
  );
}
