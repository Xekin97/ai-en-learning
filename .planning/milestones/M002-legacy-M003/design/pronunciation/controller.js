const speaker = `<svg class="pron-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>`;
const chevron = `<svg class="pron-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg>`;
const info = `<svg class="pron-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/></svg>`;

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

export function pronunciationControl({word, t, accents = ["neutral"], scenario = "dictionary", menuOpen = false, id = word}) {
  const label = t("pron.playWord", {word});
  const options = accents.map((accent) => {
    const name = accent === "en-GB" ? t("pron.uk") : accent === "en-US" ? t("pron.us") : t("pron.neutral");
    return `<button class="pron-choice" type="button" role="menuitem" data-pron-accent="${esc(accent)}"><span>${esc(name)}</span>${accent === accents[0] ? `<small>${icon("check")}</small>` : ""}</button>`;
  }).join("");
  return `<span class="pron-control" data-pron-control data-word="${esc(word)}" data-scenario="${esc(scenario)}" data-accent="${esc(accents[0])}" id="pron-${esc(id)}">
    <button class="pron-action" type="button" data-pron-play data-play-state="idle" aria-label="${esc(label)}" title="${esc(label)}">${speaker}</button>
    ${accents.length > 1 ? `<button class="pron-menu-trigger" type="button" data-pron-menu-trigger aria-label="${esc(t("pron.chooseAccent",{word}))}" aria-expanded="${menuOpen}">${chevron}</button><span class="pron-menu" role="menu" ${menuOpen ? "" : "hidden"}>${options}</span>` : ""}
  </span>`;
}

export function statusSlot() {
  return `<div class="pron-status-slot" role="status" aria-live="polite" aria-atomic="true"></div>`;
}

export function initPronunciation(root, {t, scenario: globalScenario = "dictionary"} = {}) {
  let active = null;
  let requestSerial = 0;
  const timers = new Set();
  const later = (fn, ms) => {
    const timer = setTimeout(() => { timers.delete(timer); fn(); }, ms);
    timers.add(timer);
    return timer;
  };
  const clearActiveTimers = () => {
    if (!active) return;
    active.timers.forEach((timer) => { clearTimeout(timer); timers.delete(timer); });
    active.timers.clear();
  };
  const slotFor = (control) => control.closest("[data-pron-item]")?.querySelector(".pron-status-slot") ?? control.parentElement?.querySelector(".pron-status-slot");
  const setSlot = (control, html, tone = "normal") => {
    const slot = slotFor(control);
    if (!slot) return;
    slot.innerHTML = html ? `<div class="pron-status-card" data-tone="${tone}">${html}</div>` : "";
  };
  const status = (text, tone = "normal", action = "") => `<div class="pron-status" data-tone="${tone}">${info}<span>${esc(text)}${action}</span></div>`;
  const setButtonState = (control, state) => {
    const button = control.querySelector("[data-pron-play]");
    const word = control.dataset.word;
    button.dataset.playState = state;
    button.setAttribute("aria-pressed", state === "playing" ? "true" : "false");
    const label = state === "playing" ? t("pron.stop") : state === "complete" ? t("pron.replayWord",{word}) : t("pron.playWord",{word});
    button.setAttribute("aria-label", label);
    button.title = label;
  };
  const cancelActive = (nextControl) => {
    if (!active || active.control === nextControl) return;
    clearActiveTimers();
    setButtonState(active.control,"idle");
    setSlot(active.control,status(t("pron.cancelled")));
    active = null;
  };
  const finish = (control, serial, source, note = "") => {
    if (!active || active.serial !== serial || active.control !== control) return;
    setButtonState(control,"complete");
    const label = source === "dictionary" ? t("pron.dictionary") : t("pron.browser");
    setSlot(control,status(note || label));
    active = null;
  };
  const play = (control, {availableAccent = false, directGesture = false} = {}) => {
    cancelActive(control);
    if (active?.control === control) clearActiveTimers();
    const button = control.querySelector("[data-pron-play]");
    if (button.dataset.playState === "playing") {
      clearActiveTimers();
      setButtonState(control,"complete");
      active = null;
      return;
    }
    const serial = ++requestSerial;
    const state = {control, serial, timers: new Set()};
    active = state;
    const scenario = control.dataset.scenario || globalScenario;
    const word = control.dataset.word;
    setButtonState(control,"preparing");
    setSlot(control,status(t("pron.statusPreparing",{word})));
    const schedule = (fn, ms) => state.timers.add(later(fn,ms));

    schedule(() => {
      if (!active || active.serial !== serial) return;
      if (scenario === "unavailable") {
        setButtonState(control,"error");
        const action = `<br><button class="pron-inline-action" type="button" data-pron-retry>${esc(t("pron.retry"))}</button>`;
        setSlot(control,status(t("pron.statusUnavailable",{word}),"error",action),"error");
        active = null;
        return;
      }
      if (scenario === "gesture" && !directGesture && control.dataset.gestureReady !== "true") {
        control.dataset.gestureReady = "true";
        setButtonState(control,"idle");
        const action = `<br><button class="pron-inline-action" type="button" data-pron-gesture>${esc(t("pron.clickAgain"))}</button>`;
        setSlot(control,status(t("pron.gesture"),"normal",action));
        active = null;
        return;
      }
      if (scenario === "accent" && !availableAccent) {
        setButtonState(control,"error");
        const action = `<br><button class="pron-inline-action" type="button" data-pron-available>${esc(t("pron.useAvailable"))}</button>`;
        setSlot(control,status(t("pron.accentUnavailable"),"error",action),"error");
        active = null;
        return;
      }
      const source = scenario === "fallback" || scenario === "gesture" || scenario === "accent" ? "browser" : "dictionary";
      setButtonState(control,"playing");
      const sourceName = source === "dictionary" ? t("pron.dictionary") : t("pron.browser");
      const note = scenario === "fallback" ? t("pron.fallback") : t(source === "dictionary" ? "pron.playing.dictionary" : "pron.playing.browser");
      setSlot(control,status(note));
      schedule(() => finish(control,serial,source,sourceName),1350);
    }, 420);
  };

  root.addEventListener("click", (event) => {
    const target = event.target.closest("button");
    if (!target || !root.contains(target)) return;
    const control = target.closest("[data-pron-control]") || target.closest("[data-pron-item]")?.querySelector("[data-pron-control]");
    if (target.matches("[data-pron-menu-trigger]")) {
      const menu = control.querySelector(".pron-menu");
      const open = menu.hidden;
      root.querySelectorAll(".pron-menu:not([hidden])").forEach((item) => item.hidden = true);
      root.querySelectorAll("[data-pron-menu-trigger][aria-expanded=true]").forEach((item) => item.setAttribute("aria-expanded","false"));
      menu.hidden = !open;
      target.setAttribute("aria-expanded",String(open));
      if (open) menu.querySelector("button")?.focus();
      return;
    }
    if (target.matches("[data-pron-accent]")) {
      control.dataset.accent = target.dataset.pronAccent;
      const menu = control.querySelector(".pron-menu");
      menu.hidden = true;
      control.querySelector("[data-pron-menu-trigger]")?.setAttribute("aria-expanded","false");
      play(control);
      return;
    }
    if (target.matches("[data-pron-play]")) { play(control); return; }
    if (target.matches("[data-pron-retry]")) { play(control); return; }
    if (target.matches("[data-pron-gesture]")) { play(control,{directGesture:true}); return; }
    if (target.matches("[data-pron-available]")) { control.dataset.accent = "en-US"; play(control,{availableAccent:true}); }
  });

  root.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const open = root.querySelector(".pron-menu:not([hidden])");
    if (!open) return;
    const control = open.closest("[data-pron-control]");
    open.hidden = true;
    const trigger = control.querySelector("[data-pron-menu-trigger]");
    trigger.setAttribute("aria-expanded","false");
    trigger.focus();
  });

  const stop = () => {
    clearActiveTimers();
    timers.forEach(clearTimeout);
    timers.clear();
    if (active) setButtonState(active.control,"idle");
    active = null;
  };
  window.addEventListener("pagehide",stop,{once:true});
  return { stop, play };
}
