import { renderWordMeanings } from "./word-meanings.js?v=M002-UI-23";
import { icon } from "./icons.js?v=M002-UI-23";
// Published presets only. Carousel state is local presentation, never generation state.
export function createPresetGallery({ F, t, esc, B, chips, heading, empty, link, render, scene }) {
  let dispose = () => {}, selected = 0, paused = false, language = 'all';
  const languages = ['all', '中文', 'English', '日本語'];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const value = (group, v) => t('a.preset.' + group + '.' + v);
  function view() {
    const source = scene() === 'empty' ? [] : scene() === 'single' ? F.presets.slice(0, 1) : F.presets;
    const presets = source.map((p, index) => ({ p, index })).filter(({ p }) => language === 'all' || p.language === language);
    selected = Math.max(0, Math.min(selected, presets.length - 1));
    const tabs = `<div class="gallery-language-tabs" role="tablist" aria-label="${esc(t('gallery.filter.label'))}">${languages.map((v, i) => `<button type="button" role="tab" id="gallery-language-${i}" aria-selected="${language === v}" tabindex="${language === v ? 0 : -1}" aria-controls="gallery-results" data-gallery-language="${esc(v)}"><span>${esc(v === 'all' ? t('gallery.filter.all') : value('language', v))}</span><span class="gallery-tab-count">${source.filter(p => v === 'all' || p.language === v).length}</span></button>`).join('')}</div>`;
    const start = `${heading('explore.title', 'gallery.intro')}<div class="gallery-browser"><p class="filter-label">${esc(t("explain"))}</p>${tabs}<div id="gallery-results" role="tabpanel" aria-labelledby="gallery-language-${languages.indexOf(language)}" tabindex="0">`;
    if (!presets.length) return start + (source.length ? empty('gallery.filter.empty', 'gallery.filter.emptydesc', `<button type="button" class="btn primary" data-gallery-language="all">${esc(t('gallery.filter.reset'))}</button>`) : empty('explore.empty', 'explore.emptydesc', link('create', 'create', 'btn primary'))) + '</div></div>';
    return `${start}<section class="preset-gallery" aria-label="${esc(t('gallery.label'))}" aria-roledescription="${esc(t('gallery.carousel'))}">
      <div class="gallery-toolbar"><div class="gallery-controls">
      <button type="button" class="btn gallery-arrow" data-gallery="previous" aria-controls="presets" aria-label="${esc(t('gallery.previous'))}">${icon("arrow-left")}</button>
      <span class="gallery-position" aria-live="off"></span>
      <button type="button" class="btn gallery-arrow" data-gallery="next" aria-controls="presets" aria-label="${esc(t('gallery.next'))}">${icon("arrow-right")}</button></div></div>
      <div class="gallery-track" id="presets" role="group" tabindex="0" aria-label="${esc(t('gallery.list'))}">${presets.map(({ p, index }, i) => `<article class="preset-card gallery-card" data-preset-index="${index}" aria-labelledby="preset-name-${i}">
        <div class="gallery-config"><div class="gallery-kicker"><span class="gallery-number" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span></div>
        <h2 id="preset-name-${i}">${esc(p.title)}</h2><dl class="gallery-facts">${[['model', p.model], ['style', value('style', p.style)], ['length', value('length', p.length)], ['explain', value('language', p.language)]].map(([k, v]) => `<div><dt>${esc(t(k))}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
        ${renderWordMeanings(p, { t, esc, icon })}<div class="gallery-cta">${B('try', 'try:' + index, 'primary')}</div></div>
        <div class="gallery-paper"><p class="eyebrow">${esc(t('gallery.fullsample'))}</p><div class="gallery-passage" lang="en">${p.sampleText.split(/\n\s*\n/).map(x => `<p class="story-text">${esc(x)}</p>`).join('')}</div><p class="gallery-sample-note">${esc(t('gallery.sample.note'))}</p></div>
      </article>`).join('')}</div><p class="sr-only gallery-announcement" aria-live="polite" aria-atomic="true"></p></section></div></div>`;
  }
  function afterRender() {
    dispose();
    const browser = document.querySelector('.gallery-browser');
    if (!browser) { paused = false; return; }
    const abort = new AbortController(), options = { signal: abort.signal };
    dispose = () => abort.abort();
    function choose(value) {
      if (!languages.includes(value)) return;
      language = value; selected = 0; paused = true;
      render();
      const activeTab = document.getElementById('gallery-language-' + languages.indexOf(value));
      activeTab?.focus({ preventScroll: true });
      activeTab?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
    }
    browser.addEventListener('click', e => {
      const button = e.target.closest('[data-gallery-language]');
      if (button) choose(button.dataset.galleryLanguage);
    }, options);
    browser.querySelector('[role="tablist"]').addEventListener('keydown', e => {
      const tab = e.target.closest('[role="tab"]');
      if (!tab || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
      e.preventDefault();
      const i = languages.indexOf(tab.dataset.galleryLanguage);
      const next = e.key === 'Home' ? 0 : e.key === 'End' ? languages.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + languages.length) % languages.length;
      choose(languages[next]);
    }, options);
    const root = browser.querySelector('.preset-gallery');
    if (!root) return;
    const track = root.querySelector('.gallery-track'), cards = [...track.children];
    const counter = root.querySelector('.gallery-position');
    let timer, scrollTimer, onScreen = false;
    const multi = cards.length > 1;
    const running = () => multi && !paused && !reduced.matches;
    function update() {
      root.querySelectorAll('[data-gallery="previous"],[data-gallery="next"]').forEach(x => x.disabled = !multi);
      counter.textContent = t('gallery.position', { current: selected + 1, total: cards.length });
      root.dataset.rotation = running() ? 'auto' : 'paused';
    }
    function schedule() {
      clearTimeout(timer);
      if (running() && !document.hidden && onScreen)
        timer = setTimeout(() => move(selected + 1, false), 8000);
    }
    const leftOf = i => cards[i].offsetLeft - cards[0].offsetLeft;
    function move(index, manual) {
      selected = (index + cards.length) % cards.length;
      if (manual) paused = true;
      track.scrollTo({ left: leftOf(selected), behavior: reduced.matches ? 'instant' : 'smooth' });
      update();
      if (manual) root.querySelector('.gallery-announcement').textContent = t('gallery.announcement', { current: selected + 1, total: cards.length, title: cards[selected].querySelector('h2').textContent });
      schedule();
    }
    function pause() { paused = true; update(); schedule(); }
    root.addEventListener('click', e => {
      const button = e.target.closest('[data-gallery]');
      if (!button || button.disabled) return;
      move(selected + (button.dataset.gallery === 'next' ? 1 : -1), true);
    }, options);
    // Reading or interaction ends automatic movement for this visit; no resume control.
    browser.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') pause(); }, options);
    browser.addEventListener('focusin', pause, options);
    browser.addEventListener('pointerdown', pause, options);
    browser.addEventListener('wheel', pause, { ...options, passive: true });
    if (browser.contains(document.activeElement) || (matchMedia('(hover: hover)').matches && browser.matches(':hover'))) paused = true;
    track.addEventListener('keydown', e => {
      if (e.target !== track || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
      e.preventDefault();
      move(e.key === 'Home' ? 0 : e.key === 'End' ? cards.length - 1 : selected + (e.key === 'ArrowRight' ? 1 : -1), true);
    }, options);
    track.addEventListener('scroll', () => {
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => {
        selected = cards.reduce((best, _, i) => Math.abs(leftOf(i) - track.scrollLeft) < Math.abs(leftOf(best) - track.scrollLeft) ? i : best, 0);
        update(); schedule();
      }, 120);
    }, { ...options, passive: true });
    document.addEventListener('visibilitychange', schedule, options);
    reduced.addEventListener('change', () => { update(); schedule(); }, options);
    const observer = new IntersectionObserver(entries => {
      onScreen = entries[0].isIntersecting;
      schedule();
    });
    observer.observe(root);
    update();
    track.scrollTo({ left: leftOf(selected), behavior: 'instant' });
    dispose = () => { clearTimeout(timer); clearTimeout(scrollTimer); abort.abort(); observer.disconnect(); };
  }
  return { view, afterRender };
}
