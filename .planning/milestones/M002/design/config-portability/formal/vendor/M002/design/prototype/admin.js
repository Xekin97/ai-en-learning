import { icon, routeIcons } from "./icons.js?v=M002-UI-23";
// UI-03 design-only administrator workspace. No credentials or mutations leave this prototype.
export function createAdminDesign(H) {
  const {
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
    scene,
    page,
    language,
    forget,
  } = H;
  const $ = (q) => document.querySelector(q),
    $$ = (q) => [...document.querySelectorAll(q)];
  const A = structuredClone(F.admin);
  Object.assign(A, {
    plan: "basic",
    query: "",
    searched: false,
    limit: 2,
    user: "u1",
    tab: "identity",
    kind: F.achievements[0].kind,
    pending: null,
  });
  A.planDrafts = structuredClone(A.plans);
  const modules = [
    "adminhome",
    "metrics",
    "models",
    "plans",
    "users",
    "operations",
    "messages",
    "presets",
  ];
  const pages = [...modules, "userdetail", "credits"];
  const module = () =>
    ["userdetail", "credits"].includes(page()) ? "users" : page();
  const label = (k) => t("a." + k);
  const button = (k, a, cls = "", disabled = false) =>
    B("a." + k, "adm-" + a, cls, disabled);
  const activeModels = () => A.models.filter((m) => m.enabled);
  const syncModels = () => {
    S.models = activeModels().map((m) => m.name);
  };
  const person = () => A.users.find((u) => u.id === A.user) || A.users[0];
  const planName = (code) => (code ? label("plan." + code) : "—");
  const multi = (key, id, opts, chosen) =>
    `<fieldset class="admin-options"><legend>${esc(label(key))}</legend>${opts.map(([v, name]) => `<label><input type="checkbox" name="${id}" value="${esc(v)}" ${chosen.includes(v) ? "checked" : ""}><span>${esc(name)}</span></label>`).join("")}</fieldset>`;
  const chosen = (name) =>
    $$(`input[name="${name}"]:checked`).map((x) => x.value);
  const error = (key = "failed") => {
    let box = $("#admin-error");
    if (!box) {
      box = document.createElement("p");
      box.id = "admin-error";
      box.className = "notice error";
      box.setAttribute("role", "alert");
      ($("#dialog").open ? $("#dialog h2") : $(".admin-main h1"))?.after(box);
    }
    box.textContent = t(key);
    toast(key);
  };
  function save(fn) {
    if (scene() === "save-error") {
      error();
      return false;
    }
    $("#admin-error")?.remove();
    forget();
    fn();
    toast("saved");
    return true;
  }
  function header() {
    return `<header class="topbar admin-topbar"><div class="container header-inner"><a class="brand" data-go="adminhome" href="?page=adminhome">${H.mark}${esc(t("brand"))}<small>${esc(t("admin"))}</small></a><div class="header-actions"><label class="locale-control"><span class="sr-only">${esc(t("language"))}</span><select id="site-language" aria-label="${esc(t("language"))}"><option value="zh" ${language() === "zh" ? "selected" : ""}>中文</option><option value="en" ${language() === "en" ? "selected" : ""}>EN</option></select></label><span class="pill">${esc(label("role.admin"))}</span>${button("logout", "logout", "quiet")}</div></div></header>`;
  }
  function shell(content) {
    return `<div class="admin-layout"><nav class="admin-nav" aria-label="${esc(t("admin"))}">${modules.map((p, i) => `<a href="?page=${p}&lang=${language()}" data-go="${p}" ${module() === p ? 'aria-current="page" class="selected"' : ""}>${icon(routeIcons[p])}${esc(label(p))}</a>`).join("")}</nav><div class="admin-main">${content}</div></div>`;
  }
  function home() {
    return shell(
      `${heading("a.adminhome", "a.overview.desc", link("metrics", "a.analysis.open", "btn"))}<div class="metrics-grid">${[
        ["uv", "1,248"],
        ["wau", "286"],
        ["completed", "78.2%"],
        ["failure", "2.4%"],
      ]
        .map(
          ([k, v]) =>
            `<div class="metric"><small>${esc(t(k))}</small><strong>${esc(scene() === "empty" ? t("nosample") : v)}</strong></div>`,
        )
        .join(
          "",
        )}</div><p class="muted">${esc(t("updated", { time: "2026-09-17 12:04" }))} · ${esc(t("metrics.time"))}</p><div class="admin-launch-grid">${modules
        .slice(1)
        .map(
          (p) =>
            `<a class="panel admin-launch" href="?page=${p}" data-go="${p}"><h2>${esc(label(p))}${icon("arrow-up-right")}</h2><p>${esc(label(p + ".desc"))}</p></a>`,
        )
        .join("")}</div>`,
    );
  }
  const protocolLabel = (protocol) => t('gm.' + ({openai_chat:'chat',openai_responses:'responses',anthropic_messages:'anthropic'}[protocol] || 'chat'));
  const providerKey = m => m.connectionId || 'legacy-openrouter';
  function modelProviders() {
    A.providerRegistry ||= {};
    for(const m of A.models) A.providerRegistry[providerKey(m)]={id:providerKey(m),name:m.connectionName||'OpenRouter',protocol:m.protocol||'openai_chat',baseURL:m.baseURL||'https://openrouter.ai/api/v1'};
    return Object.values(A.providerRegistry).map(p=>({...p,models:A.models.filter(m=>providerKey(m)===p.id)}));
  }
  function models() {
    const providers=scene()==='empty'?[]:modelProviders();
    return shell(`${heading('gm.title','gm.subtitle',B('gm.add','adm-model-new','primary'))}<section class="generic-provider-list">${providers.length?providers.map(p=>`<article class="generic-provider-card"><header class="generic-provider-heading"><div class="generic-model-symbol">${icon('bot')}</div><div class="generic-model-copy"><div class="generic-model-title"><h2>${esc(p.name)}</h2><span class="pill">${p.models.length} ${esc(t('gm.models.count'))}</span></div><p class="generic-model-meta"><span>${esc(p.baseURL)}</span><span>${esc(protocolLabel(p.protocol))}</span><span>${esc(t('gm.key.configured'))}</span></p></div>${B('gm.edit','adm-provider-edit:'+p.id,'small')}</header><div class="generic-provider-models">${p.models.length?p.models.map(m=>`<article class="generic-model-row"><div class="generic-model-copy"><div class="generic-model-title"><h3>${esc(m.name)}</h3>${badge(m.enabled?'gm.active':'gm.inactive')}</div><code>${esc(m.provider)}</code>${m.description?`<p class="generic-model-description">${esc(m.description)}</p>`:''}</div><div class="generic-model-actions">${B('gm.test','adm-model-test:'+A.models.indexOf(m),'quiet small')}${button('remove','model-remove:'+A.models.indexOf(m),'danger quiet small')}</div></article>`).join(''):`<p class="provider-empty">${esc(t('gm.provider.empty'))}</p>`}</div></article>`).join(''):`<div class="generic-model-empty">${icon('bot')}<h2>${esc(t('gm.empty'))}</h2><p>${esc(t('gm.empty.help'))}</p>${B('gm.add','adm-model-new','primary')}</div>`}</section>`);
  }
  let modelRowSequence=0;
  function modelItem(m={}, removable=true) {
    const key=++modelRowSequence;
    const input=(label,fieldName,value='',type='text',extra='')=>`<label class="field"><span>${esc(t(label))}</span><input data-model-field="${fieldName}" name="${fieldName}" type="${type}" value="${esc(value ?? '')}" ${extra}></label>`;
    return `<section class="generic-model-item" data-model-key="${key}" data-model-id="${esc(m.id||'')}"><div class="model-item-heading"><h4>${esc(t('gm.models.section'))}</h4>${removable?B('gm.model.remove','adm-model-row-remove:'+key,'quiet small'):''}</div><div class="model-field-grid"><div class="model-field">${input('gm.id','providerModelId',m.provider,'text','required maxlength="500"')}<p class="field-help">${esc(t('gm.id.help'))}</p></div><div class="model-field">${input('gm.name.optional','displayName',m.name,'text',`maxlength="200" placeholder="${esc(t('gm.name.auto'))}"`)}</div></div><details class="generic-model-advanced"><summary>${esc(t('gm.advanced'))}</summary><div class="model-advanced-fields"><div class="model-field">${input('gm.output','maxOutputTokens',m.maxOutputTokens,'number','min="1" max="1048576" step="1"')}<p class="field-help">${esc(t('gm.output.help'))}</p></div><div class="model-option"><label class="check"><input data-model-field="outputMode" type="checkbox" ${m.outputMode==='json_schema'?'checked':''}>${esc(t('gm.structured'))}</label><p class="field-help">${esc(t('gm.structured.help'))}</p></div>${input('gm.description','description',m.description,'text','maxlength="1000"')}</div></details><div class="model-item-actions"><label class="check"><input data-model-field="enabled" type="checkbox" ${m.enabled?'checked':''}>${esc(t('gm.enable'))}</label>${B('gm.test','adm-model-test-draft:'+key,'quiet small')}</div><p id="model-test-result-${key}" class="field-help" role="status"></p></section>`;
  }
  function modelForm(i=-1) {
    A.editProvider = i;
    const p=modelProviders().find(p=>p.id===i);
    const members=p?.models || [];
    const m=p?{connectionName:p.name,baseURL:p.baseURL,protocol:p.protocol}:{};
    dialog(p?'gm.edit':'gm.add',`<div class="generic-model-form"><section class="model-form-section" data-model-section="provider"><div class="model-section-heading"><span class="model-step">1</span><div><h3>${esc(t('gm.connection.section'))}</h3><p>${esc(t('gm.connection.section.help'))}</p></div></div><div class="generic-connection-fields"><div class="model-field-grid">${field('gm.provider','admin-model-connection-name',m.connectionName || '')}<div class="model-field">${select('gm.protocol','admin-model-protocol',[['openai_chat',t('gm.chat')],['openai_responses',t('gm.responses')],['anthropic_messages',t('gm.anthropic')]],m.protocol || 'openai_chat')}<p class="field-help" id="model-protocol-help">${esc(t('gm.chat.help'))}</p></div></div><div class="model-field">${field('gm.url','admin-model-url',m.baseURL || '','url','placeholder="https://api.example.com/v1" required')}<p class="field-help">${esc(t('gm.url.help'))}</p></div><div class="model-field">${field('gm.key','admin-model-key','','password',`autocomplete="new-password" placeholder="${esc(t(p?'gm.key.keep':'gm.key'))}"`)}<p class="field-help">${esc(t('gm.key.help'))}</p></div>${p?`<p class="field-help">${esc(t('gm.changed.connection'))}</p>`:''}</div></section><section class="model-form-section" data-model-section="models"><div class="model-section-heading"><span class="model-step">2</span><div><h3>${esc(t('gm.models.section'))}</h3><p>${esc(t('gm.models.section.help'))}</p></div></div><div id="model-entry-list" class="model-form-section">${p?members.map(m=>modelItem(m,false)).join(''):modelItem({},false)}</div>${B('gm.model.add','adm-model-row-add','model-add')}<p class="field-help">${esc(t('gm.test.note'))}</p></section></div>`,B('cancel','close')+B('gm.models.save','adm-model-save','primary'));
    const protocolChanged=()=>{const value=$('#admin-model-protocol').value;$('#model-protocol-help').textContent=t('gm.'+({openai_chat:'chat',openai_responses:'responses',anthropic_messages:'anthropic'}[value])+'.help');$$('[data-model-field="outputMode"]').forEach(x=>{x.disabled=value==='anthropic_messages';});};
    $('#admin-model-protocol').addEventListener('change',protocolChanged);protocolChanged();
  }
  function modelImpact(i) {
    const m = A.models[i];
    A.editModel = i;
    const plans = A.plans.filter((p) => p.models.includes(m.id));
    const cards = S.items.filter(
      (c) => c.type === "model" && c.models?.includes(m.name),
    );
    const presets = F.presets.filter((p) => p.model === m.name);
    dialog(
      "model.remove.title",
      `<h3>${esc(m.name)}</h3>${note("model.remove.desc", "warn")}<dl class="admin-facts"><div><dt>${esc(label("plans"))}</dt><dd>${plans.map((p) => `${esc(planName(p.code))}${p.models.length === 1 ? " · " + esc(label("model.last")) : ""}`).join("<br>") || "—"}</dd></div><div><dt>${esc(t("itemsettings"))}</dt><dd>${cards.map((c) => esc(L(c.title))).join(" / ") || "—"}</dd></div><div><dt>${esc(label("presets"))}</dt><dd>${presets.map((p) => esc(p.title)).join(" / ") || "—"}</dd></div></dl>${note("a.model.removeimpact")}`,
      B("cancel", "close") + button("remove", "model-delete", "danger"),
    );
  }
  const currentPlan = () => A.planDrafts.find((p) => p.code === A.plan);
  function planDraft() {
    const p = currentPlan();
    return {
      ...p,
      priority: Number($("#plan-priority").value),
      limit: $("#plan-unlimited").checked
        ? null
        : Number($("#plan-limit").value),
      maxEntries: Number($("#plan-max").value),
      models: chosen("plan-model"),
      lengths: chosen("plan-length"),
    };
  }
  function planWarning(p) {
    const reasons = [];
    if (!p.models.some((id) => A.models.some((m) => m.id === id && m.enabled)))
      reasons.push(label("plan.nomodel"));
    if (!p.lengths.length) reasons.push(label("plan.nolength"));
    if (p.limit === 0) reasons.push(label("plan.zero"));
    return reasons.length
      ? `<p class="notice warn">${esc(reasons.join(" · "))}</p>`
      : "";
  }
  function plans() {
    const p = currentPlan();
    return shell(
      `${heading("a.plans", "")}<div class="tabs">${A.plans.map((x) => button("plan." + x.code, "plan-select:" + x.code, x.code === p.code ? "selected" : "")).join("")}</div><section class="panel">${help("plan.effect")}<div id="plan-warning">${planWarning(p)}</div><div class="form-grid"><div>${multi(
        "plan.models",
        "plan-model",
        A.models.map((m) => [
          m.id,
          m.name + (m.enabled ? "" : " · " + t("disabled")),
        ]),
        p.models,
      )}${multi(
        "plan.lengths",
        "plan-length",
        ["short", "medium", "long", "xlong"].map((x) => [
          x,
          label("length." + x),
        ]),
        p.lengths,
      )}</div><div>${field("priority", "plan-priority", p.priority, "number", 'min="0" step="1" required')}${field("words.limit", "plan-max", p.maxEntries, "number", 'min="1" step="1" required')}${field("a.plan.limit", "plan-limit", p.limit ?? "", "number", `min="0" step="1" ${p.limit === null ? "disabled" : ""}`)}${check("a.plan.unlimited", "plan-unlimited", p.limit === null)}<p class="muted">${esc(label("plan.window"))}</p></div></div><div class="form-footer">${button("save", "plan-save", "primary")}</div></section>`,
    );
  }
  function users() {
    const rows = A.searched
      ? A.users.filter((u) =>
          u.username.toLowerCase().includes(A.query.toLowerCase()),
        )
      : [];
    return shell(
      `${heading("a.users", "")}<form class="toolbar panel" id="admin-search-form">${field("a.username", "admin-user-query", A.query, "search")}${button("search", "search", "primary")}</form>${
        !A.searched
          ? `<p class="muted search-help">${esc(t("a.users.start"))}</p>`
          : scene() === "search-error"
            ? `<section class="panel">${note("a.search.error", "error")}${button("retry", "search")}</section>`
            : !rows.length
              ? note("a.users.empty")
              : `<section class="panel"><h2>${esc(label("users.results"))}</h2><div class="table-wrap"><table class="data-table"><thead><tr>${["username", "role", "baseplan", "created", "actions"].map((k) => `<th>${esc(label(k))}</th>`).join("")}</tr></thead><tbody>${rows
                  .slice(0, A.limit)
                  .map(
                    (u) =>
                      `<tr><td><strong>${esc(u.username)}</strong><small class="admin-cell-copy">${esc(u.nickname)}</small></td><td>${esc(label("role." + u.role))}</td><td>${esc(planName(u.plan))}</td><td>${esc(u.created)}</td><td>${button("view", "user:" + u.id, "small")}</td></tr>`,
                  )
                  .join(
                    "",
                  )}</tbody></table></div>${rows.length > A.limit ? button("more", "more") : ""}</section>`
      }`,
    );
  }
  function identity(u) {
    return `<section class="panel"><dl class="admin-facts">${[
      ["username", u.username],
      ["role", label("role." + u.role)],
      ["baseplan", planName(u.plan)],
      ["created", u.created],
      ["lastlogin", u.lastLogin],
      ["lastlearn", u.lastLearn || "—"],
    ]
      .map(([k, v]) => `<div><dt>${esc(label(k))}</dt><dd>${esc(v)}</dd></div>`)
      .join(
        "",
      )}${u.role === "learner" ? `<div><dt>${esc(label("quota"))}</dt><dd>${esc(A.plans.find((p) => p.code === u.plan).limit === null ? label("plan.unlimited") : String(Math.max(0, A.plans.find((p) => p.code === u.plan).limit - u.used)))}</dd></div>` : ""}</dl>${u.role === "learner" ? `<div class="actions">${button("user.plan", "user-plan")}${button("user.password", "password", "danger")}</div>` : note("a.user.adminreadonly")}</section>`;
  }
  function points(u) {
    return `<section class="panel"><p id="found-user"><strong>${esc(u.username)}</strong> · ${esc(t("pricevalue", { count: u.points }))}</p>${note("credit.rule")}<div class="form-grid">${field("amount", "credit-amount", "", "number", 'min="1" step="1" required')}${field("reason", "credit-reason")}</div>${button("supplement", "credit", "primary")}<h2 class="section">${esc(label("ledger"))}</h2><div class="table-wrap"><table class="data-table"><thead><tr>${["time", "source", "amount", "balance"].map((k) => `<th>${esc(label(k))}</th>`).join("")}</tr></thead><tbody>${A.ledger
      .filter((x) => x.user === u.id)
      .map(
        (x) =>
          `<tr><td>${esc(x.at)}</td><td>${esc(label("source." + x.source))}${x.reason ? `<small class="admin-cell-copy">${esc(x.reason)}</small>` : ""}</td><td>${x.amount > 0 ? "+" : ""}${x.amount}</td><td>${x.balance}</td></tr>`,
      )
      .join("")}</tbody></table></div></section>`;
  }
  function growth(u) {
    return `<section class="panel"><div class="stats">${[
      ["level", "Lv. " + u.level],
      ["xp", u.xp],
      ["mastered", u.mastered],
      ["saved", u.saved],
    ]
      .map(
        ([k, v]) =>
          `<div><small>${esc(label(k))}</small><strong>${v}</strong></div>`,
      )
      .join(
        "",
      )}</div>${note("a.growth.readonly")}${link("operations", "a.growth.rules", "btn")}</section>`;
  }
  const learningRows = () => person().username === F.user.username ? H.learning().allBatches() : A.batches;
  const titleOf = (p) => p.targets ? H.learning().titleOf(p) : p.title;
  const wordsOf = (p) => p.targets ? p.targets.map((w) => w.word) : p.words;
  const tagsOf = (p) => p.tags ? p.tags.join(" · ") : L(p.label);
  function library(u) {
    return `<section class="panel"><div class="section-head"><h2>${esc(label("learning"))}</h2>${badge("a.readonly")}</div>${scene() === "empty" ? note("empty") : learningRows().map((p, i) => `<article class="admin-library-row"><div><h3>${esc(titleOf(p))}</h3><p>${wordsOf(p).map(esc).join(" · ")}</p><small>${esc(label("savedat"))} ${esc(p.savedAt || `2026-09-${17 - i}`)} · ${esc(tagsOf(p))} · ${esc(label(p.participates === false ? "paused" : "included"))}</small></div>${button("reader", "reader:" + i, "small")}</article>`).join("")}</section>`;
  }
  function userdetail(forcedTab) {
    const u = person(),
      tab = forcedTab || A.tab;
    return shell(
      `${heading("a.users", "", link("users", "a.users.back", "btn"))}<div class="admin-user-banner"><div><span class="avatar">${esc((u.nickname || u.username)[0])}</span><strong>${esc(u.nickname || u.username)}</strong><span>@${esc(u.username)}</span></div>${badge("a.role." + u.role)}</div><div class="tabs">${(u.role === "learner" ? ["identity", "growth", "points", "learning"] : ["identity"]).map((k) => button("user." + k, "user-tab:" + k, k === tab ? "selected" : "")).join("")}</div>${u.role !== "learner" ? identity(u) : tab === "points" ? points(u) : tab === "growth" ? growth(u) : tab === "learning" ? library(u) : identity(u)}`,
    );
  }
  function reader(i) {
    const p = learningRows()[i];
    if (!p) return;
    dialog(
      "a.reader",
      `${badge("a.readonly")}<p>${esc(person().username)} · ${esc(label("savedat"))} ${esc(p.savedAt || "2026-09-17")}</p><h3 class="admin-reader-title">${esc(titleOf(p))}</h3><p class="story-text">${p.passage ? H.learning().fullPassage(p) : esc(p.excerpt)}</p><dl class="admin-facts">${[
        ["model", p.model],
        ["style", p.style],
        ["length", p.length],
        ["explain", p.language],
      ]
        .map(([k, v]) => `<div><dt>${esc(t(k))}</dt><dd>${esc(v)}</dd></div>`)
        .join(
          "",
        )}</dl><h3>${esc(label("tags"))}</h3><p>${esc(tagsOf(p))}</p><h3>${esc(t("words"))}</h3>${(p.targets || F.words).map((w) => `<div class="answer-row"><div><strong>${esc(w.word)}</strong><p>${esc(w.meaningText || L(w.meaning))}</p><p>${esc(w.fullPhrase || w.phrase)}</p></div></div>`).join("")}`,
    );
  }
  function handle(action) {
    if (!action.startsWith("adm-")) return false;
    const [cmd, arg] = action.slice(4).split(":"),
      i = Number(arg),
      u = person();
    switch (cmd) {
      case "logout":
        dialog(
          "a.logout",
          note("a.logout.note"),
          B("cancel", "close") + button("logout", "logout-confirm", "primary"),
        );
        break;
      case "logout-confirm":
        close();
        S.guest = true;
        go("home");
        break;
      case 'model-test':
        toast(scene()==='save-error'?'gm.test.fail':'gm.test.ok');
        break;
      case 'model-test-draft':
        $('#model-test-result-'+arg).textContent=t(scene()==='save-error'?'gm.test.fail':'gm.test.ok');
        break;
      case 'model-row-add': {
        const list=$('#model-entry-list');if(list.children.length>=100)break;
        list.insertAdjacentHTML('beforeend',modelItem());
        list.lastElementChild.querySelector('input').focus();
        $('#admin-model-protocol').dispatchEvent(new Event('change'));
        break;
      }
      case 'model-row-remove':
        if($('#model-entry-list').children.length>1)$('[data-model-key="'+arg+'"]').remove();
        break;
      case "model-new":
        modelForm();
        break;
      case "provider-edit":
        modelForm(arg);
        break;
      case "model-save": {
        const rows=$$('.generic-model-item');
        if(!$('#admin-model-url').reportValidity() || rows.some(row=>!row.querySelector('[data-model-field="providerModelId"]').reportValidity()))break;
        const ids=rows.map(row=>row.querySelector('[data-model-field="providerModelId"]').value);
        if(new Set(ids).size!==ids.length){error('gm.duplicate');break;}
        save(()=>{
          const providerId=A.editProvider===-1?'provider-'+Date.now():A.editProvider;
          const items=rows.map((row,index)=>{
            const value=name=>row.querySelector('[data-model-field="'+name+'"]');
            return {id:row.dataset.modelId || 'm'+Date.now()+'-'+index,connectionId:providerId,name:value('displayName').value.trim()||value('providerModelId').value,provider:value('providerModelId').value,description:value('description').value,enabled:value('enabled').checked,connectionName:$('#admin-model-connection-name').value||'Custom',protocol:$('#admin-model-protocol').value,baseURL:$('#admin-model-url').value,maxOutputTokens:Number(value('maxOutputTokens').value)||null,outputMode:value('outputMode').checked?'json_schema':'prompt'};
          });
          A.providerRegistry[providerId]={id:providerId,name:$('#admin-model-connection-name').value||'Custom',protocol:$('#admin-model-protocol').value,baseURL:$('#admin-model-url').value};
          for(const item of items){const index=A.models.findIndex(m=>m.id===item.id);if(index>=0){const previous=A.models[index];A.models[index]=item;S.items.forEach(c=>{if(c.models)c.models=c.models.map(n=>n===previous.name?item.name:n);});F.presets.forEach(p=>{if(p.model===previous.name)p.model=item.name;});}else A.models.push(item);}
          syncModels();close();render();
        });
        break;
      }
      case "model-remove":
        modelImpact(i);
        break;
      case "model-delete":
        save(() => {
          const m = A.models[A.editModel];
          [...A.plans, ...A.planDrafts].forEach(
            (p) => (p.models = p.models.filter((id) => id !== m.id)),
          );
          A.models.splice(A.editModel, 1);
          syncModels();
          close();
          render();
        });
        break;
      case "plan-select":
        if ($("#plan-priority"))
          A.planDrafts[A.planDrafts.findIndex((p) => p.code === A.plan)] =
            planDraft();
        forget();
        A.plan = arg;
        render();
        break;
      case "plan-save": {
        if (
          $$("#main input[type=number]:not(:disabled)").some(
            (x) => !x.reportValidity(),
          )
        )
          break;
        const draft = planDraft();
        if (
          A.plans.some(
            (p) => p.code !== draft.code && p.priority === draft.priority,
          )
        ) {
          error("plan.duplicate");
          break;
        }
        A.pending = draft;
        dialog(
          "a.plan.confirm",
          `${note("plan.effect")}${planWarning(draft)}<p>${esc(planName(draft.code))} · ${esc(label("priority"))} ${draft.priority}</p>`,
          B("cancel", "close") + button("save", "plan-confirm", "primary"),
        );
        break;
      }
      case "plan-confirm":
        save(() => {
          A.plans[A.plans.findIndex((p) => p.code === A.pending.code)] =
            structuredClone(A.pending);
          A.planDrafts[
            A.planDrafts.findIndex((p) => p.code === A.pending.code)
          ] = structuredClone(A.pending);
          A.pending = null;
          close();
          render();
        });
        break;
      case "search":
        A.query = $("#admin-user-query").value.trim();
        A.searched = true;
        A.limit = 2;
        forget();
        render();
        break;
      case "more":
        A.limit += 2;
        render();
        break;
      case "user":
        A.user = arg;
        A.tab = "identity";
        go("userdetail");
        break;
      case "user-tab":
        A.tab = arg;
        forget();
        if (page() === "credits") go("userdetail");
        else render();
        break;
      case "user-plan":
        dialog(
          "a.user.plan",
          `${select(
            "a.baseplan",
            "base-plan",
            A.plans
              .filter((p) => p.code !== "visitor")
              .map((p) => [p.code, planName(p.code)]),
            u.plan,
          )}${note("base.resetnote", "warn")}`,
          B("cancel", "close") + button("confirm", "user-plan-save", "primary"),
        );
        break;
      case "user-plan-save":
        if (u.role !== "learner") break;
        save(() => {
          u.plan = $("#base-plan").value;
          if (u.id === "u1" && S.planUsed) S.planUsed[u.plan] = 0;
          u.used = 0;
          close();
          render();
        });
        break;
      case "password":
        dialog(
          "a.user.password",
          `${field("newpassword", "admin-password", "", "password", 'minlength="8" required autocomplete="new-password"')}${field("a.password.confirm", "admin-password-confirm", "", "password", 'minlength="8" required autocomplete="new-password"')}${note("a.password.effect", "warn")}`,
          B("cancel", "close") + button("confirm", "password-save", "danger"),
        );
        break;
      case "password-save":
        if (u.role !== "learner") break;
        if (
          !$("#admin-password").reportValidity() ||
          !$("#admin-password-confirm").reportValidity()
        )
          break;
        if ($("#admin-password").value !== $("#admin-password-confirm").value) {
          error("a.password.mismatch");
          break;
        }
        save(() => {
          $("#admin-password").value = "";
          $("#admin-password-confirm").value = "";
          close();
          render();
        });
        break;
      case "credit": {
        const amount = Number($("#credit-amount").value);
        if (!Number.isInteger(amount) || amount <= 0) {
          error("positive");
          break;
        }
        A.pending = { user: u.id, amount, reason: $("#credit-reason").value };
        dialog(
          "a.supplement",
          `<p>${esc(u.username)} · +${amount}</p>${note("credit.rule")}`,
          B("cancel", "close") + button("confirm", "credit-confirm", "primary"),
        );
        break;
      }
      case "credit-confirm":
        if (!A.pending || u.role !== "learner" || A.pending.user !== u.id)
          break;
        save(() => {
          u.points += A.pending.amount;
          A.ledger.unshift({
            ...A.pending,
            source: "manual",
            at: "2026-09-18 12:00",
            balance: u.points,
          });
          A.pending = null;
          close();
          render();
        });
        break;
      case "reader":
        if (scene() === "unavailable")
          dialog("a.reader", note("a.reader.unavailable"));
        else reader(i);
        break;
      default:
        return false;
    }
    return true;
  }
  function change(el) {
    if (el.id === "plan-unlimited") {
      $("#plan-limit").disabled = el.checked;
      if (!el.checked && !$("#plan-limit").value) $("#plan-limit").value = 5;
    }
    if (
      (el.closest(".admin-main") &&
        ["plan-limit", "plan-unlimited", "plan-max"].includes(el.id)) ||
      ["plan-model", "plan-length"].includes(el.name)
    ) {
      const box = $("#plan-warning");
      if (box) box.innerHTML = planWarning(planDraft());
    }
  }
  document.addEventListener("submit", (e) => {
    if (e.target.id === "admin-search-form") {
      e.preventDefault();
      handle("adm-search");
    }
  });
  $("#dialog").addEventListener("close", () => {
    $$("#dialog input[type=password]").forEach((x) => (x.value = ""));
  });
  return {
    pages,
    modules,
    A,
    label,
    header,
    shell,
    home,
    models,
    plans,
    users,
    userdetail,
    handle,
    change,
    save,
    error,
    planName,
    activeModels,
  };
}
