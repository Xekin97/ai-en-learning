import {esc, icon, initPronunciation, loadBookshopFixture, loadCopy, pronunciationControl, statusSlot} from "../controller.js";

const app = document.querySelector("#app");
const params = new URLSearchParams(location.search);
const language = params.get("lang") === "en" ? "en" : "zh";
const page = ["picker","plan","result","library"].includes(params.get("page")) ? params.get("page") : "picker";
const scenario = ["dictionary","fallback","gesture","unavailable","accent"].includes(params.get("scenario")) ? params.get("scenario") : "dictionary";
const longWordMode = params.get("longwords") === "1";
document.documentElement.lang = language === "en" ? "en" : "zh-CN";

const [t, sample] = await Promise.all([
  loadCopy(document.body.dataset.copyUrl,language),
  loadBookshopFixture(document.body.dataset.fixtureUrl)
]);

const logo = `<svg viewBox="0 0 44 44" aria-hidden="true"><rect width="44" height="44" rx="13" fill="#e4efcf"/><path d="M8 23c5-9 11-9 16-2 5 7 10 6 13-2" fill="none" stroke="#21654e" stroke-width="2.4" stroke-linecap="round"/><circle cx="10" cy="23" r="2" fill="#f3b986"/><circle cx="36" cy="19" r="2" fill="#f3b986"/></svg>`;
const header = () => `<a class="skip-link" href="#main">${esc(language === "en" ? "Skip to content" : "跳到主要内容")}</a><header class="topbar"><div class="container header-inner"><a class="brand" href="#">${logo}<span>${esc(t("brand"))}</span></a><nav class="nav" aria-label="${esc(language === "en" ? "Primary" : "主导航")}"><a href="#">${esc(t("nav.home"))}</a><a href="#">${esc(t("nav.explore"))}</a><a href="#" aria-current="page">${esc(t("nav.learn"))}</a><a href="#">${esc(t("nav.review"))}</a><a href="#">${esc(t("nav.library"))}</a></nav><div class="header-actions"><select class="pron-language-switch" aria-label="${esc(language === "en" ? "Switch language" : "切换界面语言")}"><option ${language === "zh" ? "selected" : ""}>中文</option><option ${language === "en" ? "selected" : ""}>English</option></select><strong>${esc(t("nav.updates"))}</strong><span class="avatar">小</span><span>${esc(t("account.name"))}</span><svg class="pron-icon pron-account-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m8 10 4 4 4-4"/></svg></div></div></header>`;
const footer = () => `<footer class="container footer"><p>${esc(t("footer"))}</p></footer>`;

const accentSet = (word) => word === "gentle" ? ["en-GB","en-US"] : word === "steady" ? ["en-US"] : ["neutral"];
const wordControl = (target, suffix, open = false) => pronunciationControl({word:target.entry,t,accents:target.accents ?? accentSet(target.entry),scenario,id:`${suffix}-${target.entry}`,menuOpen:open});
const selectedTargets = longWordMode ? [
  {entry:"communication",accents:["neutral"]},
  {entry:"pronunciation",accents:["en-GB","en-US"]}
] : sample.targets;
const meanings = () => sample.targets.map((target) => `<div data-pron-item data-entry="${esc(target.entry)}"><div class="pron-word-heading"><dt lang="en">${esc(target.entry)}</dt>${wordControl(target,page,target.entry === "gentle" && params.get("menu") === "1")}</div><dd>${esc(target.entry_meaning)}</dd><dd class="muted" lang="en">${esc(target.hint_phrase)}</dd>${statusSlot()}</div>`).join("");

function settings() {
  return `<aside class="panel pron-settings" aria-labelledby="pron-settings-title"><h2 id="pron-settings-title">${icon("sparkles")}${esc(t("settings"))}</h2><dl class="pron-settings-body"><div class="pron-setting"><dt>${esc(t("model"))}</dt><dd><select aria-label="${esc(t("model"))}"><option>Model A · General English</option></select></dd></div><div class="pron-setting"><dt>${icon("book")}${esc(t("scene"))}</dt><dd><select aria-label="${esc(t("scene"))}"><option>${esc(t("scene.value"))}</option></select></dd></div><div class="pron-setting"><dt>${icon("layers")}${esc(t("length"))}</dt><dd><select aria-label="${esc(t("length"))}"><option>${esc(t("length.value"))}</option></select></dd></div><div class="pron-setting"><dt>${icon("book")}${esc(t("meaningLanguage"))}</dt><dd><select aria-label="${esc(t("meaningLanguage"))}"><option>${esc(t("meaningLanguage.value"))}</option></select></dd></div></dl></aside>`;
}

function picker() {
  const candidates = sample.targets.slice(0,4);
  return `<section id="pron-page-401-picker" class="panel pron-picker-panel" aria-labelledby="picker-title"><div class="word-picker-head"><div><h2 id="picker-title">${esc(t("words"))}</h2><p class="word-picker-count">${esc(t("words.countDynamic",{count:selectedTargets.length}))} <span>${esc(t("words.remainingDynamic",{count:8-selectedTargets.length}))}</span></p></div><button class="btn quiet small">${icon("shuffle")}${esc(t("words.random"))}</button></div><div class="pron-selected-list" data-pron-item aria-label="${esc(t("words.selected"))}">${selectedTargets.map((target) => `<span class="pron-word-token"><span lang="en">${esc(target.entry)}</span>${wordControl(target,"selected")}<button class="pron-remove" type="button" aria-label="${esc(t("pron.removeWord",{word:target.entry}))}">${icon("x")}</button></span>`).join("")}${statusSlot()}</div><div class="pron-search-wrap"><label for="pron-search">${esc(t("words.search"))}</label><div class="pron-search-input">${icon("search")}<input id="pron-search" role="combobox" aria-expanded="true" aria-controls="pron-results" value="e" placeholder="${esc(t("words.placeholder"))}"></div><div id="pron-results" class="pron-search-popup" role="listbox" aria-label="${esc(t("words.results"))}" data-pron-item>${candidates.map((target,index) => `<div class="pron-search-row${index === 1 ? " is-active" : ""}" role="option" aria-selected="false"><span lang="en">${esc(target.entry).replace(/e/i,"<mark>$&</mark>")}</span>${wordControl(target,"candidate")}<button class="btn quiet small" type="button" aria-label="${esc(t("pron.addWord",{word:target.entry}))}">${icon("plus")}${esc(t("words.add"))}</button></div>`).join("")}${statusSlot()}</div></div><div class="actions pron-picker-actions"><button class="btn primary">${icon("sparkles")}${esc(t("generate"))}</button></div></section>`;
}

function plan() {
  return `<section id="pron-page-402-plan" class="panel pron-paper m003-generation-paper" aria-labelledby="plan-title"><div class="m003-result-heading"><span class="eyebrow">${icon("notebook")}${esc(t("workspace"))}</span><span class="pill">${esc(t("plan.ready"))}</span></div><div class="m003-result-body"><section class="m003-plan-preview"><span class="pill">${icon("sparkles")}${esc(t("plan.ready"))}</span><h2 id="plan-title">${esc(t("plan.title"))}</h2><p class="muted m003-plan-note">${esc(t("plan.note"))}</p><article class="m003-plan-scene"><small>${icon("layers")}${esc(t("plan.scene"))}</small><p>${esc(t("plan.scene.body"))}</p></article><section class="preset-meanings m003-vocabulary-panel m003-plan-meanings" aria-label="${esc(t("plan.title"))}"><dl class="m003-vocabulary-list pron-vocabulary-list">${meanings()}</dl></section></section></div></section>`;
}

function highlightedPassage() {
  const words = new Set(sample.targets.map((target) => target.entry));
  return sample.passage.split(/(\s+|[.,])/).map((part) => words.has(part.toLowerCase()) ? `<mark>${esc(part)}</mark>` : esc(part)).join("");
}

function result() {
  return `<section id="pron-page-402-result" class="panel pron-paper m003-generation-paper" aria-labelledby="result-title"><div class="m003-result-heading"><span class="eyebrow">${icon("notebook")}${esc(t("workspace"))}</span><span class="pill">${esc(t("result.ready"))}</span></div><div class="m003-result-body"><article class="m003-final-result"><p class="eyebrow">${esc(t("result.ready"))}</p><div class="pron-result-title"><h2 id="result-title" lang="en">${sample.targets.map(x=>esc(x.entry)).join(" · ")}</h2></div><p class="story-text" lang="en">${highlightedPassage()}</p><div class="chips">${sample.tags.map(tag=>`<span class="chip">${esc(tag)}</span>`).join("")}</div><section class="preset-meanings m003-vocabulary-panel m003-result-meanings"><div class="preset-meanings-head section-head"><h3>${icon("book")}${esc(t("result.resources"))}</h3><span>${esc(t("result.language"))}</span></div><dl class="m003-vocabulary-list pron-vocabulary-list">${meanings()}</dl></section><p class="notice">${esc(t("result.notice"))}</p><div class="actions"><button class="btn primary">${icon("save")}${esc(t("result.save"))}</button></div></article></div></section>`;
}

function idleWorkspace() {
  return `<section class="panel pron-paper m003-generation-paper" aria-labelledby="idle-workspace-title"><div class="m003-result-heading"><span class="eyebrow">${icon("notebook")}${esc(t("workspace"))}</span></div><div class="pron-empty"><div>${icon("sparkles")}<h2 id="idle-workspace-title">${esc(t("workspace.empty"))}</h2><p>${esc(t("workspace.emptyDesc"))}</p></div></div></section>`;
}

function createPage() {
  const content = page === "picker" ? idleWorkspace() : page === "plan" ? plan() : result();
  return `<main id="main" class="container page" tabindex="-1"><div class="page-head"><div><h1>${esc(t("create.title"))}</h1><p>${esc(t("create.desc"))}</p></div><span class="pill quota-detail">${esc(t("quota"))}</span></div><div class="pron-create-grid">${settings()}<div class="pron-main-stack">${picker()} ${content}</div></div>${demoPanel()}</main>`;
}

function libraryPage() {
  return `<main id="main" class="container page" tabindex="-1"><div class="page-head"><div><h1>${esc(t("library.detail"))}</h1></div><a class="btn" href="#">${esc(t("library.back"))}</a></div><div id="pron-page-403-library" class="pron-library-layout"><article class="panel pron-library-story"><p class="eyebrow">${esc(t("library.date"))}</p><div class="batch-title-header"><h2 class="batch-title">${esc(t("library.title"))}</h2><button class="btn quiet small">${icon("pencil")}${esc(t("library.edit"))}</button></div><div class="chips">${sample.tags.map(tag=>`<span class="chip">${esc(tag)}</span>`).join("")}</div><p class="story-text" lang="en">${highlightedPassage()}</p><section class="study-resources"><h2>${esc(t("library.resources"))}</h2><div class="resource-grid">${sample.targets.map((target) => `<article data-pron-item><div class="pron-word-heading"><h3 lang="en">${esc(target.entry)}</h3>${wordControl(target,"library",target.entry === "gentle" && params.get("menu") === "1")}</div><p>${esc(target.entry_meaning)}</p><p class="muted" lang="en">${esc(target.hint_phrase)}</p>${statusSlot()}</article>`).join("")}</div></section></article><aside class="pron-library-aside"><section class="panel"><h2>${icon("sparkles")}${esc(t("library.snapshot"))}</h2><dl class="pron-setting"><dt>${esc(t("model"))}</dt><dd>Model A</dd></dl><dl class="pron-setting"><dt>${esc(t("scene"))}</dt><dd>${esc(t("scene.value"))}</dd></dl><dl class="pron-setting"><dt>${esc(t("library.reviewed"))}</dt><dd>3</dd></dl></section><section class="panel"><h2>${esc(t("library.participate"))}</h2><p class="muted">${esc(t("library.participate.desc"))}</p><div class="actions"><button class="btn primary">${esc(t("library.single"))}</button><button class="btn danger">${esc(t("library.delete"))}</button></div></section></aside></div>${demoPanel()}</main>`;
}

function link(label, values, current) {
  const next = new URLSearchParams({page,scenario,lang:language,...values});
  return `<a href="?${next}" ${current ? 'aria-current="page"' : ""}>${esc(label)}</a>`;
}

function demoPanel() {
  return `<details class="pron-demo"><summary>${icon("sparkles")}${esc(t("formal.demoSummary"))}</summary><div class="pron-demo-body"><p><strong>${esc(t("pron.demoLabel"))}</strong> · ${esc(t("formal.disclaimer"))}</p><div class="pron-demo-links">${link(t("formal.pagePicker"),{page:"picker"},page==="picker")}${link(t("formal.pagePlan"),{page:"plan"},page==="plan")}${link(t("formal.pageResult"),{page:"result"},page==="result")}${link(t("formal.pageLibrary"),{page:"library"},page==="library")}</div><div class="pron-demo-links">${link(t("formal.normal"),{scenario:"dictionary"},scenario==="dictionary")}${link(t("formal.fallback"),{scenario:"fallback"},scenario==="fallback")}${link(t("formal.gesture"),{scenario:"gesture"},scenario==="gesture")}${link(t("formal.unavailable"),{scenario:"unavailable"},scenario==="unavailable")}${link(t("formal.accent"),{scenario:"accent"},scenario==="accent")}</div></div></details>`;
}

app.innerHTML = header() + (page === "library" ? libraryPage() : createPage()) + footer();
app.removeAttribute("aria-busy");
app.querySelectorAll("#pron-page-403-library .resource-grid article").forEach((card) => {
  card.dataset.entry = card.querySelector("h3")?.textContent?.trim() ?? "";
});
initPronunciation(app,{t,scenario});

app.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  if (button.classList.contains("pron-remove") || button.closest(".pron-search-row") && !button.matches("[data-pron-play],[data-pron-menu-trigger],[data-pron-accent]")) event.preventDefault();
});
