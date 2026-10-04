export function createOperationsDesign(H) {
  const {
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
    forget,
  } = H;
  const $ = (q) => document.querySelector(q),
    $$ = (q) => [...document.querySelectorAll(q)];
  const A = AD.A;
  let filter = "";
  const rows = () =>
    S.optab === "levelsettings" ? A.levels : A.achievements[A.kind];
  const capture = () => {
    if (!["levelsettings", "achievementsettings"].includes(S.optab)) return;
    rows().forEach((r, i) => {
      const el = $("#tier-threshold-" + i);
      if (!el) return;
      r.threshold = Number(el.value);
      r.points = Number($("#tier-points-" + i).value);
      if ($("#tier-xp-" + i)) r.xp = Number($("#tier-xp-" + i).value);
      r.card = Number($("#tier-card-" + i).value);
      r.quantity = Number($("#tier-quantity-" + i).value);
      r.enabled = $("#tier-enabled-" + i).checked;
    });
  };
  function body() {
    if (S.optab === "signsettings")
      return `${help("sign.effect")}<div class="form-grid">${[
        ["rewardpoints", "points"],
        ["increment", "increment"],
        ["cap", "cap"],
        ["rewardxp", "xp"],
        ["firstxp", "firstxp"],
      ]
        .map(([k, v]) =>
          field(
            k,
            "sign-" + v,
            A.sign[v],
            "number",
            'min="0" step="1" required',
          ),
        )
        .join("")}</div><div class="form-footer">${B("save", "settings-save", "primary")}</div>`;
    const level = S.optab === "levelsettings";
    return `${help(level ? "level.effect" : "achievement.effect")}${
      level
        ? note("a.level.initial")
        : select(
            "type",
            "achievement-kind",
            F.achievements.map((x) => [x.kind, L(x.title)]),
            A.kind,
          )
    }<div class="toolbar">${field("a.tier.search", "tier-search", filter, "search")}${B("addtier", "add-tier")}</div><div class="table-wrap"><table class="data-table tier-table"><thead><tr>${["a.tier", "threshold", "rewardpoints", ...(!level ? ["rewardxp"] : []), "rewardcard", "a.quantity", "enabled", "edit"].map((k) => `<th>${esc(t(k))}</th>`).join("")}</tr></thead><tbody>${rows()
      .map((r, i) => {
        const initial = level && i === 0;
        return `<tr data-tier-row data-tier-name="${esc(level ? "Lv. " + (i + 1) : L(r.title))}"><td>${level ? "Lv. " + (i + 1) : esc(L(r.title))}</td><td><input id="tier-threshold-${i}" aria-label="${esc(t("threshold"))} ${i + 1}" type="number" min="0" step="1" value="${r.threshold}" ${initial ? "disabled" : ""}></td><td><input id="tier-points-${i}" aria-label="${esc(t("rewardpoints"))} ${i + 1}" type="number" min="0" step="1" value="${r.points}" ${initial ? "disabled" : ""}></td>${!level ? `<td><input id="tier-xp-${i}" aria-label="${esc(t("rewardxp"))} ${i + 1}" type="number" min="0" step="1" value="${r.xp}"></td>` : ""}<td><select id="tier-card-${i}" aria-label="${esc(t("rewardcard"))} ${i + 1}" ${initial ? "disabled" : ""}><option value="-1">—</option>${S.items.map((c, n) => `<option value="${n}" ${r.card === n ? "selected" : ""}>${esc(L(c.title))}${!c.listed ? " · " + esc(t("unlisted")) : ""}</option>`).join("")}</select></td><td><input id="tier-quantity-${i}" aria-label="${esc(t("a.quantity"))} ${i + 1}" type="number" min="1" step="1" value="${r.quantity}" ${initial ? "disabled" : ""}></td><td><input id="tier-enabled-${i}" aria-label="${esc(t("enabled"))} ${i + 1}" type="checkbox" ${r.enabled ? "checked" : ""} ${initial ? "disabled" : ""}></td><td>${!level ? B("a.tier.content", "tier-content:" + i, "small") : "—"}</td></tr>`;
      })
      .join(
        "",
      )}</tbody></table></div><div class="actions form-footer">${B("save", "settings-save", "primary")}</div>`;
  }
  function content(i) {
    capture();
    A.editTier = i;
    const r = rows()[i];
    dialog(
      "a.tier.content",
      `${["title", "description", "honor"].map((k) => `<div class="form-grid">${["zh", "en"].map((l) => field("a.tier." + k + "." + l, "tier-" + k + "-" + l, r[k]?.[l] || "")).join("")}</div>`)}${note("a.honor.rule")}`,
      B("cancel", "close") + B("save", "tier-content-save", "primary"),
    );
  }
  function handle(a) {
    const [k, arg] = a.split(":");
    switch (k) {
      case "optab":
        capture();
        S.optab = arg;
        forget();
        render();
        return true;
      case "add-tier":
        capture();
        const prev = rows().at(-1);
        rows().push({
          ...structuredClone(prev),
          designId: undefined,
          threshold: prev.threshold + 100,
          enabled: true,
        });
        forget();
        render();
        return true;
      case "tier-content":
        content(Number(arg));
        return true;
      case "tier-content-save": {
        const title = {
          zh: $("#tier-title-zh").value.trim(),
          en: $("#tier-title-en").value.trim(),
        };
        if (!title.zh && !title.en) {
          AD.error("a.title.required");
          return true;
        }
        const r = rows()[A.editTier];
        r.title = title;
        for (const k of ["description", "honor"])
          r[k] = {
            zh: $("#tier-" + k + "-zh").value,
            en: $("#tier-" + k + "-en").value,
          };
        close();
        forget();
        render();
        return true;
      }
      case "settings-save": {
        if (
          $$("#main input[type=number]:not(:disabled)").some(
            (x) => !x.reportValidity(),
          )
        )
          return true;
        if (S.optab === "signsettings") {
          const draft = {};
          for (const k of Object.keys(A.sign))
            draft[k] = Number($("#sign-" + k).value);
          if (draft.cap < draft.points) {
            AD.error("a.sign.invalid");
            return true;
          }
          AD.save(() => {
            A.sign = draft;
          });
          return true;
        }
        capture();
        const r = rows();
        if (r.some((v, i) => i && v.threshold <= r[i - 1].threshold)) {
          AD.error("a.tier.order");
          return true;
        }
        if (S.optab === "levelsettings") {
          dialog(
            "a.level.confirm",
            note("level.effect", "warn"),
            B("cancel", "close") + B("confirm", "settings-confirm", "primary"),
          );
        } else AD.save(() => {});
        return true;
      }
      case "settings-confirm":
        AD.save(() => close());
        return true;
      case "item-refs": {
        const i = Number(arg);
        const refs = [];
        A.levels.forEach((r, n) => {
          if (r.card === i) refs.push(B("levelsettings", "ref-level:" + n));
        });
        Object.entries(A.achievements).forEach(([kind, tiers]) =>
          tiers.forEach((r, n) => {
            if (r.card === i)
              refs.push(
                `<button class="btn" data-action="ref-achievement:${kind}:${n}">${esc(L(r.title))}</button>`,
              );
          }),
        );
        dialog("refs", refs.length ? refs.join("") : note("refs.none"));
        return true;
      }
      case "ref-level":
        close();
        S.optab = "levelsettings";
        forget();
        render();
        return true;
      case "ref-achievement":
        close();
        S.optab = "achievementsettings";
        A.kind = arg;
        forget();
        render();
        return true;
      case "item-delete": {
        const i = Number(arg);
        if (hasRefs(i) || i < 4) {
          dialog("delete", note("delete.blocked", "warn"));
          return true;
        }
        return false;
      }
    }
    return false;
  }
  function hasRefs(i) {
    return [...A.levels, ...Object.values(A.achievements).flat()].some(
      (r) => r.card === i,
    );
  }
  function change(el) {
    if (el.id === "achievement-kind") {
      capture();
      A.kind = el.value;
      forget();
      render();
    }
  }
  function input(el) {
    if (el.id === "tier-search") {
      filter = el.value.toLowerCase();
      $$("[data-tier-row]").forEach(
        (row) =>
          (row.hidden = !row.dataset.tierName.toLowerCase().includes(filter)),
      );
    }
  }
  return { body, handle, change, input, hasRefs };
}
