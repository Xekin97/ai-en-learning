import { icon } from "./icons.js?v=M002-UI-23";
// M002-UI-06: inherited library/date-range journeys with M002 review behavior.
// All content and persistence are isolated prototype fixtures, never application data.
export function createLearningDesign(H) {
  const {
    S,
    F,
    t,
    L,
    esc,
    B,
    field,
    note,
    heading,
    link,
    empty,
    dialog,
    close,
    toast,
    render,
    go,
    scene,
    page,
    params,
    configurationSnapshot,
  } = H;
  const $ = (q) => document.querySelector(q),
    $$ = (q) => [...document.querySelectorAll(q)];
  const KEY = "ww-m002-learning-ui06";
  let data;
  try {
    data = JSON.parse(sessionStorage.getItem(KEY));
  } catch {}
  if (!data?.batches || !data.sessions)
    data = {
      batches: structuredClone(F.library),
      sessions: {},
      mastered: [],
      generated: 12,
      collected: 12,
    };
  F.user.mastered += data.mastered.length;
  F.user.stories = data.collected;
  let selected = params.get("batch") || "b1",
    query = "",
    limit = 2,
    from = "2026-09-11",
    to = "2026-09-17";
  let activeKey = params.get("session") || null,
    ready = false,
    pending = null,
    result = null,
    returning = false;
  const persist = () => sessionStorage.setItem(KEY, JSON.stringify(data));
  const button = (k, a, cls = "", disabled = false) =>
    B("l." + k, "learn-" + a, cls, disabled);
  const txt = (k, v = {}) => t("l." + k, v);
  const rows = () => (scene() === "empty" ? [] : data.batches);
  const batch = (id) => data.batches.find((b) => b.id === id);
  const titleOf = (b) => b.title || b.targets.map((w) => w.word).join(" · ");
  let titleEdit = null, libraryReturn = null, restoreLibraryReturn = false;
  const session = () => data.sessions[activeKey];
  const current = () => batch(session()?.queue[session()?.cursor]);
  const targets = () => {
    const b = current();
    return b ? session().orders[b.id].map((i) => b.targets[i]) : [];
  };
  const origin = () => (session()?.mode === "range" ? "range" : "library");
  const isReview = (p) => ["review", "overview", "summary"].includes(p);
  const encode = encodeURIComponent;
  const shuffle = (arr) => {
    arr = [...arr];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };
  const correct = (a, b) =>
    String(a || "")
      .trim()
      .toLowerCase() === b.trim().toLowerCase();
  const cleanAnswers = () => {
    S.words = targets().map(() => "");
    S.gaps =
      current()
        ?.passage.filter((x) => typeof x !== "string")
        .map(() => "") || [];
    S.step = 0;
    S.hint = false;
    S.submitted = false;
    returning = false;
    result = null;
  };
  const stateURL = () => {
    const u = new URL(location);
    if (["batch", "login", "register"].includes(page()))
      u.searchParams.set("batch", selected);
    else u.searchParams.delete("batch");
    if (
      (isReview(page()) || ["login", "register"].includes(page())) &&
      activeKey
    )
      u.searchParams.set("session", activeKey);
    else u.searchParams.delete("session");
    history.replaceState({}, "", u);
  };
  function saveDraft() {
    const s = session(),
      b = current();
    if (!ready || !s || !b || S.submitted) return;
    s.draft = {
      batch: b.id,
      words: [...S.words],
      gaps: [...S.gaps],
      step: S.step,
    };
    persist();
  }
  function sanitize(s) {
    if (!s) return;
    while (
      s.cursor < s.queue.length &&
      (!batch(s.queue[s.cursor]) || s.completed[s.queue[s.cursor]])
    )
      s.cursor++;
    if (s.cursor >= s.queue.length) s.done = true;
    if (s.draft && !batch(s.draft.batch)) delete s.draft;
  }
  function makeSession(ids, mode) {
    const key = mode === "range" ? "range" : "single:" + ids[0];
    data.sessions[key] = {
      mode,
      queue: shuffle(ids),
      orders: Object.fromEntries(
        ids.map((id) => [id, shuffle(batch(id).targets.map((_, i) => i))]),
      ),
      cursor: 0,
      marks: Object.fromEntries(
        ids.map((id) => [id, shuffle([0, 1, 2, 3, 4, 5])]),
      ),
      completed: {},
      attempts: [],
      from,
      to,
      done: false,
    };
    activeKey = key;
    ready = true;
    cleanAnswers();
    persist();
    return key;
  }
  function start(key) {
    activeKey = key;
    const s = session();
    sanitize(s);
    if (s.done) {
      go(s.mode === "range" ? "range" : "library");
      return;
    }
    ready = false;
    cleanAnswers();
    go("review");
    ready = false;
    if (s.draft) {
      pending = { kind: "resume" };
      dialog(
        "resume.title",
        note("l.resume.desc"),
        B("fresh", "learn-fresh") + B("resume", "learn-resume", "primary"),
      );
    } else {
      ready = true;
      render(true);
    }
  }
  function libraryRow(b) {
    const resume = data.sessions["single:" + b.id] && !data.sessions["single:" + b.id].done;
    const configLabel = (kind, value) => {
      const known = kind === 'style' ? ['Story', 'Discussion', 'News', 'Business'] : ['Brief', 'Standard', 'Extended', 'Deep Dive'];
      const canonical = known.find(x => x.toLowerCase() === value.toLowerCase());
      return canonical ? t('a.preset.' + kind + '.' + canonical) : value;
    };
    return `<article class="library-row ${b.participates ? '' : 'library-row-paused'}" data-batch="${b.id}" aria-labelledby="library-title-${esc(b.id)}"><span class="library-book" aria-hidden="true">${icon('book-open-text')}</span><div class="library-row-content"><div class="library-meta"><span>${icon('calendar-days')}<time datetime="${esc(b.savedAt.replace(' ', 'T'))}">${esc(b.savedAt)}</time></span><span>${esc(b.model)}</span><span>${esc(configLabel('style', b.style))} · ${esc(configLabel('length', b.length))}</span></div><h2 id="library-title-${esc(b.id)}"><a data-action="learn-open:${b.id}" href="?page=batch&batch=${b.id}">${esc(titleOf(b))}</a></h2>${titleOf(b) !== b.targets.map(x => x.word).join(' · ') ? `<p class="batch-targets"><span>${esc(txt('title.targets'))}</span> ${esc(b.targets.map(x => x.word).join(' · '))}</p>` : ''}<div class="chips">${b.tags.map(x => `<span class="chip">${esc(x)}</span>`).join('')}</div></div><div class="library-row-actions"><div class="library-main-actions">${button(resume ? 'continue' : 'single', 'single:' + b.id, 'primary')}${button('detail', 'open:' + b.id)}</div><div class="library-manage-actions"><label class="library-check"><input type="checkbox" data-participation="${b.id}" ${b.participates ? 'checked' : ''}><span>${esc(txt('participate'))}</span></label>${button('delete', 'delete:' + b.id, 'quiet library-delete')}</div></div></article>`;
  }
  function library() {
    const all = rows(), matches = all.filter(b => !query || b.targets.some(x => x.word.toLowerCase().includes(query.toLowerCase())));
    const stats = [
      ['generated', data.generated, 'notebook-pen'],
      ['words', new Set(all.flatMap(b => b.targets.map(w => w.word))).size, 'book-open-text'],
      ['participating', all.filter(b => b.participates).length, 'calendar-check'],
      ['paused', all.filter(b => !b.participates).length, 'calendar-days'],
      ['successes', all.reduce((n, b) => n + b.successes, 0), 'clipboard-check'],
      ['successfulbatches', all.filter(b => b.successes > 0).length, 'check'],
    ];
    return `<div class="library-page">${heading('l.library', 'l.library.desc', `<a class="btn primary" data-go="range" href="?page=range">${icon('calendar-days')}${esc(txt('dateReview'))}</a>`)}${all.length ? `<dl class="library-stats">${stats.map(([k,v,glyph]) => `<div data-stat="${k}"><dt>${icon(glyph)}<span>${esc(txt('stat.' + k))}</span></dt><dd>${v}</dd></div>`).join('')}</dl><div class="library-toolbar"><form id="library-search" class="library-search" role="search"><label class="library-search-field"><span class="sr-only">${esc(txt('search'))}</span>${icon('search')}<input id="library-query" type="search" value="${esc(query)}" placeholder="${esc(txt('search.placeholder'))}"></label>${button('searchAction', 'search')}${query ? button('clear', 'clear', 'quiet') : ''}</form><div class="library-list-meta"><h2 id="library-list-title">${esc(txt('count', {count: matches.length}))}</h2><p>${esc(txt('order'))}</p></div></div><section class="library-list" aria-labelledby="library-list-title">${matches.slice(0, limit).map(libraryRow).join('')}</section>${!matches.length ? empty('l.noresults', 'l.noresults.desc') : ''}${matches.length > limit ? `<div class="library-more">${button('more', 'more')}</div>` : ''}` : empty('l.empty', 'l.empty.desc', link('create', 'create', 'btn primary'))}</div>`;
  }
  const fullPassage = (b) =>
    b.passage
      .map((x) =>
        typeof x === "string" ? esc(x) : `<mark>${esc(x.answer)}</mark>`,
      )
      .join("");
  const resources = (b) =>
    `<section class="study-resources"><h2>${esc(txt("resources"))}</h2><div class="resource-grid">${b.targets.map((x) => `<article><h3>${esc(x.word)}</h3><p>${esc(x.meaningText || x.meaning.zh)}</p><p class="muted">${esc(x.fullPhrase || x.phrase.replace(/_+/g, (_, offset) => x.word.split(" ")[0]))}</p></article>`).join("")}</div></section>`;
  function titleRegion(b) {
    const editing = titleEdit?.id === b.id;
    if (!editing)
      return `<div class="batch-title-header"><h2 class="batch-title" id="saved-batch-title">${esc(titleOf(b))}</h2>${button("title.edit", "title-edit", "quiet small")}</div>`;
    return `<form id="batch-title-form" class="batch-title-editor" aria-busy="${titleEdit.busy}" novalidate>${field("l.title.label", "batch-title", titleEdit.value, "text", `aria-describedby="batch-title-hint${titleEdit.error ? " batch-title-error" : ""}" aria-invalid="${!!titleEdit.error}" ${titleEdit.busy ? "disabled" : ""}`)}<p id="batch-title-hint" class="field-help">${esc(txt("title.hint"))}</p>${titleEdit.error ? `<p id="batch-title-error" class="note error" role="alert">${esc(txt(titleEdit.error))}</p>` : ""}<div class="actions">${button(titleEdit.busy ? "title.saving" : "title.save", "title-save", "primary", titleEdit.busy)}${B("cancel", "learn-title-cancel", "quiet", titleEdit.busy)}</div></form>`;
  }
  function saveTitle() {
    const draft = titleEdit;
    if (!draft || draft.busy) return;
    draft.value = $("#batch-title")?.value ?? draft.value;
    const value = draft.value.trim();
    if (!value) {
      draft.error = "title.empty";
      render(true);
      $("#batch-title")?.focus();
      return;
    }
    draft.busy = true;
    draft.error = "";
    render(true);
    const denied = S.guest || scene() === "title-denied";
    const fail = scene() === "save-error";
    setTimeout(() => {
      const b = batch(draft.id);
      draft.busy = false;
      if (denied || S.guest || !b) draft.error = "title.denied";
      else if (fail) draft.error = "title.failed";
      else {
        const original = b.title;
        b.title = value;
        try { persist(); }
        catch { b.title = original; draft.error = "title.failed"; }
      }
      if (!draft.error) {
        if (titleEdit === draft) titleEdit = null;
        if (page() === "batch" && selected === draft.id) {
          render(true);
          $('[data-action="learn-title-edit"]')?.focus();
        }
        toast("l.title.saved");
      } else if (titleEdit === draft && page() === "batch") {
        render(true);
        $("#batch-title")?.focus();
      }
    }, 450);
  }
  function detail() {
    const b = batch(selected);
    if (!b || scene() === "unavailable")
      return (
        heading("l.detail") +
        empty(
          "l.unavailable",
          "l.unavailable.desc",
          link("library", "l.backLibrary", "btn"),
        )
      );
    return (
      heading(
        "l.detail",
        "",
        link("library", "l.backLibrary", "btn"),
      ) +
      `<div class="batch-detail"><article class="panel"><p class="eyebrow">${esc(b.savedAt)}</p>${titleRegion(b)}<div class="chips">${b.tags.map((x) => `<span class="chip">${esc(x)}</span>`).join("")}</div><p class="story-text">${fullPassage(b)}</p>${resources(b)}</article><aside><section class="panel batch-settings" aria-labelledby="batch-settings-title"><h2 id="batch-settings-title">${icon("sparkles")}${esc(txt("snapshot"))}</h2><div class="config-fields">${configurationSnapshot(b)}</div><dl class="batch-review-count"><div><dt>${icon("clipboard-check")}${esc(txt("stat.successes"))}</dt><dd>${esc(b.successes)}</dd></div></dl></section><section class="panel"><label class="library-check"><input type="checkbox" data-participation="${b.id}" ${b.participates ? "checked" : ""}><span>${esc(txt("participate"))}</span></label><p class="muted">${esc(txt("participate.desc"))}</p><div class="actions">${button("single", "single:" + b.id, "primary")}${button("delete", "delete:" + b.id, "danger")}</div></section></aside></div>`
    );
  }
  const validRange = () =>
    /^\d{4}-\d{2}-\d{2}$/.test(from) &&
    /^\d{4}-\d{2}-\d{2}$/.test(to) &&
    from <= to;
  const matched = () =>
    validRange()
      ? rows().filter(
          (b) =>
            b.participates &&
            b.savedAt.slice(0, 10) >= from &&
            b.savedAt.slice(0, 10) <= to,
        )
      : [];
  function range() {
    const s = data.sessions.range;
    sanitize(s);
    return (
      heading(
        "l.range",
        "l.range.desc",
        link("library", "l.backLibrary", "btn"),
      ) +
      (s && !s.done
        ? `<section class="notice range-resume"><div><strong>${esc(txt("unfinished"))}</strong><p>${esc(txt("resume.progress", { done: s.cursor, total: s.queue.length, from: s.from, to: s.to }))}</p></div>${button("continueRange", "range-resume", "primary")}</section>`
        : "") +
      `<div class="range-editor"><section class="panel"><h2>${esc(txt("dates"))}</h2><p class="muted">${esc(txt("dates.desc"))}</p><div class="date-fields">${field("l.from", "range-from", from, "date", "required")}${field("l.to", "range-to", to, "date", "required")}</div><p id="range-error" class="bad" role="alert"></p><div class="actions">${button("recent", "recent")}${button("begin", "begin", "primary", !validRange() || !matched().length)}</div></section><aside class="range-count panel" aria-live="polite"><strong id="range-count">${validRange() ? matched().length : "—"}</strong><span>${esc(txt("matches"))}</span></aside></div><div id="range-feedback"></div>`
    );
  }
  function updateRange() {
    const error = !validRange(),
      unknown = ["preview-error", "preview-loading"].includes(scene());
    $("#range-error").textContent = error ? txt("dateerror") : "";
    for (const id of ["range-from", "range-to"]) {
      $("#" + id).setAttribute("aria-invalid", String(error));
      $("#" + id).setAttribute("aria-describedby", "range-error");
    }
    $("#range-count").textContent = error || unknown ? "—" : matched().length;
    $('[data-action="learn-begin"]').disabled =
      error || unknown || !matched().length;
    $("#range-feedback").innerHTML = unknown
      ? note(
          scene() === "preview-error" ? "l.preview.error" : "loading",
          scene() === "preview-error" ? "error" : "",
        ) + (scene() === "preview-error" ? B("retry", "scene-normal") : "")
      : !error && !matched().length
        ? empty(
            rows().length ? "l.nomatch" : "l.empty",
            "l.nomatch.desc",
            link("library", "l.backLibrary", "btn") +
              link("create", "create", "btn primary"),
          )
        : "";
  }
  function afterRender() {
    stateURL();
    if (page() === "library" && restoreLibraryReturn) {
      restoreLibraryReturn = false;
      const context = libraryReturn;
      requestAnimationFrame(() => {
        if (page() !== "library" || !context) return;
        const title = $$('.library-row').find(el => el.dataset.batch === context.id)?.querySelector('h2 a');
        if (title) { title.focus({ preventScroll: true }); window.scrollTo({ top: context.scroll, behavior: 'instant' }); }
      });
    }
    if (page() === "range") updateRange();
    if (innerWidth <= 760) {
      const nav = $(".review-steps"), active = nav?.querySelector(".current");
      if (active) nav.scrollLeft = active.offsetLeft - nav.offsetLeft - 12;
    }
  }
  function beforeNavigate(destination) {
    if (page() === "library" && destination !== "library") {
      const row = document.activeElement?.closest('.library-row');
      libraryReturn = row ? { id: row.dataset.batch, scroll: window.scrollY } : null;
    }
    if (destination === "library" && page() !== "library" && libraryReturn) restoreLibraryReturn = true;
    if (page() === "batch" && destination !== "batch") titleEdit = null;
    if (isReview(page()) && isReview(destination)) return;
    if (isReview(page()) && !isReview(destination)) {
      if (page() === "summary" && S.submitted) {
        sanitize(session());
        S.words = [];
        S.gaps = [];
        result = null;
        ready = false;
        persist();
      } else saveDraft();
    }
  }
  function answer(a, b) {
    return correct(a, b)
      ? `<span class="result-word good">${esc(b)}<small>${esc(t("correct"))}</small></span>`
      : `<span class="result-word"><s class="bad">${esc(a || t("unanswered"))}</s><strong class="good">${esc(b)}</strong><small>${esc(t(a ? "incorrect" : "unanswered"))}</small></span>`;
  }
  function passage(mode) {
    let n = 0;
    const symbols = ["circle", "diamond", "triangle", "square", "star", "hexagon"];
    return current()
      .passage.map((part) => {
        if (typeof part === "string") return esc(part);
        const i = n++,
          a = S.gaps[i] || "",
          mark = (session().marks?.[current().id] || [0, 1, 2, 3, 4, 5])[
            part.group % 6
          ],
          symbol =
            icon(symbols[mark]) +
            (part.group >= 6 ? icon(symbols[Math.floor(part.group / 6) % 6]) : ""),
          groupName = t("groupname." + symbols[mark]) + (part.group >= 6 ? " · " + t("groupname." + symbols[Math.floor(part.group / 6) % 6]) : "");
        if (mode === "summary") return answer(a, part.answer);
        if (mode === "overview")
          return `<button class="answer-link group-${mark % 3}" data-action="learn-edit-passage">${esc(a || t("unanswered"))}</button>`;
        return `<span class="gap-wrap group-${mark % 3}"><span aria-hidden="true">${symbol}</span><input class="gap" data-gap="${i}" value="${esc(a)}" aria-label="${esc(t("gap", { index: i + 1 }) + " · " + txt("group", { symbol: groupName }))}" autocomplete="off" spellcheck="false"></span>`;
      })
      .join("");
  }
  function review() {
    const b = current(),
      s = session();
    if (!b || !s || scene() === "denied" || (page() === "summary" && !result))
      return (
        heading("review.title") +
        empty(
          "l.unavailable",
          "l.summary.unavailable",
          link("range", "l.dateReview", "btn primary") +
            link("library", "l.backLibrary", "btn"),
        )
      );
    const ws = targets(),
      i = S.step,
      summary = page() === "summary",
      overview = page() === "overview";
    const progress = txt(
      s.mode === "range" ? "rangeProgress" : "singleProgress",
      {
        index: s.cursor + 1,
        total: s.queue.length,
        date: b.savedAt,
        from: s.from,
        to: s.to,
      },
    );
    let content = "";
    if (summary || overview) {
      content = `<section class="review-paper"><h2>${esc(t("wordanswers"))}</h2>${ws.map((w, n) => `<div class="answer-row"><span class="muted">${n + 1}</span>${summary ? answer(S.words[n], w.word) : `<button class="answer-link" data-action="learn-edit-word:${n}">${esc(S.words[n] || t("unanswered"))}${icon("pencil")}</button>`}</div>`).join("")}<h2 class="section">${esc(t("passageanswers"))}</h2><p class="story-text" data-region="passage">${passage(summary ? "summary" : "overview")}</p>${summary ? note("summary.note") : ""}</section><div class="review-footer">${summary ? B("restart", "learn-restart") : B("back", "learn-back-review")}${summary ? B(s.cursor < s.queue.length - 1 ? "nextbatch" : "finish", "learn-advance", "primary") : B("submit", "learn-submit", "primary", false, 'id="submit"')}</div>`;
    } else if (i < ws.length) {
      const w = ws[i];
      let letter = 0;
      const slots = w.word
        .split(" ")
        .map(
          (chunk) =>
            `<span class="slot-word">${[...chunk].map((c) => (/[a-z]/i.test(c) ? `<input class="slot" data-slot="${letter}" maxlength="1" value="${esc((S.words[i] || "").split("").filter((_, n) => /[a-z]/i.test(w.word[n]))[letter++] || "")}" aria-label="${esc(t("slot", { index: letter }))}" autocomplete="off" spellcheck="false" autocapitalize="none">` : `<span class="slot-punctuation">${esc(c)}</span>`)).join("")}</span>`,
        )
        .join('<span class="slot-space" aria-hidden="true"></span>');
      content = `<section class="review-paper"><p class="eyebrow">${esc(t("step", { index: i + 1, total: ws.length }))}</p><h2>${esc(t("review.spell"))}</h2><div class="slots">${slots}</div><section class="hint"><small>${esc(t("review.translation"))}</small><p>${esc(w.meaningText || w.meaning.zh)}</p></section><section class="hint"><div class="actions"><small>${esc(t("review.phrase"))}</small>${B(S.hint ? "hide" : "show", "learn-hint", "quiet small", false, `aria-expanded="${S.hint}"`)}</div>${S.hint ? `<p class="story-text">${esc(w.phrase)}</p>` : ""}</section></section>${footer(!(S.words[i] || "").trim())}`;
    } else
      content = `<section class="review-paper"><h2>${esc(t("review.passage"))}</h2><p class="muted">${esc(txt("groups"))}</p><p class="story-text" data-region="passage">${passage("edit")}</p></section>${footer(!S.gaps.some((x) => x.trim()))}`;
    return (
      heading(
        summary
          ? result?.success
            ? "summary.good"
            : "summary.retry"
          : overview
            ? "overview.title"
            : "review.title",
        overview ? "overview.desc" : "",
        "",
      ) +
      `<div class="review-context"><span>${esc(progress)}</span>${link(origin(), s.mode === "range" ? "l.backRange" : "l.backLibrary", "btn quiet")}</div>` +
      (summary && result.success
        ? `<p class="notice">${esc(t("newmastery", { count: result.newWords }))}</p>`
        : "") +
      `<div class="review-layout"><aside class="review-steps">${["wordanswers", "passageanswers", "overview", ...(summary ? ["summary"] : [])].map((x, n) => B(x, summary ? "noop" : n === 0 ? "learn-edit-word:0" : n === 1 ? "learn-edit-passage" : "learn-overview", (summary ? n === 3 : overview ? n === 2 : i < ws.length ? n === 0 : n === 1) ? "current" : "", summary)).join("")}</aside><div class="review-main">${content}</div></div>`
    );
  }
  function footer(disabled) {
    return `<div class="review-footer">${B("previous", "learn-prev", "", S.step === 0)}<div class="actions">${B("skip", "learn-skip", "quiet")}${B("next", "learn-next", "primary", disabled, 'id="review-next"')}</div></div>`;
  }
  function gather() {
    const w = targets()[S.step];
    if (!w) return;
    let idx = 0;
    const vals = $$(".slot").map((x) => x.value || " ");
    S.words[S.step] = [...w.word]
      .map((c) => (/[a-z]/i.test(c) ? vals[idx++] || " " : c))
      .join("")
      .trimEnd();
  }
  function input(el) {
    if (el.id === "batch-title" && titleEdit) {
      titleEdit.value = el.value;
      return true;
    }
    if (el.matches("[data-slot]")) {
      el.value = el.value.replace(/[^a-z]/gi, "").slice(-1);
      gather();
      saveDraft();
      $("#review-next").disabled = !S.words[S.step].trim();
      if (el.value) $$(".slot")[Number(el.dataset.slot) + 1]?.focus();
      return true;
    }
    if (el.matches("[data-gap]")) {
      S.gaps[+el.dataset.gap] = el.value;
      saveDraft();
      $("#review-next").disabled = !S.gaps.some((x) => x.trim());
      return true;
    }
    if (el.id === "range-from" || el.id === "range-to") {
      from = $("#range-from").value;
      to = $("#range-to").value;
      updateRange();
      return true;
    }
    return false;
  }
  function paste(e) {
    if (!e.target.matches("[data-slot]")) return false;
    e.preventDefault();
    const chars = e.clipboardData.getData("text").replace(/[^a-z]/gi, "");
    const slots = $$(".slot"),
      n = +e.target.dataset.slot;
    [...chars].forEach((c, i) => {
      if (slots[n + i]) slots[n + i].value = c;
    });
    gather();
    saveDraft();
    $("#review-next").disabled = !S.words[S.step].trim();
    slots[Math.min(slots.length - 1, n + chars.length)]?.focus();
    return true;
  }
  function change(el) {
    if (el.dataset.participation) {
      const b = batch(el.dataset.participation);
      if (scene() === "save-error") {
        el.checked = b.participates;
        toast("failed");
        return;
      }
      b.participates = el.checked;
      persist();
      render();
      $(`[data-participation="${b.id}"]`)?.focus({ preventScroll: true });
      toast("saved");
    }
  }
  async function submit() {
    if (S.submitted && result && S.responseLost) { S.responseLost = false; go("summary"); return; }
    if (S.submitted || !ready) return;
    const btn = $("#submit");
    btn.disabled = true;
    btn.textContent = t("submitting");
    await new Promise((r) => setTimeout(r, 220));
    if (scene() === "submit-error") {
      btn.disabled = false;
      btn.textContent = t("submit");
      toast("submit.error");
      return;
    }
    const b = current(),
      s = session();
    const success =
      targets().every((w, i) => correct(S.words[i], w.word)) &&
      b.passage
        .filter((x) => typeof x !== "string")
        .every((x, i) => correct(S.gaps[i], x.answer));
    const newWords = success
      ? b.targets.map((w) => w.word).filter((w) => !data.mastered.includes(w))
      : [];
    if (success) {
      data.mastered.push(...newWords);
      b.successes++;
      S.reviewToday = true;
      F.user.mastered += newWords.length;
      S.xp += newWords.length * 5;
    }
    const answered =
      S.words.some((x) => x.trim()) || S.gaps.some((x) => x.trim());
    if (answered) F.user.lastLearn = "2026-09-17 12:00";
    s.completed[b.id] = { success, answered };
    s.attempts.push({ batch: b.id, success, answered });
    delete s.draft;
    S.submitted = true;
    result = { success, newWords: newWords.length };
    persist();
    if (scene() === "response-lost") {
      S.responseLost = true;
      btn.disabled = false;
      btn.textContent = t("g.recover.result");
      btn.insertAdjacentHTML("beforebegin", note("g.response.lost", "warn"));
      return;
    }
    go("summary");
  }
  function handle(a) {
    if (!a.startsWith("learn-")) return false;
    const [k, arg] = a.slice(6).split(":");
    switch (k) {
      case "title-edit":
        if (!batch(selected) || S.guest || scene() === "unavailable") return true;
        titleEdit = { id: selected, value: titleOf(batch(selected)), busy: false, error: "" };
        render(true);
        $("#batch-title")?.focus();
        break;
      case "title-cancel":
        if (titleEdit?.busy) return true;
        titleEdit = null;
        render(true);
        $('[data-action="learn-title-edit"]')?.focus();
        break;
      case "title-save":
        saveTitle();
        break;
      case "search":
        query = $("#library-query").value.trim();
        limit = 2;
        render();
        $("#library-query")?.focus({ preventScroll: true });
        break;
      case "clear":
        query = "";
        limit = 2;
        render();
        $("#library-query")?.focus({ preventScroll: true });
        break;
      case "more": {
        const count = $$('.library-row').length;
        limit += 2;
        render();
        $$('.library-row h2 a')[count]?.focus();
        break;
      }
      case "open":
        selected = arg;
        go("batch");
        break;
      case "single": {
        const key = "single:" + arg;
        if (data.sessions[key] && !data.sessions[key].done) start(key);
        else {
          makeSession([arg], "single");
          go("review");
        }
        break;
      }
      case "delete":
        pending = { kind: "delete", id: arg };
        dialog(
          "l.delete.title",
          note("l.delete.desc", "warn"),
          B("cancel", "close") + button("delete", "delete-confirm", "danger"),
        );
        break;
      case "delete-confirm": {
        if (scene() === "save-error") {
          toast("failed");
          break;
        }
        const id = pending?.id;
        if (!id) break;
        data.batches = data.batches.filter((b) => b.id !== id);
        for (const s of Object.values(data.sessions)) {
          if (s.draft?.batch === id) delete s.draft;
          delete s.completed[id];
          s.attempts = s.attempts.filter((a) => a.batch !== id);
          sanitize(s);
        }
        pending = null;
        persist();
        close();
        go("library");
        toast("l.deleted");
        break;
      }
      case "recent":
        from = "2026-09-11";
        to = "2026-09-17";
        render();
        break;
      case "begin":
        if (validRange() && matched().length) {
          if (data.sessions.range && !data.sessions.range.done)
            dialog(
              "l.replace.title",
              note("l.replace.desc"),
              B("cancel", "close") + button("begin", "range-new", "primary"),
            );
          else handle("learn-range-new");
        }
        break;
      case "range-new":
        close();
        makeSession(
          matched().map((b) => b.id),
          "range",
        );
        go("review");
        break;
      case "range-resume":
        start("range");
        break;
      case "resume": {
        const d = session()?.draft;
        pending = null;
        close();
        if (d) {
          S.words = [...d.words];
          S.gaps = [...d.gaps];
          S.step = d.step;
        }
        ready = true;
        render(true);
        break;
      }
      case "fresh":
        pending = null;
        close();
        delete session().draft;
        ready = true;
        cleanAnswers();
        persist();
        render(true);
        break;
      case "hint":
        S.hint = !S.hint;
        render();
        break;
      case "prev":
        S.step = Math.max(0, S.step - 1);
        S.hint = false;
        saveDraft();
        render(true);
        break;
      case "next":
      case "skip":
        if (k === "skip") {
          if (S.step < targets().length) S.words[S.step] = "";
          else S.gaps = S.gaps.map(() => "");
        }
        if (returning || S.step === targets().length) {
          returning = false;
          saveDraft();
          go("overview");
        } else {
          S.step++;
          S.hint = false;
          saveDraft();
          render(true);
        }
        break;
      case "overview":
        saveDraft();
        go("overview");
        break;
      case "back-review":
        go("review");
        break;
      case "edit-word":
        S.step = +arg;
        returning = page() === "overview";
        S.hint = false;
        saveDraft();
        go("review");
        break;
      case "edit-passage":
        S.step = targets().length;
        returning = page() === "overview";
        saveDraft();
        go("review");
        break;
      case "submit":
        void submit();
        break;
      case "restart":
        delete session().completed[current().id];
        ready = true;
        cleanAnswers();
        saveDraft();
        go("review");
        break;
      case "advance": {
        const s = session();
        s.cursor++;
        sanitize(s);
        persist();
        if (s.done) {
          result = null;
          S.words = [];
          S.gaps = [];
          go("sessiondone");
        } else {
          ready = true;
          cleanAnswers();
          go("review");
        }
        break;
      }
    }
    return true;
  }
  function done() {
    const s = session();
    if (!s)
      return empty("l.unavailable", "", link("range", "l.dateReview", "btn"));
    const attempts = s.attempts;
    return (
      heading("l.sessiondone") +
      `<section class="panel session-totals"><div class="stats">${[
        ["completed", Object.keys(s.completed).length],
        ["success", attempts.filter((a) => a.success).length],
        ["failed", attempts.filter((a) => !a.success).length],
        ["skipped", attempts.filter((a) => !a.answered).length],
      ]
        .map(
          ([k, n]) =>
            `<div><strong>${n}</strong><small>${esc(txt("total." + k))}</small></div>`,
        )
        .join(
          "",
        )}</div><div class="actions">${link("library", "l.backLibrary", "btn primary")}${link("range", "l.dateReview", "btn")}${link("create", "create", "btn quiet")}</div></section>`
    );
  }
  function initialize() {
    if (!isReview(page())) return;
    if (!session()) {
      if (!batch(selected)) return;
      makeSession(
        scene() === "multibatch"
          ? data.batches.filter((b) => b.participates).map((b) => b.id)
          : [selected],
        "single",
      );
      if (scene() === "multibatch") {
        session().mode = "range";
      }
    } else {
      sanitize(session());
      cleanAnswers();
    }
    if (scene() === "resume" && !session().draft) {
      session().draft = {
        batch: current()?.id,
        words: targets().map((_, i) => (i ? "" : "r")),
        gaps:
          current()
            ?.passage.filter((x) => typeof x !== "string")
            .map(() => "") || [],
        step: 0,
      };
      persist();
    }
    if (page() === "summary") {
      ready = false;
      return;
    }
    if (session()?.draft) start(activeKey);
    else ready = true;
  }
  function dialogClosed() {
    if (pending?.kind === "resume") {
      pending = null;
      ready = false;
      go(origin());
    }
  }
  function collect(generated) {
    const id = "saved-" + Date.now();
    data.batches.push({
      ...structuredClone(generated),
      title: generated.targets.map((w) => w.word).join(" · "),
      id,
      savedAt: "2026-09-17 12:00",
      participates: true,
      successes: 0,
    });
    data.collected++;
    F.user.stories++;
    persist();
    selected = id;
    go("batch");
    toast("collected");
  }
  const inLibrary = (word) =>
    data.batches.some((b) => b.targets.some((w) => w.word === word));
  const generationComplete = () => {
    data.generated++;
    persist();
  };
  const reset = () => sessionStorage.removeItem(KEY);
  function erase() {
    data = {
      batches: [],
      sessions: {},
      mastered: [],
      generated: 0,
      collected: 0,
    };
    activeKey = null;
    ready = false;
    result = null;
    S.points = 0;
    S.xp = 0;
    S.inventory = [];
    F.user.mastered = 0;
    F.user.stories = 0;
    persist();
  }

  return {
    library,
    detail,
    titleOf,
    allBatches: () => data.batches,
    range,
    review,
    done,
    resources,
    fullPassage,
    saveDraft,
    handle,
    input,
    paste,
    change,
    afterRender,
    beforeNavigate,
    initialize,
    dialogClosed,
    collect,
    inLibrary,
    generationComplete,
    reset,
    erase,
  };
}
