import { format, resolveConfig } from "prettier";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
const root = new URL("../../", import.meta.url);
const design = new URL(".planning/milestones/M002/design/", root);
const source = JSON.parse(await readFile(new URL("copy.json", design), "utf8"));
const digest = (data) => createHash("sha256").update(data).digest("hex");
const escapeMessage = (value) =>
  value.replace(/@/g, "{'@'}").replace(/\|/g, "{'|'}");
for (const [prefix, locale] of [
  ["zh", "zh-CN"],
  ["en", "en-US"],
]) {
  const url = new URL(`frontend/i18n/locales/${locale}.json`, root);
  const messages = JSON.parse(await readFile(url, "utf8"));
  messages.m002 = Object.fromEntries(
    Object.entries({ ...source.static, ...source.templates })
      .filter(([key]) => key.startsWith(prefix + "."))
      .map(([key, value]) => [
        key.slice(3).replaceAll(".", "__"),
        escapeMessage(value),
      ]),
  );
  await writeFile(url, JSON.stringify(messages, null, 2) + "\n");
}
const fixtures = JSON.parse(
  await readFile(new URL("prototype/fixtures.json", design), "utf8"),
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
  await readFile(new URL("prototype/assets/lucide.json", design), "utf8"),
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
  new URL("frontend/public/licenses/lucide.txt", root),
  await readFile(new URL("prototype/assets/lucide-LICENSE.txt", design)),
);
await writeFile(
  new URL("frontend/public/licenses/lucide-source.md", root),
  await readFile(new URL("prototype/assets/README.md", design)),
);
await writeFile(
  new URL("frontend/app/assets/css/theme.css", root),
  (await readFile(new URL("theme.css", design), "utf8"))
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
      version: "M002-UI-31",
      handoff: "M002-UI-31",
      copySha256: digest(await readFile(new URL("copy.json", design))),
      themeSha256: digest(await readFile(new URL("theme.css", design))),
      iconsSha256: digest(
        await readFile(new URL("prototype/assets/lucide.json", design)),
      ),
      copyKeys: Object.keys({ ...source.static, ...source.templates }).length,
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
