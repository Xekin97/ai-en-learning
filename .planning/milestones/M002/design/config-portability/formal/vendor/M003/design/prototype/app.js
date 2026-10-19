import { icon, routeIcons } from './m002/icons.js?v=M003-UI-13-R4';
import { createWordPicker } from './m002/word-picker.js?v=M003-UI-13-R4';
import { createSelectDesign } from './m002/select.js?v=M003-UI-13-R4';

const streamFixtureBase = '../../technical/fixtures/stream-v5/';
const cr306FixtureBase = '../../technical/fixtures/cr306/';
const cr312FixtureBase = '../../technical/fixtures/cr311-312/';
const [COPY, fixtures, streamIndex, cr306Management, cr306Errors, cr306Streams, cr312Index, richBookshopFixture] = await Promise.all([
  fetch('../copy.json').then(r => { if (!r.ok) throw Error('copy.json'); return r.json(); }),
  fetch('./fixtures.json').then(r => { if (!r.ok) throw Error('fixtures.json'); return r.json(); }),
  fetch(streamFixtureBase + 'index.json').then(r => { if (!r.ok) throw Error('stream-v5/index.json'); return r.json(); }),
  fetch(cr306FixtureBase + 'management.json').then(r => { if (!r.ok) throw Error('cr306/management.json'); return r.json(); }),
  fetch(cr306FixtureBase + 'errors.json').then(r => { if (!r.ok) throw Error('cr306/errors.json'); return r.json(); }),
  fetch(cr306FixtureBase + 'streams.json').then(r => { if (!r.ok) throw Error('cr306/streams.json'); return r.json(); }),
  fetch(cr312FixtureBase + 'index.json').then(r => { if (!r.ok) throw Error('cr311-312/index.json'); return r.json(); }),
  fetch('../fixtures/ui13-r3-bookshop.json').then(r => { if (!r.ok) throw Error('design/fixtures/ui13-r3-bookshop.json'); return r.json(); }),
]);
const streamFixtures = Object.fromEntries(await Promise.all(streamIndex.files.map(async file => {
  const response = await fetch(streamFixtureBase + file);
  if (!response.ok) throw Error('stream-v5/' + file);
  return [file.replace(/\.json$/, ''), await response.json()];
})));
for (const item of cr306Streams.cases) {
  streamFixtures[`cr306-${item.id}`] = {
    ...item,
    request: item.request ?? streamFixtures['preview-basic'].request,
    status_responses: item.status_response ? [item.status_response] : [],
    playback: item.wire.map((_, index) => ({after_ms:index ? 420 : 180})),
  };
}
const cr312Fixtures = Object.fromEntries(await Promise.all(cr312Index.files.filter(file => !['boundaries.json','candidates.json'].includes(file)).map(async file => {
  const response = await fetch(cr312FixtureBase + file);
  if (!response.ok) throw Error('cr311-312/' + file);
  const fixture = await response.json();
  return [`cr312-${file.replace(/\.json$/, '')}`, {...fixture, status_responses:fixture.status_responses ?? [], playback:fixture.wire.map((frame, index) => ({after_ms:frame.event.endsWith('.activity') ? 680 : index ? 420 : 180}))}];
})));
Object.assign(streamFixtures, cr312Fixtures);
streamFixtures['ui13-r3-bookshop'] = richBookshopFixture;
streamFixtures['ui13-r3-bookshop-preview'] = {...richBookshopFixture,wire:richBookshopFixture.preview_wire,playback:richBookshopFixture.playback};
const eligibleVocabularyCandidates = [...richBookshopFixture.request.entries,'theater','another'];
const maxCustomParameterBytes = Number(cr306Errors.boundaries.find(item => item.id === 'compact_utf8_16384')?.id.match(/\d+$/)?.[0] ?? 16384);

const params = new URLSearchParams(location.search);
const lang = params.get('lang') === 'en' ? 'en' : 'zh';
const formalPreview = params.get('view') === 'formal';
document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const t = (key, values = {}) => {
  const raw = COPY.static[`${lang}.${key}`] ?? COPY.templates[`${lang}.${key}`] ?? `⟦${key}⟧`;
  return raw.replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? '—'));
};
const qurl = changes => {
  const next = new URLSearchParams(params);
  Object.entries(changes).forEach(([key,value]) => value == null ? next.delete(key) : next.set(key,String(value)));
  return `?${next.toString()}`;
};
const mark = `<svg viewBox="0 0 44 44" fill="none" aria-hidden="true"><rect x="2" y="2" width="40" height="40" rx="14" fill="#e4efcf"/><path d="M8 24c7-13 18-14 28-5" stroke="#21654e" stroke-width="2.2" stroke-linecap="round"/><path d="M9 18c8 14 19 15 27 6" stroke="#bd6f2f" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="20.5" r="2.2" fill="#21654e"/><circle cx="32" cy="22" r="2.2" fill="#bd6f2f"/></svg>`;
const DS = createSelectDesign({icon});
let playbackEpoch = 0, playbackTimer = null, liveSession = null;
let modelModalSession = null, modelModalOpener = null, discardModalOpener = null, regenerateOpener = null;
let motionEpoch = 0;
const motionTimers = new Set();
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const typingSegmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter(undefined,{granularity:'grapheme'}) : null;
const typingGraphemes = value => typingSegmenter ? [...typingSegmenter.segment(String(value ?? ''))].map(part => part.segment) : Array.from(String(value ?? ''));
const TYPING_BASE_GRAPHEMES_PER_SECOND = 36;
const TYPING_MAX_LAG_MS = 650;
let typingEpoch = 0, typingFrame = null, typingSession = null;

function afterMotion(delay, callback) {
  const epoch = motionEpoch;
  const timer = setTimeout(() => {
    motionTimers.delete(timer);
    if (epoch === motionEpoch) callback();
  }, reducedMotion.matches ? 0 : delay);
  motionTimers.add(timer);
  return timer;
}
function clearMotionTransitions() {
  motionEpoch += 1;
  motionTimers.forEach(clearTimeout);
  motionTimers.clear();
  document.querySelectorAll('.m003-final-exit-slot,.m003-paragraph-exit-ghost').forEach(node => node.remove());
  document.querySelectorAll('.is-entering,.is-replacing,.is-final-entering,.is-settling,.is-status-changing').forEach(node => {
    node.classList.remove('is-entering','is-replacing','is-final-entering','is-settling','is-status-changing');
    node.style.removeProperty('height');
    node.style.removeProperty('transform');
    node.style.removeProperty('transition');
    node.removeAttribute('data-previous');
  });
}

function replaceUrl(changes) {
  history.replaceState({}, '', qurl(changes));
  for (const [key,value] of Object.entries(changes)) value == null ? params.delete(key) : params.set(key,String(value));
}
function navigate(changes, focusId) {
  stopPlayback();
  history.pushState({}, '', qurl(changes));
  for (const [key,value] of Object.entries(changes)) value == null ? params.delete(key) : params.set(key,String(value));
  render();
  requestAnimationFrame(() => document.getElementById(focusId)?.focus({preventScroll:true}));
}
function stopPlayback() {
  playbackEpoch += 1;
  if (playbackTimer !== null) clearTimeout(playbackTimer);
  stopInitialTyping({flush:false});
  clearMotionTransitions();
  playbackTimer = null; liveSession = null;
}
function initialStreamState() {
  return {lifecycle:"idle", accepted:false, contractVersion:null, phase:null, planItems:[], planId:null, planLanguage:null, text:"", published:"", working:"", result:null, notice:null, canSave:false, pending:false, error:null, refunded:null, rev:0, contentVersion:0, currentDraft:null, draftMode:null, changedParagraphs:[], publishKind:null, activity:null, retiredDrafts:[], lastSeq:0, lastFingerprint:null, protocolError:null, editKind:null};
}

function paragraphParts(value) {
  return String(value ?? '').split(/(?:\r?\n[ \t]*\r?\n)+/);
}
function publishParagraph(state, index) {
  const published = paragraphParts(state.published);
  const working = paragraphParts(state.working);
  while (published.length <= index) published.push('');
  published[index] = working[index] ?? '';
  return published.join('\n\n');
}

function applyV6Event(state, frame) {
  const next = {...state, retiredDrafts:[...(state.retiredDrafts ?? [])], changedParagraphs:[...(state.changedParagraphs ?? [])]};
  const kind = frame.event.split('.').at(-1);
  const data = frame.data ?? {};
  const fingerprint = JSON.stringify(frame);
  if (data.seq === state.lastSeq && fingerprint === state.lastFingerprint) return next;
  const reject = reason => ({...next,lifecycle:'pending',pending:true,canSave:false,protocolError:reason});
  if (!Number.isInteger(data.seq) || data.seq !== state.lastSeq + 1) return reject('sequence');
  next.lastSeq = data.seq; next.lastFingerprint = fingerprint;
  if (kind === 'started') {
    if (state.lastSeq !== 0 || data.contract_version !== 'm003-stream-v6') return reject('start');
    return {...initialStreamState(),lifecycle:'accepted',accepted:true,contractVersion:'m003-stream-v6',lastSeq:data.seq,lastFingerprint:fingerprint};
  }
  if (!state.accepted || ['valid','failed','cancelled'].includes(state.lifecycle)) return reject('lifecycle');
  if (kind === 'progress') return {...next,lifecycle:data.phase,phase:data.phase,activity:data.phase === 'composing' ? state.activity : null,pending:false};
  if (kind === 'activity') return {...next,activity:data.activity,pending:false};
  if (kind === 'plan_item') {
    const item = data.item;
    return {...next,lifecycle:'planning',planItems:[...state.planItems,item],planId:data.plan_id,planLanguage:data.meaning_language,pending:false};
  }
  if (kind === 'draft') {
    if (data.action === 'begin') {
      return {...next,lifecycle:'drafting',phase:'composing',currentDraft:data.draft_id,draftMode:data.mode,working:data.mode === 'initial' ? '' : state.published,changedParagraphs:[],publishKind:null,pending:false,editKind:null};
    }
    if (data.draft_id !== state.currentDraft) return reject('draft');
    if (data.action === 'paragraph_complete') {
      const published = publishParagraph(state, data.paragraph_index);
      return {...next,lifecycle:'drafting',published,text:published,changedParagraphs:[data.paragraph_index],publishKind:'paragraph',pending:false};
    }
    if (data.action === 'body_complete') {
      return {...next,lifecycle:'drafting',published:state.working,text:state.working,changedParagraphs:[],publishKind:'body',pending:false};
    }
    if (data.action === 'discard') {
      return {...next,lifecycle:'drafting',working:state.published,changedParagraphs:[],publishKind:null,currentDraft:null,draftMode:null,pending:false};
    }
    return next;
  }
  if (kind === 'edit') {
    if (data.draft_id !== state.currentDraft || data.base_rev !== state.rev || data.rev !== state.rev + 1) return reject('revision');
    const points = Array.from(state.working);
    if (data.at < 0 || data.delete_count < 0 || data.at + data.delete_count > points.length) return reject('range');
    points.splice(data.at,data.delete_count,...Array.from(data.insert));
    const working = points.join('');
    const initial = state.draftMode === 'initial';
    const append = initial && data.delete_count === 0 && data.at === points.length - Array.from(data.insert).length;
    return {...next,lifecycle:'drafting',working,published:initial ? working : state.published,text:initial ? working : state.published,rev:data.rev,contentVersion:data.content_version,currentDraft:data.draft_id,changedParagraphs:initial?[]:state.changedParagraphs,publishKind:null,pending:false,editKind:append?'append':'replace'};
  }
  if (kind === 'validated') return {...next,lifecycle:'valid',planItems:[],text:'',published:'',working:'',result:data.result,notice:data.completion_notice ?? null,canSave:!frame.event.startsWith('preview.'),pending:false};
  if (kind === 'settlement_pending') return {...next,lifecycle:'pending',pending:true,canSave:false};
  if (kind === 'failed') return {...next,lifecycle:'failed',planItems:[],text:'',published:'',working:'',result:null,error:data.code,refunded:data.quota_refunded,canSave:false,pending:false};
  if (kind === 'cancelled') return {...next,lifecycle:'cancelled',planItems:[],text:'',published:'',working:'',result:null,refunded:data.quota_refunded,canSave:false,pending:false};
  return reject('event');
}

function applyStreamEvent(state, frame) {
  if (state.contractVersion === 'm003-stream-v6' || frame?.data?.contract_version === 'm003-stream-v6') return applyV6Event(state,frame);
  const next = {...state, retiredDrafts:[...(state.retiredDrafts ?? [])]};
  const kind = frame.event.split(".").at(-1);
  const data = frame.data ?? {};
  const fingerprint = JSON.stringify(frame);
  if (data.seq === state.lastSeq && fingerprint === state.lastFingerprint) return next;
  const reject = (reason) => ({...next,lifecycle:"pending",pending:true,canSave:false,protocolError:reason});
  if (!Number.isInteger(data.seq) || data.seq !== state.lastSeq + 1) return reject("sequence");
  next.lastSeq = data.seq;
  next.lastFingerprint = fingerprint;
  if (kind === "started") {
    if (state.lastSeq !== 0 || data.contract_version !== "m003-stream-v5") return reject("start");
    return {...initialStreamState(),lifecycle:"accepted",accepted:true,lastSeq:data.seq,lastFingerprint:fingerprint};
  }
  if (!state.accepted || ["valid","failed","cancelled"].includes(state.lifecycle)) return reject("lifecycle");
  if (kind === "progress") {
    if (!['planning','composing','finalizing'].includes(data.phase)) return reject("phase");
    return {...next,lifecycle:data.phase,phase:data.phase,pending:false};
  }
  if (kind === "plan_item") {
    const item = data.item;
    if (state.phase !== "planning" || !data.plan_id || !["zh","en","ja"].includes(data.meaning_language) || (state.planId && state.planId !== data.plan_id) || (state.planLanguage && state.planLanguage !== data.meaning_language) || !item || !["scene","word_use"].includes(item.kind)) return reject("plan_item");
    if (item.kind === "scene" && (typeof item.text !== "string" || state.planItems.some((entry) => entry.kind === "scene"))) return reject("plan_item");
    if (item.kind === "word_use" && ([item.entry,item.form,item.sense,item.phrase].some((value) => typeof value !== "string") || state.planItems.some((entry) => entry.kind === "word_use" && entry.entry === item.entry))) return reject("plan_item");
    return {...next,lifecycle:"planning",planItems:[...state.planItems,item],planId:data.plan_id,planLanguage:data.meaning_language,pending:false};
  }
  if (kind === "edit") {
    if (state.phase === "finalizing") return reject("late_edit");
    if (!Number.isInteger(data.base_rev) || !Number.isInteger(data.rev) || data.base_rev !== state.rev || data.rev !== data.base_rev + 1) return reject("revision");
    if (!Number.isInteger(data.at) || !Number.isInteger(data.delete_count) || data.at < 0 || data.delete_count < 0 || typeof data.insert !== "string") return reject("range");
    const points = Array.from(state.text);
    if (data.at > points.length || data.at + data.delete_count > points.length) return reject("range");
    const switchedDraft = Boolean(state.currentDraft && data.draft_id !== state.currentDraft);
    if (!data.draft_id || next.retiredDrafts.includes(data.draft_id)) return reject("draft_reuse");
    if (switchedDraft) next.retiredDrafts.push(state.currentDraft);
    if (!Number.isInteger(data.content_version) || data.content_version < 1 || (data.source === "provider" && state.contentVersion && ![state.contentVersion,state.contentVersion + 1].includes(data.content_version)) || (data.source === "retained" && data.content_version > state.contentVersion)) return reject("content_version");
    points.splice(data.at, data.delete_count, ...Array.from(data.insert));
    return {...next,lifecycle:"drafting",phase:"composing",text:points.join(""),rev:data.rev,contentVersion:data.content_version,currentDraft:data.draft_id,pending:false,editKind:data.delete_count > 0 && !data.insert ? "delete" : switchedDraft ? "replace" : "append"};
  }
  if (kind === "validated") return {...next,lifecycle:"valid",planItems:[],text:"",result:data.result,notice:data.completion_notice ?? null,canSave:!frame.event.startsWith("preview."),pending:false};
  if (kind === "settlement_pending") return {...next,lifecycle:"pending",pending:true,canSave:false};
  if (kind === "failed") return {...next,lifecycle:"failed",planItems:[],text:"",result:null,error:data.code,refunded:data.quota_refunded,canSave:false,pending:false};
  if (kind === "cancelled") return {...next,lifecycle:"cancelled",planItems:[],text:"",result:null,refunded:data.quota_refunded,canSave:false,pending:false};
  return reject("event");
}

function applyStatus(state, response, preview = false) {
  const data = response?.body?.data;
  if (!data) return {...state, lifecycle:"pending", pending:true, canSave:false};
  if (data.status === "valid" && data.result) return {...state, lifecycle:"valid", planItems:[], text:"", result:data.result, notice:data.completion_notice ?? null, canSave:preview ? false : data.can_save === true, pending:false, statusData:data};
  if (data.status === "failed" || data.status === "cancelled") return {...state, lifecycle:data.status, planItems:[], text:"", result:null, error:data.status === "failed" ? "content_validation_failed" : null, refunded:data.quota_refunded, canSave:false, pending:false, statusData:data};
  return {...state, lifecycle:"pending", pending:true, canSave:false, statusData:data};
}

function resolveFixture(name, preview = false) {
  const fixture = streamFixtures[name] ?? streamFixtures[preview ? "preview-enhanced" : "enhanced-edited-pass"];
  const eventCount = Math.max(0, Math.min(fixture.wire.length, Number(params.get("event") ?? 0)));
  let state = fixture.wire.slice(0, eventCount).reduce(applyStreamEvent, initialStreamState());
  const terminal = ["valid", "failed", "cancelled"].includes(state.lifecycle);
  if (eventCount === fixture.wire.length && !terminal && state.lifecycle !== "pending") state = {...state, lifecycle:"pending", pending:true, canSave:false, eof:true};
  const statusCount = Math.max(0, Math.min(fixture.status_responses.length, Number(params.get("status") ?? 0)));
  for (const response of fixture.status_responses.slice(0, statusCount)) state = applyStatus(state, response, preview);
  return {fixture, eventCount, statusCount, state};
}

function highlightedPassage(result) {
  const marks = (result.targets ?? []).flatMap((target) => (target.occurrences ?? []).map((range) => ({...range, entry:target.entry}))).sort((a, b) => a.start - b.start);
  const points = Array.from(result.passage ?? "");
  let cursor = 0;
  let html = "";
  for (const mark of marks) {
    html += esc(points.slice(cursor, mark.start).join(""));
    html += `<mark data-entry="${esc(mark.entry)}">${esc(points.slice(mark.start, mark.end).join(""))}</mark>`;
    cursor = mark.end;
  }
  return html + esc(points.slice(cursor).join(""));
}


function currentCreateFixtureName() {
  const candidate = params.get('scenario');
  return candidate && streamFixtures[candidate] && !candidate.startsWith('preview-') ? candidate : 'ui13-r3-bookshop';
}
function currentCreateResolved() { return resolveFixture(currentCreateFixtureName()); }
function hasUnsavedResult() { return currentCreateResolved().state.lifecycle === 'valid' && params.get('saved') !== '1'; }
function currentCreateWords() {
  const base = currentCreateResolved().fixture.request?.entries ?? [];
  return (params.get('words') ?? base.join(',')).split(',').filter(Boolean);
}
function previewMode() { return params.get('mode') === 'enhanced' ? 'enhanced' : 'basic'; }
function currentPreviewFixtureName() { return params.get('previewFailure') === 'timeout' ? 'cr306-preview_timeout' : previewMode() === 'enhanced' ? 'ui13-r3-bookshop-preview' : 'preview-basic'; }
function currentPreviewResolved() { return resolveFixture(currentPreviewFixtureName(), true); }
function currentPreviewWords() {
  const base = currentPreviewResolved().fixture.request?.entries ?? [];
  return (params.get('presetWords') ?? base.join(',')).split(',').filter(Boolean);
}
const createPicker = createWordPicker({
  id:'create-words', t, esc, icon,
  scope:() => currentCreateFixtureName(),
  words:currentCreateWords,
  limit:() => fixtures.limits.maxEntries,
  candidates:() => eligibleVocabularyCandidates,
  disabled:() => ['accepted','planning','drafting','composing','finalizing','pending'].includes(currentCreateResolved().state.lifecycle),
  state:() => 'ready',
  random:() => eligibleVocabularyCandidates.find(word => !currentCreateWords().includes(word)),
  change:words => navigate(hasUnsavedResult() ? {words:words.join(','),discardError:null} : {words:words.join(','),event:0,status:0,saved:null,discardError:null}, 'create-words-search'),
});
const presetPicker = createWordPicker({
  id:'preset-words', t, esc, icon,
  scope:() => previewMode(),
  words:currentPreviewWords,
  candidates:() => fixtures.vocabularyCandidates,
  disabled:() => ['accepted','planning','drafting','composing','finalizing','pending'].includes(currentPreviewResolved().state.lifecycle),
  state:() => 'ready',
  change:words => navigate({presetWords:words.join(','),event:0,status:0,qualified:null,stale:1}, 'preset-words-search'),
});

function localeControl() {
  return `<label class="locale-control"><span class="sr-only">${esc(t('language'))}</span><select id="site-language" aria-label="${esc(t('language'))}"><option value="zh" ${lang === 'zh' ? 'selected' : ''}>中文</option><option value="en" ${lang === 'en' ? 'selected' : ''}>EN</option></select></label>`;
}
function learnerHeader() {
  const links = [['home','nav.home'],['explore','nav.explore'],['create','nav.create'],['range','nav.range'],['library','nav.library']];
  return `<a class="skip-link" href="#main">${esc(t('skip.main'))}</a><header class="topbar"><div class="container header-inner"><a class="brand" href="/M002/design/prototype/?page=home&lang=${lang}">${mark}${esc(t('brand'))}</a><nav class="nav" aria-label="${esc(t('mainnav'))}">${links.map(([page,key]) => `<a href="${page === 'create' ? qurl({page:'create'}) : `/M002/design/prototype/?page=${page}&lang=${lang}`}" ${page === 'create' ? 'aria-current="page"' : ''}>${esc(t(key))}</a>`).join('')}</nav><div class="header-actions">${localeControl()}<a class="btn quiet" href="/M002/design/prototype/?page=notices&lang=${lang}">${esc(t('notices'))}</a><details class="account-dropdown"><summary aria-label="${esc(t('accountmenu'))}"><span class="avatar" aria-hidden="true">${esc(fixtures.user.avatar)}</span><span class="user-name">${esc(fixtures.user.displayName)}</span>${icon('chevron-down','dropdown-chevron')}</summary><nav class="account-popover" aria-label="${esc(t('accountmenu'))}"><a href="/M002/design/prototype/?page=profile&lang=${lang}">${icon('user')}${esc(t('profile'))}</a><a href="/M002/design/prototype/?page=growth&lang=${lang}">${icon('trophy')}${esc(t('growth'))}</a><a href="/M002/design/prototype/?page=bag&lang=${lang}">${icon('shopping-bag')}${esc(t('bag'))}</a></nav></details></div></div></header>`;
}
const adminModules = ['adminhome','metrics','models','plans','users','operations','messages','presets'];
function adminHeader() {
  return `<a class="skip-link" href="#main">${esc(t('skip.main'))}</a><header class="topbar admin-topbar"><div class="container header-inner"><a class="brand" href="/M002/design/prototype/?page=adminhome&lang=${lang}">${mark}${esc(t('brand'))}<small>${esc(t('admin'))}</small></a><div class="header-actions">${localeControl()}<span class="pill">${esc(t('a.role.admin'))}</span><a class="btn quiet" href="/M002/design/prototype/?page=home&lang=${lang}">${esc(t('a.logout'))}</a></div></div></header>`;
}
function adminNav(current) {
  return `<nav class="admin-nav" aria-label="${esc(t('admin'))}">${adminModules.map(page => `<a href="${['models','plans','presets'].includes(page) ? qurl({page}) : `/M002/design/prototype/?page=${page}&lang=${lang}`}" ${current === page ? 'aria-current="page" class="selected"' : ''}>${icon(routeIcons[page])}${esc(t('a.' + page))}</a>`).join('')}</nav>`;
}
function footer() { return `<footer class="container footer"><span>${esc(t('footer'))}</span></footer>`; }
function heading(key, desc = '', action = '') {
  return `<div class="page-head"><div><h1 tabindex="-1">${esc(t(key))}</h1>${desc ? `<p>${esc(t(desc))}</p>` : ''}</div>${action ? `<div class="actions">${action}</div>` : ''}</div>`;
}
function selectField(key,id,options,value,extra='') {
  const glyph = ({model:'bot',style:'book-open',length:'layers',explain:'book-open-text'})[key];
  return `<label class="field"><span>${glyph ? icon(glyph) : ''}${esc(t(key))}</span><select id="${id}" ${extra}>${options.map(([v,label]) => `<option value="${esc(v)}" ${v === value ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select></label>`;
}
function emptyState(titleKey, bodyKey, glyph='file-pen-line', action='') {
  return `<div class="empty"><div class="seal" aria-hidden="true">${icon(glyph)}</div><h2>${esc(t(titleKey))}</h2><p>${esc(t(bodyKey))}</p>${action}</div>`;
}
function exactWords(actual,fixture) {
  const expected = fixture.request?.entries ?? [];
  return actual.length === expected.length && expected.every(word => actual.includes(word));
}
function statusLabel(value) {
  const lifecycle = typeof value === 'string' ? value : value.lifecycle;
  if (typeof value === 'object' && value.activity === 'improving' && !['valid','failed','cancelled','pending'].includes(lifecycle)) return t('m003.activity.improving');
  const map = {accepted:'m003.accepted',planning:'m003.planning',composing:'m003.composing',drafting:'m003.composing',finalizing:'m003.finalizing',pending:'m003.pending.title',valid:'m003.complete',failed:'create.failure',cancelled:'create.cancelled'};
  return t(map[lifecycle] ?? 'm003.composing');
}
function planPreview(state, compact=false) {
  const scene = state.planItems.find(item => item.kind === 'scene');
  const uses = state.planItems.filter(item => item.kind === 'word_use');
  const planning = state.phase === 'planning' ? `<div class="m003-writing" aria-hidden="true"><i></i><i></i><i></i></div>` : '';
  return `<section id="planning-preview" class="m003-plan-preview${compact ? ' compact' : ''}" data-plan-language="${esc(state.planLanguage ?? '')}" aria-labelledby="plan-preview-title"><header><span class="pill">${icon('sparkles')}${esc(t('m003.plan.label'))}</span>${planning}</header><h2 id="plan-preview-title">${esc(t('m003.plan.title'))}</h2><p class="muted m003-plan-note" role="status" aria-live="polite">${esc(t('m003.plan.note'))}</p>${scene ? `<article class="m003-plan-scene plan-item" data-plan-kind="scene"><small>${icon('layers')}${esc(t('m003.plan.scene'))}</small><p>${esc(scene.text)}</p></article>` : ''}${uses.length ? `<section class="preset-meanings m003-vocabulary-panel m003-plan-meanings" aria-label="${esc(t('m003.resources'))}"><dl class="m003-plan-uses m003-vocabulary-list">${uses.map(item => `<div class="m003-plan-use plan-item" data-plan-kind="word_use" data-plan-entry="${esc(item.entry)}"><dt lang="en">${esc(item.entry)}</dt><dd>${esc(item.sense)}</dd><dd class="muted" lang="en">${esc(item.form)} · ${esc(item.phrase)}</dd></div>`).join('')}</dl></section>` : ''}</section>`;
}
function draftStory(state) {
  const paragraphs = paragraphParts(state.text);
  return paragraphs.map((paragraph,index) => `<span class="m003-story-paragraph${state.changedParagraphs?.includes(index) ? ' is-changed' : ''}" data-paragraph-index="${index}">${esc(paragraph)}</span>`).join('');
}
function draftPreview(state, fixture, compact=false, preview=false) {
  const body = state.pending ? t(state.protocolError ? 'm003.protocol' : state.eof ? 'm003.eof' : 'm003.pending.body') : state.lifecycle === 'finalizing' ? t('m003.finalizing') : t('m003.draft.body');
  const recheck = state.pending && fixture.status_responses.length ? `<button class="btn quiet" data-action="${preview ? 'next-status' : 'recheck-generation'}">${icon('refresh-cw')}${esc(t('m003.recheck'))}</button>` : '';
  const activity = `<div class="m003-writing" aria-hidden="true"><i></i><i></i><i></i></div>`;
  const title = state.activity === 'improving' ? t('m003.draft.current.title') : t('m003.draft.title');
  const detail = state.activity === 'improving' && !state.pending ? '' : `<p class="muted draft-status" role="status" aria-live="polite">${esc(body)}</p>`;
  return `<article id="live-draft" class="m003-live-draft${compact ? ' compact' : ''}" data-edit-kind="${esc(state.editKind ?? 'append')}" aria-labelledby="live-draft-title"><header><span class="eyebrow">${esc(t('m003.draft.label'))}</span>${activity}</header><h2 id="live-draft-title">${esc(title)}</h2><div class="story-text live-draft-text" lang="en">${draftStory(state)}</div>${detail}${recheck}</article>`;
}
function resultArticle(result,notice,preview=false) {
  const saved = params.get('saved') === '1';
  const words = (result.targets ?? []).map(target => target.entry).join(' · ');
  const meaningLanguage = preview ? currentPreviewResolved().fixture.request?.meaning_language : currentCreateResolved().fixture.request?.meaning_language;
  // Match the production PresetWordMeanings native-language labels.
  const meaningLanguageLabel = ({zh:'中文',en:'English',ja:'日本語'})[meaningLanguage] ?? '';
  return `<article id="final-result" class="article m003-final-result"><p class="eyebrow">${esc(t(preview ? 'preview' : 'm003.complete'))}</p><h2 lang="en">${esc(words || t('m003.complete'))}</h2><p class="story-text" lang="en">${highlightedPassage(result)}</p><div class="chips">${(result.tags ?? []).map(tag => `<span class="chip">${esc(tag)}</span>`).join('')}</div><section class="preset-meanings m003-vocabulary-panel m003-result-meanings"><div class="section-head"><h3>${icon('book-open-text')}${esc(t('m003.resources'))}</h3><span>${esc(meaningLanguageLabel)}</span></div><dl class="m003-vocabulary-list">${(result.targets ?? []).map(target => `<div><dt lang="en">${esc(target.entry)}</dt><dd>${esc(target.entry_meaning)}</dd><dd class="muted" lang="en">${esc(target.hint_phrase)}</dd></div>`).join('')}</dl></section><p class="notice ${notice === 'content_review_incomplete' ? 'warn' : ''}" role="status">${esc(t(notice === 'content_review_incomplete' ? (preview ? 'm003.preview.incomplete' : 'm003.incomplete') : 'm003.complete.body'))}</p>${preview ? '' : `<div class="actions">${saved ? `<span class="pill">${icon('check')}${esc(t('m003.saved'))}</span>` : `<button class="btn primary" data-action="save-story">${icon('save')}${esc(t('collect'))}</button>`}</div>`}</article>`;
}
function streamBody(state,fixture,preview=false) {
  if (state.lifecycle === 'idle') return emptyState(preview ? 'preview' : 'create.empty', preview ? 'preset.meanings.pending' : 'create.emptydesc', preview ? 'book-open' : 'file-pen-line');
  if (state.result) {
    const article = resultArticle(state.result,state.notice,preview);
    if (!preview) return article;
    const qualified = params.get('qualified') === '1' && state.statusData?.status === 'valid';
    return `${article}<div class="notice ${qualified ? '' : 'warn'}" role="status">${esc(t(qualified ? 'm003.preview.ready' : 'm003.preview.qualifying'))}</div>`;
  }
  if (state.lifecycle === 'failed' || state.lifecycle === 'cancelled') return emptyState(state.lifecycle === 'failed' ? 'create.failure' : 'create.cancelled', state.lifecycle === 'failed' ? 'l.refunded' : 'l.cancel.charged', 'inbox', `<button class="btn primary" data-action="restart">${icon('refresh-cw')}${esc(t('retry'))}</button>`);
  const plan = state.planItems.length ? planPreview(state,preview) : '';
  if (state.text) return `<div class="m003-working-composition">${plan}${draftPreview(state,fixture,preview,preview)}</div>`;
  if (state.pending) return `<div class="m003-working-composition">${plan}<div class="notice warn m003-pending" role="status"><h2>${esc(t('m003.pending.title'))}</h2><p>${esc(t(state.protocolError ? 'm003.protocol' : state.eof ? 'm003.eof' : 'm003.pending.body'))}</p>${fixture.status_responses.length ? `<button class="btn quiet" data-action="${preview ? 'next-status' : 'recheck-generation'}">${icon('refresh-cw')}${esc(t('m003.recheck'))}</button>` : ''}</div></div>`;
  if (plan) return plan;
  const key = state.lifecycle === 'accepted' ? 'm003.accepted' : state.lifecycle === 'planning' ? 'm003.planning' : 'm003.composing';
  return `<div class="empty m003-running" role="status" aria-live="polite"><span class="word-picker-spinner" aria-hidden="true"></span><h2>${esc(t(key))}</h2><p>${esc(t(key + '.body'))}</p></div>`;
}

function patchPlanItems(host,state) {
  const plan = host?.querySelector('#planning-preview');
  if (!plan || !state.planItems.length) return false;
  plan.dataset.planLanguage = state.planLanguage ?? '';
  const scene = state.planItems.find(item => item.kind === 'scene');
  if (scene && !plan.querySelector('[data-plan-kind="scene"]')) {
    plan.querySelector('.m003-plan-note')?.insertAdjacentHTML('afterend', `<article class="m003-plan-scene plan-item is-entering" data-plan-kind="scene"><small>${icon('layers')}${esc(t('m003.plan.scene'))}</small><p>${esc(scene.text)}</p></article>`);
    const item = plan.querySelector('[data-plan-kind="scene"]');
    if (item) afterMotion(180,() => item.isConnected && item.classList.remove('is-entering'));
  }
  const uses = state.planItems.filter(item => item.kind === 'word_use');
  if (uses.length && !plan.querySelector('.m003-plan-uses')) plan.insertAdjacentHTML('beforeend',`<section class="preset-meanings m003-vocabulary-panel m003-plan-meanings" aria-label="${esc(t('m003.resources'))}"><dl class="m003-plan-uses m003-vocabulary-list"></dl></section>`);
  const grid = plan.querySelector('.m003-plan-uses');
  uses.forEach(item => {
    if (!grid?.querySelector(`[data-plan-entry="${CSS.escape(item.entry)}"]`)) {
      grid?.insertAdjacentHTML('beforeend', `<div class="m003-plan-use plan-item is-entering" data-plan-kind="word_use" data-plan-entry="${esc(item.entry)}"><dt lang="en">${esc(item.entry)}</dt><dd>${esc(item.sense)}</dd><dd class="muted" lang="en">${esc(item.form)} · ${esc(item.phrase)}</dd></div>`);
      const row = grid?.querySelector(`[data-plan-entry="${CSS.escape(item.entry)}"]`);
      if (row) afterMotion(180,() => row.isConnected && row.classList.remove('is-entering'));
    }
  });
  return true;
}

function statusPill(label) {
  return `<span class="pill m003-stream-status" data-stream-status role="status" aria-live="polite"><span class="m003-status-copy">${esc(label)}</span></span>`;
}
function patchStatus(host,state) {
  let badge = host.querySelector('[data-stream-status]');
  if (state.lifecycle === 'idle') { badge?.remove(); return; }
  if (!badge && state.lifecycle !== 'idle') {
    host.querySelector('.m003-result-heading')?.insertAdjacentHTML('beforeend',statusPill(statusLabel(state)));
    badge = host.querySelector('[data-stream-status]');
  }
  if (!badge) return;
  const copy = badge.querySelector('.m003-status-copy') ?? badge;
  const next = statusLabel(state);
  if (copy.textContent === next) return;
  copy.textContent = next;
  badge.classList.remove('is-status-changing');
  void badge.offsetWidth;
  if (!reducedMotion.matches) badge.classList.add('is-status-changing');
}
function enter(node,duration=180) {
  if (!node || reducedMotion.matches) return;
  node.classList.add('is-entering');
  afterMotion(duration,() => node.isConnected && node.classList.remove('is-entering'));
}
function visibleAnchor(host) {
  if (scrollY <= 0) return null;
  const candidates = host.querySelectorAll('[data-paragraph-index],#live-draft,#planning-preview');
  const node = [...candidates].find(item => {
    const rect=item.getBoundingClientRect();
    return rect.bottom > 0 && rect.top < innerHeight;
  });
  return node ? {node,top:node.getBoundingClientRect().top} : null;
}
function restoreAnchor(anchor) {
  if (!anchor?.node?.isConnected || scrollY <= 0) return;
  const delta = anchor.node.getBoundingClientRect().top - anchor.top;
  if (Math.abs(delta) > .5) scrollBy(0,delta);
}
function paragraphNode(index,text) {
  const node=document.createElement('span');
  node.className='m003-story-paragraph';
  node.dataset.paragraphIndex=String(index);
  node.textContent=text;
  return node;
}
function replaceParagraph(node,text) {
  const old=node.textContent;
  if (old === text) return;
  const oldHeight=node.getBoundingClientRect().height;
  node.classList.remove('is-replacing','is-changed');
  node.dataset.previous=old;
  node.textContent=text;
  node.classList.add('is-changed');
  if (reducedMotion.matches) {
    node.removeAttribute('data-previous');
    return;
  }
  const newHeight=node.getBoundingClientRect().height;
  node.style.height=`${oldHeight}px`;
  node.classList.add('is-replacing');
  requestAnimationFrame(() => {
    if (!node.isConnected || !node.classList.contains('is-replacing')) return;
    node.style.height=`${newHeight}px`;
  });
  afterMotion(220,() => {
    if (!node.isConnected) return;
    node.classList.remove('is-replacing');
    node.style.removeProperty('height');
    node.removeAttribute('data-previous');
  });
  afterMotion(260,() => node.isConnected && node.classList.remove('is-changed'));
}
function exitParagraph(node,host) {
  if (!node || reducedMotion.matches) { node?.remove(); return; }
  const hostRect=host.getBoundingClientRect(), rect=node.getBoundingClientRect();
  const ghost=document.createElement('span');
  ghost.className='m003-paragraph-exit-ghost';
  ghost.setAttribute('aria-hidden','true');
  ghost.dataset.exitText=node.textContent;
  Object.assign(ghost.style,{top:`${rect.top-hostRect.top}px`,left:`${rect.left-hostRect.left}px`,width:`${rect.width}px`,height:`${rect.height}px`});
  host.append(ghost);
  node.remove();
  afterMotion(180,() => ghost.remove());
}
function patchDraftText(draftText,state) {
  const anchor=visibleAnchor(draftText);
  const values=paragraphParts(state.text);
  const current=[...draftText.querySelectorAll(':scope > [data-paragraph-index]')];
  if (!current.length && draftText.textContent) draftText.replaceChildren(paragraphNode(0,draftText.textContent));
  const nodes=new Map([...draftText.querySelectorAll(':scope > [data-paragraph-index]')].map(node=>[Number(node.dataset.paragraphIndex),node]));
  values.forEach((text,index) => {
    let node=nodes.get(index);
    if (!node) {
      node=paragraphNode(index,text);
      draftText.append(node);
      return;
    }
    if (node.textContent === text) {
      if (!node.classList.contains('is-replacing')) node.classList.remove('is-changed');
      return;
    }
    if ((state.changedParagraphs?.includes(index) || state.publishKind === 'body') && state.draftMode !== 'initial') replaceParagraph(node,text);
    else node.textContent=text;
  });
  [...draftText.querySelectorAll(':scope > [data-paragraph-index]')].forEach(node => {
    if (Number(node.dataset.paragraphIndex) >= values.length) exitParagraph(node,draftText);
  });
  restoreAnchor(anchor);
}
function paintTypingText(host,text) {
  if (!host?.isConnected) return;
  patchDraftText(host,{text,draftMode:'initial',changedParagraphs:[],publishKind:null});
  host.dataset.typingShown=String(typingGraphemes(text).length);
}
function stopInitialTyping({flush=false,text=null}={}) {
  typingEpoch += 1;
  if (typingFrame !== null) cancelAnimationFrame(typingFrame);
  typingFrame=null;
  const session=typingSession;
  if (session?.host?.isConnected) {
    if (flush) paintTypingText(session.host,text ?? session.target);
    session.host.classList.remove('is-typing');
    session.host.removeAttribute('aria-busy');
    session.host.dataset.typingState=flush?'flushed':'stopped';
  }
  typingSession=null;
}
function scheduleInitialTyping(host,target) {
  if (!host) return;
  if (reducedMotion.matches || !typingSegmenter) {
    stopInitialTyping({flush:false});
    paintTypingText(host,target);
    host.dataset.typingState=reducedMotion.matches?'reduced':'segmenter-fallback';
    return;
  }
  const targetParts=typingGraphemes(target);
  const now=performance.now();
  let session=typingSession;
  if (!session || session.host!==host || !host.isConnected || !target.startsWith(session.target)) {
    stopInitialTyping({flush:false});
    session={host,target:'',parts:[],shown:0,last:now,carry:0,deadline:now+TYPING_MAX_LAG_MS,epoch:typingEpoch};
    typingSession=session;
  }
  if (target===session.target) return;
  const wasCaughtUp=session.shown>=session.parts.length;
  const previousDisplayed=session.parts.slice(0,session.shown).join('');
  session.target=target;
  session.parts=targetParts;
  const recomposedDisplayed=session.parts.slice(0,session.shown).join('');
  if (recomposedDisplayed!==previousDisplayed) paintTypingText(host,recomposedDisplayed);
  host.dataset.typingReceived=String(targetParts.length);
  if (wasCaughtUp && session.shown>=session.parts.length) {
    host.classList.remove('is-typing');
    host.removeAttribute('aria-busy');
    host.dataset.typingState='caught-up';
    return;
  }
  if (wasCaughtUp) {
    session.deadline=now+TYPING_MAX_LAG_MS;
    session.last=now;
    session.carry=0;
  }
  host.classList.add('is-typing');
  host.setAttribute('aria-busy','true');
  host.dataset.typingState='running';
  if (session.shown===0 && session.parts.length) {
    session.shown=1;
    paintTypingText(host,session.parts[0]);
  }
  const epoch=session.epoch;
  const tick=time => {
    if (!typingSession || typingSession!==session || epoch!==typingEpoch || !host.isConnected) return;
    const remaining=session.parts.length-session.shown;
    if (remaining<=0) {
      host.classList.remove('is-typing');
      host.removeAttribute('aria-busy');
      host.dataset.typingState='caught-up';
      typingFrame=null;
      return;
    }
    const elapsed=Math.max(1,Math.min(64,time-session.last||16));
    session.last=time;
    const remainingWindow=session.deadline-time;
    let take;
    if (remainingWindow<=elapsed) take=remaining;
    else {
      const catchupRate=remaining*1000/remainingWindow;
      const budget=session.carry+Math.max(TYPING_BASE_GRAPHEMES_PER_SECOND,catchupRate)*elapsed/1000;
      take=Math.floor(budget);
      session.carry=budget-take;
    }
    if (take>0) {
      session.shown=Math.min(session.parts.length,session.shown+take);
      paintTypingText(host,session.parts.slice(0,session.shown).join(''));
    }
    typingFrame=requestAnimationFrame(tick);
  };
  if (typingFrame===null) tick(now);
}
if (params.get('typingProbe')==='1') {
  globalThis.__M003TypingDesignProbe={
    reset(){const host=document.querySelector('.live-draft-text');stopInitialTyping({flush:false});host?.replaceChildren();return Boolean(host)},
    present(target){const host=document.querySelector('.live-draft-text');scheduleInitialTyping(host,target);return host?.textContent ?? ''},
    snapshot(){const host=document.querySelector('.live-draft-text');return {text:host?.textContent ?? '',state:host?.dataset.typingState ?? null,shown:Number(host?.dataset.typingShown ?? 0),received:Number(host?.dataset.typingReceived ?? 0)}}
  };
}
function syncGenerationControls(state) {
  const busy=['accepted','planning','drafting','composing','finalizing','pending'].includes(state.lifecycle);
  const settings=document.querySelector('#create-settings fieldset');
  if (settings) settings.disabled=busy;
  const picker=document.getElementById('create-words');
  if (!picker) return;
  const full=currentCreateWords().length >= fixtures.limits.maxEntries;
  const search=picker.querySelector('#create-words-search');
  const random=picker.querySelector('[data-picker-random]');
  const clear=picker.querySelector('[data-picker-clear]');
  if (search) search.disabled=busy;
  if (random) random.disabled=busy||full;
  if (clear) clear.disabled=busy;
  picker.querySelectorAll('[data-picker-remove]').forEach(button => { button.disabled=busy; });
}
function patchGenerationAction(fixture,state) {
  const actions=document.getElementById('generation-actions');
  if (!actions) return;
  const busy=['accepted','planning','drafting','composing','finalizing','pending'].includes(state.lifecycle);
  let button=actions.querySelector('button[data-action]');
  if (!button) {
    actions.innerHTML=busy ? `<button class="btn quiet" data-action="cancel-generation"></button>` : `<button class="btn primary" id="generate" data-action="generate"></button>`;
    button=actions.querySelector('button[data-action]');
  }
  button.className=busy?'btn quiet':'btn primary';
  button.dataset.action=busy?'cancel-generation':'generate';
  if (busy) button.removeAttribute('id'); else button.id='generate';
  const words=currentCreateWords();
  button.disabled=!busy&&(words.length<1||words.length>fixtures.limits.maxEntries);
  button.innerHTML=busy?esc(t('cancelgen')):`${icon('sparkles')}${esc(t('start'))}`;
}
function replaceStreamBody(body,html,animated=true) {
  body.innerHTML=html;
  if (animated) enter(body.firstElementChild);
}
function transitionToFinal(body,state,fixture,preview) {
  const oldStory=body.querySelector('#live-draft .live-draft-text');
  if (!oldStory) {
    replaceStreamBody(body,streamBody(state,fixture,preview),false);
    return;
  }
  const oldBodyHeight=body.getBoundingClientRect().height;
  const oldStoryRect=oldStory.getBoundingClientRect();
  const anchor=scrollY > 0 ? {node:oldStory,top:oldStoryRect.top} : null;
  const oldPlan=body.querySelector('#planning-preview');
  const exitSlot=document.createElement('div');
  exitSlot.className='m003-final-exit-slot';
  exitSlot.setAttribute('aria-hidden','true');
  if (oldPlan) exitSlot.append(oldPlan.cloneNode(true));
  const exitHeight=oldPlan?.getBoundingClientRect().height ?? 0;
  exitSlot.style.height=`${exitHeight}px`;
  const template=document.createElement('template');
  template.innerHTML=streamBody(state,fixture,preview);
  const final=template.content.querySelector('#final-result');
  const nextStory=final?.querySelector('.story-text');
  if (!final || !nextStory) {
    replaceStreamBody(body,streamBody(state,fixture,preview),false);
    return;
  }
  oldStory.className='story-text m003-retained-passage';
  oldStory.removeAttribute('data-edit-kind');
  oldStory.innerHTML=highlightedPassage(state.result);
  nextStory.replaceWith(oldStory);
  if (reducedMotion.matches) {
    body.replaceChildren(template.content);
    restoreAnchor(anchor);
    return;
  }
  body.replaceChildren(exitSlot,template.content);
  final.classList.add('is-final-entering');
  const newBodyHeight=final.getBoundingClientRect().height;
  const newStoryRect=oldStory.getBoundingClientRect();
  oldStory.style.transform=`translateY(${oldStoryRect.top-newStoryRect.top}px)`;
  oldStory.style.transition='transform var(--m003-motion-final) var(--m003-motion-ease)';
  body.style.height=`${oldBodyHeight}px`;
  body.classList.add('is-settling');
  requestAnimationFrame(() => {
    if (!oldStory.isConnected) return;
    exitSlot.classList.add('is-exiting');
    exitSlot.style.height='0px';
    oldStory.style.transform='translateY(0)';
    body.style.height=`${newBodyHeight}px`;
    restoreAnchor(anchor);
  });
  afterMotion(240,() => {
    exitSlot.remove();
    if (!body.isConnected) return;
    body.classList.remove('is-settling');
    body.style.removeProperty('height');
    final.classList.remove('is-final-entering');
    oldStory.style.removeProperty('transform');
    oldStory.style.removeProperty('transition');
  });
}
function patchStreamRegion(state,fixture,preview=false,reset=false) {
  const host = document.getElementById(preview ? 'preview-result' : 'generation-status');
  if (!host) return;
  host.dataset.state = state.lifecycle;
  patchStatus(host,state);
  const body = host.querySelector('.m003-result-body') ?? host;
  let draftText = body.querySelector('.live-draft-text');
  const typingAppend=Boolean(state.text && state.draftMode==='initial' && state.editKind==='append' && !state.publishKind && !state.pending && !state.result && !reset);
  if (!typingAppend && typingSession) {
    const flush=Boolean(state.publishKind==='body' || state.lifecycle==='finalizing' || state.result || (state.text && state.draftMode!=='initial'));
    stopInitialTyping({flush,text:state.text || null});
  }
  if (state.result && !reset) {
    transitionToFinal(body,state,fixture,preview);
  } else if (state.planItems.length && !state.text && !state.result && !state.pending && !reset) {
    if (!patchPlanItems(body,state)) replaceStreamBody(body,streamBody(state,fixture,preview),true);
  } else if (state.text && !state.result && !reset) {
    if (!draftText && body.querySelector('#planning-preview')) {
      body.insertAdjacentHTML('beforeend',draftPreview(typingAppend?{...state,text:''}:state,fixture,preview,preview));
      draftText = body.querySelector('.live-draft-text');
      enter(draftText?.closest('#live-draft'));
    }
    if (!draftText) {
      replaceStreamBody(body,streamBody(typingAppend?{...state,text:''}:state,fixture,preview),true);
      draftText=body.querySelector('.live-draft-text');
    }
    if (draftText) {
      if (typingAppend) scheduleInitialTyping(draftText,state.text);
      else patchDraftText(draftText,state);
    }
    const draft = body.querySelector('#live-draft');
    if (draft) draft.dataset.editKind = state.editKind ?? 'append';
    const status = body.querySelector('.draft-status');
    if (status) status.textContent = state.pending ? t(state.protocolError ? 'm003.protocol' : state.eof ? 'm003.eof' : 'm003.pending.body') : state.lifecycle === 'finalizing' ? t('m003.finalizing') : t('m003.draft.body');
    if (draft && state.activity === 'improving') {
      const title=draft.querySelector('#live-draft-title'); if(title) title.textContent=t('m003.draft.current.title');
      draft.querySelector('.draft-status')?.remove();
    }
  } else {
    const running=body.querySelector('.m003-running');
    const nextKey=state.lifecycle === 'accepted' ? 'm003.accepted' : state.lifecycle === 'planning' ? 'm003.planning' : null;
    if (running && nextKey && !reset) {
      const title=running.querySelector('h2'), detail=running.querySelector('p');
      if (title) title.textContent=t(nextKey);
      if (detail) detail.textContent=t(nextKey+'.body');
    } else replaceStreamBody(body,streamBody(state,fixture,preview),!reset && !['failed','cancelled'].includes(state.lifecycle));
  }
  if (state.phase !== 'planning') body.querySelector('#planning-preview > header .m003-writing')?.remove();
  if (!preview) {
    syncGenerationControls(state);
    patchGenerationAction(fixture,state);
  }
  bindActions();
}
function generateButton(fixture,state) {
  const words = currentCreateWords();
  const busy = ['accepted','planning','drafting','composing','finalizing','pending'].includes(state.lifecycle);
  const disabled = busy || words.length < 1 || words.length > fixtures.limits.maxEntries;
  return `<button class="btn primary" id="generate" data-action="generate" ${disabled ? 'disabled' : ''}>${icon('sparkles')}${esc(t('start'))}</button>`;
}
function createSettings(fixture,state) {
  const busy = ['accepted','planning','drafting','composing','finalizing','pending'].includes(state.lifecycle);
  const models = fixtures.models.map(model => [model.id,model.label]);
  const meaning = params.get('meaning') ?? fixture.request?.meaning_language ?? 'zh';
  return `<details id="create-settings" class="settings creation-settings" ${innerWidth > 1100 ? 'open' : ''}><summary><span class="creation-settings-title">${icon('sparkles')}<span>${esc(t('config'))}</span></span>${icon('chevron-down','creation-settings-chevron')}</summary><fieldset class="generation-fields" ${busy ? 'disabled' : ''}><div class="config-fields"><div class="creation-model">${selectField('model','create-model',models,params.get('model') ?? models[0][0], 'data-config')}</div><div class="creation-options">${selectField('style','create-style',[['story',t('a.preset.style.Story')],['discussion',t('a.preset.style.Discussion')]],params.get('style') ?? 'story','data-config')}${selectField('length','create-length',[['brief',t('a.preset.length.Brief')],['standard',t('a.preset.length.Standard')]],params.get('length') ?? 'brief','data-config')}${selectField('explain','create-meaning',[['zh',t('a.preset.language.中文')],['en',t('a.preset.language.English')],['ja',t('a.preset.language.日本語')]],meaning,'data-config')}</div></div></fieldset></details>`;
}
function scenarioBar(items) {
  if (formalPreview) return '';
  const resolved=currentCreateResolved();
  const event=Math.max(0,Math.min(resolved.fixture.wire.length,resolved.eventCount));
  return `<details class="m003-scenario-bar" ${params.get('demo') === 'open' ? 'open' : ''} data-design-harness><summary>${esc(t('m003.prototype'))}</summary><p>${esc(t('m003.prototype.note'))}</p><div>${items.join('')}</div><div class="m003-harness-controls"><button class="btn quiet small" data-action="harness-replay">${esc(t('m003.harness.replay'))}</button><a class="btn quiet small" href="${qurl({event:Math.min(event+1,resolved.fixture.wire.length),demo:'open'})}">${esc(t('m003.harness.next'))}</a><span>${esc(t('m003.harness.step',{current:event,total:resolved.fixture.wire.length}))}</span></div></details>`;
}
function scenarioLink(label,changes) { return `<a class="btn quiet small" href="${qurl(changes)}">${esc(label)}</a>`; }
function createPage() {
  const name = currentCreateFixtureName();
  const resolved = currentCreateResolved();
  const quota = t('b.quota',{plan:fixtures.learnerQuota.remaining,extra:fixtures.learnerQuota.extra});
  const scenarios = scenarioBar([
    scenarioLink('Rich bookshop sample',{scenario:'ui13-r3-bookshop',event:11,status:0,words:null,saved:null,demo:'open'}),
    scenarioLink('Paragraph revision',{scenario:'cr312-shorter',event:11,status:0,words:null,saved:null,demo:'open'}),
    scenarioLink('Long paragraph',{scenario:'cr312-large-paragraph',event:11,status:0,words:null,saved:null,demo:'open'}),
    scenarioLink('Recovery / Q02',{scenario:'cr312-q02-mid-draft',event:11,status:0,words:null,saved:null,demo:'open'}),
    scenarioLink('Pending',{scenario:'cr312-pending',event:11,status:0,words:null,saved:null,demo:'open'}),
    scenarioLink('Failure',{scenario:'cr312-failed',event:11,status:0,words:null,saved:null,demo:'open'}),
    scenarioLink('Cancelled',{scenario:'cr312-cancelled',event:11,status:0,words:null,saved:null,demo:'open'}),
    scenarioLink('Legacy selected “the”',{scenario:'cr312-shorter',event:0,status:0,words:'the,art',saved:null,demo:'open'}),
  ]);
  const generationAction = ['accepted','planning','drafting','composing','finalizing','pending'].includes(resolved.state.lifecycle) ? `<button class="btn quiet" data-action="cancel-generation">${esc(t('cancelgen'))}</button>` : generateButton(resolved.fixture,resolved.state);
  const discardFailure = params.get('discardError') === '1' ? `<p class="notice error m003-regenerate-error" role="alert">${esc(t('m003.regenerate.failure'))}</p>` : '';
  const regenerateDialog = `<dialog id="regenerate-confirm" class="m003-confirm-dialog m003-regenerate-dialog" aria-labelledby="regenerate-title"><button class="btn quiet dialog-close" type="button" data-action="cancel-regenerate" aria-label="${esc(t('cancel'))}">${icon('x')}</button><h2 id="regenerate-title">${esc(t('m003.regenerate.title'))}</h2><div class="dialog-body"><p>${esc(t('m003.regenerate.body'))}</p></div><div class="dialog-actions"><button class="btn" type="button" data-action="cancel-regenerate">${esc(t('cancel'))}</button><button class="btn danger" type="button" data-action="confirm-regenerate">${esc(t('m003.regenerate.confirm'))}</button></div></dialog>`;
  return `${learnerHeader()}<main id="main" class="container page" tabindex="-1">${heading('create.title','create.desc',`<span class="pill quota-detail">${esc(quota)}</span>`)}<div class="workspace">${createSettings(resolved.fixture,resolved.state)}<div class="m003-creation-main"><section class="panel generation-word-panel">${createPicker.view()}${discardFailure}<div id="generation-actions" class="actions">${generationAction}</div></section><section id="generation-status" class="panel m003-generation-paper" data-region="generation-result" data-state="${esc(resolved.state.lifecycle)}" tabindex="-1"><div class="m003-result-heading"><span class="eyebrow">${icon('notebook-pen')}${esc(t('create'))}</span>${resolved.state.lifecycle !== 'idle' ? statusPill(statusLabel(resolved.state)) : ''}</div><div class="m003-result-body">${streamBody(resolved.state,resolved.fixture,false)}</div></section></div></div>${scenarios}</main>${regenerateDialog}${footer()}`;
}

function planTabName(key) { const p=fixtures.plans[key]; return lang === 'zh' ? p.nameZh : p.nameEn; }

function modelErrorCase() {
  const id = params.get('case') ?? 'protected_model';
  return cr306Errors.cases.find(item => item.id === id) ?? cr306Errors.cases[0];
}
function modelErrorMessage(item) {
  const code = item?.problem?.field_errors?.[0]?.code ?? item?.problem?.code;
  const limit = lang === 'zh' ? `16 KiB（${maxCustomParameterBytes.toLocaleString('zh-CN')} 字节）` : `16 KiB (${maxCustomParameterBytes.toLocaleString('en-US')} bytes)`;
  return t(`cr306.error.${code}`,{limit});
}
function compactJsonBytes(raw) {
  try { return new TextEncoder().encode(JSON.stringify(JSON.parse(raw))).length; }
  catch { return null; }
}
function customJsonSize(raw) {
  const bytes = compactJsonBytes(raw);
  return t('cr306.custom.size',{count:bytes == null?'—':bytes.toLocaleString(lang==='zh'?'zh-CN':'en-US'),limit:'16 KiB'});
}
function providerCards() {
  return cr306Management.get.body.data.items.map(provider => {
    const connection = provider.connection;
    const rows = provider.models.map((model,index) => {const description=model.description?.startsWith('Synthetic configuration;')?'':model.description;return `<article class="generic-model-row"><div class="generic-model-copy"><div class="generic-model-title"><h3>${esc(model.display_name)}</h3><span class="pill">${esc(t(model.enabled?'gm.active':'gm.inactive'))}</span></div><code>${esc(model.provider_model_id)}</code>${description?`<p class="generic-model-description">${esc(description)}</p>`:''}</div><div class="generic-model-actions"><button class="btn quiet small" data-action="open-probe" data-provider="${esc(connection.id)}" data-model-index="${index}">${esc(t('gm.test'))}</button><button class="btn danger quiet small">${esc(t('a.remove'))}</button></div></article>`;}).join('');
    return `<article class="generic-provider-card" data-provider-id="${esc(connection.id)}"><header class="generic-provider-heading"><div class="generic-model-symbol">${icon('bot')}</div><div class="generic-model-copy"><div class="generic-model-title"><h2>${esc(connection.name)}</h2><span class="pill">${provider.models.length} ${esc(t('gm.models.count'))}</span></div><p class="generic-model-meta"><span>${esc(connection.base_url)}</span><span>${esc(connection.protocol)}</span><span>${esc(connection.masked_hint)}</span></p></div><button class="btn small" data-action="edit-provider" data-provider="${esc(connection.id)}">${esc(t('gm.edit'))}</button></header><div class="generic-provider-models">${rows}</div></article>`;
  }).join('');
}
function blankModelEntry() {
  return {id:null,display_name:'',description:'',provider_model_id:'',enabled:true,max_output_tokens:null,output_mode:'prompt',custom_parameters:{},customParametersText:'{}',probe:null};
}
function copyModelEntry(model) {
  return {...model,description:model.description?.startsWith('Synthetic configuration;')?'':model.description,customParametersText:JSON.stringify(model.custom_parameters ?? {},null,2),probe:null};
}
function modelDialogShell() {
  return `<dialog id="admin-model" class="m003-model-dialog" aria-labelledby="model-dialog-title"></dialog><dialog id="model-discard" class="m003-confirm-dialog" aria-labelledby="discard-title"><h2 id="discard-title">${esc(t('gm.unsaved'))}</h2><p>${esc(t('cr306.discard.body'))}</p><div class="dialog-actions"><button class="btn" data-action="keep-editing">${esc(t('gm.keep'))}</button><button class="btn danger" data-action="discard-model">${esc(t('gm.discard'))}</button></div></dialog>`;
}
function beginModelSession(providerId, mode='edit', opener=null, requestedState='edit') {
  const source = cr306Management.get.body.data.items.find(item=>item.connection.id===providerId);
  const isAdd = mode === 'add' || !source;
  const provider = isAdd ? {connection:{id:null,name:'',protocol:'openai_chat',base_url:'',credential_configured:false,masked_hint:''},models:[blankModelEntry()]} : JSON.parse(JSON.stringify(source));
  provider.models = provider.models.map(copyModelEntry);
  const directError = requestedState === 'error' ? modelErrorCase() : null;
  if (directError) provider.models[0].customParametersText = directError.raw_custom_json;
  modelModalSession = {
    mode:isAdd?'add':'edit', provider, dirty:Boolean(directError), error:directError, errorIndex:directError?0:null,
    conflict:requestedState==='conflict', tested:params.get('tested')==='1', stale:params.get('stale')==='1',
  };
  modelModalOpener = opener && opener.isConnected ? opener : null;
  paintModelDialog();
  const dialog=document.getElementById('admin-model');
  if(dialog && !dialog.open) dialog.showModal();
  dialog?.querySelector('.dialog-close')?.focus({preventScroll:true});
}
function jsonField(entry,index) {
  const error = modelModalSession.error && modelModalSession.errorIndex===index ? modelModalSession.error : null;
  const fieldAlert = error ? `<div class="notice error custom-json-error" role="alert"><strong>${esc(t('cr306.error.title'))}</strong><p id="custom-parameters-error-${index}">${esc(modelErrorMessage(error))}</p></div>` : '';
  const conflictAlert = modelModalSession.conflict && index===0 ? `<div class="notice warn" role="alert"><strong>${esc(t('cr306.conflict.title'))}</strong><p>${esc(t('cr306.conflict.body'))}</p><button class="btn" type="button" data-action="refresh-provider">${esc(t('gm.refresh'))}</button></div>` : '';
  const raw=entry.customParametersText ?? '{}';
  return `<div class="model-field custom-json-field"><div class="field-label-row"><label for="custom-parameters-${index}">${esc(t('cr306.custom.label'))}</label><span id="custom-json-count-${index}" class="field-counter">${esc(customJsonSize(raw))}</span></div><textarea class="custom-parameters" id="custom-parameters-${index}" data-model-index="${index}" spellcheck="false" aria-describedby="${error?`custom-parameters-error-${index} `:''}custom-parameters-help-${index}" aria-invalid="${error?'true':'false'}">${esc(raw)}</textarea>${fieldAlert}<p id="custom-parameters-help-${index}" class="field-help">${esc(t('cr306.custom.help'))}</p><div class="custom-json-guide"><p><strong>${esc(t('cr306.custom.example'))}</strong> <code>{"reasoning":{"enabled":false}}</code></p><p>${esc(t('cr306.custom.empty'))}</p><details class="custom-json-rules"><summary>${esc(t('cr306.custom.rules.toggle'))}</summary><p>${esc(t('cr306.custom.protected'))}</p><p>${esc(t('cr306.custom.rules'))}</p></details></div>${conflictAlert}</div>`;
}
function modelEntryView(entry,index) {
  const probe = entry.probe==='ok' ? `<p class="notice success" role="status">${esc(t('cr306.probe.ok'))}</p>` : entry.probe==='error' ? `<p class="notice error" role="alert">${esc(t('cr306.probe.rejected'))}</p>` : entry.probe==='stale' ? `<p class="notice warn" role="status">${esc(t('cr306.probe.stale'))}</p>` : '';
  return `<section class="generic-model-item" id="model-entry-${index+1}"><div class="model-item-heading"><h4>${esc(t('gm.models.section'))} ${index+1}</h4>${modelModalSession.provider.models.length>1?`<button class="btn quiet small" type="button" data-action="remove-model" data-model-index="${index}">${esc(t('gm.model.remove'))}</button>`:''}</div><div class="model-field-grid"><div class="model-field"><label class="field"><span>${esc(t('gm.id'))}</span><input id="provider-model-id-${index}" data-model-field="provider_model_id" data-model-index="${index}" value="${esc(entry.provider_model_id)}" required></label><p class="field-help">${esc(t('gm.id.help'))}</p></div><label class="field"><span>${esc(t('gm.name.optional'))}</span><input data-model-field="display_name" data-model-index="${index}" value="${esc(entry.display_name)}"></label></div><details class="generic-model-advanced" ${index===0?'open':''}><summary>${esc(t('gm.advanced'))}</summary><div class="model-advanced-fields"><div class="model-field"><label class="field"><span>${esc(t('gm.output'))}</span><input data-model-field="max_output_tokens" data-model-index="${index}" type="number" min="1" max="1048576" value="${esc(entry.max_output_tokens??'')}" placeholder="—"></label><p class="field-help">${esc(t('gm.output.help'))}</p></div><div class="model-option"><label class="check"><input data-model-field="output_mode" data-model-index="${index}" type="checkbox" ${entry.output_mode==='json_schema'?'checked':''}><span>${esc(t('gm.structured'))}</span></label><p class="field-help">${esc(t('gm.structured.help'))}</p></div>${jsonField(entry,index)}<label class="field"><span>${esc(t('gm.description'))}</span><input data-model-field="description" data-model-index="${index}" value="${esc(entry.description)}"></label></div></details><div class="model-item-actions"><label class="check"><input data-model-field="enabled" data-model-index="${index}" type="checkbox" ${entry.enabled?'checked':''}><span>${esc(t('gm.enable'))}</span></label><button class="btn quiet small" type="button" data-action="test-model" data-model-index="${index}">${esc(t('gm.test'))}</button></div>${probe}</section>`;
}
function paintModelDialog(focusId=null) {
  const dialog=document.getElementById('admin-model'); if(!dialog||!modelModalSession)return;
  const {provider,mode}=modelModalSession;
  const connection=provider.connection;
  dialog.innerHTML=`<button class="btn quiet dialog-close" type="button" data-action="close-model" aria-label="${esc(t('cancel'))}">${icon('x')}</button><h2 id="model-dialog-title">${esc(t(mode==='add'?'gm.add':'gm.edit'))}</h2><div class="dialog-body"><form class="generic-model-form" id="model-form"><section class="model-form-section"><div class="model-section-heading"><span class="model-step">1</span><div><h3>${esc(t('gm.connection.section'))}</h3><p>${esc(t('gm.connection.section.help'))}</p></div></div><div class="generic-connection-fields"><div class="model-field-grid"><label class="field"><span>${esc(t('gm.provider'))}</span><input data-connection-field="name" value="${esc(connection.name)}"></label><label class="field"><span>${esc(t('gm.protocol'))}</span><select data-connection-field="protocol"><option value="openai_chat" ${connection.protocol==='openai_chat'?'selected':''}>${esc(t('gm.chat'))}</option><option value="openai_responses" ${connection.protocol==='openai_responses'?'selected':''}>${esc(t('gm.responses'))}</option><option value="anthropic_messages" ${connection.protocol==='anthropic_messages'?'selected':''}>${esc(t('gm.anthropic'))}</option></select></label></div><label class="field"><span>${esc(t('gm.url'))}</span><input data-connection-field="base_url" type="url" value="${esc(connection.base_url)}" placeholder="${esc(t('gm.endpoint.placeholder'))}"></label><label class="field"><span>${esc(t('gm.key'))}</span><input type="password" placeholder="${esc(mode==='edit'?t('gm.key.keep'):t('gm.key'))}"></label><p class="field-help">${esc(t('gm.changed.connection'))}</p></div></section><section class="model-form-section"><div class="model-section-heading"><span class="model-step">2</span><div><h3>${esc(t('gm.models.section'))}</h3><p>${esc(t('gm.models.section.help'))}</p></div></div>${provider.models.map(modelEntryView).join('')}<button type="button" class="btn model-add" data-action="add-model">${esc(t('gm.model.add'))}</button><p class="field-help">${esc(t('cr306.save.no-call'))}</p><p class="field-help">${esc(t('gm.test.note'))}</p></section></form></div><div class="dialog-actions"><button class="btn" type="button" data-action="close-model">${esc(t('cancel'))}</button><button class="btn primary" type="button" data-action="save-provider">${esc(t('gm.save'))}</button></div>`;
  bindModelDialogContents();
  if(focusId) requestAnimationFrame(()=>document.getElementById(focusId)?.focus({preventScroll:true}));
}
function markModelDirty() {
  if(!modelModalSession)return;
  modelModalSession.dirty=true;
  if(modelModalSession.tested){
    modelModalSession.stale=true;
    modelModalSession.provider.models.forEach((entry,index)=>{
      if(entry.probe){
        entry.probe='stale';
        const notice=document.querySelector(`#model-entry-${index+1} > .notice`);
        if(notice){notice.className='notice warn';notice.setAttribute('role','status');notice.textContent=t('cr306.probe.stale');}
      }
    });
  }
}
function requestModelClose(opener) {
  if(!modelModalSession)return;
  if(!modelModalSession.dirty){ document.getElementById('admin-model')?.close(); return; }
  discardModalOpener=opener instanceof HTMLElement?opener:document.activeElement;
  const confirm=document.getElementById('model-discard');
  if(confirm&&!confirm.open){confirm.showModal();confirm.querySelector('[data-action="keep-editing"]')?.focus({preventScroll:true});}
}
function trapDialogFocus(dialog,event) {
  if(event.key!=='Tab'||!dialog.matches(':modal'))return;
  const items=[...dialog.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[href]')].filter(item=>item.getClientRects().length);
  if(!items.length){event.preventDefault();dialog.focus();return;}
  const first=items[0],last=items.at(-1),active=document.activeElement;
  if(event.shiftKey&&(active===first||!dialog.contains(active))){event.preventDefault();last.focus();}
  else if(!event.shiftKey&&(active===last||!dialog.contains(active))){event.preventDefault();first.focus();}
}
function bindModelDialogContents() {
  const dialog=document.getElementById('admin-model'); if(!dialog)return;
  dialog.querySelectorAll('[data-connection-field]').forEach(el=>{const update=()=>{modelModalSession.provider.connection[el.dataset.connectionField]=el.value;markModelDirty();};el.addEventListener('input',update);el.addEventListener('change',update);});
  dialog.querySelectorAll('[data-model-field]').forEach(el=>el.addEventListener('input',()=>{const entry=modelModalSession.provider.models[Number(el.dataset.modelIndex)];const field=el.dataset.modelField;entry[field]=el.type==='checkbox'?(field==='output_mode'?(el.checked?'json_schema':'prompt'):el.checked):el.value;markModelDirty();}));
  dialog.querySelectorAll('.custom-parameters').forEach(area=>area.addEventListener('input',()=>{const index=Number(area.dataset.modelIndex);modelModalSession.provider.models[index].customParametersText=area.value;modelModalSession.error=null;modelModalSession.errorIndex=null;markModelDirty();const count=document.getElementById(`custom-json-count-${index}`);if(count)count.textContent=customJsonSize(area.value);area.setAttribute('aria-invalid','false');area.removeAttribute('aria-errormessage');}));
  dialog.querySelectorAll('[data-action]').forEach(node=>node.addEventListener('click',()=>handleModelAction(node)));
}
function handleModelAction(node) {
  const action=node.dataset.action;
  if(action==='close-model'){requestModelClose(node);return;}
  if(action==='add-model'){modelModalSession.provider.models.push(blankModelEntry());markModelDirty();paintModelDialog(`provider-model-id-${modelModalSession.provider.models.length-1}`);return;}
  if(action==='remove-model'){const i=Number(node.dataset.modelIndex);modelModalSession.provider.models.splice(i,1);markModelDirty();paintModelDialog();return;}
  if(action==='test-model'){const i=Number(node.dataset.modelIndex);modelModalSession.provider.models[i].probe=params.get('state')==='probe-error'?'error':'ok';modelModalSession.tested=true;modelModalSession.stale=false;paintModelDialog(`model-entry-${i+1}`);return;}
  if(action==='refresh-provider'){modelModalSession.conflict=false;paintModelDialog(`custom-parameters-${modelModalSession.errorIndex??0}`);return;}
  if(action==='save-provider'){
    for(let i=0;i<modelModalSession.provider.models.length;i++){
      const raw=modelModalSession.provider.models[i].customParametersText;
      let match=cr306Errors.cases.find(item=>item.raw_custom_json===raw);
      if(!match){try{const value=JSON.parse(raw);if(!value||Array.isArray(value)||typeof value!=='object')match=cr306Errors.cases.find(item=>item.id==='array');else if(compactJsonBytes(raw)>maxCustomParameterBytes)match={problem:{field_errors:[{code:'too_large'}]}};}catch{match=cr306Errors.cases.find(item=>item.id==='syntax');}}
      if(match){modelModalSession.error=match;modelModalSession.errorIndex=i;paintModelDialog(`custom-parameters-${i}`);return;}
    }
    modelModalSession.dirty=false; document.getElementById('admin-model')?.close('saved'); modelModalSession=null; replaceUrl({state:'saved',case:null,tested:null,stale:null,provider:null,mode:null}); render();
  }
}
function setupModelDialogs() {
  const dialog=document.getElementById('admin-model'), confirm=document.getElementById('model-discard');
  if(!dialog||!confirm)return;
  dialog.addEventListener('cancel',event=>{event.preventDefault();requestModelClose(document.activeElement);});
  dialog.addEventListener('keydown',event=>trapDialogFocus(dialog,event));
  dialog.addEventListener('click',event=>{if(event.target===dialog)requestModelClose(document.activeElement);});
  dialog.addEventListener('close',()=>{const opener=modelModalOpener;modelModalSession=null;if(dialog.returnValue!=='saved')replaceUrl({state:'list',case:null,tested:null,stale:null,provider:null,mode:null});if(opener?.isConnected)requestAnimationFrame(()=>opener.focus({preventScroll:true}));});
  confirm.addEventListener('cancel',event=>{event.preventDefault();confirm.close('keep');});
  confirm.addEventListener('keydown',event=>trapDialogFocus(confirm,event));
  confirm.addEventListener('click',event=>{if(event.target===confirm)confirm.close('keep');});
  confirm.querySelector('[data-action="keep-editing"]')?.addEventListener('click',()=>confirm.close('keep'));
  confirm.querySelector('[data-action="discard-model"]')?.addEventListener('click',()=>confirm.close('discard'));
  confirm.addEventListener('close',()=>{if(confirm.returnValue==='discard'){modelModalSession.dirty=false;dialog.close('discard');}else{const focus=discardModalOpener;requestAnimationFrame(()=>focus?.isConnected?focus.focus({preventScroll:true}):dialog.querySelector('.dialog-close')?.focus({preventScroll:true}));}});
  const state=params.get('state')??'list';
  if(!['list','saved'].includes(state)){
    const providerId=params.get('provider')??cr306Management.get.body.data.items[0]?.connection.id;
    beginModelSession(providerId,params.get('mode')==='add'?'add':'edit',null,state);
    if(state==='probe-ok'||state==='probe-error'){modelModalSession.provider.models[0].probe=state==='probe-error'?'error':'ok';modelModalSession.tested=true;paintModelDialog('model-entry-1');}
  }
}
function modelsPage() {
  const saved = params.get('state') === 'saved';
  return `${adminHeader()}<main id="main" class="container page admin-layout" tabindex="-1">${adminNav('models')}<section class="admin-main">${heading('gm.title','gm.subtitle',`<button class="btn primary" data-action="add-provider">${icon('plus')}${esc(t('gm.add'))}</button>`)}${saved?`<div class="notice success" role="status"><strong>${esc(t('cr306.saved.title'))}</strong><p>${esc(t('cr306.saved.body'))}</p></div>`:''}<section class="generic-provider-list" aria-label="${esc(t('gm.title'))}">${providerCards()}</section>${scenarioBar([scenarioLink('Edit',{page:'models',state:'edit',case:null}),scenarioLink('Protected field',{page:'models',state:'error',case:'protected_model'}),scenarioLink('Conflict',{page:'models',state:'conflict',case:null}),scenarioLink('Probe rejected',{page:'models',state:'probe-error',case:null})])}</section></main>${modelDialogShell()}${footer()}`;
}
function plansPage() {
  const key = fixtures.plans[params.get('plan')] ? params.get('plan') : 'pro';
  const plan = fixtures.plans[key];
  const limitRaw = params.get('contentLimit') ?? String(plan.limit);
  const valid = /^\d+$/.test(limitRaw) && Number(limitRaw) >= 0 && Number(limitRaw) <= 99;
  const changed = params.get('changed') === '1';
  const conflict = params.get('conflict') === '1';
  const confirmed = params.get('planConfirmed') === '1';
  const reviewOn = plan.editable && valid && Number(limitRaw) > 0;
  const tabs = Object.keys(fixtures.plans).map(id => `<button type="button" role="tab" aria-selected="${id===key}" class="${id===key?'selected':''}" data-plan="${id}">${esc(planTabName(id))}</button>`).join('');
  const models = fixtures.models.map(model => `<label><input type="checkbox" name="plan-model" value="${esc(model.id)}" checked><span>${esc(model.label)}</span></label>`).join('');
  const lengths = [['short','a.length.short'],['medium','a.length.medium'],['long','a.length.long'],['xlong','a.length.xlong']].map(([value,label]) => `<label><input type="checkbox" name="plan-length" value="${value}" checked><span>${esc(t(label))}</span></label>`).join('');
  const service = `<section id="service-settings" class="m003-service-section" aria-labelledby="service-title"><div class="section-head"><div><h2 id="service-title">${esc(t('m003.service.title'))}</h2><p>${esc(t('m003.service.desc'))}</p></div><span class="pill" data-service-tier="${reviewOn?'enhanced':'basic'}">${esc(t(reviewOn?'m003.service.enhanced':'m003.service.basic'))}</span></div><div class="m003-service-grid"><label class="field"><span>${esc(t('m003.basic.budget'))}</span><input value="2" readonly aria-readonly="true"><small>${esc(t('m003.basic.scope'))}</small></label><div class="m003-content-control"><label class="field inline"><input id="content-review-enabled" type="checkbox" ${reviewOn?'checked':''} ${plan.editable?'':'disabled'}><span>${esc(t('m003.content.toggle'))}</span></label><label class="field"><span>${esc(t('m003.content.limit'))}</span><input id="content-repair-limit" type="number" min="0" max="99" inputmode="numeric" value="${esc(limitRaw)}" ${plan.editable&&reviewOn?'':'disabled'} aria-invalid="${valid?'false':'true'}"><small>${esc(t(plan.editable?'m003.content.scope':'m003.content.unavailable'))}</small></label></div></div>${valid ? `<p class="notice">${esc(t(Number(limitRaw)===0?'m003.content.off':'m003.content.on',{count:limitRaw}))}</p>` : `<p class="notice warn" role="alert">${esc(t('m003.content.invalid'))}</p>`}</section>`;
  const preview = changed ? `<section id="change-preview" class="notice"><h2>${esc(t('m003.impact.title'))}</h2><p class="m003-impact-counts" data-basic-users="${plan.basicUsers}" data-trial-users="${plan.trialUsers}">${esc(t('m003.impact',{basic:plan.basicUsers,trial:plan.trialUsers}))}</p><p class="muted">${esc(t('m003.effect.new'))} ${esc(t('m003.effect.inflight'))}</p><label class="field inline"><input id="plan-confirm" type="checkbox" ${confirmed?'checked':''}><span>${esc(t('m003.confirm.save'))}</span></label></section>` : '';
  const priorityOpen=params.get('priorities')==='1', priorityPreview=params.get('priorityPreview')==='1';
  const priorityEditor=priorityOpen?`<dialog id="priority-editor" open aria-labelledby="priority-editor-title"><button class="dialog-close" data-action="close-priority-editor" aria-label="${esc(t('cancel'))}">${icon('x')}</button><h2 id="priority-editor-title">${esc(t('priority'))}</h2><form id="priority-form">${Object.keys(fixtures.plans).map((id,i)=>`<label class="field"><span>${esc(planTabName(id))}</span><input type="number" min="0" step="1" value="${i*10}"></label>`).join('')}</form>${priorityPreview?`<p class="notice">${esc(t('plan.effect'))}</p>`:''}<div class="dialog-actions"><button class="btn" data-action="close-priority-editor">${esc(t('cancel'))}</button><button class="btn primary" data-action="${priorityPreview?'save-priorities':'preview-priorities'}">${esc(t(priorityPreview?'confirm':'a.save'))}</button></div></dialog>`:'';
  return `${adminHeader()}<main id="main" class="container page admin-layout" tabindex="-1">${adminNav('plans')}<section class="admin-main">${heading('a.plans','a.plans.desc',`<button class="btn" data-action="open-priority-editor">${esc(t('priority'))}</button>`)}<div class="tabs" role="tablist" aria-label="${esc(t('a.plans'))}">${tabs}</div><section class="panel"><div class="section-head"><div><h2>${esc(planTabName(key))}</h2><p>${esc(t('a.plan.confirm'))}</p></div><span class="pill">${esc(key.toUpperCase())}</span></div><div class="form-grid"><div><fieldset class="admin-options"><legend>${esc(t('a.plan.models'))}</legend>${models}</fieldset><fieldset class="admin-options"><legend>${esc(t('a.plan.lengths'))}</legend>${lengths}</fieldset></div><div><label class="field"><span>${esc(t('priority'))}</span><input id="plan-priority" type="number" min="0" step="1" value="${key==='visitor'?0:key==='basic'?10:20}"></label><label class="field"><span>${esc(t('words.limit'))}</span><input id="plan-max" type="number" min="1" step="1" value="${key==='visitor'?2:8}"></label><label class="field"><span>${esc(t('a.plan.limit'))}</span><input id="plan-limit" type="number" min="0" step="1" value="${key==='visitor'?0:10}" ${key==='plus'?'disabled':''}></label><label class="field inline"><input id="plan-unlimited" type="checkbox" ${key==='plus'?'checked':''}><span>${esc(t('a.plan.unlimited'))}</span></label><p class="muted">${esc(t('a.plan.window'))}</p></div></div>${service}${preview}${conflict?`<div id="version-conflict" class="notice warn" role="alert"><strong>${esc(t('m003.conflict.title'))}</strong><p>${esc(t('m003.conflict.body'))}</p><button class="btn quiet" data-action="recheck-plan">${icon('refresh-cw')}${esc(t('m003.conflict.recheck'))}</button></div>`:''}<div id="plan-actions" class="actions form-footer"><button class="btn" data-action="preview-plan" ${valid?'':'disabled'}>${icon('search')}${esc(t(changed?'m003.preview.change':'preview'))}</button><button class="btn primary" data-action="save-plan" ${valid&&changed&&confirmed&&!conflict?'':'disabled'}>${icon('save')}${esc(t('save'))}</button><button class="btn quiet" data-action="reset-plan">${esc(t('cancel'))}</button></div></section>${scenarioBar([scenarioLink('Conflict',{page:'plans',plan:key,conflict:1,changed:1,planConfirmed:1}),scenarioLink('Clean',{page:'plans',plan:key,conflict:null})])}</section></main>${priorityEditor}${footer()}`;
}

function previewPaper(state,fixture) {
  return `<section id="preview-result" class="article section m003-preview-paper" data-state="${esc(state.lifecycle)}"><div class="section-head m003-result-heading"><h2>${icon('book-open')}${esc(t('preview'))}</h2>${state.lifecycle!=='idle'?statusPill(statusLabel(state)):''}</div><div class="m003-result-body">${streamBody(state,fixture,true)}</div></section>`;
}
function presetsPage() {
  const resolved=currentPreviewResolved(), mode=previewMode();
  const basic=mode==='basic';
  const qualified=params.get('qualified')==='1' && resolved.state.statusData?.status==='valid';
  const confirmed=params.get('confirmed')==='1';
  const publishable=qualified && (resolved.state.notice!=='content_review_incomplete'||confirmed);
  const title=params.get('presetTitle') ?? (lang==='zh'?fixtures.preset.title:'Community garden learning story');
  const presetModel=params.get('presetModel') ?? fixtures.models[0].id;
  const presetStyle=params.get('presetStyle') ?? 'story';
  const presetLength=params.get('presetLength') ?? 'brief';
  const presetMeaning=params.get('presetMeaning') ?? resolved.fixture.request?.meaning_language ?? 'zh';
  const requestMatches=exactWords(currentPreviewWords(),resolved.fixture) && presetMeaning===resolved.fixture.request?.meaning_language;
  return `${adminHeader()}<main id="main" class="container page admin-layout" tabindex="-1">${adminNav('presets')}<section class="admin-main">${heading('a.presets','a.presets.desc',`<button class="btn primary">${icon('plus')}${esc(t('newpreset'))}</button>`)}<div class="admin-master-detail"><section class="panel admin-records" id="preset-list"><h2>${esc(t('a.preset.list'))}</h2><button class="admin-record selected"><strong>${esc(title)}</strong><span>${esc(t(params.get('stale')==='1'?'a.preset.state.changed':'a.preset.state.draft'))}</span></button><button class="admin-record"><strong>${esc(lang==='zh'?fixtures.preset.publishedTitleZh:fixtures.preset.publishedTitleEn)}</strong><span>${esc(t('a.preset.state.published'))}</span></button></section><section class="panel" id="preset-editor"><span class="pill">${esc(t(params.get('stale')==='1'?'a.preset.state.changed':'a.preset.state.draft'))}</span><p>${esc(t('a.preset.options'))}</p><div id="preset-settings"><div class="preset-title-field"><label class="field"><span>${esc(t('preset.name'))}</span><input id="preset-title" value="${esc(title)}" data-preset-param="presetTitle"></label></div>${presetPicker.view()}<div class="form-grid">${selectField('model','preset-model',fixtures.models.map(x=>[x.id,x.label]),presetModel,'data-preset-param="presetModel"')}${selectField('style','preset-style',[['story',t('a.preset.style.Story')],['discussion',t('a.preset.style.Discussion')]],presetStyle,'data-preset-param="presetStyle"')}${selectField('length','preset-length',[['brief',t('a.preset.length.Brief')],['standard',t('a.preset.length.Standard')]],presetLength,'data-preset-param="presetLength"')}${selectField('explain','preset-language',[['zh',t('a.preset.language.中文')],['en',t('a.preset.language.English')],['ja',t('a.preset.language.日本語')]],presetMeaning,'data-preset-param="presetMeaning"')}</div><fieldset id="preview-mode" class="m003-preview-mode"><legend>${esc(t('m003.preview.mode'))}</legend><label class="option-row"><input type="radio" name="preview-mode" value="basic" ${basic?'checked':''}><span><strong>${esc(t('m003.mode.basic'))}</strong><small>${esc(t('m003.mode.basic.help'))}</small></span></label><label class="option-row"><input type="radio" name="preview-mode" value="enhanced" ${basic?'':'checked'}><span><strong>${esc(t('m003.mode.enhanced'))}</strong><small>${esc(t('m003.mode.enhanced.help'))}</small></span></label><p class="muted">${esc(t('m003.preview.mode.note'))}</p></fieldset></div><div id="preset-actions" class="actions form-footer"><button class="btn" data-action="save-preset-draft">${icon('save')}${esc(t('save.draft'))}</button><button class="btn" data-action="generate-preview" ${requestMatches?'':'disabled'}>${icon('sparkles')}${esc(t('previewgen'))}</button>${resolved.state.notice==='content_review_incomplete'?`<label class="field inline m003-confirm"><input id="q02-confirm" type="checkbox" ${confirmed?'checked':''}><span>${esc(t('m003.q02.confirm'))}</span></label>`:''}<button class="btn primary" data-action="publish-preset" ${publishable&&params.get('stale')!=='1'?'':'disabled'}>${icon('check')}${esc(t('publish'))}</button><button class="btn quiet" data-action="unlist-preset">${esc(t('unlist'))}</button></div>${!requestMatches?`<p class="notice warn">${esc(t('m003.preview.fixturematch'))}</p>`:''}${previewPaper(resolved.state,resolved.fixture)}${scenarioBar([scenarioLink('Basic',{page:'presets',mode:'basic',event:0,status:0,qualified:null,stale:null,presetWords:null,presetMeaning:null,previewFailure:null}),scenarioLink('Enhanced',{page:'presets',mode:'enhanced',event:0,status:0,qualified:null,stale:null,presetWords:null,presetMeaning:null,previewFailure:null}),scenarioLink('CR306 timeout',{page:'presets',mode:'basic',previewFailure:'timeout',event:3,status:0,qualified:null,stale:null})])}</section></div></section></main>${footer()}`;
}

function startAutoPlayback(preview=false) {
  stopPlayback();
  const epoch=playbackEpoch;
  const name=preview?currentPreviewFixtureName():currentCreateFixtureName();
  const fixture=streamFixtures[name];
  if(preview && (!exactWords(currentPreviewWords(),fixture) || (params.get('presetMeaning') ?? fixture.request?.meaning_language)!==fixture.request?.meaning_language)) return;
  let state=initialStreamState(), index=0;
  liveSession={preview,fixture,state,index};
  replaceUrl({event:0,status:0,saved:null,qualified:null});
  patchStreamRegion(state,fixture,preview,true);
  const advance=()=>{
    if(epoch!==playbackEpoch||!liveSession)return;
    if(index<fixture.wire.length){
      state=applyStreamEvent(state,fixture.wire[index]); index+=1;
      liveSession={preview,fixture,state,index};
      replaceUrl({event:index,status:0}); patchStreamRegion(state,fixture,preview);
      playbackTimer=setTimeout(advance,Math.max(80,fixture.playback?.[index]?.after_ms??120));
      return;
    }
    if(preview && fixture.status_responses.length){
      const response=fixture.status_responses[0];
      playbackTimer=setTimeout(()=>{
        if(epoch!==playbackEpoch)return;
        state=applyStatus(state,response,true); liveSession={preview,fixture,state,index,status:1};
        replaceUrl({status:1,qualified:state.lifecycle==='valid'?1:null,stale:state.lifecycle==='valid'?null:params.get('stale')}); render();
      },response.after_ms??350);
    }
  };
  playbackTimer=setTimeout(advance,fixture.playback?.[0]?.after_ms??100);
}
function configNavigate(id,value){
  const map={'create-model':'model','create-style':'style','create-length':'length','create-meaning':'meaning'};
  navigate(hasUnsavedResult() ? {[map[id]]:value,discardError:null} : {[map[id]]:value,event:0,status:0,discardError:null},id);
}
function openRegenerateDialog(opener) {
  const dialog=document.getElementById('regenerate-confirm');
  if(!dialog||dialog.open)return;
  regenerateOpener=opener instanceof HTMLElement?opener:document.activeElement;
  dialog.showModal();
  dialog.querySelector('[data-action="cancel-regenerate"]:not(.dialog-close)')?.focus({preventScroll:true});
}
function closeRegenerateDialog() {
  document.getElementById('regenerate-confirm')?.close('cancel');
}
function confirmRegenerate() {
  const dialog=document.getElementById('regenerate-confirm');
  if(params.get('discardFailure')==='1'){
    dialog?.close('failed');
    replaceUrl({discardError:1});
    render();
    requestAnimationFrame(()=>document.getElementById('generate')?.focus({preventScroll:true}));
    return;
  }
  dialog?.close('confirmed');
  replaceUrl({event:0,status:0,saved:null,discardError:null});
  startAutoPlayback(false);
}
function setupRegenerateDialog() {
  const dialog=document.getElementById('regenerate-confirm');
  if(!dialog)return;
  dialog.addEventListener('cancel',event=>{event.preventDefault();closeRegenerateDialog();});
  dialog.addEventListener('keydown',event=>trapDialogFocus(dialog,event));
  dialog.addEventListener('click',event=>{if(event.target===dialog)closeRegenerateDialog();});
  dialog.querySelectorAll('[data-action="cancel-regenerate"]').forEach(node=>node.addEventListener('click',closeRegenerateDialog));
  dialog.querySelector('[data-action="confirm-regenerate"]')?.addEventListener('click',confirmRegenerate);
  dialog.addEventListener('close',()=>{
    if(dialog.returnValue==='confirmed')return;
    const opener=regenerateOpener;
    regenerateOpener=null;
    if(opener?.isConnected)requestAnimationFrame(()=>opener.focus({preventScroll:true}));
  });
}
function bindActions(){
  document.querySelectorAll('[data-action]').forEach(node=>node.onclick=()=>{
    const a=node.dataset.action;
    if(a==='edit-provider'){replaceUrl({page:'models',state:'edit',provider:node.dataset.provider,mode:null,case:null,tested:null,stale:null});beginModelSession(node.dataset.provider,'edit',node,'edit');}
    if(a==='add-provider'){replaceUrl({page:'models',state:'edit',provider:null,mode:'add',case:null,tested:null,stale:null});beginModelSession(null,'add',node,'edit');}
    if(a==='open-probe'){replaceUrl({page:'models',state:'probe-ok',provider:node.dataset.provider,mode:null,case:null,tested:1,stale:null});beginModelSession(node.dataset.provider,'edit',node,'probe-ok');modelModalSession.provider.models[Number(node.dataset.modelIndex)].probe='ok';modelModalSession.tested=true;paintModelDialog(`model-entry-${Number(node.dataset.modelIndex)+1}`);}
    if(a==='generate') hasUnsavedResult() ? openRegenerateDialog(node) : startAutoPlayback(false);
    if(a==='generate-preview') startAutoPlayback(true);
    if(a==='harness-replay'){ replaceUrl({event:0,status:0,saved:null}); startAutoPlayback(false); }
    if(a==='cancel-generation'){ stopPlayback(); const f=currentCreateResolved().fixture; const cancelled={...initialStreamState(),lifecycle:'cancelled'}; patchStreamRegion(cancelled,f,false,true); replaceUrl({event:0,status:0,cancelled:1}); }
    if(a==='restart'){ stopPlayback(); replaceUrl({event:0,status:0,saved:null,cancelled:null}); render(); }
    if(a==='save-story'){ replaceUrl({saved:1}); render(); }
    if(a==='recheck-generation'||a==='next-status'){ const preview=a==='next-status'; const r=preview?currentPreviewResolved():currentCreateResolved(); const state=applyStatus(r.state,r.fixture.status_responses[r.statusCount],preview); replaceUrl({status:r.statusCount+1,qualified:preview&&state.lifecycle==='valid'?1:null}); render(); }
    if(a==='preview-plan') navigate({changed:1,planConfirmed:null},'change-preview');
    if(a==='save-plan') navigate({changed:null,conflict:null,planConfirmed:null},'plan-actions');
    if(a==='recheck-plan') navigate({conflict:null,changed:1,planConfirmed:null,refreshed:1},'change-preview');
    if(a==='reset-plan') navigate({contentLimit:null,changed:null,conflict:null,planConfirmed:null},'content-repair-limit');
    if(a==='open-priority-editor') navigate({priorities:1,priorityPreview:null},'priority-editor-title');
    if(a==='close-priority-editor'||a==='save-priorities') navigate({priorities:null,priorityPreview:null},'main');
    if(a==='preview-priorities') navigate({priorities:1,priorityPreview:1},'priority-editor-title');
    if(a==='publish-preset') navigate({published:1},'preset-actions');
    if(a==='save-preset-draft') navigate({draftSaved:1},'preset-actions');
    if(a==='unlist-preset') navigate({unlisted:1},'preset-actions');
  });
}
function bind(){
  document.getElementById('site-language')?.addEventListener('change',e=>{ location.href=qurl({lang:e.target.value}); });
  document.querySelectorAll('[data-config]').forEach(el=>el.addEventListener('change',()=>configNavigate(el.id,el.value)));
  document.querySelectorAll('[data-plan]').forEach(el=>el.addEventListener('click',()=>navigate({plan:el.dataset.plan,contentLimit:null,changed:null,conflict:null},'content-repair-limit')));
  document.getElementById('content-repair-limit')?.addEventListener('input',e=>navigate({contentLimit:e.target.value,changed:1},'content-repair-limit'));
  document.getElementById('content-review-enabled')?.addEventListener('change',e=>navigate({contentLimit:e.target.checked?(params.get('lastContentLimit')||1):0,lastContentLimit:e.target.checked?null:(Number(params.get('contentLimit')||1)>0?(params.get('contentLimit')||1):1),changed:1,planConfirmed:null},'content-review-enabled'));
  document.getElementById('plan-confirm')?.addEventListener('change',e=>navigate({planConfirmed:e.target.checked?1:null},'plan-confirm'));
  document.querySelectorAll('input[name="preview-mode"]').forEach(el=>el.addEventListener('change',()=>navigate({mode:el.value,event:0,status:0,qualified:null,confirmed:null},'preview-mode')));
  document.querySelectorAll('[data-preset-param]').forEach(el=>el.addEventListener('change',()=>navigate({[el.dataset.presetParam]:el.value,event:0,status:0,qualified:null,confirmed:null,stale:1},el.id)));
  document.getElementById('q02-confirm')?.addEventListener('change',e=>navigate({confirmed:e.target.checked?1:null},'q02-confirm'));
  bindActions(); createPicker.afterRender(); presetPicker.afterRender(); DS.enhance(document); setupModelDialogs();
}
function render(){
  stopPlayback();
  const page=params.get('page')||'create';
  document.title=`${t('brand')} · M003-UI-13-R4`;
  document.getElementById('app').innerHTML=page==='models'?modelsPage():page==='plans'?plansPage():page==='presets'?presetsPage():createPage();
  document.getElementById('app').removeAttribute('aria-busy'); bind(); setupRegenerateDialog();
}
addEventListener('popstate',()=>location.reload());
addEventListener('pagehide',stopPlayback);
render();
