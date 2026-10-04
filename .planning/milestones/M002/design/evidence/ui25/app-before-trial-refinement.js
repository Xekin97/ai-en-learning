import { createSelectDesign } from "./select.js?v=M002-UI-25";
import { renderMarkdown } from "./markdown.js?v=M002-UI-25";
import { createHomeMotion } from "./home-motion.js?v=M002-UI-25";
import { icon, routeIcons, actionIcons } from "./icons.js?v=M002-UI-25";
import { createPresetGallery } from "./gallery.js?v=M002-UI-25";
import { createBenefitsDesign } from "./benefits.js?v=M002-UI-25";
import { createGrowthDesign } from "./growth.js?v=M002-UI-25";
import { createLearningDesign } from "./learning.js?v=M002-UI-25";
import { createIdentityDesign } from "./identity.js?v=M002-UI-25";
import { createPresetDesign } from "./presets.js?v=M002-UI-25";
import { createOperationsDesign } from "./operations.js?v=M002-UI-25";
import { createAdminDesign } from "./admin.js?v=M002-UI-25";
const DESIGN_VERSION = "M002-UI-25";
const [COPY, F, TRACE] = await Promise.all(
  ["../copy.json", "fixtures.json", "../traceability.json"].map((u) =>
    fetch(`${u}?v=${DESIGN_VERSION}`, { cache: "no-store" }).then((r) => {
      if (!r.ok) throw Error(u);
      return r.json();
    }),
  ),
);
const generationExample = structuredClone(F.presets[0]);
const $ = (s) => document.querySelector(s),
  $$ = (s) => [...document.querySelectorAll(s)],
  esc = (v) =>
    String(v ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
const params = new URLSearchParams(location.search);
let lang =
    (params.get("lang") || localStorage.getItem("ww-m002-language") || "zh") ===
    "en"
      ? "en"
      : "zh",
  scene = params.get("state") || "normal",
  page = params.get("page") || "home";
const routes = {
  home: "PAGE-205",
  explore: "PAGE-217",
  create: "PAGE-204",
  library: "PAGE-005",
  batch: "PAGE-006",
  range: "PAGE-007",
  sessiondone: "PAGE-008",
  login: "PAGE-003",
  register: "PAGE-002",
  review: "PAGE-201",
  overview: "PAGE-202",
  summary: "PAGE-203",
  profile: "PAGE-206",
  notices: "PAGE-207",
  adminhome: "PAGE-218",
  models: "PAGE-208",
  plans: "PAGE-208",
  users: "PAGE-103",
  userdetail: "PAGE-103",
  messages: "PAGE-209",
  operations: "PAGE-210",
  credits: "PAGE-211",
  presets: "PAGE-212",
  metrics: "PAGE-213",
  growth: "PAGE-214",
  bag: "PAGE-215",
  shop: "PAGE-215",
  trial: "PAGE-216",
};
let S = {
  guest: params.has("role")
    ? params.get("role") === "guest"
    : sessionStorage.getItem("ww-m002-auth") === "guest",
  nickname: F.user.name,
  gender: "",
  points: F.user.points,
  xp: F.user.xp,
  step: 0,
  words: ["", "", ""],
  gaps: ["", "", "", ""],
  hint: false,
  selected: [...F.presets[0].words],
  model: "",
  explain: "",
  style: "story",
  length: "brief",
  quota: 5,
  generation: "idle",
  output: "",
  preset: 0,
  claimed: [],
  levelClaimed: false,
  signed: false,
  inventory: F.items.map((x, i) => ({ type: i, status: "unused" })),
  items: structuredClone(F.items),
  optab: "itemsettings",
  tiers: 4,
  models: ["Model A", "Model B"],
  message: 0,
  preview: false,
  published: false,
  previewUsage: 0,
  noticeIndex: 0,
  returnOverview: false,
  submitted: false,
};
let timer = null,
  opener = null,
  toastTimer;
const formMemory = new Map();
function rememberForm() {
  if (
    ["library", "batch", "range", "review", "overview", "summary"].includes(
      page,
    )
  )
    return;
  const values = {};
  $$(
    "#main input[id]:not([type=password]),#main textarea[id],#main select[id]",
  ).forEach(
    (el) => (values[el.id] = el.type === "checkbox" ? el.checked : el.value),
  );
  formMemory.set(page, values);
}
function restoreForm() {
  if (
    ["library", "batch", "range", "review", "overview", "summary"].includes(
      page,
    )
  )
    return;
  Object.entries(formMemory.get(page) || {}).forEach(([id, v]) => {
    // These selectors already render from S and current plan constraints.
    if (page === "create" && ["model", "style", "length", "explain"].includes(id)) return;
    const el = document.getElementById(id);
    if (el) {
      if (el.type === "checkbox") el.checked = v;
      else el.value = v;
    }
  });
}
const t = (k, v = {}) => {
  const key = lang + "." + k;
  const s = COPY.static[key] ?? COPY.templates[key];
  if (s == null) {
    console.error("Missing copy", key);
    return "[" + k + "]";
  }
  return s.replace(/\{(\w+)\}/g, (_, n) => String(v[n] ?? ""));
};
const L = (x) => x?.[lang] || x?.zh || x?.en || "";
const B = (k, a, cls = "", disabled = false, extra = "") =>
  `<button type="button" class="btn ${cls}" data-action="${a}" ${disabled ? "disabled" : ""} ${extra}>${actionIcons[k] ? icon(actionIcons[k]) : ""}${esc(t(k))}</button>`;
const link = (p, k, cls = "") =>
  `<a class="${cls}" href="?page=${p}&lang=${lang}" data-go="${p}">${esc(t(k))}</a>`;
const badge = (k, cls = "") => `<span class="pill ${cls}">${esc(t(k))}</span>`;
const field = (k, id, val = "", type = "text", attrs = "") =>
  `<label class="field"><span>${esc(t(k))}</span><input id="${id}" name="${id}" type="${type}" value="${esc(val)}" ${attrs}></label>`;
const select = (k, id, opts, value = "", attrs = "", glyph = "") =>
  `<label class="field"><span>${glyph ? icon(glyph) : ""}${esc(t(k))}</span><select id="${id}" ${attrs}>${opts
    .map((o) => {
      const [v, label] = Array.isArray(o) ? o : [o, t(o)];
      return `<option value="${esc(v)}" ${(Array.isArray(value) ? value.includes(v) : v === value) ? "selected" : ""}>${esc(label)}</option>`;
    })
    .join("")}</select></label>`;
const check = (k, id, on) =>
  `<label class="field inline"><input type="checkbox" id="${id}" ${on ? "checked" : ""}><span>${esc(t(k))}</span></label>`;
const note = (k, cls = "") => `<p class="notice ${cls}">${esc(t(k))}</p>`;
const help = (k) => `<details class="form-help"><summary>${esc(t("help.rules"))}</summary>${note(k)}</details>`;
const heading = (k, desc = "", actions = "", title = "") =>
  `<div class="page-head"><div><h1 tabindex="-1">${esc(title || t(k))}</h1>${desc ? `<p>${esc(t(desc))}</p>` : ""}</div>${actions ? `<div class="actions">${actions}</div>` : ""}</div>`;
const chips = (words) =>
  `<div class="chips">${words.map((w) => `<span class="chip">${esc(w)}</span>`).join("")}</div>`;
const mark = `<svg viewBox="0 0 44 44" fill="none" aria-hidden="true"><rect x="2" y="2" width="40" height="40" rx="14" fill="#e4efcf"/><path d="M8 24c7-13 18-14 28-5" stroke="#21654e" stroke-width="2.2" stroke-linecap="round"/><path d="M9 18c8 14 19 15 27 6" stroke="#bd6f2f" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="20.5" r="2.2" fill="#21654e"/><circle cx="32" cy="22" r="2.2" fill="#bd6f2f"/></svg>`;
const empty = (title = "empty", desc = "", action = "") =>
  `<div class="empty"><div class="seal" aria-hidden="true">${icon(title.startsWith("create.") ? "file-pen-line" : "inbox")}</div><h2>${esc(t(title))}</h2>${desc ? `<p>${esc(t(desc))}</p>` : ""}${action}</div>`;
const toastNode = $("#toast");
const toastMotion = matchMedia("(prefers-reduced-motion: reduce)");
let toastAnimation = null, toastFade = 0;
function hideToast() {
  clearTimeout(toastTimer);
  toastNode.classList.remove("visible");
  if (toastNode.matches(":popover-open")) toastNode.hidePopover();
  toastAnimation?.cancel();
  toastAnimation = null;
  positionToast();
}
toastMotion.addEventListener("change", ({ matches }) => {
  if (!matches || !toastAnimation) return;
  const remaining = toastAnimation.effect.getTiming().duration - toastAnimation.currentTime;
  const exiting = remaining <= toastFade;
  toastAnimation.cancel();
  toastAnimation = null;
  if (exiting) hideToast();
  else toastTimer = setTimeout(hideToast, remaining);
});
function positionToast() {
  const modal = $("#dialog");
  modal.classList.remove("with-toast-space");
  modal.style.removeProperty("--toast-clearance");
  if (!modal.open || !toastNode.classList.contains("visible")) return;
  const feedback = toastNode.getBoundingClientRect(), box = modal.getBoundingClientRect();
  if (feedback.top < box.bottom + 12 && feedback.bottom > box.top) {
    modal.style.setProperty("--toast-clearance", `${innerHeight - feedback.top + 12}px`);
    modal.classList.add("with-toast-space");
  }
}
function syncToastLayer() {
  const modal = $("#dialog"), host = modal.open ? modal : document.body;
  // Keep the status in the active modal's accessible subtree, then above its backdrop.
  if (toastNode.matches(":popover-open")) toastNode.hidePopover();
  if (toastNode.parentElement !== host) host.append(toastNode);
  toastNode.classList.toggle("on-modal", modal.open);
  if (toastNode.classList.contains("visible")) toastNode.showPopover();
  positionToast();
}
function toast(k, v = {}) {
  clearTimeout(toastTimer);
  toastAnimation?.cancel();
  toastAnimation = null;
  const isWelcome = k === "welcome" || k.startsWith("welcome.") || k === "g.welcome.new";
  if (k === "welcome") {
    const elapsed = document.createElement("strong");
    elapsed.className = "toast-days";
    elapsed.textContent = t("welcome.elapsed", v);
    toastNode.replaceChildren(...COPY.templates[lang + ".welcome"].split(/(\{\w+\})/g).map(part =>
      part === "{elapsed}" ? elapsed : document.createTextNode(part === "{name}" ? String(v.name ?? "") : part)
    ));
  } else toastNode.textContent = t(k, v);
  toastNode.classList.add("visible");
  syncToastLayer();
  const dwell = isWelcome ? 10000 : 5000;
  toastFade = toastMotion.matches ? 0 : parseFloat(getComputedStyle(toastNode).getPropertyValue("--toast-fade"));
  const duration = dwell + toastFade * 2;
  // One timeline survives dialog reparenting and pagination without replaying the entrance.
  if (toastFade) {
    const animation = toastNode.animate([
      { opacity: 0, offset: 0, easing: "ease-out" },
      { opacity: 1, offset: toastFade / duration },
      { opacity: 1, offset: (toastFade + dwell) / duration, easing: "ease-in" },
      { opacity: 0, offset: 1 },
    ], { duration, fill: "both" });
    toastAnimation = animation;
    animation.finished.then(() => {
      if (toastAnimation === animation) hideToast();
    }, () => {}); // A replacement or reduced-motion preference may cancel it.
  } else toastTimer = setTimeout(hideToast, dwell);
}
function dialog(title, body, actions = "", reading = null) {
  opener = document.activeElement;
  // Notice pagination replaces dialog content; retain the same toast and its timer.
  if (toastNode.parentElement === $("#dialog")) {
    if (toastNode.matches(":popover-open")) toastNode.hidePopover();
    document.body.append(toastNode);
  }
  $("#dialog").classList.toggle("notice-dialog", !!reading);
  $("#dialog").innerHTML = reading
    ? `${B("close", "close", "quiet dialog-close", false, `aria-label="${esc(t("close"))}"`)}<header class="notice-heading"><p class="eyebrow">${icon("bell")}${esc(t(title))}</p><h2 id="dialog-title">${esc(reading.title)}</h2><p class="notice-meta">${esc(reading.meta || "")}</p></header><div class="notice-reading" tabindex="0" role="region" aria-label="${esc(t("notice.reading"))}">${body}</div><footer class="dialog-actions">${actions || B("close", "close", "primary")}</footer>`
    : `${B("close", "close", "quiet dialog-close", false, `aria-label="${esc(t("close"))}"`)}<h2 id="dialog-title">${esc(t(title))}</h2>${body}<div class="dialog-actions">${actions || B("close", "close")}</div>`;
  DS.enhance();
  if (!$("#dialog").open) $("#dialog").showModal();
  syncToastLayer();
}
$("#dialog").addEventListener("close", () => {
  syncToastLayer();
  if (opener?.isConnected) opener.focus();
  else $("h1")?.focus();
});
window.addEventListener("resize", positionToast);
function close() {
  $("#dialog")
    .querySelectorAll('input[type="password"]')
    .forEach((input) => {
      input.value = "";
    });
  $("#dialog").close();
}
const markdown = renderMarkdown;
const DS = createSelectDesign({ icon });
function localeControl() { return `<label class="locale-control"><span class="sr-only">${esc(t("language"))}</span><select id="site-language" aria-label="${esc(t("language"))}"><option value="zh" ${lang === "zh" ? "selected" : ""}>中文</option><option value="en" ${lang === "en" ? "selected" : ""}>EN</option></select></label>`; }

const accountViews = ["profile", "growth", "bag", "shop"];
function accountLinks() {
  return accountViews
    .map(
      (p) =>
        `<a href="?page=${p}&lang=${lang}" data-go="${p}" ${page === p ? 'aria-current="page"' : ""}>${icon(routeIcons[p])}${esc(t(p))}</a>`,
    )
    .join("");
}
function header() {
  return `<header class="topbar"><div class="container header-inner"><a class="brand" href="?page=home" data-go="home">${mark}${esc(t("brand"))}</a><nav class="nav" aria-label="${esc(t("mainnav"))}">${["home", "explore", "create", "range", "library"].map((p) => link(p, "nav." + p)).join("")}</nav><div class="header-actions">${localeControl()}${S.guest ? "" : link("notices", "notices", "btn quiet")}${S.guest ? B("login", "login", "primary") + B("i.register", "identity-register", "quiet") : `<details class="account-dropdown"><summary aria-label="${esc(t("accountmenu"))}"><span class="avatar" aria-hidden="true">${esc((S.nickname || F.user.username).slice(0, 1))}</span><span class="user-name">${esc(S.nickname || F.user.username)}</span>${icon("chevron-down", "dropdown-chevron")}</summary><nav class="account-popover" aria-label="${esc(t("accountmenu"))}">${accountLinks()}</nav></details>`}</div></div></header>`;
}
function accountShell(content) {
  const name = S.nickname || F.user.username;
  return `<div class="account-layout"><aside class="account-sidebar" aria-label="${esc(t("accountinfo"))}"><div class="account-identity"><div class="avatar profile-avatar" aria-hidden="true">${esc(name[0])}</div><div><h2>${esc(name)}</h2><p class="muted">@${esc(F.user.username)}</p></div></div><dl class="account-facts"><div class="account-plan"><dt>${icon("layers")}${esc(t("a.baseplan"))}</dt><dd>${esc(t("a.plan." + BD.base().code))}</dd></div><div class="account-plan"><dt>${icon("sparkles")}${esc(t("account.effective"))}</dt><dd>${esc(t("a.plan." + BD.plan().code))}</dd></div><div><dt>${esc(t("lastlogin"))}</dt><dd>${esc(F.user.lastLogin)}</dd></div><div><dt>${esc(t("lastlearn"))}</dt><dd>${scene === "empty" ? "—" : esc(F.user.lastLearn || "—")}</dd></div></dl><nav class="account-nav" aria-label="${esc(t("accountnav"))}">${accountLinks()}</nav></aside><div class="account-content">${content}</div></div>`;
}
function home() {
  return `<section class="home-hero" data-region="hero"><div class="home-intro"><p class="home-kicker">${icon("sparkles")}${esc(t("hero.eyebrow"))}</p><h1>${esc(t("hero.title"))}</h1><p class="home-description">${esc(t("hero.desc"))}</p><div class="home-actions"><a class="btn primary" data-go="create" href="?page=create&lang=${lang}">${icon("notebook-pen")}${esc(t("hero.cta"))}</a><a class="btn home-secondary" data-go="explore" href="?page=explore&lang=${lang}">${esc(t("hero.secondary"))}${icon("arrow-right")}</a></div></div><div class="home-example"><div class="home-card-stack" data-top="1" data-motion="paused">${F.hero.stories.map((story, index) => `<article class="home-paper home-paper-${index === 0 ? "back" : "front"}" tabindex="0" aria-labelledby="home-story-${index}"><div class="home-paper-meta"><span>${icon("sparkles")}${esc(t("hero.sample"))}</span><span>${esc(t("a.preset.style.Story"))} · ${esc(t("a.preset.length.Brief"))}</span></div><h2 id="home-story-${index}" lang="en">${esc(story.title)}</h2><div class="home-word-row" aria-label="${esc(t("words"))}">${story.words.map((w, i) => `<span class="home-word home-word-${i % 3}" lang="en">${esc(w)}</span>`).join("")}</div><p class="home-story" lang="en">${story.parts.map(x => typeof x === "string" ? esc(x) : `<mark>${esc(x.word)}</mark>`).join("")}</p><div class="home-word-meaning">${icon("book-open-text")}<div><strong lang="en">${esc(story.meaningWord)}</strong><span>${esc(F.dictionary[story.meaningWord].meaning[lang])}</span></div></div></article>`).join("")}</div></div></section><section class="home-path" aria-label="${esc(t("hero.steps"))}">${["choose", "read", "review"].map((x, i) => `<article class="home-step"><span class="home-step-icon home-step-${i}">${icon(["shuffle", "book-open", "clipboard-check"][i])}</span><div><h2>${esc(t("path." + x))}</h2><p>${esc(t("path." + x + ".desc"))}</p></div></article>`).join("")}</section><section class="home-why" aria-labelledby="why-title" data-region="why-wordweave"><header><p class="eyebrow">${esc(t("why.eyebrow"))}</p><h2 id="why-title">${esc(t("why.title"))}</h2></header><div class="why-features">${["choose", "ai", "language"].map((key, i) => `<article class="why-feature"><span class="why-icon why-icon-${i}">${icon(["shuffle", "sparkles", "languages"][i])}</span><h3>${esc(t("why." + key + ".title"))}</h3><p>${esc(t("why." + key + ".desc"))}</p></article>`).join("")}</div></section>`;
}
const HM = createHomeMotion();
const PG = createPresetGallery({ F, t, esc, B, chips, heading, empty, link, render, scene: () => scene });
function explore() { return PG.view(); }

function generationSnapshot() {
  const locked = page === "trial",
    pre = F.presets[S.preset] || generationExample;
  const words = locked ? pre.words : S.selected;
  const language = locked
    ? pre.language
    : { chinese: "中文", english: "English", japanese: "日本語" }[S.explain];
  const targetLang =
    language === "English" ? "en" : language === "日本語" ? "ja" : "zh";
  const targets = words.map((w) => ({
    ...structuredClone(F.dictionary[w]),
    meaningText: F.dictionary[w].meaning[targetLang],
  }));
  const original = F.library.find(
    (b) => b.targets.map((x) => x.word).join("|") === words.join("|"),
  );
  const passage = original
    ? structuredClone(original.passage)
    : words.flatMap((w, group) => [
        F.generatedSentences[w][0],
        { answer: w, group },
        F.generatedSentences[w][1],
      ]);
  return {
    title: words.join(" · "),
    targets,
    passage,
    tags:
      targetLang === "zh"
        ? ["日常", "成长"]
        : targetLang === "ja"
          ? ["日常", "成長"]
          : ["Everyday", "Growth"],
    model: locked ? pre.model : S.model,
    style: locked ? pre.style : S.style,
    length: locked ? pre.length : S.length,
    language,
  };
}
function trialConfiguration(pre) {
  const names = {
    style: { story: "Story", discussion: "Discussion", business: "Business", news: "News" },
    length: { brief: "Brief", standard: "Standard", extended: "Extended", deep: "Deep Dive", "deep dive": "Deep Dive" },
    language: { chinese: "中文", "中文": "中文", english: "English", japanese: "日本語", "日本語": "日本語" },
  };
  const label = (kind, value) => {
    const key = names[kind][String(value).toLowerCase()];
    return key ? t("a.preset." + kind + "." + key) : value;
  };
  const facts = [
    ["style", label("style", pre.style), "book-open"],
    ["length", label("length", pre.length), "layers"],
    ["explain", label("language", pre.language), "book-open-text"],
  ];
  return `<div class="trial-model"><div class="trial-model-icon">${icon("bot")}</div><dl><dt>${esc(t("model"))}</dt><dd>${esc(pre.model)}</dd></dl></div><dl class="trial-config-facts">${facts.map(([key, value, glyph]) => `<div class="trial-config-row"><dt>${icon(glyph)}<span>${esc(t(key))}</span></dt><dd>${esc(value)}</dd></div>`).join("")}</dl>`;
}
function creationConfiguration(availableModels, lengths) {
  const styles = ["Story", "Discussion", "Business", "News"].map(value => [value.toLowerCase(), t("a.preset.style." + value)]);
  const lengthNames = { brief: "Brief", standard: "Standard", extended: "Extended", deep: "Deep Dive" };
  const languages = [["chinese", "中文"], ["english", "English"], ["japanese", "日本語"]].map(([value, label]) => [value, t("a.preset.language." + label)]);
  return `<div class="creation-model">${select("model", "model", [["", t("select")], ...availableModels.map(value => [value, value])], S.model, `${scene === "nomodel" ? "disabled" : ""} title="${esc(S.model || t("select"))}"`, "bot")}</div><div class="creation-options">${select("style", "style", styles, S.style, "", "book-open")}${select("length", "length", [["", t("select")], ...lengths.map(value => [value, t("a.preset.length." + lengthNames[value])])], S.length, "", "layers")}${select("explain", "explain", [["", t("select")], ...languages], S.explain, "", "book-open-text")}</div>`;
}
function generation(locked) {
  const pre = F.presets[S.preset] || (locked ? null : generationExample);
  if (!pre)
    return (
      heading("preset.title") +
      note("preset.invaliddesc", "error") +
      link("explore", "explore", "btn")
    );
  const words = locked ? pre.words : S.selected,
    busy = ["running", "done"].includes(S.generation);
  const unavailable = ["noquota", "invalid", "nomodel", "nolength"].includes(
    scene,
  );
  const plan = BD.plan();
  BD.quota();
  const availableModels = BD.models();
  if (!locked && !availableModels.includes(S.model)) S.model = "";
  const lengths =
    scene === "nolength"
      ? []
      : plan.lengths.map(
          (x) =>
            ({
              short: "brief",
              medium: "standard",
              long: "extended",
              xlong: "deep",
            })[x],
        );
  if (!locked && !lengths.includes(S.length)) S.length = "";
  let result = empty("create.empty", "create.emptydesc");
  if (S.generation === "running")
    result = `<div class="article"><p class="eyebrow">${esc(t("create.generating"))}</p><p class="story-text" aria-live="polite">${esc(S.output)}▍</p>${B("cancelgen", "cancelgen")}</div>`;
  if (S.generation === "done")
    result = `<div class="article"><p class="eyebrow">${esc(t("create.done"))}</p><h2>${esc(S.generated.title)}</h2><p class="story-text">${LD.fullPassage(S.generated)}</p>${chips(S.generated.tags)}${LD.resources(S.generated)}<div class="actions">${B(S.guest ? "guestcollect" : "collect", "collect", "primary")}${B("l.discard", "discard", "quiet")}</div></div>`;
  if (["failure", "cancelled"].includes(S.generation))
    result = empty(
      "create." + S.generation,
      S.generation === "failure" ? "l.refunded" : "l.cancel.charged",
      B("retry", "generate", "primary"),
    );
  return `${heading(locked ? "preset.title" : "create.title", locked ? "preset.desc" : "create.desc", `<span class="pill quota-detail">${esc(scene === "noquota" ? t("b.quota", { plan: 0, extra: 0 }) : BD.quotaText())}</span>`, locked ? pre.title : "")}${locked && scene === "invalid" ? note("preset.invaliddesc", "error") : ""}<div class="workspace"><details class="settings ${locked ? "trial-settings" : "creation-settings"}" ${innerWidth > 1100 || locked ? "open" : ""}><summary>${locked ? `<span class="trial-settings-title">${icon("lock-keyhole")}<span>${esc(t("trial.config.title"))}</span><span class="sr-only">${esc(t("preset.locked"))}</span></span>${icon("chevron-down", "trial-settings-chevron")}` : `<span class="creation-settings-title">${icon("sparkles")}<span>${esc(t("config"))}</span></span>${icon("chevron-down", "creation-settings-chevron")}`}</summary><fieldset class="generation-fields" ${busy ? "disabled" : ""}><div class="config-fields">${
    locked
      ? trialConfiguration(pre)
      : creationConfiguration(availableModels, lengths)
  }</div></fieldset></details><div><section class="panel"><div class="section-head"><div><h2>${esc(t("words"))}</h2><small>${esc(t("wordcount", { count: words.length, limit: locked ? words.length : plan.maxEntries }))}</small></div>${locked ? badge("preset.locked") : B("random", "random", "small", busy)}</div><div class="chips">${words.map((w, i) => `<span class="chip">${esc(w)}${locked ? "" : `<button type="button" class="btn quiet small" data-action="remove-word:${i}" ${busy ? "disabled" : ""} aria-label="${esc(t("remove"))} ${esc(w)}">${icon("x")}</button>`}</span>`).join("")}</div>${locked ? "" : `<fieldset class="generation-fields" ${busy ? "disabled" : ""}><div class="form-actions"><label class="field"><span>${esc(t("wordsearch"))}</span><input id="wordsearch" list="wordlist" autocomplete="off"><datalist id="wordlist">${F.candidates.map((w) => `<option value="${esc(w)}"></option>`).join("")}</datalist></label>${B("add", "add-word")}</div></fieldset>`}${scene === "noquota" ? note("noquota.desc", "warn") : scene === "nomodel" ? note("nomodel.desc", "warn") : scene === "nolength" ? note("l.nolength", "warn") : ""}<div class="actions">${B("start", "generate", "primary", unavailable || S.quota === 0 || busy || (!locked && (!S.model || !S.explain || !words.length || !S.length)), 'id="generate"')}</div></section><section class="panel" style="margin-top:22px" data-region="generation-result">${result}</section></div></div>`;
}
function review() {
  return LD.review();
}
function saveDraft() {
  LD.saveDraft();
}
function growth() { return GD.view(); }
const itemDesc = (x) =>
  t(
    x.type === "model"
      ? "card.modelnote"
      : x.type === "plan"
        ? "card.plannote"
        : x.type === "count"
          ? "card.countnote"
          : "makeup.desc",
  );
function bag(shop = false) {
  return `${heading(shop ? "shop.title" : "bag.title", shop ? "shop.desc" : "bag.desc", `<div class="account-balance">${icon("diamond")}<div><span>${esc(t("account.balance"))}</span><strong>${S.points}</strong></div></div>`)}<div class="account-items ${shop ? "account-shop" : "account-bag"}">${
    scene === "empty"
      ? empty(
          shop ? "shop.empty" : "bag.empty",
          "",
          shop ? "" : link("shop", "shop", "btn primary"),
        )
      : `<div class="items-grid">${(shop
          ? S.items.map((_, i) => ({ type: i }))
          : S.inventory
        )
          .filter((x) => !shop || S.items[x.type].listed)
          .map((v, i) => {
            const x = shop ? S.items[v.type] : BD.definition(v),
              retired =
                !shop && BD.refundable(v),
              covered = !shop && x.type === "model" && v.status === "unused" && (BD.covered(x) || scene === "covered"),
              expired = scene === "expired" || v.status === "used",
              active = v.status === "active" || scene === "active";
            return `<article class="item item-${x.type}"><div class="item-heading"><span class="item-symbol" aria-hidden="true">${icon(({model:"bot",count:"ticket",plan:"gem",makeup:"calendar-check"})[x.type])}</span><h2>${esc(L(x.title))}</h2>${shop ? "" : badge(retired ? "retired" : v.status === "used" ? "b.used" : expired ? "expired" : active ? "active" : v.status)}</div><div class="item-body">${shop ? `${x.type === "makeup" ? "" : `<p class="item-effect">${esc(BD.effect(x))}</p>`}<p class="item-rule">${esc(itemDesc(x))}</p><p class="item-validity">${icon("calendar-days")}${esc(t("account.redeem.days", { days: x.days }))}</p>` : `${x.type === "makeup" ? `<p class="item-rule">${esc(itemDesc(x))}</p>` : ""}${BD.details(v)}${x.type === "makeup" ? "" : `<p class="item-rule">${esc(itemDesc(x))}</p>`}`}${covered ? note("covered", "warn") : ""}</div><div class="item-footer">${shop ? `<strong class="item-price">${esc(t("pricevalue", { count: x.price }))}</strong>` : retired ? `<strong class="item-price">${esc(t("pricevalue", { count: S.items[v.type].refund }))}</strong>` : ""}${B(shop ? "redeem" : retired ? "refund" : x.type === "makeup" ? "makeup" : x.type === "count" ? "use" : "activate", (shop ? "redeem:" : retired ? "refund:" : "use:") + (shop ? v.type : i), "primary", !shop && !retired && (covered || expired || active || v.status === "refunded"))}</div></article>`;
          })
          .join("")}</div>`
  }</div>`;
}
function profile() {
  return `${heading("profile.title", "profile.desc")}<div class="profile-sections"><section class="panel profile-form-panel"><div class="account-section-head">${icon("user")}<h2>${esc(t("account.details"))}</h2></div><form id="profile-form"><div class="form-grid">${field("nickname", "nickname", S.nickname, "text", 'autocomplete="nickname" aria-describedby="nickname-hint"')}${select("gender", "gender", ["unspecified", "female", "male"], S.gender || "unspecified")}</div><div class="profile-save-row"><p id="nickname-hint" class="field-help">${esc(t("account.nickname.hint"))}</p>${B("save", "profile-save", "primary")}</div></form></section><section class="panel profile-security"><div class="account-section-head">${icon("lock-keyhole")}<h2>${esc(t("account.security"))}</h2></div>${[["password", "account.password.hint", "password", "lock-keyhole"], ["logout", "account.logout.hint", "logout", "log-out"], ["deleteaccount", "deleteaccount.desc", "delete-account", "trash"]].map(([title, desc, action, glyph]) => `<div class="security-row ${action === "delete-account" ? "security-delete" : ""}"><span class="security-icon" aria-hidden="true">${icon(glyph)}</span><div><h3>${esc(t(title))}</h3><p>${esc(t(desc))}</p></div>${B(title, action, action === "delete-account" ? "danger quiet" : "")}</div>`).join("")}</section></div>`;
}
function notices() {
  const rows = F.notices
    .filter(n => n.visible)
    .sort((a, b) => Number(b.remind) - Number(a.remind) || b.date.localeCompare(a.date));
  return `<div class="notices-page" data-region="notice-index">${heading("notices.title").replace('<h1 ', '<h1 id="notice-index-title" ')}${
    scene === "empty" || !rows.length
      ? `<section class="notice-empty">${empty()}</section>`
      : `<ul class="notice-list" aria-labelledby="notice-index-title">${rows.map(n => `<li><button type="button" class="notice-entry" data-action="notice:${F.notices.indexOf(n)}"><time class="notice-entry-date" datetime="${esc(n.date)}">${esc(n.date)}</time><span class="notice-entry-copy"><span class="notice-entry-title">${esc(L(n.title))}</span></span>${icon("chevron-right", "notice-entry-arrow")}</button></li>`).join("")}</ul>`
  }</div>`;
}
function noticeDialog(i) {
  const pool = F.notices
    .map((n, index) => ({ ...n, index }))
    .filter((n) => n.visible && (!S.reminderMode || n.remind))
    .sort(
      (a, b) =>
        Number(b.remind) - Number(a.remind) || b.date.localeCompare(a.date),
    );
  if (!pool.length) return;
  let at = pool.findIndex((x) => x.index === i);
  if (at < 0) at = 0;
  const n = pool[at];
  S.noticeIndex = n.index;
  dialog(
    "notices.title",
    `<div class="markdown">${markdown(L(n.body))}</div>`,
    B("previous", "notice:" + pool[Math.max(0, at - 1)].index, "", at === 0) +
      B(
        "next",
        "notice:" + pool[Math.min(pool.length - 1, at + 1)].index,
        "",
        at === pool.length - 1,
      ) +
      B("close", "close", "primary"),
    { title: scene === "long-title" ? L(F.noticeLongTitle) : L(n.title), meta: `${n.date} · ${t("position", { index: at + 1, total: pool.length })}` },
  );
}
function loginNotice() {
  S.reminderMode = true;
  noticeDialog(-1);
}

const AD = createAdminDesign({
  S,
  F,
  t,
  L,
  esc,
  B,
  field,
  select,
  check,
  note,
  help,
  heading,
  badge,
  link,
  dialog,
  close,
  toast,
  render,
  go,
  mark,
  scene: () => scene,
  page: () => page,
  language: () => lang,
  learning: () => LD,
  forget: () => formMemory.clear(),
});
const OD = createOperationsDesign({
  AD,
  S,
  F,
  t,
  L,
  esc,
  B,
  field,
  select,
  check,
  note,
  help,
  dialog,
  close,
  render,
  forget: () => formMemory.clear(),
});
const PD = createPresetDesign({
  AD,
  F,
  t,
  L,
  esc,
  B,
  field,
  select,
  note,
  help,
  heading,
  badge,
  dialog,
  close,
  render,
  scene: () => scene,
  page: () => page,
  forget: () => formMemory.clear(),
});
function admin(content) {
  return AD.shell(content);
}
function models() {
  return AD.models();
}
function messages() {
  const n = F.notices[S.message];
  return admin(
    `${heading("a.messages", "a.messages.desc", B("newmessage", "new-message", "primary"))}<div class="admin-master-detail"><section class="panel admin-records"><h2>${esc(t("a.message.list"))}</h2>${F.notices.map((x, i) => `<button class="admin-record ${i === S.message ? "selected" : ""}" data-action="message:${i}"><strong>${esc(L(x.title) || t("a.untitled"))}</strong><span>${esc(x.date)} · ${esc(t(x.visible ? "visible" : "a.hidden"))}${x.remind ? " · " + esc(t("remind")) : ""}</span></button>`).join("")}</section><section class="panel"><div class="form-grid">${field("name.zh", "message-zh", n.title.zh)}${field("name.en", "message-en", n.title.en)}</div><div class="form-grid">${["zh", "en"].map((l) => `<label class="field"><span>${esc(t("markdown"))} · ${l}</span><textarea id="body-${l}">${esc(n.body[l] || "")}</textarea></label>`).join("")}</div><div class="actions">${check("visible", "visible", n.visible)}${check("remind", "remind", n.remind)}</div>${help("a.message.rule")}<div class="actions form-footer">${B("preview", "message-preview")}${B("save", "message-save", "primary")}</div></section></div>`,
  );
}
function operations() {
  let body;
  if (S.optab === "itemsettings")
    body = `<p class="muted">${esc(t("item.rule"))}</p><div class="toolbar">${field("search", "item-search", "", "search")}${select("type", "type-filter", [["", t("all")], ...F.items.map((x) => [x.type, L(x.title)])])}${select("status", "status-filter", [["", t("all")], "listed", "unlisted"])}${B("newitem", "item-new", "primary")}</div><div class="table-wrap"><table class="data-table"><thead><tr>${["name.zh", "type", "price", "status", "edit"].map((k) => `<th>${esc(t(k))}</th>`).join("")}</tr></thead><tbody>${S.items.map((x, i) => `<tr data-item-row data-name="${esc(L(x.title))}" data-type="${x.type}" data-listed="${x.listed ? "listed" : "unlisted"}"><td>${esc(L(x.title))}</td><td>${esc(L(F.items.find((y) => y.type === x.type).title))}</td><td>${x.price}</td><td>${badge(x.listed ? "listed" : "unlisted")}</td><td><div class="actions">${B("edit", "item-edit:" + i, "small")}${B(x.listed ? "unlist" : "list", "item-list:" + i, "small")}${B("refs", "item-refs:" + i, "small")}${B("delete", "item-delete:" + i, "small danger")}</div></td></tr>`).join("")}</tbody></table></div>`;
  else body = OD.body();
  return admin(
    `${heading("operations", "admin.desc")}<div class="tabs">${["signsettings", "levelsettings", "achievementsettings", "itemsettings"].map((k) => B(k, "optab:" + k, k === S.optab ? "selected" : "")).join("")}</div><section class="panel">${body}</section>`,
  );
}
function itemForm(index = -1, type = "model") {
  const x =
    index >= 0
      ? S.items[index]
      : {
          ...F.items.find((x) => x.type === type),
          title: { zh: "", en: "" },
          listed: false,
        };
  S.editItem = index;
  S.editType = x.type;
  dialog(
    index >= 0 ? "edit" : "newitem",
    `${note("item.rule")}${select(
      "type",
      "item-type",
      F.items.map((x) => [x.type, L(x.title)]),
      x.type,
      index >= 0 ? "disabled" : "",
    )}<div class="form-grid">${field("name.zh", "item-zh", x.title.zh)}${field("name.en", "item-en", x.title.en)}</div><div class="form-grid">${field("desc.zh", "item-desc-zh", x.desc?.zh || "")}${field("desc.en", "item-desc-en", x.desc?.en || "")}${field("price", "item-price", x.price, "number", 'min="0"')}${field("deadline", "item-days", x.days, "number", 'min="1"')}</div>${
      x.type === "model"
        ? `${select(
            "model",
            "item-model",
            AD.activeModels().map((m) => [m.name, m.name]),
            x.models || [],
            "multiple",
          )}${field("duration", "item-duration", x.duration, "number", 'min="1"')}${field("retirementpoints", "item-refund", x.refund, "number", 'min="0"')}`
        : x.type === "plan"
          ? `${select(
              "plan",
              "item-plan",
              AD.A.plans
                .filter((p) => p.code !== "visitor")
                .map((p) => [p.code, AD.planName(p.code)]),
              x.plan,
            )}${field("duration", "item-duration", x.duration, "number", 'min="1"')}`
          : x.type === "count"
            ? field("count", "item-count", x.count, "number", 'min="1"')
            : ""
    }${note("item.effect")}`,
    B("cancel", "close") + B("save", "item-save", "primary"),
  );
}
function credits() {
  return AD.userdetail("points");
}
function presets() {
  return PD.page();
}
function metricDetails() {
  const missing = scene === "empty";
  const m = F.metrics;
  return `<section class="panel" style="margin-top:22px"><div class="section-head"><h2>${esc(t("retention"))}</h2>${select("period", "metric-period", ["days7", "days30"], "days7")}</div><svg viewBox="0 0 640 180" role="img" aria-label="${esc(t("retention"))}" style="width:100%;max-height:230px"><path d="M30 10V145H620" fill="none" stroke="#a7b7a8"/>${missing ? "" : `<path d="M30 80L120 65L210 73L300 54L390 60L480 48L590 55" stroke="#21654e" stroke-width="3" fill="none"/><path d="M30 118L120 110L210 105L300 108L390 92L480 98L590 88" stroke="#a65c31" stroke-dasharray="7 4" stroke-width="3" fill="none"/>`}<text x="40" y="172" fill="#5f6d65" font-size="12">09-11</text><text x="550" y="172" fill="#5f6d65" font-size="12">09-17</text></svg><p class="muted">D1 —　D7 ┄　D30 · ${esc(t(missing ? "nosample" : "observing"))}</p><div class="table-wrap"><table class="data-table"><tbody>${[
    ["bounce", m.bounce],
    ["a.metrics.reviewSuccess", m.reviewSuccess],
    ["a.metrics.sameDayActivation", m.sameDayActivation],
    ["a.metrics.requestFailed", m.requestFailed],
    ["a.metrics.requestCancelled", m.requestCancelled],
    ["a.metrics.requestRunning", m.requestRunning],
    ["a.metrics.precheck", m.precheck],
    ["gens", m.generated],
    ["savecount", m.saved],
    ["reviewfreq", m.frequency],
    ["adminusage", m.previews],
  ]
    .map(
      ([k, v]) =>
        `<tr><th>${esc(t(k))}</th><td>${missing ? esc(t("nosample")) : esc(v)}</td></tr>`,
    )
    .join(
      "",
    )}</tbody></table></div><p class="muted">${esc(t("metrics.separate"))}</p></section>`;
}
function metrics() {
  const val = scene === "empty" ? t("nosample") : null;
  return admin(
    `${heading("metrics.title", "metrics.time", `<span class="muted">${esc(t("updated", { time: "12:04" }))}</span>`)}${scene === "delayed" ? note("delayed", "warn") : ""}<div class="metrics-grid">${[
      ["uv", "1,248"],
      ["pv", "3,920"],
      ["wau", "286"],
      ["failure", "2.4%"],
    ]
      .map(
        ([k, v]) =>
          `<div class="metric"><small>${esc(t(k))}</small><strong>${esc(val || v)}</strong></div>`,
      )
      .join(
        "",
      )}</div><div class="split"><section class="panel"><h2>${esc(t("traffic"))}</h2><div class="chart" role="img" aria-label="${esc(t("traffic"))}">${[38, 50, 43, 68, 80, 56, 95].map((h, i) => `<div class="bar" style="height:${scene === "empty" ? 0 : h}%"><span>${11 + i}</span></div>`).join("")}</div><div class="answer-row"><span>${esc(t("channel"))}</span><span>UTM / Direct / Referrer</span></div></section><section class="panel"><h2>${esc(t("funnel"))}</h2>${[
      ["registered", "18.6%", 85],
      ["activated", "62.4%", 62],
      ["completed", "78.2%", 78],
    ]
      .map(
        ([k, v, w]) =>
          `<div class="answer-row"><span>${esc(t(k))}</span><strong>${esc(val || v)}</strong></div><div class="progress"><span style="width:${scene === "empty" ? 0 : w}%"></span></div>`,
      )
      .join(
        "",
      )}</section></div><section class="panel" style="margin-top:22px"><h2>${esc(t("retention"))}</h2><div class="stats">${["D1", "D7", "D30"].map((x, i) => `<div><small>${x}</small><strong>${esc(val || (i === 2 ? t("observing") : i === 1 ? "24.6%" : "41.2%"))}</strong></div>`).join("")}</div><div class="actions" style="margin-top:24px">${B("metrics.definition", "metric-info")}${B("clarity", "clarity")}</div><p class="muted" style="margin-top:20px">${esc(t("clarity.note"))}</p></section>${metricDetails()}`,
  );
}
const LD = createLearningDesign({
  S,
  F,
  t,
  L,
  esc,
  B,
  field,
  note,
  help,
  heading,
  link,
  empty,
  dialog,
  close,
  toast,
  render,
  go,
  params,
  configurationSnapshot: trialConfiguration,
  scene: () => scene,
  page: () => page,
});
const ID = createIdentityDesign({
  S,
  F,
  t,
  esc,
  B,
  field,
  note,
  help,
  heading,
  dialog,
  close,
  toast,
  go,
  render,
  params,
  LD,
  loginNotice,
  page: () => page,
  scene: () => scene,
});
const BD = createBenefitsDesign({ S, F, AD, t, L, esc, B, note, dialog, close, toast, render, scene: () => scene });
const GD = createGrowthDesign({ S, F, AD, BD, t, L, esc, B, note, heading, link, badge, scene: () => scene, render, toast });
const renderers = {
  library: LD.library,
  batch: LD.detail,
  range: LD.range,
  sessiondone: LD.done,
  login: () => ID.view(false),
  register: () => ID.view(true),
  home,
  explore,
  create: () => generation(false),
  trial: () => generation(true),
  review,
  overview: review,
  summary: review,
  growth,
  bag,
  shop: () => bag(true),
  profile,
  notices,
  adminhome: AD.home,
  plans: AD.plans,
  users: AD.users,
  userdetail: AD.userdetail,
  models,
  messages,
  operations,
  credits,
  presets,
  metrics,
};
function render(focus = false) {
  const creationOpen = $(".creation-settings")?.open;
  document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  document.title =
    t("brand") + " · " + (routes[page] || "") + " · " + DESIGN_VERSION;
  const content = ["loading", "error"].includes(scene)
    ? empty(
        scene,
        "",
        scene === "error" ? B("retry", "scene-normal", "primary") : "",
      )
    : (renderers[page] || home)();
  $("#app").innerHTML =
    (AD.pages.includes(page) ? AD.header() : header()) +
    `<main class="container ${page === "home" ? "" : "page"}" data-page="${routes[page]}" id="main">${accountViews.includes(page) ? accountShell(content) : AD.pages.includes(page) && ["loading", "error"].includes(scene) ? admin(content) : content}</main><footer class="container footer"><div class="actions"><span>${esc(t("footer"))}</span></div></footer>`;
  $$(".nav a").forEach((a) => {
    if (
      a.dataset.go ===
      (page === "trial"
        ? "explore"
        : page === "batch"
          ? "library"
          : ["review", "overview", "summary", "sessiondone"].includes(page)
            ? "range"
            : page)
    )
      a.setAttribute("aria-current", "page");
  });
  if (creationOpen !== undefined && $(".creation-settings")) $(".creation-settings").open = creationOpen;
  restoreForm();
  LD.afterRender();
  ID.afterRender();
  PG.afterRender();
  HM.afterRender();
  DS.enhance();
  if (innerWidth <= 760 && AD.pages.includes(page)) {
    const nav = $(".admin-nav"),
      active = nav?.querySelector("[aria-current]");
    if (active) nav.scrollLeft = active.offsetLeft - nav.offsetLeft - 12;
  }
  renderDemo();
  if (focus) $("h1")?.focus();
}
function renderDemo() {
  const inspecting = new URLSearchParams(location.search).get("inspect") === "1";
  $("#demo").hidden = !inspecting;
  if (!inspecting) { $("#demo").replaceChildren(); return; }
  $("#demo").setAttribute("aria-label", t("prototype"));
  const states = [
    "normal",
    "empty",
    "loading",
    "error",
    ...({
      create: ["noquota", "nomodel", "nolength", "failure", "save-error"],
      library: ["save-error"],
      batch: ["save-error", "unavailable", "title-denied"],
      range: ["preview-error", "preview-loading"],
      login: ["auth-error", "admin"],
      register: ["username-taken", "auth-error"],
      trial: ["invalid", "noquota", "failure"],
      review: ["resume", "denied", "multibatch"],
      overview: ["submit-error", "response-lost"],
      summary: [],
      growth: ["blocked", "disabled", "demoted", "maxlevel", "claim-error"],
      bag: ["covered", "retired", "expired", "active", "lower", "insufficient"],
      shop: ["insufficient"],
      operations: ["save-error"],
      models: ["save-error", "missing-key"],
      plans: ["save-error"],
      users: ["search-error"],
      userdetail: ["save-error", "unavailable"],
      messages: ["save-error"],
      notices: ["long-title"],
      profile: ["save-error"],
      credits: ["save-error"],
      explore: ["empty", "single"],
      presets: ["save-error", "failure"],
      metrics: ["delayed"],
    }[page] || []),
  ];
  $("#demo").innerHTML =
    `<details class="demo-bar"><summary>${esc(t("prototype"))}<br>${DESIGN_VERSION} · ${routes[page]}</summary><div class="demo-controls"><select id="demo-page" aria-label="Page">${Object.entries(
      routes,
    )
      .map(
        ([p, id]) =>
          `<option value="${p}" ${page === p ? "selected" : ""}>${id} · ${esc(AD.pages.includes(p) ? AD.label(["credits", "userdetail"].includes(p) ? "users" : p) : ["home", "explore", ...accountViews].includes(p) ? t(p) : TRACE.find((x) => x.page === id)?.title)}</option>`,
      )
      .join(
        "",
      )}</select><select id="demo-state" aria-label="${esc(t("scenario"))}">${states.map((x) => `<option ${scene === x ? "selected" : ""}>${x}</option>`).join("")}</select>${B("reset", "reset", "small")}</div></details>`;
}
let pendingNavigation = null;
function go(p, confirmed = false) {
  if (
    !confirmed &&
    p !== page &&
    ["create", "trial"].includes(page) &&
    ["running", "done"].includes(S.generation) &&
    !(S.claimPending && ID.authPages.includes(p))
  ) {
    pendingNavigation = p;
    dialog(
      "l.leave.title",
      note("l.leave.desc", "warn"),
      B("cancel", "close") + B("confirm", "leave-generation", "danger"),
    );
    return;
  }
  if (
    !confirmed &&
    S.claimPending &&
    ID.authPages.includes(page) &&
    !ID.authPages.includes(p)
  ) {
    pendingNavigation = p;
    dialog(
      "l.leave.title",
      note("i.claim.note", "warn"),
      B("cancel", "close") + B("confirm", "leave-generation", "danger"),
    );
    return;
  }
  LD.beforeNavigate(p);
  if (
    p === "create" &&
    page !== "create" &&
    !["running", "done"].includes(S.generation)
  ) {
    S.model = "";
    S.explain = "";
    S.style = "story";
    S.length = "brief";
    S.generation = "idle";
  }
  page = ID.destination(p);
  if (S.preset >= F.presets.length) S.preset = 0;
  scene = "normal";
  syncURL();
  render(true);
}
function syncURL() {
  const u = new URL(location);
  u.searchParams.set("page", page);
  u.searchParams.set("role", S.guest ? "guest" : "learner");
  if (!["login", "register"].includes(page)) {
    u.searchParams.delete("claim");
    u.searchParams.delete("return");
  }
  u.searchParams.set("lang", lang);
  u.searchParams.set("state", scene);
  history.replaceState({}, "", u);
}
function activate(i) {
  if (BD.definition(S.inventory[i]).type === "makeup") makeup();
  else BD.preview(i);
}
function makeup() {
  const card = S.inventory.find(
    (x) => S.items[x.type].type === "makeup" && x.status === "unused",
  );
  dialog(
    "makeup.title",
    `<p>${esc(t("makeup.desc"))}</p>${card ? `<div class="calendar">${[11, 12, 13, 14, 15, 16].map((d) => `<button class="day ${d === 14 ? "missed" : "signed"}" data-action="makeup-day:${d}" ${d === 14 && !S.madeup ? "" : "disabled"}>09-${d}<br>${icon(d === 14 && !S.madeup ? "circle" : "check")}<span class="sr-only">${esc(t(d === 14 && !S.madeup ? "unsigned" : "signed"))}</span></button>`).join("")}</div>` : note("makeup.none", "warn")}`,
    B("cancel", "close"),
  );
}
function saveFeedback(fn) {
  if (scene === "save-error") {
    if (AD.pages.includes(page)) AD.error("failed");
    else toast("failed");
    return false;
  }
  fn?.();
  toast("saved");
  return true;
}
function generate() {
  if (
    BD.quota() < 1 ||
    S.generation === "running" ||
    ["noquota", "invalid", "nomodel", "nolength"].includes(scene)
  )
    return;
  if (!BD.consume()) return;
  S.generation = "running";
  S.output = "";
  render();
  S.generated = generationSnapshot();
  const text = S.generated.passage
    .map((x) => (typeof x === "string" ? x : x.answer))
    .join("");
  let n = 0;
  clearInterval(timer);
  timer = setInterval(() => {
    n += 4;
    S.output = text.slice(0, n);
    if (n >= text.length) {
      clearInterval(timer);
      S.generation = scene === "failure" ? "failure" : "done";
      if (S.generation === "failure") BD.refundCharge();
      else if (!S.guest) {
        LD.generationComplete();
        if (!S.signed) {
          S.signed = true;
          S.points += 5;
          S.xp += 10;
          toast("signed");
        }
      }
      render();
    } else {
      const output = $('[data-region="generation-result"] .story-text');
      if (output) output.textContent = S.output + " ▍";
    }
  }, 65);
}
async function act(a) {
  if (
    BD.handle(a) ||
    GD.handle(a) ||
    LD.handle(a) ||
    ID.handle(a) ||
    AD.handle(a) ||
    OD.handle(a) ||
    PD.handle(a)
  )
    return;
  const [k, arg] = a.split(":");
  const i = Number(arg);
  switch (k) {
    case "noop":
      break;
    case "close":
      close();
      break;
    case "language": {
      const secrets = $$("#main input[type=password]").map((el) => [
        el.id,
        el.value,
      ]);
      rememberForm();
      lang = lang === "zh" ? "en" : "zh";
      localStorage.setItem("ww-m002-language", lang);
      syncURL();
      render();
      secrets.forEach(([id, value]) => {
        const input = document.getElementById(id);
        if (input) input.value = value;
      });
      break;
    }
    case "try":
      S.preset = i;
      S.generation = "idle";
      go("trial");
      break;
    case "random": {
      if (S.selected.length >= BD.plan().maxEntries) return toast("word.limit");
      const w = F.candidates
        .filter((x) => !S.selected.includes(x) && (S.guest || !LD.inLibrary(x)))
        .sort(() => Math.random() - 0.5)[0];
      if (!w) return toast("random.none");
      S.selected.push(w);
      render();
      break;
    }
    case "add-word": {
      const w = $("#wordsearch").value.trim().toLowerCase();
      if (S.selected.length >= BD.plan().maxEntries) return toast("word.limit");
      if (!F.candidates.includes(w) || S.selected.includes(w))
        return toast("random.none");
      S.selected.push(w);
      render();
      break;
    }
    case "remove-word":
      S.selected.splice(i, 1);
      render();
      break;
    case "generate":
      generate();
      break;
    case "cancelgen":
      clearInterval(timer);
      if (S.generation !== "running") return;
      if (!S.guest) LD.generationComplete();
      S.generation = "cancelled";
      S.generated = null;
      render();
      break;
    case "collect":
      if (S.generation !== "done" || !S.generated) return;
      if (scene === "save-error") return toast("failed");
      if (S.guest) ID.begin("batch", true);
      else {
        const result = S.generated;
        S.generation = "saved";
        S.generated = null;
        LD.collect(result);
      }
      break;
    case "leave-generation":
      clearInterval(timer);
      if (S.generation === "running") BD.refundCharge();
      S.generation = "idle";
      S.generated = null;
      S.output = "";
      ID.discardClaim();
      close();
      go(pendingNavigation || "create", true);
      pendingNavigation = null;
      break;
    case "discard":
      pendingNavigation = page;
      dialog(
        "l.discard.title",
        note("l.discard.desc", "warn"),
        B("cancel", "close") + B("confirm", "leave-generation", "danger"),
      );
      break;
    case "makeup":
      makeup();
      break;
    case "makeup-day":
      S.makeupDay = i;
      dialog(
        "makeup.title",
        `<p>2026-09-${i}</p>${note("makeup.desc")}`,
        B("cancel", "close") + B("confirm", "makeup-confirm", "primary"),
      );
      break;
    case "makeup-confirm": {
      const card = S.inventory.find(
        (x) => S.items[x.type].type === "makeup" && x.status === "unused",
      );
      if (!card || S.madeup || S.makeupDay !== 14) return;
      card.status = "used";
      S.madeup = true;
      S.points += 6;
      close();
      render();
      toast("makeup.done");
      break;
    }
    case "redeem": {
      const item = S.items[i];
      if (S.points < item.price || scene === "insufficient")
        return toast("card.insufficient");
      dialog(
        "redeem",
        `<h3>${esc(L(item.title))}</h3><p>${esc(t("pricevalue", { count: item.price }))}</p>`,
        B("cancel", "close") + B("confirm", "redeem-confirm:" + i, "primary"),
      );
      break;
    }
    case "redeem-confirm": {
      const item = S.items[i];
      if (!item.listed || S.points < item.price) return;
      S.points -= item.price;
      BD.issue(i);
      close();
      render();
      toast("card.redeemed");
      break;
    }
    case "use":
      activate(i);
      break;
    case "profile-save":
      saveFeedback(() => {
        S.nickname = $("#nickname").value.trim();
        S.gender = $("#gender").value;
        formMemory.delete("profile");
        render();
      });
      break;
    case "notice":
      if (!$("#dialog").open) S.reminderMode = false;
      noticeDialog(i);
      break;
    case "new-message":
      formMemory.delete(page);
      F.notices.push({
        title: { zh: "", en: "" },
        body: { zh: "", en: "" },
        date: "2026-09-17",
        visible: false,
        remind: false,
      });
      S.message = F.notices.length - 1;
      render();
      break;
    case "message":
      formMemory.delete(page);
      S.message = i;
      render();
      break;
    case "message-preview":
      dialog(
        "preview",
        `<div class="markdown">${markdown($("#body-" + lang).value || $("#body-" + (lang === "zh" ? "en" : "zh")).value)}</div>`,
        "",
        { title: $("#message-" + lang).value || $("#message-" + (lang === "zh" ? "en" : "zh")).value || t("preview"), meta: t("preview") },
      );
      break;
    case "message-save":
      if (
        (!$("#message-zh").value.trim() && !$("#message-en").value.trim()) ||
        (!$("#body-zh").value.trim() && !$("#body-en").value.trim())
      )
        return AD.error("a.message.required");
      saveFeedback(() => {
        F.notices[S.message] = {
          title: { zh: $("#message-zh").value, en: $("#message-en").value },
          body: { zh: $("#body-zh").value, en: $("#body-en").value },
          date: "2026-09-17",
          visible: $("#visible").checked,
          remind: $("#remind").checked,
        };
        formMemory.delete(page);
        render();
      });
      break;
    case "optab":
      formMemory.delete(page);
      S.optab = arg;
      render();
      break;
    case "add-tier":
      rememberForm();
      S.tiers++;
      render();
      break;
    case "settings-save":
      if ($$("#main input[type=number]").some((x) => !x.checkValidity())) {
        $$("#main input[type=number]")
          .find((x) => !x.checkValidity())
          .reportValidity();
        break;
      }
      saveFeedback(() => rememberForm());
      break;
    case "item-new":
      itemForm();
      break;
    case "item-edit":
      itemForm(i);
      break;
    case "item-save": {
      const title = {
        zh: $("#item-zh").value.trim(),
        en: $("#item-en").value.trim(),
      };
      if (!title.zh && !title.en) {
        $("#item-zh").focus();
        return;
      }
      const inputs = $$("#dialog input[type=number]");
      if (inputs.some((x) => !x.checkValidity())) {
        inputs.find((x) => !x.checkValidity()).reportValidity();
        return;
      }
      saveFeedback(() => {
        const x = {
          ...(S.editItem >= 0
            ? S.items[S.editItem]
            : F.items.find((x) => x.type === S.editType)),
          title,
          desc: { zh: $("#item-desc-zh").value, en: $("#item-desc-en").value },
          price: Number($("#item-price").value),
          days: Number($("#item-days").value),
        };
        if ($("#item-duration")) x.duration = Number($("#item-duration").value);
        if ($("#item-refund")) x.refund = Number($("#item-refund").value);
        if ($("#item-count")) x.count = Number($("#item-count").value);
        if ($("#item-plan")) x.plan = $("#item-plan").value;
        if ($("#item-model"))
          x.models = [...$("#item-model").selectedOptions].map((x) => x.value);
        if (S.editItem >= 0) S.items[S.editItem] = x;
        else S.items.push({ ...x, issued: false, listed: false });
        close();
        render();
      });
      break;
    }
    case "item-list":
      saveFeedback(() => {
        S.items[i].listed = !S.items[i].listed;
        render();
      });
      break;
    case "item-refs":
      dialog(
        "refs",
        i < 4
          ? `<p>${esc(L(F.achievements[0].title))} · Lv. 3</p>`
          : note("refs.none"),
      );
      break;
    case "item-delete":
      if (S.items[i].issued || OD.hasRefs(i)) return dialog("delete", note("delete.blocked", "warn"));
      dialog(
        "delete",
        `<p>${esc(L(S.items[i].title))}</p>`,
        B("cancel", "close") +
          B("delete", "item-delete-confirm:" + i, "danger"),
      );
      break;
    case "item-delete-confirm":
      if (S.items[i].issued || OD.hasRefs(i))
        return dialog("delete", note("delete.blocked", "warn"));
      saveFeedback(() => {
        S.items.splice(i, 1);
        S.inventory.forEach(v => { if (v.type > i) v.type--; });
        [...AD.A.levels, ...Object.values(AD.A.achievements).flat()].forEach(
          (r) => {
            if (r.card > i) r.card--;
          },
        );
        close();
        render();
      });
      break;
    case "metric-info":
      dialog("metrics.definition", note("metrics.rules"));
      break;
    case "clarity":
      dialog("clarity", note("clarity.unavailable"));
      break;
    case "scene-normal":
      scene = "normal";
      syncURL();
      render();
      break;
    case "reset":
      LD.reset();
      location.href = "?page=" + page + "&lang=" + lang;
      break;
  }
}
function closeIfOpen() {
  if ($("#dialog").open) close();
}
document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-go],[data-action]");
  if (!el || el.disabled) return;
  e.preventDefault();
  if (el.dataset.go) {
    e.preventDefault();
    go(el.dataset.go);
  } else act(el.dataset.action);
});
document.addEventListener("input", (e) => {
  const el = e.target;
  if (LD.input(el)) return;
  OD.input(el);
  if (["plan-limit", "plan-max"].includes(el.id)) AD.change(el);
  if (el.matches("[data-slot]")) {
    el.value = el.value.replace(/[^a-zA-Z]/g, "").slice(-1);
    const a = $$(".slot").map((x) => x.value || " ");
    S.words[S.step] = a.join("").trimEnd();
    saveDraft();
    $("#review-next").disabled = !S.words[S.step].trim();
    if (el.value) $$(".slot")[Number(el.dataset.slot) + 1]?.focus();
  }
  if (el.matches("[data-gap]")) {
    S.gaps[Number(el.dataset.gap)] = el.value;
    saveDraft();
    $("#review-next").disabled = !S.gaps.some((x) => x.trim());
  }
  if (el.id === "item-search") filterItems();
  PD.change(el);
});
document.addEventListener("click", (e) => {
  const dropdown = $(".account-dropdown[open]");
  if (dropdown && !dropdown.contains(e.target)) dropdown.open = false;
});
document.addEventListener("focusin", (e) => {
  const dropdown = $(".account-dropdown[open]");
  if (dropdown && !dropdown.contains(e.target)) dropdown.open = false;
});
document.addEventListener("keydown", (e) => {
  const dropdown = $(".account-dropdown[open]");
  if (e.key === "Escape" && dropdown && !$("#dialog").open) {
    e.preventDefault();
    dropdown.open = false;
    dropdown.querySelector("summary").focus();
  }
});
document.addEventListener("keydown", (e) => {
  if (!e.target.matches("[data-slot]")) return;
  const slots = $$(".slot"),
    n = Number(e.target.dataset.slot);
  if (e.key === "Backspace" && !e.target.value && n > 0) {
    slots[n - 1].focus();
  }
  if (e.key === "ArrowLeft") {
    e.preventDefault();
    slots[Math.max(0, n - 1)].focus();
  }
  if (e.key === "ArrowRight") {
    e.preventDefault();
    slots[Math.min(slots.length - 1, n + 1)].focus();
  }
});
document.addEventListener("paste", (e) => {
  if (LD.paste(e)) return;
  if (!e.target.matches("[data-slot]")) return;
  e.preventDefault();
  const text = e.clipboardData.getData("text").replace(/[^a-zA-Z]/g, "");
  const slots = $$(".slot"),
    start = Number(e.target.dataset.slot);
  for (let n = 0; n < text.length && start + n < slots.length; n++)
    slots[start + n].value = text[n];
  S.words[S.step] = slots
    .map((x) => x.value || " ")
    .join("")
    .trimEnd();
  saveDraft();
  $("#review-next").disabled = !S.words[S.step].trim();
  slots[Math.min(slots.length - 1, start + text.length)]?.focus();
});
function filterItems() {
  const name = $("#item-search").value.toLowerCase(),
    type = $("#type-filter").value,
    status = $("#status-filter").value;
  $$("[data-item-row]").forEach(
    (row) =>
      (row.hidden = !(
        row.dataset.name.toLowerCase().includes(name) &&
        (!type || row.dataset.type === type) &&
        (!status || row.dataset.listed === status)
      )),
  );
}
document.addEventListener("change", (e) => {
  const el = e.target;
  if (el.id === "site-language") { lang = el.value; localStorage.setItem("ww-m002-language", lang); syncURL(); render(); return; }
  LD.change(el);
  AD.change(el);
  OD.change(el);
  PD.change(el);
  if (["model", "explain", "style", "length"].includes(el.id)) {
    const fieldId = el.id;
    S[fieldId] = el.value;
    render();
    if (page === "create") document.getElementById(fieldId)?.closest(".ww-select")?.querySelector("button")?.focus({ preventScroll: true });
  }
  if (["type-filter", "status-filter"].includes(el.id)) filterItems();
  if (el.id === "item-type") itemForm(-1, el.value);
  if (el.id === "demo-page") {
    go(el.value);
  }
  if (el.id === "demo-state") {
    scene = el.value;
    syncURL();
    render();
    if (scene === "resume") LD.initialize();
  }
});
document.addEventListener("submit", (e) => {
  if (e.target.id === "batch-title-form") {
    e.preventDefault();
    LD.handle("learn-title-save");
  }
  if (e.target.id === "library-search") {
    e.preventDefault();
    LD.handle("learn-search");
  }
  if (e.target.id === "identity-form") {
    e.preventDefault();
    ID.handle("identity-submit");
  }
});
$("#dialog").addEventListener("close", () => {
  LD.dialogClosed();
  ID.closed();
});
window.addEventListener("beforeunload", (e) => {
  LD.saveDraft();
  if (["running", "done"].includes(S.generation) || S.claimPending) {
    e.preventDefault();
    e.returnValue = "";
  }
});
if (ID.authPages.includes(page)) S.guest = true;
page = ID.destination(page);
render();
LD.initialize();
render();
