export const esc = (value = "") => String(value).replace(/[&<>'"]/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]));

export async function loadDesign(body=document.body){
  const [copy,fixture]=await Promise.all([
    fetch(body.dataset.copyUrl || "../copy.json").then(r=>r.json()),
    fetch(body.dataset.fixtureUrl || "../fixtures/admin-safe.json").then(r=>r.json())
  ]);
  return {copy,fixture};
}

export function translator(copy,language){
  const translate=(key,vars={})=>{
    const value=copy.static[`${language}.${key}`] ?? copy.templates[`${language}.${key}`] ?? key;
    return Object.entries(vars).reduce((out,[name,replacement])=>out.replaceAll(`{${name}}`,String(replacement)),value);
  };
  translate.locale=language;
  return translate;
}

export function icon(name){
  const paths={
    download:'<path d="M12 3v12m0 0 4-4m-4 4-4-4"/><path d="M5 19h14"/>',
    upload:'<path d="M12 21V9m0 0 4 4m-4-4-4 4"/><path d="M5 5h14"/>',
    shield:'<path d="M12 3 5 6v5c0 4.5 2.8 7.3 7 10 4.2-2.7 7-5.5 7-10V6l-7-3Z"/><path d="m9.5 12 1.5 1.5 3.5-4"/>',
    file:'<path d="M6 2h8l4 4v16H6z"/><path d="M14 2v5h5M9 13h6M9 17h4"/>',
    warning:'<path d="M12 3 2.5 20h19z"/><path d="M12 9v4m0 3h.01"/>',
    check:'<path d="m4 12 5 5L20 6"/>',
    x:'<path d="m6 6 12 12M18 6 6 18"/>',
    bot:'<rect x="4" y="7" width="16" height="12" rx="3"/><path d="M12 3v4M8 12h.01M16 12h.01M8 16h8"/>',
    layers:'<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/>',
    gift:'<rect x="3" y="9" width="18" height="12" rx="2"/><path d="M12 9v12M3 13h18M7.5 9C5 9 4 7.7 4 6.2 4 4.8 5 4 6.2 4 8.5 4 12 9 12 9m4.5 0C19 9 20 7.7 20 6.2 20 4.8 19 4 17.8 4 15.5 4 12 9 12 9"/>',
    refresh:'<path d="M20 7v5h-5M4 17v-5h5"/><path d="M18.5 10a7 7 0 0 0-12-3L4 9m16 6-2.5 2a7 7 0 0 1-12-3"/>',
    lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    arrow:'<path d="M5 12h14m-5-5 5 5-5 5"/>'
  };
  return `<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[name]||paths.file}</svg>`;
}

export const categoryMeta={
  models:{name:"models.title",page:"models",items:3},
  plans:{name:"plans.title",page:"plans",items:4},
  items:{name:"growth.itemTab",page:"growth",items:3},
  growth:{name:"growth.title",page:"growth",items:15}
};

function summary(category,t,data){
  const p=data[category].preview;
  return t("preview.summary",p);
}
function titleFor(category,t){
  const map={models:"import.title",plans:"import.titlePlans",items:"import.titleItems",growth:"import.titleGrowth"};
  return t(map[category]);
}
function successFor(category,t){
  const map={models:"result.success",plans:"result.successPlans",items:"result.successItems",growth:"result.successGrowth"};
  return t(map[category]);
}
function effectFor(category,t){return t(`preview.${category}Effect`)}
function localized(value,t){return typeof value==='string'?value:(value?.[t.locale]??value?.zh??'')}
function changeRows(items,t){
  if(!items?.length)return `<p class="change-empty">${esc(t('changes.none'))}</p>`;
  return `<ul class="change-list">${items.map(item=>`<li><div><strong>${esc(localized(item.name,t))}</strong>${item.identity?`<code>${esc(item.identity)}</code>`:''}</div><p>${esc(localized(item.detail,t))}</p>${item.applied?`<small class="applied-result">${icon('check')}${esc(t('changes.applied'))} ${esc(localized(item.applied,t))}</small>`:''}</li>`).join('')}</ul>`;
}
function changeDetails(category,t,data,{confirmation=false}={}){
  const changes=data[category].changes||{},order=confirmation?['remove','add','update']:['add','update','remove'];
  return `<section class="change-details ${confirmation?'confirmation-changes':''}" aria-labelledby="change-details-title"><div class="change-details-head"><h3 id="change-details-title">${esc(t(confirmation?'changes.confirmTitle':'changes.title'))}</h3><p>${esc(t(confirmation?'changes.confirmHelp':'changes.help'))}</p></div>${order.map(kind=>`<details class="change-group change-${kind}" ${!confirmation||kind==='remove'?'open':''}><summary><span>${esc(t(`preview.${kind}`))}</span><strong>${changes[kind]?.length||0}</strong></summary>${changeRows(changes[kind],t)}</details>`).join('')}</section>`;
}
function closeButton(t,disabled=false){return `<button class="btn quiet portability-close" type="button" data-action="close" aria-label="${esc(t("common.close"))}" ${disabled?'disabled':''}>${icon("x")}</button>`}
function footer(buttons){return `<footer class="dialog-actions">${buttons}</footer>`}

export function portabilityDialog({category="models",state="file",t,data,inline=false,outcome="success"}){
  const meta=categoryMeta[category], categoryName=t(meta.name), preview=data[category].preview;
  const dialogClass=`portability-dialog state-${state}${inline?' inline-dialog':''}`;
  let body="",buttons="",title=titleFor(category,t),closeDisabled=false;
  if(state==="export"){
    title=`${t("portability.export")} · ${categoryName}`;
    body=`<p class="notice">${esc(t("portability.completeScope"))}</p>
      ${category==='models'?`<p>${esc(t("export.keyless"))}</p><label class="option-card"><input type="checkbox" data-export-keys><span><strong>${esc(t("export.includeKeys"))}</strong><small>${esc(t("export.includeKeysHelp"))}</small></span></label><div class="credential-fields" hidden><label class="field"><span>${esc(t("export.password"))}</span><input type="password" autocomplete="new-password" data-export-password></label><label class="field"><span>${esc(t("export.passwordConfirm"))}</span><input type="password" autocomplete="new-password" data-export-confirm></label><p class="field-help">${esc(t("export.passwordHelp"))}</p><p class="notice error password-error" role="alert" hidden>${esc(t("export.passwordMismatch"))}</p></div>`:`<p>${esc(t("import.noWrite"))}</p>`}
      <div class="demo-local-result" role="status"></div>`;
    buttons=`<button class="btn" data-action="close">${esc(t("common.cancel"))}</button><button class="btn primary" data-action="prepare-export">${icon("download")}<span data-export-label>${esc(t("export.prepare"))}</span></button>`;
  } else if(state==="file"){
    body=`<p class="notice warn">${esc(t("import.scopeWarning"))}</p><div class="file-drop"><span class="file-mark">${icon("file")}</span><strong>${esc(t("import.choose"))}</strong><p>${esc(t("import.noWrite"))}</p><button class="btn" data-action="sample">${esc(t("import.demoFile"))}</button></div><section class="field-summary"><h3>${esc(t("field.title"))}</h3><p>${esc(t("field.help"))}</p><div class="field-rule"><span class="pill">${esc(t("field.required"))}</span><p>${esc(category==='models'?t("field.modelRequired"):t("field.zero"))}</p></div>${category==='models'?`<div class="field-rule"><span class="pill optional">${esc(t("field.optional"))}</span><p>${esc(t("field.modelOptional"))}</p></div>`:''}</section>`;
    buttons=`<button class="btn" data-action="close">${esc(t("common.cancel"))}</button>`;
  } else if(state==="decrypt"){
    body=`<div class="selected-file">${icon("shield")}<div><strong>${esc(t("import.fileSelected"))}</strong><small>${esc(t("preview.fileMeta",{category:categoryName,version:"1",items:meta.items}))}</small></div></div><label class="field"><span>${esc(t("import.password"))}</span><input type="password" autocomplete="current-password" data-import-password aria-describedby="decrypt-help"></label><p id="decrypt-help" class="field-help">${esc(t("import.passwordHelp"))}</p>`;
    buttons=`<button class="btn" data-action="back-file">${esc(t("common.cancel"))}</button><button class="btn primary" data-action="validate" disabled>${icon("lock")}${esc(t("import.validate"))}</button>`;
  } else if(state==="reading"){
    closeDisabled=true;body=`<div class="progress-state" role="status"><span class="spinner" aria-hidden="true"></span><h3>${esc(t("import.reading"))}</h3><p>${esc(t("import.noWrite"))}</p></div>`;
  } else if(state==="preview"){
    body=`<p class="notice success">${icon("check")}${esc(t("preview.valid"))}</p><div class="preview-counts" aria-label="${esc(summary(category,t,data))}"><div><strong>${preview.add}</strong><span>${esc(t("preview.add"))}</span></div><div><strong>${preview.update}</strong><span>${esc(t("preview.update"))}</span></div><div class="remove"><strong>${preview.remove}</strong><span>${esc(t("preview.remove"))}</span></div><div><strong>${preview.unchanged}</strong><span>${esc(t("preview.unchanged"))}</span></div></div>${changeDetails(category,t,data)}<section class="impact-card"><h3>${esc(t("preview.title"))}</h3><p>${esc(effectFor(category,t))}</p>${category==='models'?`<p class="credential-ok">${icon("shield")}${esc(t("preview.credentials"))}</p><p class="field-help">${esc(t("preview.notProviderVerified"))}</p>`:''}${category==='growth'?`<p class="notice">${esc(t("growth.effective",{date:data.growth.effectiveDate}))}</p>`:''}</section>`;
    buttons=`<button class="btn" data-action="close">${esc(t("common.cancel"))}</button><button class="btn primary" data-action="next-confirm">${esc(t("preview.confirm"))}${icon("arrow")}</button>`;
  } else if(state==="confirm"){
    title=t("confirm.title");
    body=`<p class="notice warn">${esc(t("import.scopeWarning"))}</p><div class="preview-counts compact"><div><strong>${preview.add}</strong><span>${esc(t("preview.add"))}</span></div><div><strong>${preview.update}</strong><span>${esc(t("preview.update"))}</span></div><div class="remove"><strong>${preview.remove}</strong><span>${esc(t("preview.remove"))}</span></div></div>${changeDetails(category,t,data,{confirmation:true})}<p>${esc(effectFor(category,t))}</p><label class="option-card acknowledge"><input type="checkbox" data-ack><span><strong>${esc(t("confirm.ack"))}</strong></span></label>`;
    buttons=`<button class="btn" data-action="back-preview">${esc(t("common.cancel"))}</button><button class="btn danger solid" data-action="submit" disabled>${esc(t("confirm.replace"))}</button>`;
  } else if(state==="submitting"){
    title=t("confirm.title");closeDisabled=true;
    body=`<div class="progress-state" role="status" aria-live="polite"><span class="spinner" aria-hidden="true"></span><h3>${esc(t("submit.pending"))}</h3><p>${esc(t("submit.pendingHelp"))}</p></div>`;
    buttons=`<button class="btn danger solid" disabled>${esc(t("confirm.replace"))}</button>`;
  } else if(state==="success"){
    title=successFor(category,t);
    body=`<div class="result-mark success-mark">${icon("check")}</div><p class="result-lead">${esc(t("result.successSummary",preview))}</p><p>${esc(t("result.successHelp"))}</p>${category==='growth'?`<p class="notice">${esc(t("growth.effective",{date:data.growth.effectiveDate}))}</p>`:''}`;
    buttons=`<button class="btn primary" data-action="close">${esc(t("common.close"))}</button>`;
  } else if(state==="unknown"){
    title=t("result.unknown");
    body=`<div class="result-mark unknown-mark">${icon("warning")}</div><p class="result-lead">${esc(t("result.unknownHelp"))}</p>`;
    buttons=`<button class="btn" data-action="read-current">${icon("refresh")}${esc(t("result.read"))}</button><button class="btn primary" data-action="check-result">${esc(t("result.check"))}</button>`;
  } else if(state==="blocked"){
    title=category==='items'?t("error.itemDependency"):t("error.dependency");
    const refs=(data[category].references||data.models.references).map(ref=>`<li><a href="#dependency-${esc(ref.target)}">${esc(t("error.reference",ref))}</a></li>`).join("");
    body=`<p class="notice error" role="alert">${icon("warning")}${esc(t("error.dependencyHelp"))}</p><ul class="dependency-list">${refs}</ul>`;
    buttons=`<button class="btn primary" data-action="close">${esc(t("common.close"))}</button>`;
  } else if(state==="stale"){
    title=t("error.stale");body=`<p class="notice warn" role="alert">${esc(t("error.staleHelp"))}</p>`;buttons=`<button class="btn primary" data-action="repreview">${icon("refresh")}${esc(t("error.repreview"))}</button>`;
  } else {
    const errorKey={missingkey:"error.missingKey",fields:"error.required",mismatch:"error.category",wrongpass:"error.wrongPassword"}[state]||"error.required";
    title=t("error.title");body=`<p class="notice error" role="alert">${icon("warning")}${esc(t(errorKey))}</p><p>${esc(t("import.noWrite"))}</p>`;buttons=`<button class="btn" data-action="back-file">${esc(t("error.fixFile"))}</button>`;
  }
  return `<section id="portability-dialog" class="${dialogClass}" role="dialog" aria-modal="${inline?'false':'true'}" aria-labelledby="portability-dialog-title" data-portability-state="${state}" data-category="${category}">${inline?'':closeButton(t,closeDisabled)}<header class="dialog-heading">${inline?'<p class="eyebrow">M003-UI-15</p>':''}<h2 id="portability-dialog-title">${esc(title)}</h2></header><div class="dialog-body">${body}</div>${footer(buttons)}</section>`;
}

export function bindPortability({host,category,state,t,data,inline=false,outcome="success",onClose}){
  let current=state;
  const render=(next)=>{
    current=next;host.innerHTML=portabilityDialog({category,state:next,t,data,inline,outcome});
    host.dataset.open="true";
    const dialog=host.querySelector('#portability-dialog');
    if(!inline) requestAnimationFrame(()=>dialog?.querySelector('button:not([disabled]),input:not([disabled])')?.focus());
    wire();
  };
  const close=()=>{if(["submitting","reading"].includes(current))return;if(onClose)onClose();else render("file")};
  const wire=()=>{
    const dialog=host.querySelector('#portability-dialog');if(!dialog)return;
    dialog.querySelector('[data-export-keys]')?.addEventListener('change',event=>{
      const checked=event.target.checked, fields=dialog.querySelector('.credential-fields'), label=dialog.querySelector('[data-export-label]');
      fields.hidden=!checked;label.textContent=t(checked?'export.prepareEncrypted':'export.prepare');
    });
    const updateExport=()=>{
      const a=dialog.querySelector('[data-export-password]')?.value||'',b=dialog.querySelector('[data-export-confirm]')?.value||'',error=dialog.querySelector('.password-error');
      if(error)error.hidden=!b||a===b;
    };
    dialog.querySelectorAll('[data-export-password],[data-export-confirm]').forEach(el=>el.addEventListener('input',updateExport));
    dialog.querySelector('[data-import-password]')?.addEventListener('input',event=>{dialog.querySelector('[data-action="validate"]').disabled=!event.target.value.trim()});
    dialog.querySelector('[data-ack]')?.addEventListener('change',event=>{dialog.querySelector('[data-action="submit"]').disabled=!event.target.checked});
    dialog.querySelectorAll('[data-action]').forEach(button=>button.addEventListener('click',()=>{
      const action=button.dataset.action;
      if(action==='close')return close();
      if(action==='sample')return render(category==='models'?'decrypt':'preview');
      if(action==='back-file')return render('file');
      if(action==='validate'){render('reading');return setTimeout(()=>render('preview'),360)}
      if(action==='next-confirm')return render('confirm');
      if(action==='back-preview')return render('preview');
      if(action==='submit'){render('submitting');return setTimeout(()=>render(outcome),700)}
      if(action==='check-result'||action==='read-current'||action==='repreview')return render('success');
      if(action==='prepare-export'){
        const keys=dialog.querySelector('[data-export-keys]')?.checked;
        if(keys){const a=dialog.querySelector('[data-export-password]').value,b=dialog.querySelector('[data-export-confirm]').value;if(!a||a!==b){dialog.querySelector('.password-error').hidden=false;return}}
        dialog.querySelector('.demo-local-result').innerHTML=`<p class="notice success">${icon('check')}${esc(t('export.ready'))}</p>`;
      }
    }));
  };
  const keydown=event=>{if(event.key==='Escape'){event.preventDefault();close()}if(event.key==='Tab'&&!inline){const focusable=[...host.querySelectorAll('button:not([disabled]),input:not([disabled]),summary,a[href]')].filter(el=>el.getClientRects().length);if(!focusable.length)return;const first=focusable[0],last=focusable.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}}};
  host.addEventListener('keydown',keydown);
  if(!inline)host.addEventListener('click',event=>{if(event.target===host)close()});
  render(current);
  return {render,get state(){return current},destroy(){host.removeEventListener('keydown',keydown)}};
}
