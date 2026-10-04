import { icon } from "./icons.js?v=M002-UI-23";
// Visual authentication/lifecycle demonstration only; no credentials are stored or sent.
export function createIdentityDesign(H) {
  const {
    S,
    F,
    t,
    esc,
    B,
    field,
    note,
    heading,
    dialog,
    close,
    toast,
    go,
    render,
    page,
    scene,
    params,
    LD,
    loginNotice,
  } = H;
  const $ = (q) => document.querySelector(q);
  const allowed = [
    "home",
    "library",
    "batch",
    "range",
    "profile",
    "growth",
    "bag",
    "shop",
    "notices",
  ];
  let returnTo = allowed.includes(params.get("return"))
      ? params.get("return")
      : "home",
    claim = null;
  const protectedPages = [
    ...allowed.filter((p) => p !== "home"),
    "review",
    "overview",
    "summary",
    "sessiondone",
  ];
  const authPages = ["login", "register"];
  function begin(target = "home", withClaim = false) {
    returnTo = allowed.includes(target) ? target : "home";
    claim = withClaim ? structuredClone(S.generated) : null;
    S.claimPending = !!claim;
    go("login");
  }
  function destination(p) {
    if (S.guest && protectedPages.includes(p)) {
      returnTo = p;
      return "login";
    }
    return p;
  }
  function view(register = false) {
    const pending = !!claim,
      lost = !claim && params.get("claim") === "1";
    const contextual = pending || lost || returnTo !== "home";
    return `<div class="auth-layout ${contextual ? "has-context" : ""}"><section class="auth-intent"><span class="auth-symbol" aria-hidden="true">${icon("book-open")}</span><h2>${esc(t(pending ? "i.claim.title" : "i.story.title"))}</h2><p>${esc(t(pending ? "i.claim.desc" : "i.story.desc"))}</p>${pending ? note("i.claim.note") : lost ? note("i.claim.lost", "warn") : returnTo !== "home" ? `<p class="notice">${esc(t("i.return", { page: t(returnTo === "range" ? "l.range" : returnTo === "library" ? "l.library" : returnTo === "batch" ? "l.detail" : returnTo) }))}</p>` : ""}</section><section class="auth-form">${heading(register ? "i.register" : "login", register ? "i.register.desc" : "i.login.desc")}<form id="identity-form">${field("i.username", "auth-username", "", "text", `required minlength="3" maxlength="32" pattern="[A-Za-z0-9_]{3,32}" autocomplete="username"${register ? ' aria-describedby="auth-username-hint"' : ''}`)}${register ? `<p id="auth-username-hint" class="field-help">${esc(t("i.username.rule"))}</p>` : ""}${field("i.password", "auth-password", "", "password", `required minlength="8" maxlength="128" autocomplete="${register ? "new-password" : "current-password"}"${register ? ' aria-describedby="auth-password-hint"' : ''}`)}${register ? `<p id="auth-password-hint" class="field-help">${esc(t("i.password.rule"))}</p>` + field("i.confirm", "auth-confirm", "", "password", 'required minlength="8" maxlength="128" autocomplete="new-password"') : ""}<p id="auth-error" class="bad" role="alert"></p>${B(register ? "i.register" : "login", "identity-submit", "primary").replace('type="button"', 'type="submit"')}</form><div class="auth-switch"><span>${esc(t(register ? "i.existing" : "i.new"))}</span>${B(register ? "login" : "i.register", register ? "identity-login" : "identity-register", "quiet")}</div></section></div>`;
  }
  function error(k) {
    let el = $("#auth-error") || $("#identity-error");
    if (!el) {
      el = document.createElement("p");
      el.id = "identity-error";
      el.className = "bad";
      el.setAttribute("role", "alert");
      $("#dialog h2").after(el);
    }
    el.textContent = t(k);
  }
  function validForm(selector) {
    const inputs = [...document.querySelectorAll(selector + " input")];
    const bad = inputs.find((x) => !x.checkValidity());
    if (bad) {
      bad.reportValidity();
      return false;
    }
    return true;
  }
  async function authenticate() {
    if (!validForm("#identity-form")) return;
    if (
      page() === "register" &&
      $("#auth-password").value !== $("#auth-confirm").value
    ) {
      error("i.mismatch");
      return;
    }
    const btn = $('[data-action="identity-submit"]');
    btn.disabled = true;
    btn.textContent = t("loading");
    await new Promise((r) => setTimeout(r, 200));
    if (["auth-error", "username-taken"].includes(scene())) {
      error(scene() === "username-taken" ? "i.taken" : "i.failed");
      btn.disabled = false;
      btn.textContent = t(page() === "register" ? "i.register" : "login");
      return;
    }
    const admin = scene() === "admin";
    const name = $("#auth-username").value;
    const registering = page() === "register";
    if (registering) {
      F.user.username = name;
      S.nickname = "";
      F.user.lastLearn = null;
    }
    for (const el of document.querySelectorAll(
      "#identity-form input[type=password]",
    ))
      el.value = "";
    S.guest = false;
    sessionStorage.setItem("ww-m002-auth", "learner");
    if (admin) {
      S.claimPending = false;
      claim = null;
      go("adminhome");
      return;
    }
    const priorLearn = F.user.lastLearn;
    const learningDay = value => Math.floor((Date.parse(value) + 4 * 3600000) / 86400000);
    const welcome = () => toast(priorLearn ? "welcome" : "g.welcome.new", {
      name: S.nickname || name,
      days: priorLearn ? Math.max(0, learningDay(F.now) - learningDay(priorLearn.replace(" ", "T") + "+08:00")) : 0,
    });
    if (claim) {
      const result = claim;
      claim = null;
      S.claimPending = false;
      S.generation = "saved";
      S.generated = null;
      LD.generationComplete();
      LD.collect(result);
      if (!S.signed) {
        S.signed = true;
        S.points += 5;
        S.xp += 10;
      }
      welcome();
      setTimeout(loginNotice, 250);
    } else {
      go(returnTo);
      LD.initialize();
      render();
      welcome();
      setTimeout(loginNotice, 250);
    }
  }
  function handle(a) {
    if (a === "login") {
      begin(page());
      return true;
    }
    if (a === "login-collect") {
      begin("batch", true);
      return true;
    }
    if (a === "password") {
      dialog(
        "password",
        `<form id="password-form">${field("i.current", "current-password", "", "password", 'required autocomplete="current-password"')}${field("newpassword", "new-password", "", "password", 'required minlength="8" maxlength="128" autocomplete="new-password"')}${field("i.confirm", "confirm-password", "", "password", 'required minlength="8" maxlength="128" autocomplete="new-password"')}${note("i.sessions")}</form>`,
        B("cancel", "close") + B("save", "identity-password-save", "primary"),
      );
      return true;
    }
    if (a === "delete-account") {
      dialog(
        "deleteaccount",
        `<form id="account-delete-form">${note("deleteaccount.desc", "warn")}${field("i.current", "delete-password", "", "password", 'required autocomplete="current-password"')}<label class="library-check"><input id="delete-understood" type="checkbox" required><span>${esc(t("i.delete.confirm"))}</span></label></form>`,
        B("cancel", "close") + B("confirm", "identity-delete-check", "danger"),
      );
      return true;
    }
    if (a === "logout") {
      S.guest = true;
      sessionStorage.setItem("ww-m002-auth", "guest");
      go("home");
      return true;
    }
    if (!a.startsWith("identity-")) return false;
    switch (a.slice(9)) {
      case "login":
        go("login");
        break;
      case "register":
        go("register");
        break;
      case "submit":
        void authenticate();
        break;
      case "password-save":
        if (!validForm("#password-form")) break;
        if ($("#new-password").value !== $("#confirm-password").value) {
          error("i.mismatch");
          break;
        }
        if (scene() === "save-error") {
          error("i.current.invalid");
          break;
        }
        close();
        toast("i.password.saved");
        break;
      case "delete-check":
        if (!validForm("#account-delete-form")) break;
        if (scene() === "save-error") {
          error("i.current.invalid");
          break;
        }
        $("#delete-password").value = "";
        dialog(
          "deleteaccount",
          note("i.delete.final", "warn"),
          B("cancel", "close") +
            B("deleteaccount", "identity-delete-final", "danger"),
        );
        break;
      case "delete-final":
        LD.erase();
        close();
        S.guest = true;
        S.claimPending = false;
        claim = null;
        sessionStorage.setItem("ww-m002-auth", "guest");
        go("home");
        toast("i.deleted");
        break;
    }
    return true;
  }
  function afterRender() {
    if (!authPages.includes(page())) return;
    const u = new URL(location);
    u.searchParams.set("return", returnTo);
    if (claim) u.searchParams.set("claim", "1");
    history.replaceState({}, "", u);
  }
  function discardClaim() {
    claim = null;
    S.claimPending = false;
  }
  function closed() {
    for (const el of document.querySelectorAll("#dialog input[type=password]"))
      el.value = "";
  }
  return {
    view,
    begin,
    destination,
    handle,
    afterRender,
    discardClaim,
    closed,
    authPages,
    protectedPages,
  };
}
