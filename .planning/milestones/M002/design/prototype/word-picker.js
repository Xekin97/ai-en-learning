// Design-only catalog adapter. Production uses the existing search endpoint and entry IDs.
export function createWordPicker(O) {
  const { id, t, esc, icon } = O;
  let query = '', expanded = false, active = -1, message = '', scope, recovered = false, composing = false;
  let abort;
  const selected = () => O.words();
  const limit = () => O.limit?.() ?? Infinity;
  const full = () => selected().length >= limit();
  const busy = () => !!O.disabled?.();
  const root = () => document.getElementById(id);
  const input = () => document.getElementById(id + '-search');
  const state = () => O.state?.() === 'word-loading' ? 'loading' : O.state?.() === 'word-error' && !recovered ? 'error' : 'ready';
  const options = () => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return O.candidates().filter(w => w.toLowerCase().includes(q)).sort((a, b) => Number(!a.toLowerCase().startsWith(q)) - Number(!b.toLowerCase().startsWith(q)) || a.localeCompare(b));
  };
  const blocked = w => busy() || full() || selected().includes(w);
  const matching = w => {
    const q = query.trim().toLowerCase(), at = w.toLowerCase().indexOf(q);
    return at < 0 ? esc(w) : esc(w.slice(0, at)) + '<mark>' + esc(w.slice(at, at + q.length)) + '</mark>' + esc(w.slice(at + q.length));
  };
  function view() {
    const nextScope = O.scope?.() ?? id;
    if (scope !== nextScope) { scope = nextScope; query = ''; expanded = false; active = -1; message = ''; recovered = false; }
    const count = selected().length, capped = Number.isFinite(limit());
    return `<section class="word-picker" id="${id}" data-word-picker="${id}" aria-labelledby="${id}-title"><div class="word-picker-head"><div><h2 id="${id}-title">${esc(t('words'))}</h2><p class="word-picker-count">${esc(capped ? t('wordcount', { count, limit: limit() }) : t('picker.count', { count }))}${capped && !full() ? `<span>${esc(t('picker.remaining', { count: limit() - count }))}</span>` : ''}</p></div>${O.random ? `<button type="button" class="btn quiet small word-picker-random" data-picker-random ${busy() || full() ? 'disabled' : ''}>${icon('shuffle')}${esc(t('random'))}</button>` : ''}</div>
      <div class="word-picker-selection" aria-label="${esc(t('picker.selected'))}">${count ? selected().map(w => `<span class="word-token"><span lang="en">${esc(w)}</span><button type="button" data-picker-remove="${esc(w)}" aria-label="${esc(t('remove'))} ${esc(w)}" ${busy() ? 'disabled' : ''}>${icon('x')}</button></span>`).join('') : `<p class="word-picker-empty">${esc(t('picker.empty'))}</p>`}</div>
      <div class="word-picker-search"><label for="${id}-search">${esc(t('wordsearch'))}</label><div class="word-picker-input">${icon('search')}<input id="${id}-search" data-word-query type="text" role="combobox" autocomplete="off" autocapitalize="none" spellcheck="false" aria-autocomplete="list" aria-haspopup="listbox" aria-controls="${id}-list" aria-expanded="false" aria-describedby="${id}-feedback" placeholder="${esc(t('picker.placeholder'))}" value="${esc(query)}" ${busy() ? 'disabled' : ''}><button type="button" data-picker-clear aria-label="${esc(t('picker.clear'))}" ${!query ? 'hidden' : ''} ${busy() ? 'disabled' : ''}>${icon('x')}</button></div><div class="word-picker-popup" data-picker-popup hidden><div role="listbox" id="${id}-list" aria-label="${esc(t('picker.options'))}" aria-multiselectable="true"></div><div data-picker-search-state></div></div></div>
      <p class="word-picker-feedback ${full() ? 'at-limit' : ''}" id="${id}-feedback" ${full() ? '' : 'hidden'}>${full() ? esc(t('picker.full')) : ''}</p><span class="sr-only" data-picker-live role="status" aria-live="polite" aria-atomic="true">${esc(message)}</span></section>`;
  }
  function paint() {
    const r = root(), field = input(); if (!r || !field) return;
    const items = options(), show = expanded && !!query.trim() && !busy(), ready = state() === 'ready';
    r.querySelector('[data-picker-popup]').hidden = !show;
    r.querySelector('[data-picker-clear]').hidden = !query;
    field.setAttribute('aria-expanded', String(show));
    const list = r.querySelector('[role=listbox]');
    list.innerHTML = ready ? items.map((w, i) => `<button type="button" role="option" id="${id}-option-${i}" tabindex="-1" data-picker-option="${i}" aria-selected="${selected().includes(w)}" aria-disabled="${blocked(w)}" class="word-picker-option ${i === active ? 'is-active' : ''}"><span lang="en">${matching(w)}</span><span class="word-picker-option-status">${selected().includes(w) ? esc(t('picker.chosen')) + icon('check') : icon('plus')}</span></button>`).join('') : '';
    const status = r.querySelector('[data-picker-search-state]');
    status.className = 'word-picker-search-state' + (state() === 'loading' ? ' is-loading' : '');
    status.setAttribute('role', 'status');
    field.setAttribute('aria-busy', String(state() === 'loading'));
    status.innerHTML = state() === 'loading' ? `<span class="word-picker-spinner" aria-hidden="true"></span><p>${esc(t('picker.loading'))}</p>` : !ready ? `<p>${esc(t('picker.error'))}</p><button type="button" class="btn quiet small" data-picker-retry>${icon('refresh-cw')}${esc(t('retry'))}</button>` : !items.length ? `<p>${esc(t('picker.none'))}</p>` : '';
    list.hidden = !ready || !items.length;
    if (show && ready && active >= 0 && items[active]) {
      field.setAttribute('aria-activedescendant', `${id}-option-${active}`);
      document.getElementById(`${id}-option-${active}`)?.scrollIntoView({ block: 'nearest' });
    } else field.removeAttribute('aria-activedescendant');
  }
  function announce(value) { message = value; const node = root()?.querySelector('[data-picker-live]'); if (node) node.textContent = value; }
  function close() { expanded = false; active = -1; paint(); }
  function refreshQuery(value) {
    query = value; expanded = true;
    active = options().findIndex(w => !blocked(w));
    paint();
    announce(state() === 'ready' ? options().length ? t('picker.matches', { count: options().length }) : t('picker.none') : t('picker.' + state()));
  }
  function choose(w) {
    if (!w || !O.candidates().includes(w) || blocked(w) || state() !== 'ready') return;
    query = ''; expanded = false; active = -1; message = t('picker.added', { word: w });
    O.change([...selected(), w]);
    input()?.focus({ preventScroll: true });
  }
  function afterRender() {
    abort?.abort(); const r = root(); if (!r) return;
    abort = new AbortController(); const opts = { signal: abort.signal };
    paint();
    r.addEventListener('compositionstart', () => { composing = true; }, opts);
    r.addEventListener('compositionend', e => { composing = false; if (e.target === input()) refreshQuery(e.target.value); }, opts);
    r.addEventListener('input', e => { if (e.target === input() && !composing && !e.isComposing) refreshQuery(e.target.value); }, opts);
    r.addEventListener('focusin', e => { if (e.target === input()) { expanded = true; paint(); } }, opts);
    r.addEventListener('focusout', e => { if (!r.contains(e.relatedTarget)) close(); }, opts);
    document.addEventListener('pointerdown', e => { if (!r.contains(e.target)) close(); }, opts);
    r.addEventListener('click', e => {
      const button = e.target.closest('button'); if (!button || button.disabled) return;
      if (button.hasAttribute('data-picker-option')) choose(options()[Number(button.dataset.pickerOption)]);
      else if (button.hasAttribute('data-picker-clear')) { query = ''; expanded = false; active = -1; input().value = ''; paint(); input().focus(); }
      else if (button.hasAttribute('data-picker-retry')) { recovered = true; active = options().findIndex(w => !blocked(w)); paint(); input().focus(); }
      else if (button.hasAttribute('data-picker-remove') && !busy()) {
        const w = button.dataset.pickerRemove, before = selected(), index = before.indexOf(w), next = before.filter(v => v !== w);
        message = t('picker.removed', { word: w }); active = -1; O.change(next);
        const target = next[index] ?? next[index - 1];
        const remove = [...(root()?.querySelectorAll('[data-picker-remove]') || [])].find(b => b.dataset.pickerRemove === target);
        (remove || input())?.focus({ preventScroll: true });
      } else if (button.hasAttribute('data-picker-random') && !busy() && !full()) {
        const w = O.random(); if (w) choose(w); else announce(t('random.none'));
      }
    }, opts);
    r.addEventListener('keydown', e => {
      if (e.target !== input() || composing || e.isComposing) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
      if (e.key === 'Tab') { close(); return; }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (expanded && state() === 'ready') choose(options()[active]);
        return;
      }
      if (!['ArrowDown','ArrowUp'].includes(e.key) || !query.trim() || state() !== 'ready') return;
      e.preventDefault(); expanded = true;
      const items = options(), valid = items.map((w,i)=>!blocked(w)?i:-1).filter(i=>i>=0);
      const at = valid.indexOf(active), direction = e.key === 'ArrowDown' ? 1 : -1;
      active = valid.length ? valid[(at + direction + valid.length) % valid.length] : -1; paint();
    }, opts);
  }
  return { view, afterRender };
}
