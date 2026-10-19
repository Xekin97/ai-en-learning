import {esc, initPronunciation, loadCopy, pronunciationControl, statusSlot} from "../controller.js";

const app = document.querySelector("#app");
const params = new URLSearchParams(location.search);
const language = params.get("lang") === "en" ? "en" : "zh";
const scenario = ["dictionary","fallback","gesture","unavailable","accent"].includes(params.get("scenario")) ? params.get("scenario") : "dictionary";
document.documentElement.lang = language === "en" ? "en" : "zh-CN";
const t = await loadCopy(document.body.dataset.copyUrl,language);

const rows = [
  {word:"wander",meaning:language === "en" ? "to walk without a fixed route" : "漫步；闲逛",usage:"wander through the old town",accents:["neutral"],scenario},
  {word:"gentle",meaning:language === "en" ? "kind, calm, or soft" : "轻柔的；温和的",usage:"a gentle voice",accents:["en-GB","en-US"],scenario:scenario === "dictionary" ? "fallback" : scenario},
  {word:"steady",meaning:language === "en" ? "regular and continuing" : "稳定而持续的",usage:"steady practice",accents:["en-US"],scenario:scenario === "dictionary" ? "unavailable" : scenario}
];

const scenarioOptions = [
  ["dictionary","formal.normal"],
  ["fallback","formal.fallback"],
  ["gesture","formal.gesture"],
  ["unavailable","formal.unavailable"],
  ["accent","formal.accent"]
];

app.innerHTML = `<div class="pron-prototype-shell"><header class="pron-prototype-head"><div><p class="eyebrow">${esc(t("prototype.eyebrow"))}</p><h1>${esc(t("prototype.title"))}</h1><p>${esc(t("prototype.desc"))}</p></div><a class="btn primary" href="../formal/?page=picker&scenario=${scenario}&lang=${language}">${esc(t("prototype.formal"))}</a></header><div class="pron-prototype-grid"><aside class="pron-prototype-sidebar"><div><h2>${esc(t("pron.demoLabel"))}</h2><p>${esc(t("pron.demoHelp"))}</p></div><fieldset><legend>${esc(t("formal.demo"))}</legend>${scenarioOptions.map(([value,key]) => `<label><input type="radio" name="scenario" value="${value}" ${value === scenario ? "checked" : ""}><span>${esc(t(key))}</span></label>`).join("")}</fieldset><div><a class="btn quiet small" href="?scenario=${scenario}&lang=${language === "en" ? "zh" : "en"}">${language === "en" ? "中文" : "English"}</a></div></aside><section class="pron-prototype-stage" aria-labelledby="lab-title"><header><h2 id="lab-title">${esc(t("prototype.section"))}</h2><p>${esc(t("prototype.instructions"))}</p></header><div class="pron-lab-list">${rows.map((row,index) => `<article class="pron-lab-row" data-pron-item><div><div class="pron-lab-word" lang="en">${esc(row.word)}</div><div>${esc(row.meaning)}</div><div class="pron-lab-meta" lang="en">${esc(row.usage)}</div></div>${pronunciationControl({word:row.word,t,accents:row.accents,scenario:row.scenario,id:`lab-${index}`,menuOpen:row.word === "gentle" && params.get("menu") === "1"})}${statusSlot()}</article>`).join("")}</div><div class="pron-prototype-note"><p><strong>${esc(t("pron.demoLabel"))}</strong></p><p>${esc(t("prototype.keyboard"))}</p></div></section></div></div>`;
app.removeAttribute("aria-busy");
initPronunciation(app,{t,scenario});

app.addEventListener("change", (event) => {
  const input = event.target.closest('input[name="scenario"]');
  if (!input) return;
  location.search = new URLSearchParams({scenario:input.value,lang:language}).toString();
});
