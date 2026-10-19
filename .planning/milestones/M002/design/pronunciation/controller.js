const speaker = `<svg class="pron-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>`;
const chevron = `<svg class="pron-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg>`;

export const icon = (name) => {
  const paths = {
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
    x: '<path d="m7 7 10 10M17 7 7 17"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    shuffle: '<path d="M3 7h3c4 0 6 10 10 10h5"/><path d="m18 14 3 3-3 3"/><path d="M3 17h3c1.8 0 3.1-1.9 4.4-4"/><path d="M14 7c.7 0 1.3 0 2 0h5"/><path d="m18 4 3 3-3 3"/>',
    sparkles: '<path d="m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2L12 3Z"/><path d="m5 14 .8 2.2L8 17l-2.2.8L5 20l-.8-2.2L2 17l2.2-.8L5 14Z"/>',
    book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v16H6.5A2.5 2.5 0 0 0 4 21.5v-16Z"/><path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H13v16h4.5a2.5 2.5 0 0 1 2.5 2.5v-16Z"/>',
    notebook: '<path d="M6 3h12v18H6z"/><path d="M9 3v18M12 7h3M12 11h3"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    save: '<path d="M5 3h12l2 2v16H5z"/><path d="M8 3v6h8V3M8 21v-7h8v7"/>',
    pencil: '<path d="m4 20 4.5-1 10-10a2 2 0 0 0-3-3l-10 10L4 20Z"/>',
    layers: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/>',
    volume: '<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/>'
  };
  return `<svg class="pron-icon" viewBox="0 0 24 24" aria-hidden="true">${paths[name] ?? paths.volume}</svg>`;
};

export function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[char]);
}

export async function loadCopy(url, language) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`copy source ${response.status}`);
  const copy = await response.json();
  const lang = language === "en" ? "en" : "zh";
  const replace = (source, vars = {}) => Object.entries(vars).reduce((text,[key,value]) => text.replaceAll(`{${key}}`, String(value)), source);
  return (key, vars = {}) => {
    const full = `${lang}.${key}`;
    const value = copy.static[full] ?? copy.templates[full];
    return value == null ? full : replace(value, vars);
  };
}

export async function loadBookshopFixture(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`fixture source ${response.status}`);
  const fixture = await response.json();
  const last = [...(fixture.wire ?? [])].reverse().find((item) => item.event === "generation.validated")?.data?.result;
  if (!last?.targets?.length) throw new Error("bookshop fixture result missing");
  return { passage: last.passage, tags: last.tags, targets: last.targets, source: fixture.sample_source };
}

const accentLabel = (t, accent) => t(accent === "en-GB" ? "pron.uk" : accent === "en-US" ? "pron.us" : "pron.english");
const stateIcon = (state) => {
  const paths = {
    preparing: '<path d="M20 12a8 8 0 1 1-5.5-7.6"/>',
    playing: '<path d="M4 10v4M8 6v12M12 3v18M16 7v10M20 10v4"/>',
    error: '<path d="M3 10a9 9 0 1 1 2.6 8.4"/><path d="M3 4v6h6"/>',
    gesture: '<path d="M3 10a9 9 0 1 1 2.6 8.4"/><path d="M3 4v6h6"/>',
    accent: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 17h.01"/>'
  };
  return paths[state] ? `<svg class="pron-icon" viewBox="0 0 24 24" aria-hidden="true">${paths[state]}</svg>` : speaker;
};

export function pronunciationControl({word, t, accents = ["neutral"], scenario = "dictionary", menuOpen = false, id = word}) {
  if (!word) return "";
  const label = t("pron.playWord", {word});
  const options = accents.map((accent, index) => `<button class="pron-choice" type="button" role="menuitemradio" aria-checked="${index === 0}" data-pron-accent="${esc(accent)}"><span>${esc(accentLabel(t, accent))}</span><small>${icon("check")}</small></button>`).join("");
  return `<span class="pron-control" data-pron-control data-word="${esc(word)}" data-scenario="${esc(scenario)}" data-accent="${esc(accents[0])}" data-source-count="${accents.length}" id="pron-${esc(id)}">
    <button class="pron-action" type="button" data-pron-play data-play-state="idle" aria-label="${esc(label)}">${speaker}</button>
    ${accents.length > 1 ? `<button class="pron-menu-trigger" type="button" data-pron-menu-trigger aria-label="${esc(t("pron.chooseAccent",{word}))}" aria-haspopup="menu" aria-controls="pron-menu-${esc(id)}" aria-expanded="${menuOpen}"><span data-pron-source>${esc(accentLabel(t,accents[0]))}</span>${chevron}</button><span id="pron-menu-${esc(id)}" class="pron-menu" role="menu" aria-label="${esc(t("pron.chooseAccent",{word}))}" ${menuOpen ? "" : "hidden"}>${options}</span>` : ""}
    <span class="pron-live" role="status" aria-live="polite" aria-atomic="true"></span>
  </span>`;
}

// Deterministic design demo; audio and provider integration belong to the technical stage.
export function initPronunciation(root, {t, scenario: globalScenario = "dictionary"} = {}) {
  let active = null;
  let serial = 0;
  const states = new WeakMap();
  const update = (control, state, source = "") => {
    const button = control.querySelector("[data-pron-play]");
    const word = control.dataset.word;
    states.set(control,{state,source});
    button.dataset.playState = state;
    control.dataset.actualSource = source;
    let detail = t("pron.playWord",{word});
    if (state === "preparing") detail = t("pron.statusPreparing",{word});
    if (state === "playing") detail = t("pron.statusPlaying",{word,source:t(`pron.${source}`)}) + " " + t("pron.replayWord",{word});
    if (state === "complete") detail = t("pron.replayWord",{word}) + " · " + t(`pron.${source}`);
    if (state === "error") detail = t("pron.statusUnavailable",{word}) + " " + t("pron.retry");
    if (state === "gesture") detail = t("pron.gesture") + " " + t("pron.playWord",{word});
    if (state === "accent") detail = t("pron.accentUnavailable") + " " + t("pron.chooseAccent",{word});
    button.innerHTML = stateIcon(state);
    button.setAttribute("aria-label", detail);
    control.querySelector(".pron-live").textContent = state === "idle" ? "" : detail;

  };
  const cancel = () => {
    serial++;
    if (!active) return;
    active.timers.forEach(clearTimeout);
    update(active.control,"idle");
    active = null;
  };
  const chooseAccent = (control, accent) => {
    control.dataset.accent = accent;
    const label = control.querySelector("[data-pron-source]");
    if (label) label.textContent = accentLabel(t,accent);
    control.querySelectorAll("[data-pron-accent]").forEach(button => button.setAttribute("aria-checked", String(button.dataset.pronAccent === accent)));
  };
  const play = (control, {directGesture = false} = {}) => {
    cancel(); // Same word also restarts from the beginning; no play/stop toggle.
    const request = ++serial;
    active = {control,timers:[]};
    const scenario = control.dataset.scenario || globalScenario;
    update(control,"preparing");
    const later = (fn,ms) => {
      active.timers.push(setTimeout(() => {
        if (active?.control === control && serial === request && control.isConnected) fn();
      },ms));
    };
    later(() => {
      if (scenario === "unavailable") { update(control,"error"); active = null; return; }
      if (scenario === "gesture" && !directGesture) { update(control,"gesture"); active = null; return; }
      if (scenario === "accent" && control.dataset.accent === "en-GB") { update(control,"accent"); active = null; return; }
      const source = ["fallback","gesture","accent"].includes(scenario) ? "browser" : "dictionary";
      update(control,"playing",source);
      later(() => { update(control,"complete",source); active = null; },1800);
    },420);
  };
  const closeMenus = (restoreFocus = false) => {
    root.querySelectorAll(".pron-menu:not([hidden])").forEach(menu => {
      menu.hidden = true;
      const trigger = menu.parentElement.querySelector("[data-pron-menu-trigger]");
      trigger.setAttribute("aria-expanded","false");
      if (restoreFocus) trigger.focus();
    });
  };
  root.addEventListener("click", event => {
    const control = event.target.closest("[data-pron-control]");
    const trigger = event.target.closest("[data-pron-menu-trigger]");
    if (trigger && control) {
      const menu = control.querySelector(".pron-menu");
      const open = menu.hidden;
      closeMenus();
      menu.hidden = !open;
      trigger.setAttribute("aria-expanded",String(open));
      if (open) menu.querySelector('[aria-checked="true"]').focus();
      return;
    }
    const choice = event.target.closest("[data-pron-accent]");
    if (choice && control) {
      chooseAccent(control,choice.dataset.pronAccent);
      closeMenus();
      control.querySelector("[data-pron-play]").focus();
      play(control);
      return;
    }
    closeMenus();
    if (!control || !event.target.closest("[data-pron-play]")) return;
    const previous = states.get(control)?.state;
    if (previous === "accent") {
      // With no visible operation label, changing sources must use an explicit menu choice.
      const menu = control.querySelector(".pron-menu");
      menu.hidden = false;
      control.querySelector("[data-pron-menu-trigger]").setAttribute("aria-expanded","true");
      menu.querySelector('[aria-checked="false"]')?.focus();
      return;
    }
    play(control,{directGesture:previous === "gesture"});
  });
  root.addEventListener("keydown", event => {
    if (event.key === "Escape") { closeMenus(true); return; }
    const menu = event.target.closest(".pron-menu");
    if (menu && ["ArrowDown","ArrowUp","Home","End"].includes(event.key)) {
      event.preventDefault();
      const choices = [...menu.querySelectorAll("[data-pron-accent]")];
      const i = choices.indexOf(document.activeElement);
      const next = event.key === "Home" ? 0 : event.key === "End" ? choices.length-1 : (i + (event.key === "ArrowDown" ? 1 : -1) + choices.length)%choices.length;
      choices[next].focus();
    }
  });
  root.addEventListener("focusout", () => queueMicrotask(() => {
    const open = root.querySelector(".pron-menu:not([hidden])");
    if (open && !open.parentElement.contains(document.activeElement)) closeMenus();
  }));
  window.addEventListener("pagehide",cancel);
  return {cancel};
}
