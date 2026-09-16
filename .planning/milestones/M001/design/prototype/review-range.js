(function () {
  'use strict';

  // Design-only model. Dates are relative to browser-local today; no network or persistence.
  var state, timer, revision = 0, drawIcon, escapeHtml;
  var copy = {
    title: ['选择日期范围', 'Choose a date range'],
    subtitle: ['默认显示最近 7 天', 'The last 7 days are selected'],
    from: ['开始日期', 'From'], to: ['结束日期', 'To'],
    start: ['开始复习', 'Review'],
    stories: ['篇短文', 'stories'],
    loading: ['正在查找短文…', 'Finding stories…'],
    errorTitle: ['暂时无法加载复习内容', 'Couldn’t load your review'],
    errorCopy: ['日期已保留，请重试。', 'Your dates are kept. Please try again.'],
    retry: ['重试', 'Try again'],
    emptyTitle: ['这段时间没有可复习的短文', 'No stories to review in this range'],
    emptyCopy: ['换个日期范围，或先学习几个新词。', 'Try different dates or learn a few new words.'],
    library: ['查看学习记录', 'View library'],
    create: ['继续学习', 'Keep learning'],
    missing: ['请选择开始和结束日期。', 'Choose a start and end date.'],
    order: ['结束日期不能早于开始日期。', 'The end date can’t be before the start date.'],
    invalid: ['请检查日期', 'Check the dates'],
    resume: ['继续上次日期复习', 'Continue your date review'],
    resumeCopy: ['你已经完成 2 / 5 篇。单篇复习不会改变这里的进度。', 'You finished 2 of 5 stories. Reviewing one story won’t change this progress.'],
    resumeAction: ['继续日期复习', 'Continue date review']
  };
  function message(key, locale) { return copy[key][locale === 'zh-CN' ? 0 : 1]; }
  function words(count, locale) { return locale === 'zh-CN' ? count + ' 个词语' : count + (count === 1 ? ' word' : ' words'); }
  function ready(count, locale) { return locale === 'zh-CN' ? count + ' 篇短文可供复习。' : count + (count === 1 ? ' story ready to review.' : ' stories ready to review.'); }
  function dateOffset(days) {
    var date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() + days);
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
  }
  function validDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    var parts = value.split('-').map(Number);
    var date = new Date(value + 'T12:00:00');
    return date.getFullYear() === parts[0] && date.getMonth() === parts[1] - 1 && date.getDate() === parts[2];
  }
  function dateError() {
    if (!validDate(state.from) || !validDate(state.to)) return 'missing';
    return state.from > state.to ? 'order' : '';
  }
  function project() {
    var error = dateError();
    if (error) return { status: 'invalid', error: error };
    var matches = state.fixtures.filter(function (batch) {
      return batch.participates && batch.saved >= state.from && batch.saved <= state.to;
    });
    return { status: matches.length ? 'ready' : 'empty', count: matches.length,
      words: matches.reduce(function (sum, batch) { return sum + batch.entries; }, 0) };
  }
  function reset(mode) {
    clearTimeout(timer);
    revision += 1;
    var older = mode === 'empty' || mode === 'resume-empty';
    var offsets = older ? [-24, -20] : [0, -1, -2, -4, -6];
    state = {
      from: dateOffset(-6), to: dateOffset(0),
      resume: mode === 'resume' || mode === 'resume-empty',
      fixtures: mode === 'empty-library' ? [] : offsets.map(function (offset, index) {
        return { saved: dateOffset(offset), participates: mode !== 'paused-only', entries: index === 4 ? 2 : 3 };
      })
    };
    if (mode === 'date-error') state.to = dateOffset(-7);
    if (mode === 'date-missing') state.from = '';
    state.preview = project();
    if (mode === 'loading') state.preview = { status: 'loading' };
    if (mode === 'preview-error') state.preview = { status: 'error' };
  }
  function canStart() { return Boolean(state && state.preview.status === 'ready' && !dateError()); }
  function statusText(locale) {
    var preview = state.preview;
    if (preview.status === 'ready') return ready(preview.count, locale);
    if (preview.status === 'empty') return message('emptyTitle', locale);
    if (preview.status === 'loading') return message('loading', locale);
    if (preview.status === 'error') return message('errorTitle', locale);
    return message(preview.error, locale);
  }
  function countMarkup(locale) {
    var preview = state.preview;
    if (preview.status === 'ready' || preview.status === 'empty') {
      return '<span class="count-number">' + preview.count + '</span><strong>' + message('stories', locale) +
        '</strong><p class="helper">' + words(preview.words, locale) + '</p>';
    }
    return '<span class="count-number" aria-hidden="true">—</span><p class="helper">' +
      message(preview.status === 'loading' ? 'loading' : preview.status === 'invalid' ? 'invalid' : 'errorTitle', locale) + '</p>';
  }
  function feedbackMarkup(locale) {
    if (state.preview.status === 'empty') {
      return '<div class="empty-state card"><div class="empty-symbol">' + drawIcon('book') +
        '</div><h2>' + message('emptyTitle', locale) + '</h2><p>' + message('emptyCopy', locale) +
        '</p><div class="inline-actions"><button class="button button-secondary" data-action="navigate" data-value="PAGE-005">' +
        message('library', locale) + '</button><button class="button button-primary" data-action="navigate" data-value="PAGE-004">' +
        message('create', locale) + '</button></div></div>';
    }
    if (state.preview.status === 'error') {
      return '<div class="notice notice-danger">' + drawIcon('alert') + '<div><strong class="notice-title">' +
        message('errorTitle', locale) + '</strong><p>' + message('errorCopy', locale) +
        '</p><button class="button button-secondary button-small" data-action="retry-range-preview">' +
        message('retry', locale) + '</button></div></div>';
    }
    return '';
  }
  function invalidField(id) {
    if (state.preview.status !== 'invalid') return false;
    return state.preview.error === 'order' ? id === 'review-end' : !validDate(id === 'review-start' ? state.from : state.to);
  }
  function field(id, key, value, locale) {
    return '<div class="field"><label class="field-label" for="' + id + '">' + message(key, locale) +
      '</label><input class="date-input" id="' + id + '" type="date" required value="' + escapeHtml(value) +
      '" aria-invalid="' + invalidField(id) + '"' + (invalidField(id) ? ' aria-describedby="range-date-error"' : '') + '></div>';
  }
  function render(locale, icon, esc) {
    if (!state) reset('default');
    drawIcon = icon; escapeHtml = esc;
    var resume = state.resume ? '<section class="notice notice-info range-resume">' + icon('clock') +
      '<div><strong class="notice-title">' + message('resume', locale) + '</strong><p>' + message('resumeCopy', locale) +
      '</p><div class="inline-actions"><button class="button button-secondary button-small" data-action="resume-range-review">' +
      message('resumeAction', locale) + '</button></div></div></section>' : '';
    return resume + '<section class="review-setup range-editor" data-range-preview="' + state.preview.status +
      '"><div class="card"><div class="card-header"><div><h2 class="card-title">' + message('title', locale) +
      '</h2><p class="card-subtitle">' + message('subtitle', locale) + '</p></div></div><div class="card-body"><div class="date-range">' +
      field('review-start', 'from', state.from, locale) + field('review-end', 'to', state.to, locale) +
      '</div><p id="range-date-error" class="range-field-error"' + (state.preview.status === 'invalid' ? '' : ' hidden') + '>' +
      (state.preview.status === 'invalid' ? message(state.preview.error, locale) : '') + '</p></div><div class="card-footer">' +
      '<button class="button button-primary" data-action="start-review"' + (canStart() ? '' : ' disabled') + '>' +
      message('start', locale) + ' ' + icon('arrow') + '</button></div></div>' +
      '<aside class="count-card range-count" aria-busy="' + (state.preview.status === 'loading') + '">' + countMarkup(locale) +
      '</aside></section><p id="range-announcement" class="sr-only" role="status" aria-live="polite" aria-atomic="true">' + statusText(locale) +
      '</p><div id="range-feedback" class="range-feedback">' + feedbackMarkup(locale) + '</div>';
  }
  function update(locale) {
    var editor = document.querySelector('.range-editor');
    if (!editor) return; // A late mock response must not replace a new route or visitor gate.
    editor.setAttribute('data-range-preview', state.preview.status);
    editor.querySelector('[data-action="start-review"]').disabled = !canStart();
    var count = editor.querySelector('.range-count');
    count.setAttribute('aria-busy', String(state.preview.status === 'loading'));
    count.innerHTML = countMarkup(locale);
    var error = document.getElementById('range-date-error');
    error.hidden = state.preview.status !== 'invalid';
    error.textContent = error.hidden ? '' : message(state.preview.error, locale);
    ['review-start', 'review-end'].forEach(function (id) {
      var input = document.getElementById(id), invalid = invalidField(id);
      input.setAttribute('aria-invalid', String(invalid));
      if (invalid) input.setAttribute('aria-describedby', 'range-date-error');
      else input.removeAttribute('aria-describedby');
    });
    document.getElementById('range-feedback').innerHTML = feedbackMarkup(locale);
    document.getElementById('range-announcement').textContent = statusText(locale);
  }
  function schedule(locale) {
    clearTimeout(timer);
    var current = ++revision;
    state.preview = dateError() ? project() : { status: 'loading' };
    update(locale());
    if (state.preview.status === 'invalid') return;
    timer = setTimeout(function () {
      if (current !== revision) return;
      state.preview = project();
      update(locale());
    }, 350);
  }
  function change(id, value, locale) {
    if (!state) return;
    var key = id === 'review-start' ? 'from' : 'to';
    if (state[key] === value) return;
    state[key] = value;
    schedule(locale);
  }
  function retry(locale) {
    if (!state || state.preview.status !== 'error') return;
    var button = document.activeElement;
    // Retry is removed by loading; place keyboard users at the preserved editor.
    if (button && button.getAttribute('data-action') === 'retry-range-preview') document.getElementById('review-start').focus();
    schedule(locale);
  }
  window.WordWeaveReviewRange = { reset: reset, render: render, change: change, retry: retry,
    canStart: canStart, hasResume: function () { return Boolean(state && state.resume); } };
}());
