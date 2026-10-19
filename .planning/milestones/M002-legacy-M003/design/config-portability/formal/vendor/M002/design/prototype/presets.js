import { createWordPicker } from "./word-picker.js?v=M002-UI-26";
import { renderWordMeanings } from "./word-meanings.js?v=M002-UI-23";
import { icon } from "./icons.js?v=M002-UI-23";
export function createPresetDesign(H) {
  const {
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
    scene,
    forget,
  } = H;
  const $ = (q) => document.querySelector(q);
  const P = F.presets.map((p, i) => ({
    id: i,
    draft: structuredClone(p),
    live: structuredClone(p),
    preview: null,
    signature: null,
    state: "published",
    usage: 0,
  }));
  let current = 0,
    timer = null;
  const row = () => P[current];
  const sig = (p) =>
    JSON.stringify([p.words, p.model, p.style, p.length, p.language]);
  P.forEach((r) => {
    r.preview = r.draft.sampleText;
    r.previewSnapshot = structuredClone(r.draft);
    r.signature = sig(r.draft);
  });
  const opt = (group, values) =>
    values.map((v) => [v, t("a.preset." + group + "." + v)]);
  const values = {
    style: ["Story", "Discussion", "Business", "News"],
    length: ["Brief", "Standard", "Extended", "Deep Dive"],
    language: ["中文", "English", "日本語"],
  };
  function take() {
    const r = row();
    if (!$("#preset-title")) return r.draft;
    return {
      ...r.draft,
      title: $("#preset-title").value.trim(),
      words: [...r.draft.words],
      model: $("#preset-model").value,
      style: $("#preset-style").value,
      length: $("#preset-length").value,
      language: $("#preset-language").value,
    };
  }
  function publishable() {
    const r = row();
    return (
      !!r.preview &&
      r.signature === sig(r.draft) &&
      AD.activeModels().some((m) => m.name === r.draft.model)
    );
  }
  function capture() {
    const r = row(),
      prev = JSON.stringify(r.draft);
    r.draft = take();
    if (JSON.stringify(r.draft) !== prev) {
      r.state = r.live ? "changed" : "draft";
    }
    return r;
  }
  function syncLive() {
    F.presets.splice(
      0,
      F.presets.length,
      ...P.filter((p) => p.live).map((p) => structuredClone(p.live)),
    );
  }
  function valid() {
    const p = row().draft;
    if (
      !p.title.trim() ||
      !p.words.length ||
      !AD.activeModels().some((m) => m.name === p.model)
    ) {
      AD.error("a.preset.invalid");
      return false;
    }
    return true;
  }
  const picker = createWordPicker({
    id: "preset-words", t, esc, icon,
    scope: () => row().id,
    words: () => row().draft.words,
    candidates: () => F.candidates,
    disabled: () => row().state === "running",
    state: scene,
    change: words => {
      const r = capture();
      if (r.state === "running") return;
      r.draft.words = words;
      r.state = r.live ? "changed" : "draft";
      forget(); render();
    },
  });
  function page() {
    const r = row(),
      p = r.draft;
    return AD.shell(
      `${heading("a.presets", "preview.rule", B("newpreset", "new-preset", "primary"))}<div class="admin-master-detail"><section class="panel admin-records"><h2>${esc(t("a.preset.list"))}</h2>${P.map((x, i) => `<button class="admin-record ${i === current ? "selected" : ""}" data-action="preset-edit:${i}"><strong>${esc(x.draft.title || t("a.untitled"))}</strong><span>${esc(t("a.preset.state." + x.state))}</span></button>`).join("")}</section><section class="panel">${badge("a.preset.state." + r.state)}${help("preset.draftnote")}<div class="preset-title-field">${field("preset.name", "preset-title", p.title, "text", 'aria-describedby="preset-title-hint"')}<p id="preset-title-hint" class="field-help">${esc(t("preset.namehint"))}</p></div>${picker.view()}<div class="form-grid">${select(
        "model",
        "preset-model",
        [
          ...(!AD.activeModels().some((m) => m.name === p.model)
            ? [[p.model, t("a.preset.modelmissing")]]
            : []),
          ...AD.activeModels().map((m) => [m.name, m.name]),
        ],
        p.model,
        "data-preset-param",
      )}${select("style", "preset-style", opt("style", values.style), p.style, "data-preset-param")}${select("length", "preset-length", opt("length", values.length), p.length, "data-preset-param")}${select("explain", "preset-language", opt("language", values.language), p.language, "data-preset-param")}</div><div class="actions form-footer">${B("save.draft", "preset-save")}${B(r.state === "running" ? "cancelgen" : "previewgen", r.state === "running" ? "preset-cancel" : "preset-preview")}${B("publish", "preset-publish", "primary", !publishable() || r.state === "running")}${r.live ? B("unlist", "preset-unlist") : ""}</div>${r.state === "running" ? note("create.generating") : r.state === "failed" ? note("create.failure", "error") : r.state === "cancelled" ? note("create.cancelled", "warn") : ""}${r.preview ? `<section class="article section"><div class="section-head"><h2>${esc(t("preview"))}</h2>${badge("sample")}</div><h3>${esc(p.title)}</h3><p class="story-text preset-sample-text">${esc(r.preview)}</p>${renderWordMeanings(r.previewSnapshot || p, { t, esc, icon })}${`<div data-preview-status>${r.signature !== sig(p) ? note("preview.required", "warn") : ""}</div>`}</section>` : `<section class="preset-meanings"><h3>${esc(t("preset.meanings"))}</h3><p class="muted">${esc(t("preset.meanings.pending"))}</p></section>`}<p class="muted usage-note">${esc(t("usage"))} · ${r.usage} · ${esc(t("unknown"))}</p></section></div>`,
    );
  }
  function handle(a) {
    const [k, arg] = a.split(":");
    if (
      ![
        "preset-edit",
        "new-preset",
        "preset-save",
        "preset-preview",
        "preset-cancel",
        "preset-publish",
        "preset-unlist",
      ].includes(k)
    )
      return false;
    let r = row();
    if (k === "preset-edit" || k === "new-preset") {
      capture();
      if (r.state === "running") {
        clearTimeout(timer);
        r.state = "cancelled";
      }
      forget();
      if (k === "preset-edit") current = Number(arg);
      else {
        P.push({
          id: P.length,
          draft: {
            ...structuredClone(F.presets[0] || r.draft),
            title: "",
            words: [],
          },
          live: null,
          preview: null,
          signature: null,
          state: "draft",
          usage: 0,
        });
        current = P.length - 1;
      }
      render();
      return true;
    }
    capture();
    if (k === "preset-save") {
      if (!valid()) return true;
      AD.save(() => {
        r.state = r.live
          ? "changed"
          : r.preview && publishable()
            ? "previewed"
            : "draft";
        render();
      });
    }
    if (k === "preset-preview") {
      if (!valid()) return true;
      r.usage++;
      r.state = "running";
      forget();
      render();
      const start = sig(r.draft),
        failure = scene() === "failure";
      timer = setTimeout(() => {
        if (failure) {
          r.state = "failed";
        } else {
          r.preview =
            r.draft.sampleText || F.presets[0]?.sampleText || "A new story begins.";
          r.draft.meanings = r.draft.words.map(word => ({ word, meaning: F.dictionary[word]?.meaning[{ "中文": "zh", "English": "en", "日本語": "ja" }[r.draft.language]] || t("preset.meanings.pending") }));
          r.previewSnapshot = structuredClone(r.draft);
          r.signature = start;
          r.state = "previewed";
        }
        if (row() === r && H.page() === "presets") render();
      }, 750);
    }
    if (k === "preset-cancel") {
      clearTimeout(timer);
      r.state = "cancelled";
      render();
    }
    if (k === "preset-publish") {
      if (!valid()) return true;
      if (!publishable()) {
        AD.error("preview.required");
        return true;
      }
      AD.save(() => {
        r.live = { ...structuredClone(r.draft), sampleText: r.preview };
        r.state = "published";
        syncLive();
        render();
      });
    }
    if (k === "preset-unlist") {
      dialog(
        "unlist",
        note("a.preset.unlist"),
        B("cancel", "close") + B("confirm", "preset-unlist-confirm", "primary"),
      );
    }
    return true;
  }
  function confirm(a) {
    if (a !== "preset-unlist-confirm") return false;
    AD.save(() => {
      row().live = null;
      row().state = "unlisted";
      syncLive();
      close();
      render();
    });
    return true;
  }
  function change(el) {
    if (el.matches("[data-word-query]")) return;
    if (
      el.closest("#main") &&
      H.page() === "presets" &&
      el.matches("input,select,textarea")
    ) {
      capture();
      const b = $('[data-action="preset-publish"]');
      if (b) b.disabled = !publishable() || row().state === "running";
      const status = $("[data-preview-status]");
      if (status) status.innerHTML = row().signature !== sig(row().draft) ? note("preview.required", "warn") : "";
    }
  }
  return { page, handle: (a) => confirm(a) || handle(a), change, afterRender: picker.afterRender };
}
