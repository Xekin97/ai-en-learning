(function () {
  'use strict';

  var PAGE_DEFS = [
    { id: 'PAGE-001', title: '首页', group: '学习者', states: [['default', '访客首页'], ['learner', '学习者首页']] },
    { id: 'PAGE-002', title: '注册', group: '账号', states: [['default', '默认'], ['claim', '承接访客结果'], ['error', '字段错误']] },
    { id: 'PAGE-003', title: '登录', group: '账号', states: [['default', '默认'], ['claim', '承接访客结果'], ['error', '凭据错误']] },
    { id: 'PAGE-004', title: '造文工作台', group: '学习者', states: [['default', '开始'], ['ready', '准备完成'], ['streaming', '生成中'], ['valid', '生成完成'], ['saved', '已保存'], ['cancelled', '已取消'], ['system-error', '连接中断'], ['validation-error', '结果异常'], ['quota-empty', '暂时不可用'], ['config-missing', '暂无可用选项']] },
    { id: 'PAGE-005', title: '学习记录', group: '学习者', states: [['default', '正常列表'], ['empty', '首次空状态'], ['search-empty', '搜索无结果']] },
    { id: 'PAGE-006', title: '批次详情', group: '学习者', states: [['default', '正常详情'], ['not-found', '不存在或无权']] },
    { id: 'PAGE-007', title: '复习范围', group: '学习者', states: [['default', '匹配批次'], ['resume', '恢复会话'], ['empty', '仅有较早记录'], ['empty-library', '无学习记录'], ['paused-only', '全部暂不参与'], ['resume-empty', '恢复会话与空范围'], ['date-error', '日期顺序错误'], ['date-missing', '日期未填完'], ['loading', '预览加载中'], ['preview-error', '预览失败']] },
    { id: 'PAGE-008', title: '复习过程', group: '学习者', states: [['stage-1', '日期复习：词条拼写'], ['stage-1-hint', '日期复习：多处提示挖空'], ['single-stage-1', '本篇复习：词条拼写'], ['stage-1-error', '阶段一：答案错误'], ['stage-2', '阶段二：同词分组'], ['stage-2-error', '阶段二：部分答案错误'], ['summary', '日期复习总结'], ['single-summary', '本篇复习总结']] },
    { id: 'PAGE-009', title: '账号设置', group: '账号', states: [['default', '默认'], ['password-success', '密码修改成功']] },
    { id: 'PAGE-101', title: 'OpenRouter 与模型', group: '管理员', states: [['default', '已配置'], ['no-key', '密钥未配置'], ['empty', '暂无模型']] },
    { id: 'PAGE-102', title: '权益组设置', group: '管理员', states: [['default', '有效配置'], ['invalid', '不可生成配置']] },
    { id: 'PAGE-103', title: '用户管理', group: '管理员', states: [['default', '搜索前'], ['loading', '搜索中'], ['results', '多个结果'], ['loading-more', '继续加载'], ['single', '单个结果'], ['empty', '搜索无结果'], ['error', '搜索失败'], ['detail', '用户详情'], ['batch-short', '只读短文：短篇'], ['batch-long', '只读短文：长篇'], ['batch-xlong', '只读短文：特长 / 多词条'], ['batch-loading', '只读短文：加载'], ['batch-error', '只读短文：失败'], ['batch-unavailable', '只读短文：不可用']] }
  ];

  var AUTH_TARGETS = {
    'PAGE-005': 'library',
    'PAGE-006': 'story',
    'PAGE-007': 'review',
    'PAGE-008': 'review',
    'PAGE-009': 'account'
  };

  var WORDS = [
    'according to', 'adapt', 'business', 'conversation', 'create', 'creative',
    'creature', 'curious', 'news', 'resilient', 'weave', 'community'
  ];

  var MODEL_OPTIONS = [
    { id: 'sage-mini', name: 'Sage Mini', description: '快速生成，适合日常短文' },
    { id: 'atlas-reasoner', name: 'Atlas Reasoner', description: '更强语境组织，适合长文' }
  ];

  var ADMIN_USERS = [
    { username: 'lin_context', role: '学习者', plan: 'Plus', joined: '2026-08-11', status: '正常', stories: '9 篇' },
    { username: 'lin_news', role: '学习者', plan: '基础版', joined: '2026-08-29', status: '正常', stories: '3 篇' },
    { username: 'lin_story', role: '学习者', plan: 'Pro', joined: '2026-08-08', status: '正常', stories: '6 篇' },
    { username: 'lin_weave', role: '学习者', plan: '基础版', joined: '2026-08-03', status: '正常', stories: '2 篇' },
    { username: 'linda_reads', role: '学习者', plan: '基础版', joined: '2026-08-15', status: '正常', stories: '1 篇' },
    { username: 'linguistic_thread_collector_2026', role: '学习者', plan: 'Pro', joined: '2026-08-21', status: '正常', stories: '4 篇' }
  ];

  var CLOZE_TONES = ['jade', 'amber', 'blue', 'plum', 'rose', 'slate'];
  var CLOZE_PATTERNS = ['solid', 'stripe', 'dot', 'double'];

  var SAMPLE_PASSAGE =
    'When the neighborhood library faced an uncertain future, a small learning circle decided to create a new reason for people to gather. They invited residents to weave personal memories into a shared story about the streets around them. The group remained resilient when the first meeting attracted only a few visitors. Instead of giving up, they listened carefully, adjusted the format, and made every conversation easier to join. Within weeks, the quiet reading room became a place where newcomers and longtime neighbors exchanged ideas. The project did more than protect a building; it created a habit of learning together and showed how a community can adapt without losing its character.';

  var SAMPLE_PASSAGE_TAGS = {
    zh: ['社区共创', '韧性', '公共空间'],
    en: ['Community building', 'Resilience', 'Public space'],
    ja: ['コミュニティ共創', 'レジリエンス', '公共空間']
  };

  var RESOURCE_MAP = {
    'create': { meaning: '创造；在此处指建立新的共同活动', meaningEn: 'to bring something new into being; here, to start a shared activity', meaningJa: '創造する；ここでは、新しい共同活動を始めること', phrase: 'creating a shared reason to gather' },
    'resilient': { meaning: '有韧性的；遇到困难后仍能继续调整', meaningEn: 'able to recover and keep adapting after difficulty', meaningJa: '回復力がある；困難の後も適応を続けられること', phrase: 'a resilient team with resilient learning habits' },
    'weave': { meaning: '编织；在此处指把不同记忆组织成整体', meaningEn: 'to weave; here, to bring different memories into one whole', meaningJa: '織り合わせる；ここでは、異なる記憶を一つにまとめること', phrase: 'weaving memories into a story' },
    'according to': { meaning: '根据；用于说明信息来源', meaningEn: 'according to; used to name a source', meaningJa: '〜によると；情報源を示す表現', phrase: 'according to the local report and according to community updates' },
    'business': { meaning: '商业；与组织经营有关的活动', meaningEn: 'business; work related to running an organization', meaningJa: '事業；組織の運営に関わる活動', phrase: 'a responsible business decision' },
    'news': { meaning: '新闻；有关近期事件的信息', meaningEn: 'news; information about recent events', meaningJa: 'ニュース；最近の出来事に関する情報', phrase: 'sharing the latest news' },
    'adapt': { meaning: '适应；根据变化调整做法', meaningEn: 'to adapt; to change in response to a new situation', meaningJa: '適応する；変化に応じて方法を調整すること', phrase: 'adapting to a new situation' },
    'conversation': { meaning: '交谈；双方或多人之间的交流', meaningEn: 'a conversation between two or more people', meaningJa: '会話；二人以上の間で行うやり取り', phrase: 'joining a thoughtful conversation' },
    'community': { meaning: '社区；共享地点或关系的一群人', meaningEn: 'a community connected by place or relationships', meaningJa: 'コミュニティ；場所や関係を共有する人々の集まり', phrase: 'supporting the local community' }
  };

  var BROWSER_LOCALE_KEY = 'wordweave.uiLocale';
  var ACCOUNT_LOCALE_KEY = 'wordweave.accountLocale.';

  var appState = {
    page: 'PAGE-001',
    demo: 'default',
    role: 'visitor',
    locale: resolveInitialLocale(),
    localeSyncPending: false,
    localeSaveMode: 'ok',
    hasClaim: false,
    authIntent: null,
    adminBatchIndex: 0,
    adminBatchMode: 'short',
    selectedBatch: 0,
    recordQuery: '',
    adminUserQuery: '',
    adminUserResultState: 'results',
    adminUserSelected: 3,
    adminGroup: 'visitor',
    pendingNavigation: null,
    genTimer: null,
    gen: freshGeneration(),
    reviewMode: 'range',
    reviewBatchIndex: null,
    rangeSession: {
      inProgress: true,
      completed: 2,
      total: 5
    },
    review: freshReview(),
    batches: [
      {
        id: 'batch-001',
        saved: '2026-08-12',
        status: 'active',
        words: ['create', 'resilient', 'weave'],
        scene: '故事',
        length: '中篇',
        language: '中文',
        model: 'Sage Mini',
        reviewed: 3,
        singleSession: 'in-progress',
        tags: ['社区共创', '韧性', '公共空间']
      },
      {
        id: 'batch-002',
        saved: '2026-08-20',
        status: 'paused',
        words: ['according to', 'business', 'news'],
        scene: '新闻',
        length: '短篇',
        language: '中文',
        model: 'Atlas Reasoner',
        reviewed: 0,
        singleSession: null,
        tags: ['商业趋势', '行业动态']
      }
    ]
  };

  var pageSelect;
  var stateSelect;
  var main;
  var headerRoot;
  var dialog;
  var dialogContent;
  var toastRegion;
  var dialogReturnFocus;

  function ui(key) {
    return window.WordWeaveI18n.message(key, appState.locale);
  }

  function pageLabel(id) {
    return AUTH_TARGETS[id] ? ui(AUTH_TARGETS[id]) : localize(getPageDef(id).title);
  }

  function freshGeneration() {
    return {
      words: [],
      query: '',
      model: '',
      language: '',
      scenario: '',
      length: '',
      streamStep: 0
    };
  }

  function freshReview() {
    return {
      hint: false,
      answer1: '',
      answers2: {},
      incorrect2: [],
      groupStyles: null,
      feedback: '',
      skipped: false
    };
  }

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function isSupportedLocale(value) {
    return ['zh-CN', 'en-US'].indexOf(value) >= 0;
  }

  function readPreference(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (error) {
      return null;
    }
  }

  function writePreference(key, value) {
    try {
      window.localStorage.setItem(key, value);
      return true;
    } catch (error) {
      return false;
    }
  }

  function removePreference(key) {
    try {
      window.localStorage.removeItem(key);
    } catch (error) {
      return;
    }
  }

  function matchBrowserLocale() {
    var languages = navigator.languages && navigator.languages.length
      ? navigator.languages
      : [navigator.language || ''];
    for (var index = 0; index < languages.length; index += 1) {
      var value = String(languages[index]).toLowerCase();
      if (value === 'zh' || value.indexOf('zh-') === 0) return 'zh-CN';
      if (value === 'en' || value.indexOf('en-') === 0) return 'en-US';
    }
    return 'en-US';
  }

  function resolveInitialLocale() {
    var saved = readPreference(BROWSER_LOCALE_KEY);
    if (isSupportedLocale(saved)) return saved;
    var matched = matchBrowserLocale();
    writePreference(BROWSER_LOCALE_KEY, matched);
    return matched;
  }

  function accountLocaleKey(role) {
    return ACCOUNT_LOCALE_KEY + role;
  }

  function saveAccountLocale(role) {
    if (role !== 'learner' && role !== 'admin') return true;
    if (appState.localeSaveMode === 'fail') return false;
    return writePreference(accountLocaleKey(role), appState.locale);
  }

  function mergeAccountLocale(role) {
    var saved = readPreference(accountLocaleKey(role));
    if (isSupportedLocale(saved)) {
      appState.locale = saved;
      writePreference(BROWSER_LOCALE_KEY, saved);
      appState.localeSyncPending = false;
      return;
    }
    writePreference(BROWSER_LOCALE_KEY, appState.locale);
    appState.localeSyncPending = !saveAccountLocale(role);
  }

  function selectLocale(locale) {
    if (!isSupportedLocale(locale)) return;
    appState.locale = locale;
    writePreference(BROWSER_LOCALE_KEY, locale);
    appState.localeSyncPending = !saveAccountLocale(appState.role);
    document.documentElement.lang = appState.locale;
    render();
    requestAnimationFrame(function () {
      var select = document.querySelector('[data-locale-select]');
      if (select) select.focus();
    });
    if (appState.localeSyncPending) showToast('界面语言已切换，账号偏好暂未同步。', 'warning');
  }

  function icon(name) {
    var paths = {
      arrow: '<path d="M5 12h14M14 6l6 6-6 6"/>',
      book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v16H6.5A2.5 2.5 0 0 0 4 21.5z"/><path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H13v16h4.5a2.5 2.5 0 0 1 2.5 2.5z"/>',
      check: '<path d="m5 12 4 4L19 6"/>',
      search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
      spark: '<path d="m12 3 1.4 4.6L18 9l-4.6 1.4L12 15l-1.4-4.6L6 9l4.6-1.4z"/><path d="m18 15 .8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8z"/>',
      alert: '<path d="M12 3 2.5 20h19z"/><path d="M12 9v4M12 17h.01"/>',
      info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
      clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
      user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
      settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1z"/>',
      users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
      menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
      close: '<path d="m6 6 12 12M6 18 18 6"/>',
      trash: '<path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6"/>',
      pause: '<path d="M8 5v14M16 5v14"/>',
      play: '<path d="m8 5 11 7-11 7z"/>',
      logout: '<path d="M10 17l5-5-5-5M15 12H3M15 4h5v16h-5"/>',
      key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l2 2M14 9l2 2"/>',
      globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>'
    };
    return '<svg class="icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + (paths[name] || paths.info) + '</svg>';
  }

  function logo() {
    return '<svg class="brand-mark" aria-hidden="true" viewBox="0 0 44 44" fill="none">' +
      '<rect x="2" y="2" width="40" height="40" rx="14" fill="#E4F1EC"/>' +
      '<path d="M8 24c7-13 18-14 28-5" stroke="#1E7464" stroke-width="2.2" stroke-linecap="round"/>' +
      '<path d="M9 18c8 14 19 15 27 6" stroke="#BD6F2F" stroke-width="2.2" stroke-linecap="round"/>' +
      '<circle cx="12" cy="20.5" r="2.2" fill="#1E7464"/><circle cx="32" cy="22" r="2.2" fill="#BD6F2F"/>' +
      '</svg>';
  }

  function brandName() {
    return appState.locale === 'zh-CN' ? '词涟' : 'WordWeave';
  }

  function brandMarkup() {
    var localeClass = appState.locale === 'zh-CN' ? 'brand-name-zh' : 'brand-name-en';
    return logo() + '<span class="brand-copy"><span class="brand-name ' + localeClass + '">' + esc(brandName()) + '</span></span>';
  }

  function getPageDef(id) {
    return PAGE_DEFS.filter(function (page) { return page.id === id; })[0];
  }

  function isAdminPage(id) {
    return id.indexOf('PAGE-10') === 0;
  }

  function isRestrictedPage(id) {
    return ['PAGE-005', 'PAGE-006', 'PAGE-007', 'PAGE-008', 'PAGE-009'].indexOf(id) >= 0;
  }

  function init() {
    pageSelect = document.getElementById('prototype-page');
    stateSelect = document.getElementById('prototype-state');
    main = document.getElementById('app-main');
    headerRoot = document.getElementById('app-header');
    dialog = document.getElementById('app-dialog');
    dialogContent = document.getElementById('dialog-content');
    toastRegion = document.getElementById('toast-region');

    applyUrlState();
    if (appState.role === 'learner' || appState.role === 'admin') mergeAccountLocale(appState.role);
    populatePageSelect();
    bindEvents();
    applyDemoState(appState.demo);
    render();
  }

  function applyUrlState() {
    if (!window.location || !window.location.search) return;
    var params = new URLSearchParams(window.location.search);
    var requestedPage = params.get('page');
    var requestedRole = params.get('role');
    var requestedState = params.get('state');
    var requestedLocale = params.get('locale');
    if (getPageDef(requestedPage)) appState.page = requestedPage;
    if (['visitor', 'learner', 'admin'].indexOf(requestedRole) >= 0) appState.role = requestedRole;
    if (['zh-CN', 'en-US'].indexOf(requestedLocale) >= 0) appState.locale = requestedLocale;
    var def = getPageDef(appState.page);
    if (def.states.some(function (item) { return item[0] === requestedState; })) appState.demo = requestedState;
    var batchIndex = appState.batches.findIndex(function (batch) { return batch.id === params.get('batch'); });
    if (batchIndex >= 0) appState.selectedBatch = batchIndex;
    var returnPage = params.get('returnPage');
    if (AUTH_TARGETS[returnPage] && (appState.page === 'PAGE-002' || appState.page === 'PAGE-003')) {
      appState.authIntent = { page: returnPage, batchIndex: appState.selectedBatch };
    }
    if (isAdminPage(appState.page)) appState.role = 'admin';
  }

  function populatePageSelect() {
    var groups = {};
    PAGE_DEFS.forEach(function (page) {
      if (!groups[page.group]) groups[page.group] = [];
      groups[page.group].push(page);
    });
    pageSelect.innerHTML = Object.keys(groups).map(function (group) {
      return '<optgroup label="' + esc(group) + '">' +
        groups[group].map(function (page) {
          return '<option value="' + page.id + '">' + page.id + ' · ' + esc(pageLabel(page.id)) + '</option>';
        }).join('') +
        '</optgroup>';
    }).join('');
  }

  function populateStateSelect() {
    var def = getPageDef(appState.page);
    stateSelect.innerHTML = def.states.map(function (item) {
      var label = appState.page === 'PAGE-007' ? localize(item[1]) : item[1];
      return '<option value="' + item[0] + '">' + esc(label) + '</option>';
    }).join('');
    stateSelect.value = appState.demo;
  }

  function syncPrototypeControls() {
    populatePageSelect();
    pageSelect.value = appState.page;
    populateStateSelect();
    document.querySelectorAll('[data-prototype-role]').forEach(function (button) {
      button.setAttribute('aria-pressed', String(button.getAttribute('data-prototype-role') === appState.role));
    });
  }

  function bindEvents() {
    pageSelect.addEventListener('change', function () {
      navigate(pageSelect.value);
    });

    stateSelect.addEventListener('change', function () {
      applyDemoState(stateSelect.value);
      render();
    });

    document.addEventListener('click', handleClick);
    document.addEventListener('input', handleInput);
    document.addEventListener('change', handleChange);
    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('focusout', handleFocusOut);
    document.addEventListener('submit', function (event) {
      event.preventDefault();
      if (event.target.id === 'admin-user-search-form') submitAdminUserSearch();
    });

    dialog.addEventListener('click', function (event) {
      if (event.target === dialog) closeDialog();
    });
    dialog.addEventListener('cancel', function (event) {
      event.preventDefault();
      closeDialog();
    });
    dialog.addEventListener('close', finishDialogClose);
    dialog.addEventListener('keydown', function (event) {
      if (event.key !== 'Tab') return;
      var focusable = Array.from(dialog.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [href], [tabindex="0"]')).filter(function (element) { return element.getClientRects().length > 0; });
      if (!focusable.length) return;
      var first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || focusable.indexOf(document.activeElement) < 0)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || focusable.indexOf(document.activeElement) < 0)) {
        event.preventDefault();
        first.focus();
      }
    });
  }

  function handleClick(event) {
    var roleButton = event.target.closest('[data-prototype-role]');
    if (roleButton) {
      changeRole(roleButton.getAttribute('data-prototype-role'));
      return;
    }

    var target = event.target.closest('[data-action]');
    if (!target) return;
    var action = target.getAttribute('data-action');
    var value = target.getAttribute('data-value');
    var index = Number(target.getAttribute('data-index'));

    if (action === 'navigate') navigate(value);
    if (action === 'select-word') selectWord(value);
    if (action === 'remove-word') removeWord(value);
    if (action === 'start-generation') startGeneration();
    if (action === 'cancel-generation') showCancelDialog();
    if (action === 'confirm-cancel') confirmCancel();
    if (action === 'confirm-leave-generation') confirmLeaveGeneration();
    if (action === 'discard-generation') showDiscardDialog();
    if (action === 'confirm-discard') confirmDiscard();
    if (action === 'save-generation') saveGeneration();
    if (action === 'new-generation') startNewGeneration();
    if (action === 'auth-submit') completeAuth();
    if (action === 'view-batch') openBatch(index);
    if (action === 'review-batch') startBatchReview(index);
    if (action === 'delete-batch') showDeleteBatchDialog(index);
    if (action === 'confirm-delete-batch') confirmDeleteBatch(index);
    if (action === 'start-review') startRangeReview();
    if (action === 'resume-range-review') {
      if (window.WordWeaveReviewRange.hasResume()) openRangeReviewSample();
    }
    if (action === 'retry-range-preview') window.WordWeaveReviewRange.retry(function () { return appState.locale; });
    if (action === 'check-stage-1') checkStageOne();
    if (action === 'skip-stage-1') skipStageOne();
    if (action === 'check-stage-2') checkStageTwo();
    if (action === 'skip-stage-2') finishReview(false);
    if (action === 'restart-review') restartReview();
    if (action === 'retry-locale-sync') retryLocaleSync();
    if (action === 'reset-locale-preferences') resetLocalePreferences();
    if (action === 'change-password') showPasswordDialog();
    if (action === 'confirm-password') {
      closeDialog();
      appState.demo = 'password-success';
      render();
      showToast('密码已更新，其他会话已退出。');
    }
    if (action === 'logout') {
      appState.role = 'visitor';
      appState.localeSyncPending = false;
      showToast('当前会话已退出。');
      navigate('PAGE-001');
    }
    if (action === 'delete-account') showDeleteAccountDialog();
    if (action === 'confirm-delete-account') {
      closeDialog();
      appState.role = 'visitor';
      appState.batches = [];
      removePreference(accountLocaleKey('learner'));
      appState.localeSyncPending = false;
      showToast('账号及全部数据已永久删除。');
      navigate('PAGE-001');
    }
    if (action === 'close-dialog') closeDialog();
    if (action === 'replace-key') showKeyDialog();
    if (action === 'confirm-key') {
      closeDialog();
      appState.demo = 'default';
      render();
      showToast('OpenRouter 密钥配置已更新。');
    }
    if (action === 'add-model' || action === 'edit-model') showModelDialog(action === 'edit-model');
    if (action === 'confirm-model') {
      closeDialog();
      appState.demo = 'default';
      render();
      showToast('模型配置已保存。');
    }
    if (action === 'select-group') {
      appState.adminGroup = value;
      render();
    }
    if (action === 'save-group') showToast('方案设置已保存。');
    if (action === 'change-user-group') showUserGroupDialog();
    if (action === 'confirm-user-group') {
      closeDialog();
      showToast('用户方案已更新。');
    }
    if (action === 'reset-user-password') showResetUserPasswordDialog();
    if (action === 'confirm-reset-user-password') {
      closeDialog();
      showToast('密码已重置。');
    }
    if (action === 'admin-view-batch') showAdminBatchDialog(index, 'short');
    if (action === 'admin-batch-retry') showAdminBatchDialog(appState.adminBatchIndex, 'short');
    if (action === 'admin-user-search') {
      event.preventDefault();
      submitAdminUserSearch();
    }
    if (action === 'admin-user-retry') submitAdminUserSearch();
    if (action === 'admin-user-open') openAdminUser(index);
    if (action === 'admin-user-back') returnToAdminUserResults();
    if (action === 'admin-user-load-more') loadMoreAdminUsers();
    if (action === 'mobile-menu') showMobileMenuDialog();
  }

  function handleInput(event) {
    if (event.target.id === 'review-start' || event.target.id === 'review-end') {
      window.WordWeaveReviewRange.change(event.target.id, event.target.value, function () { return appState.locale; });
    }
    if (event.target.id === 'word-search') {
      appState.gen.query = event.target.value;
      render();
      refocus('word-search', appState.gen.query.length);
    }
    if (event.target.id === 'record-search') {
      appState.recordQuery = event.target.value;
      render();
      refocus('record-search', appState.recordQuery.length);
    }
    if (event.target.id === 'review-answer-1') appState.review.answer1 = event.target.value;
    if (event.target.hasAttribute('data-cloze-answer')) {
      var answerId = event.target.getAttribute('data-cloze-answer');
      appState.review.answers2[answerId] = event.target.value;
      appState.review.incorrect2 = appState.review.incorrect2.filter(function (id) { return id !== answerId; });
    }
    if (event.target.id === 'admin-user-search') {
      appState.adminUserQuery = event.target.value;
    }
  }

  function handleFocusIn(event) {
    var cloze = event.target.closest('[data-cloze-group]');
    if (!cloze) return;
    setActiveClozeGroup(cloze.getAttribute('data-cloze-group'));
  }

  function handleFocusOut(event) {
    if (!event.target.closest('[data-cloze-group]')) return;
    window.requestAnimationFrame(function () {
      var active = document.activeElement && document.activeElement.closest
        ? document.activeElement.closest('[data-cloze-group]')
        : null;
      setActiveClozeGroup(active ? active.getAttribute('data-cloze-group') : null);
    });
  }

  function setActiveClozeGroup(groupId) {
    document.querySelectorAll('[data-cloze-group]').forEach(function (item) {
      item.classList.toggle('is-group-active', Boolean(groupId) && item.getAttribute('data-cloze-group') === groupId);
      item.classList.toggle('is-group-muted', Boolean(groupId) && item.getAttribute('data-cloze-group') !== groupId);
    });
  }

  function handleChange(event) {
    if (event.target.id === 'review-start' || event.target.id === 'review-end') {
      window.WordWeaveReviewRange.change(event.target.id, event.target.value, function () { return appState.locale; });
      return;
    }
    if (event.target.hasAttribute('data-locale-select')) {
      selectLocale(event.target.value);
      return;
    }
    if (event.target.id === 'prototype-locale-save') {
      appState.localeSaveMode = event.target.value;
      return;
    }
    var field = event.target.getAttribute('data-gen-field');
    if (field) {
      appState.gen[field] = event.target.value;
      render();
    }
    if (event.target.id === 'hint-toggle') {
      appState.review.hint = event.target.checked;
      render();
    }
    if (event.target.hasAttribute('data-batch-participation')) {
      setBatchParticipation(Number(event.target.getAttribute('data-index')), event.target.checked);
    }
  }

  function refocus(id, position) {
    requestAnimationFrame(function () {
      var input = document.getElementById(id);
      if (!input) return;
      input.focus();
      if (input.setSelectionRange) input.setSelectionRange(position, position);
    });
  }

  function changeRole(role) {
    appState.role = role;
    appState.localeSyncPending = false;
    if (role === 'learner' || role === 'admin') mergeAccountLocale(role);
    if (role === 'admin') {
      navigate('PAGE-101');
      return;
    }
    if (isAdminPage(appState.page)) navigate('PAGE-001');
    else render();
  }

  function navigate(id, demo, force) {
    if (!force && appState.page === 'PAGE-004' && appState.demo === 'streaming' && id !== 'PAGE-004') {
      appState.pendingNavigation = { id: id, demo: demo };
      showLeaveGenerationDialog();
      return;
    }
    if (dialog && dialog.open) closeDialog();
    stopGenerationTimer();
    var previous = appState.page;
    var goingToAuth = id === 'PAGE-002' || id === 'PAGE-003';
    if (appState.role === 'visitor' && goingToAuth && AUTH_TARGETS[previous]) {
      appState.authIntent = { page: previous, batchIndex: appState.selectedBatch };
    } else if (!goingToAuth) {
      appState.authIntent = null;
    }
    // Switching login/register keeps a pending saved-story claim; leaving auth does not.
    if (goingToAuth && appState.hasClaim && (previous === 'PAGE-002' || previous === 'PAGE-003')) demo = 'claim';
    appState.page = id;
    appState.demo = demo || getPageDef(id).states[0][0];
    if (id === 'PAGE-004' && previous !== 'PAGE-002' && previous !== 'PAGE-003' && appState.demo === 'default') {
      appState.gen = freshGeneration();
    }
    if (isAdminPage(id)) appState.role = 'admin';
    if (!isAdminPage(id) && appState.role === 'admin') appState.role = 'visitor';
    applyDemoState(appState.demo);
    render();
    window.scrollTo(0, 0);
    requestAnimationFrame(function () { main.focus(); });
  }

  function applyDemoState(demo) {
    appState.demo = demo;
    if (appState.page === 'PAGE-007') window.WordWeaveReviewRange.reset(demo);
    if (appState.page === 'PAGE-001' && demo === 'learner') appState.role = 'learner';
    if (appState.page === 'PAGE-002' || appState.page === 'PAGE-003') appState.hasClaim = demo === 'claim';
    if (appState.page === 'PAGE-004') {
      if (['ready', 'streaming', 'valid', 'saved', 'cancelled', 'system-error', 'validation-error'].indexOf(demo) >= 0) {
        appState.gen.words = ['create', 'resilient', 'weave'];
        appState.gen.model = 'sage-mini';
        appState.gen.language = 'zh';
        appState.gen.scenario = 'story';
        appState.gen.length = 'medium';
      }
      if (demo === 'streaming') appState.gen.streamStep = 3;
    }
    if (appState.page === 'PAGE-008') {
      if (demo === 'single-stage-1' || demo === 'single-summary') {
        appState.reviewMode = 'single';
        if (appState.reviewBatchIndex == null || !appState.batches[appState.reviewBatchIndex]) {
          appState.reviewBatchIndex = Math.min(1, appState.batches.length - 1);
        }
      } else if (demo === 'stage-1' || demo === 'stage-1-hint' || demo === 'summary') {
        appState.reviewMode = 'range';
        appState.reviewBatchIndex = null;
      }
      if (demo === 'stage-1-error') {
        appState.review.answer1 = 'resiliant';
        appState.review.feedback = '还不正确，请检查拼写后再试。';
      } else if (demo === 'stage-2' || demo === 'stage-2-error') {
        if (!appState.review.groupStyles) appState.review.groupStyles = createClozeGroupStyles();
        if (demo === 'stage-2-error') {
          appState.review.answers2 = { 'blank-2': 'wave' };
          appState.review.incorrect2 = ['blank-2'];
          appState.review.feedback = '还有空白需要修改，可以继续尝试。';
        } else {
          appState.review.incorrect2 = [];
          appState.review.feedback = '';
        }
      } else if (demo === 'stage-1-hint') {
        appState.review = freshReview();
        appState.review.hint = true;
      } else if (demo === 'stage-1' || demo === 'single-stage-1') {
        appState.review = freshReview();
      }
    }
    if (appState.page === 'PAGE-103') {
      if (demo === 'default') appState.adminUserQuery = '';
      if (demo === 'loading' || demo === 'results' || demo === 'loading-more') appState.adminUserQuery = 'lin';
      if (demo === 'single') appState.adminUserQuery = 'lin_weave';
      if (demo === 'empty') appState.adminUserQuery = 'nobody';
      if (demo === 'error') appState.adminUserQuery = 'wea';
      if (demo === 'detail' || demo.indexOf('batch-') === 0) {
        appState.adminUserQuery = appState.adminUserQuery || 'lin';
        appState.adminUserResultState = 'results';
      }
    }
  }

  function render() {
    document.documentElement.lang = appState.locale;
    syncPrototypeControls();
    localizeStaticShell();
    syncPreviewUrl();
    if (isAdminPage(appState.page)) headerRoot.innerHTML = '';
    else headerRoot.innerHTML = localize(renderHeader());

    if (isRestrictedPage(appState.page) && appState.role === 'visitor') {
      main.innerHTML = localize(renderLocaleSyncNotice() + renderAuthGate());
      return;
    }

    var renderers = {
      'PAGE-001': renderHome,
      'PAGE-002': function () { return renderAuth('register'); },
      'PAGE-003': function () { return renderAuth('login'); },
      'PAGE-004': renderGenerate,
      'PAGE-005': renderRecords,
      'PAGE-006': renderBatchDetail,
      'PAGE-007': renderReviewRange,
      'PAGE-008': renderReview,
      'PAGE-009': renderAccount,
      'PAGE-101': renderAdminModels,
      'PAGE-102': renderAdminGroups,
      'PAGE-103': renderAdminUsers
    };
    main.innerHTML = localize(renderLocaleSyncNotice() + renderers[appState.page]());
    if (appState.page === 'PAGE-103' && appState.demo.indexOf('batch-') === 0) {
      showAdminBatchDialog(0, appState.demo.slice(6));
    }
  }

  function syncPreviewUrl() {
    var params = new URLSearchParams();
    params.set('page', appState.page);
    params.set('role', appState.role);
    params.set('state', appState.demo);
    params.set('locale', appState.locale);
    if (appState.authIntent) params.set('returnPage', appState.authIntent.page);
    if (appState.page === 'PAGE-006' || (appState.authIntent && appState.authIntent.page === 'PAGE-006')) {
      var batch = appState.batches[appState.selectedBatch];
      if (batch) params.set('batch', batch.id);
    }
    window.history.replaceState(null, '', '?' + params.toString());
  }

  function localize(markup) {
    if (!window.WordWeaveI18n) return markup;
    return window.WordWeaveI18n.translate(markup, appState.locale);
  }

  function localizeStaticShell() {
    var skipLink = document.querySelector('.skip-link');
    var prototypeBrand = document.getElementById('prototype-brand-label');
    var prototypeTrigger = document.querySelector('.prototype-trigger');
    var description = document.querySelector('meta[name="description"]');
    if (skipLink) skipLink.textContent = localize('跳到主要内容');
    if (prototypeBrand) prototypeBrand.textContent = 'M001 · ' + brandName();
    if (prototypeTrigger) prototypeTrigger.setAttribute('aria-label', localize('原型面板'));
    if (description) description.setAttribute('content', brandName() + (appState.locale === 'en-US' ? ' M001 interactive UI/UX prototype' : ' M001 UI/UX 交互原型'));
    document.title = brandName() + (appState.locale === 'en-US' ? ' — M001 interactive prototype' : ' — M001 交互原型');
  }

  function renderLocaleSyncNotice() {
    if (!appState.localeSyncPending) return '';
    return '<section class="container locale-sync-banner"><div class="notice notice-warning" role="status">' + icon('alert') +
      '<div class="locale-sync-copy"><strong class="notice-title">账号语言偏好暂未同步</strong><span>当前界面仍会保持本次选择。</span></div>' +
      '<button type="button" class="button button-secondary button-small" data-action="retry-locale-sync">重试</button></div></section>';
  }

  function retryLocaleSync() {
    appState.localeSyncPending = !saveAccountLocale(appState.role);
    render();
    showToast(appState.localeSyncPending ? '暂时无法同步，请稍后再试。' : '语言偏好已同步。', appState.localeSyncPending ? 'warning' : 'success');
  }

  function resetLocalePreferences() {
    removePreference(BROWSER_LOCALE_KEY);
    removePreference(accountLocaleKey('learner'));
    removePreference(accountLocaleKey('admin'));
    appState.locale = matchBrowserLocale();
    appState.localeSyncPending = false;
    appState.role = 'visitor';
    document.documentElement.lang = appState.locale;
    render();
    showToast('语言偏好已清除。');
  }

  function renderLocaleSwitch(theme) {
    return '<label class="locale-switch ' + (theme === 'dark' ? 'locale-switch-dark' : '') + '">' +
      '<span class="sr-only">界面语言</span><span class="locale-symbol" aria-hidden="true">' + icon('globe') + '</span>' +
      '<select data-locale-select aria-label="界面语言">' +
      '<option value="zh-CN"' + (appState.locale === 'zh-CN' ? ' selected' : '') + '>中文</option>' +
      '<option value="en-US"' + (appState.locale === 'en-US' ? ' selected' : '') + '>EN</option>' +
      '</select></label>';
  }

  function renderHeader() {
    var learner = appState.role === 'learner';
    var current = appState.page;
    return '<header class="app-header">' +
      '<div class="app-header-inner">' +
      '<button type="button" class="brand" data-action="navigate" data-value="PAGE-001" aria-label="' + (appState.locale === 'zh-CN' ? '返回词涟首页' : 'WordWeave home') + '">' +
      brandMarkup() + '</button>' +
      '<nav class="main-nav" aria-label="主要导航">' +
      navButton('PAGE-004', '开始学习', current) +
      navButton('PAGE-007', '复习', current) +
      navButton('PAGE-005', '学习记录', current) +
      '</nav>' +
      '<div class="header-actions">' +
      renderLocaleSwitch() +
      (learner
        ? '<button type="button" class="identity-pill" data-action="navigate" data-value="PAGE-009"><span class="identity-avatar">L</span><span>lin_weave</span></button>'
        : '<button type="button" class="button button-quiet button-small" data-action="navigate" data-value="PAGE-003">登录</button><button type="button" class="button button-primary button-small" data-action="navigate" data-value="PAGE-002">注册</button>') +
      '<button type="button" class="mobile-nav-toggle" data-action="mobile-menu" aria-label="打开导航">' + icon('menu') + '</button>' +
      '</div></div></header>';
  }

  function navButton(id, label, current) {
    return '<button type="button" class="nav-link" data-action="navigate" data-value="' + id + '"' +
      (id === current ? ' aria-current="page"' : '') + '>' + label + '</button>';
  }

  function renderHome() {
    var learner = appState.role === 'learner';
    return '<section class="hero"><div class="container">' +
      '<div class="hero-grid"><div>' +
      '<p class="eyebrow">语境让词语更好记</p>' +
      '<h1 class="hero-title">让词语在<em>语境</em>中相连</h1>' +
      '<p class="hero-copy">选择想学的词，让它们在一篇英文短文里相遇。读懂语境，再回来复习。</p>' +
      '<div class="hero-actions">' +
      '<button type="button" class="button button-primary" data-action="navigate" data-value="PAGE-004">立即学习 ' + icon('arrow') + '</button>' +
      '<button type="button" class="button button-secondary" data-action="navigate" data-value="PAGE-007">' + (learner ? '开始复习' : '登录后复习') + '</button>' +
      '<button type="button" class="button button-quiet" data-action="navigate" data-value="PAGE-005">学习记录</button>' +
      '</div></div>' +
      '<div class="weave-visual" aria-label="三个词条被编织在一起的抽象图形"><div class="weave-words"><span class="weave-word">resilient</span><span class="weave-word">weave</span><span class="weave-word">create</span></div></div>' +
      '</div>' +
      '<div class="path-grid" aria-label="学习流程">' +
      pathCard('01', '选词', '挑出此刻想学的词。') +
      pathCard('02', '阅读', '让词语在同一篇短文中相遇。') +
      pathCard('03', '记住', '用两轮回忆加深印象。') +
      '</div></div></section>';
  }

  function pathCard(number, title, copy) {
    return '<article class="path-card"><span class="path-number">' + number + '</span><h3>' + title + '</h3><p>' + copy + '</p></article>';
  }

  function renderAuthGate() {
    var target = AUTH_TARGETS[appState.page];
    return '<section class="container page-section auth-gate" data-auth-target="' + target + '"><div class="empty-state card">' +
      '<div class="empty-symbol">' + icon('key') + '</div>' +
      '<p class="eyebrow">需要登录</p><h1>' + esc(ui('gate.' + target + '.title')) + '</h1>' +
      '<p>' + esc(ui('gate.' + target + '.body')) + '</p>' +
      '<div class="inline-actions"><button type="button" class="button button-primary" data-action="navigate" data-value="PAGE-003">登录并继续</button>' +
      '<button type="button" class="button button-secondary" data-action="navigate" data-value="PAGE-002">创建账号</button></div>' +
      '</div></section>';
  }

  function renderAuth(mode) {
    var register = mode === 'register';
    var claim = appState.hasClaim || appState.demo === 'claim';
    var error = appState.demo === 'error';
    return '<section class="container auth-layout">' +
      '<div class="auth-message"><p class="eyebrow">' + (claim ? '保留当前学习成果' : '你的词语，你的语境') + '</p>' +
      '<h1>' + (claim ? '再一步，就能保存这篇短文' : (register ? '从一组自己的词开始' : '继续你的词汇脉络')) + '</h1>' +
      '<p class="page-description">' + (claim ? '完成后，这篇短文会自动加入你的学习记录。' : '用一个用户名，开始积累自己的词汇语境。') + '</p></div>' +
      '<div class="auth-card">' +
      (!claim && appState.authIntent ? '<p class="auth-intent" role="status" data-auth-intent="' + AUTH_TARGETS[appState.authIntent.page] + '">' + esc(ui('auth.' + AUTH_TARGETS[appState.authIntent.page] + '.continue')) + '</p>' : '') +
      (claim ? '<div class="notice notice-warning">' + icon('alert') + '<div><strong class="notice-title">当前结果暂未保存</strong>请在本页面完成' + (register ? '注册' : '登录') + '。</div></div><hr class="divider">' : '') +
      '<h2>' + (register ? '创建账号' : '欢迎回来') + '</h2><p class="card-subtitle">' + (register ? '几秒钟即可开始。' : '继续你的学习。') + '</p>' +
      (error ? '<div class="notice notice-danger" style="margin-top:1rem">' + icon('alert') + '<div>' + (register ? '请检查用户名格式、唯一性和密码确认。' : '用户名或密码不正确，请重新输入。') + '</div></div>' : '') +
      '<form aria-label="' + (register ? '注册表单' : '登录表单') + '">' +
      fieldInput('用户名', 'auth-username', 'text', '3–32 个字母、数字或下划线', 'lin_weave') +
      fieldInput('密码', 'auth-password', 'password', '8–128 个字符', 'password123') +
      (register ? fieldInput('确认密码', 'auth-confirm', 'password', '再次输入相同密码', 'password123') : '') +
      '<button type="submit" class="button button-primary auth-submit" data-action="auth-submit">' + (register ? '创建账号并继续' : '登录并继续') + '</button></form>' +
      '<p class="auth-alt">' + (register ? '已有账号？ <button type="button" class="button button-quiet button-small" data-action="navigate" data-value="PAGE-003">去登录</button>' : '还没有账号？ <button type="button" class="button button-quiet button-small" data-action="navigate" data-value="PAGE-002">去注册</button>') + '</p>' +
      '</div></section>';
  }

  function fieldInput(label, id, type, helper, value) {
    return '<div class="field"><label class="field-label" for="' + id + '">' + label + '</label>' +
      '<input class="text-input" id="' + id + '" type="' + type + '" value="' + esc(value || '') + '" autocomplete="off">' +
      '<span class="helper">' + helper + '</span></div>';
  }

  function renderGenerate() {
    var state = appState.demo;
    return '<section class="container page-section">' +
      '<div class="page-heading"><div><p class="eyebrow">创作短文</p><h1 class="page-title">把词语编成一篇短文</h1>' +
      '<p class="page-description">选好词语和阅读偏好，剩下的交给词涟。</p></div>' +
      '<span class="quota-pill">' + icon('clock') + (appState.role === 'visitor' ? '还可生成 3 次' : '不限次数') + '</span></div>' +
      renderGenerateNotice(state) +
      '<div class="studio-grid"><aside class="studio-sidebar card" aria-label="造文配置">' +
      '<div class="card-body">' + renderWordPicker() + renderGenerationChoices() +
      '<div class="quota-line"><span>可用次数</span><span class="meter" aria-label="还可生成 3 次"><span style="width:60%"></span></span><strong>' + (appState.role === 'visitor' ? '3' : '∞') + '</strong></div>' +
      '<div class="generate-bar"><button type="button" class="button button-primary" data-action="start-generation"' +
      (canGenerate() && !isGenerationLocked() && state !== 'quota-empty' && state !== 'config-missing' ? '' : ' disabled') + '>' +
      icon('spark') + (state === 'streaming' ? '正在生成' : '生成场景短文') + '</button></div>' +
      '</div></aside>' +
      '<article class="output-canvas card" aria-label="短文生成结果">' + renderGenerationOutput(state) + '</article></div></section>';
  }

  function renderGenerateNotice(state) {
    if (state === 'quota-empty') return '<div class="notice notice-warning" style="margin-bottom:1.5rem">' + icon('clock') + '<div><strong class="notice-title">暂时无法生成</strong>可用次数恢复后再来看看。</div></div>';
    if (state === 'config-missing') return '<div class="notice notice-danger" style="margin-bottom:1.5rem">' + icon('alert') + '<div><strong class="notice-title">暂时无法开始</strong>当前没有可用的模型或篇幅。</div></div>';
    if (state === 'cancelled') return '<div class="notice notice-warning" style="margin-bottom:1.5rem">' + icon('alert') + '<div><strong class="notice-title">已停止生成</strong>可以调整选项后再试。</div></div>';
    if (state === 'system-error') return '<div class="notice notice-danger" style="margin-bottom:1.5rem">' + icon('alert') + '<div><strong class="notice-title">没有完成</strong>请检查网络后再试，本次不会减少可用次数。</div></div>';
    if (state === 'validation-error') return '<div class="notice notice-danger" style="margin-bottom:1.5rem">' + icon('alert') + '<div><strong class="notice-title">这次没有写好</strong>再试一次，本次不会减少可用次数。</div></div>';
    if (state === 'saved') return '<div class="notice notice-success" style="margin-bottom:1.5rem">' + icon('check') + '<div><strong class="notice-title">已保存</strong>随时可以回来阅读或复习。</div></div>';
    return '';
  }

  function renderWordPicker() {
    var selected = appState.gen.words;
    var query = appState.gen.query.trim().toLowerCase();
    var matches = [];
    if (query) {
      matches = WORDS.filter(function (word) {
        return word.toLowerCase().indexOf(query) === 0 && selected.indexOf(word) < 0;
      }).concat(WORDS.filter(function (word) {
        return word.toLowerCase().indexOf(query) > 0 && selected.indexOf(word) < 0;
      })).slice(0, 6);
    }
    return '<div class="config-section"><div class="section-label"><span class="section-index">1</span>选择词语 <span class="field-meta">' + selected.length + ' / 5</span></div>' +
      '<div class="word-search-shell"><div class="input-with-icon">' + icon('search') + '<input id="word-search" class="text-input" value="' + esc(appState.gen.query) + '" placeholder="搜索英文词语…" autocomplete="off" aria-expanded="' + (query ? 'true' : 'false') + '"' + (query ? ' aria-controls="word-search-results"' : '') + (isGenerationLocked() ? ' disabled' : '') + '></div>' +
      (query ? '<ul id="word-search-results" class="search-results" aria-label="词条搜索结果">' +
        (matches.length ? matches.map(function (word) {
          var prefix = word.slice(0, query.length);
          return '<li><button type="button" class="search-result" data-action="select-word" data-value="' + esc(word) + '"><span><span class="result-prefix">' + esc(prefix) + '</span>' + esc(word.slice(query.length)) + '</span><span aria-hidden="true">＋</span></button></li>';
        }).join('') : '<li class="helper" style="padding:.75rem">没有找到这个词</li>') + '</ul>' : '') + '</div>' +
      (selected.length ? '<div class="chip-list studio-chip-list">' + selected.map(function (word) {
        return '<span class="chip">' + esc(word) + '<button class="chip-remove" type="button" data-action="remove-word" data-value="' + esc(word) + '" aria-label="移除 ' + esc(word) + '"' + (isGenerationLocked() ? ' disabled' : '') + '>×</button></span>';
      }).join('') + '</div>' : '') + '</div>';
  }

  function renderGenerationChoices() {
    return '<div class="config-section"><div class="section-label"><span class="section-index">2</span>阅读偏好</div>' +
      '<div class="field"><span class="field-label">模型</span>' +
      '<div class="choice-grid choice-grid-model">' + MODEL_OPTIONS.map(function (model) {
        return choice('model', model.id, model.name, model.description, appState.gen.model, 'model');
      }).join('') + '</div></div>' +
      '<div class="field"><span class="field-label">释义语言</span><div class="choice-grid choice-grid-3 choice-grid-compact">' +
      choice('language', 'zh', '中文', '中文情境释义', appState.gen.language, 'language') +
      choice('language', 'en', '英文', '英英学习', appState.gen.language, 'language') +
      choice('language', 'ja', '日文', '日本語の意味', appState.gen.language, 'language') + '</div></div>' +
      '<div class="field"><span class="field-label">场景</span><div class="choice-grid choice-grid-scenario choice-grid-compact">' +
      choice('scenario', 'discussion', '讨论', '观点交流', appState.gen.scenario, 'scenario') +
      choice('scenario', 'story', '故事', '连贯叙事', appState.gen.scenario, 'scenario') +
      choice('scenario', 'business', '商务', '职场语境', appState.gen.scenario, 'scenario') +
      choice('scenario', 'news', '新闻', '信息报道', appState.gen.scenario, 'scenario') + '</div></div>' +
      '<div class="field"><span class="field-label">篇幅</span><div class="choice-grid choice-grid-4 choice-grid-compact">' +
      choice('length', 'short', '短篇', '', appState.gen.length, 'length') +
      choice('length', 'medium', '中篇', '', appState.gen.length, 'length') +
      choice('length', 'long', '长篇', '', appState.gen.length, 'length') +
      choice('length', 'xlong', '特长篇', '', appState.gen.length, 'length') + '</div></div></div>';
  }

  function choice(name, value, title, description, selected, field) {
    var id = 'choice-' + name + '-' + value;
    return '<div class="choice"><input type="radio" id="' + id + '" name="' + name + '" value="' + value + '" data-gen-field="' + field + '"' + (selected === value ? ' checked' : '') + (isGenerationLocked() ? ' disabled' : '') + '>' +
      '<label for="' + id + '"><span class="choice-title">' + title + '</span>' + (description ? '<span class="choice-description">' + description + '</span>' : '') + '</label></div>';
  }

  function canGenerate() {
    return appState.gen.words.length > 0 && appState.gen.model && appState.gen.language && appState.gen.scenario && appState.gen.length;
  }

  function isGenerationLocked() {
    return ['streaming', 'valid', 'saved'].indexOf(appState.demo) >= 0;
  }

  function renderGenerationOutput(state) {
    if (['default', 'ready', 'quota-empty', 'config-missing', 'cancelled', 'system-error', 'validation-error'].indexOf(state) >= 0) {
      var copy = state === 'ready'
        ? '准备好了。短文会在这里逐步出现。'
        : state === 'cancelled' || state === 'system-error' || state === 'validation-error'
          ? '换个选项，或直接再试一次。'
          : '选好词语后，从左侧选择喜欢的阅读方式。';
      return '<div class="output-empty"><div class="output-empty-mark"></div><h2>' + (state === 'ready' ? '开始编织' : '你的短文会出现在这里') + '</h2><p>' + copy + '</p></div>';
    }

    if (state === 'streaming') {
      var length = Math.min(SAMPLE_PASSAGE.length, Math.max(95, appState.gen.streamStep * 115));
      return '<div class="output-header"><span class="stream-status"><span class="spinner"></span>正在编织短文</span>' +
        '<button type="button" class="button button-danger-quiet button-small" data-action="cancel-generation">停止</button></div>' +
        '<div class="notice notice-warning" style="border-radius:0;border-width:0 0 1px">' + icon('alert') + '<div>先留在这一页，完成后就能保存。</div></div>' +
        '<div class="output-content"><div class="reading-passage streaming-caret"><p>' + esc(SAMPLE_PASSAGE.slice(0, length)) + '</p></div></div>';
    }

    var resultActions = state === 'saved'
      ? '<button type="button" class="button button-secondary" data-action="new-generation">继续学习</button><button type="button" class="button button-primary" data-action="navigate" data-value="PAGE-005">查看学习记录</button>'
      : '<button type="button" class="button button-secondary" data-action="discard-generation">换一篇</button><button type="button" class="button button-primary" data-action="save-generation">' + icon('book') + (appState.role === 'visitor' ? '登录后加入复习库' : '加入复习库') + '</button>';
    return '<div class="output-header"><div><span class="status-badge status-success">短文已完成</span></div><span class="helper">' + generationSummary() + '</span></div>' +
      '<div class="output-content">' + renderPassageTags(currentPassageTags()) + '<div class="reading-passage"><p>' + highlightedPassage() + '</p></div>' +
      '<section class="resource-section"><div class="card-header" style="padding:0 0 1rem;border:0"><div><h2 class="card-title">文中词语</h2><p class="card-subtitle">看看这些词在文章里的含义与搭配。</p></div></div>' +
      '<div class="resource-grid">' + selectedResources() + '</div></section></div>' +
      '<div class="result-action-bar">' + resultActions + '</div>';
  }

  function highlightedPassage() {
    return esc(SAMPLE_PASSAGE)
      .replace(/\bcreate(d|s|ing)?\b/gi, '<mark class="target-word">$&</mark>')
      .replace(/\bresilient\b/gi, '<mark class="target-word">$&</mark>')
      .replace(/\bweave\b/gi, '<mark class="target-word">$&</mark>');
  }

  function generationSummary() {
    var labels = {
      scenario: { discussion: '讨论', story: '故事', business: '商务', news: '新闻' },
      length: { short: '短篇', medium: '中篇', long: '长篇', xlong: '特长篇' },
      language: { zh: '中文释义', en: '英英学习', ja: '日文释义' }
    };
    var model = MODEL_OPTIONS.filter(function (item) { return item.id === appState.gen.model; })[0];
    return [
      labels.scenario[appState.gen.scenario] || '',
      labels.length[appState.gen.length] || '',
      labels.language[appState.gen.language] || '',
      model ? model.name : ''
    ].filter(Boolean).map(esc).join(' · ');
  }

  function selectedResources() {
    var words = appState.gen.words.length ? appState.gen.words : ['create', 'resilient', 'weave'];
    return words.map(function (word) {
      var resource = RESOURCE_MAP[word] || { meaning: '本篇语境下的目标语言释义', meaningEn: 'a meaning based on this story', meaningJa: 'この短文の文脈に基づく意味', phrase: 'using ' + word + ' in context' };
      return '<article class="resource-card" data-content-language="generated"><h3 class="resource-word">' + esc(word) + '</h3><p class="resource-meaning">' + esc(currentMeaning(resource)) + '</p>' +
        '<p class="resource-phrase">“' + esc(resource.phrase) + '”</p></article>';
    }).join('');
  }

  function currentMeaning(resource) {
    if (appState.gen.language === 'en') return resource.meaningEn;
    if (appState.gen.language === 'ja') return resource.meaningJa;
    return resource.meaning;
  }

  function currentPassageTags() {
    return SAMPLE_PASSAGE_TAGS[appState.gen.language] || SAMPLE_PASSAGE_TAGS.zh;
  }

  function renderPassageTags(tags) {
    return '<div class="passage-tags" aria-label="短文主题"><span class="passage-tags-label">主题</span><div class="chip-list" data-content-language="generated">' +
      tags.map(function (tag) { return '<span class="tag tag-passage">' + esc(tag) + '</span>'; }).join('') + '</div></div>';
  }

  function selectWord(word) {
    if (isGenerationLocked()) return;
    if (appState.gen.words.length >= 5 || appState.gen.words.indexOf(word) >= 0) return;
    appState.gen.words.push(word);
    appState.gen.query = '';
    render();
  }

  function removeWord(word) {
    if (isGenerationLocked()) return;
    appState.gen.words = appState.gen.words.filter(function (item) { return item !== word; });
    render();
  }

  function startGeneration() {
    if (!canGenerate()) return;
    appState.demo = 'streaming';
    appState.gen.streamStep = 1;
    render();
    stopGenerationTimer();
    appState.genTimer = window.setInterval(function () {
      appState.gen.streamStep += 1;
      if (appState.gen.streamStep >= 6) {
        stopGenerationTimer();
        appState.demo = 'valid';
      }
      render();
    }, 700);
  }

  function stopGenerationTimer() {
    if (appState.genTimer) {
      window.clearInterval(appState.genTimer);
      appState.genTimer = null;
    }
  }

  function showCancelDialog() {
    openDialog(
      '停止生成？',
      '<p>已写出的内容会消失，本次仍会计入使用次数。</p>',
      '<button class="button button-secondary" data-action="close-dialog">继续生成</button><button class="button button-danger" data-action="confirm-cancel">停止</button>'
    );
  }

  function confirmCancel() {
    closeDialog();
    stopGenerationTimer();
    appState.demo = 'cancelled';
    render();
  }

  function showLeaveGenerationDialog() {
    openDialog(
      '现在离开？',
      '<p>这篇短文还没完成，离开后不会保留。</p>',
      '<button class="button button-secondary" data-action="close-dialog">继续等待</button><button class="button button-danger" data-action="confirm-leave-generation">离开</button>'
    );
  }

  function confirmLeaveGeneration() {
    var pending = appState.pendingNavigation;
    appState.pendingNavigation = null;
    closeDialog();
    stopGenerationTimer();
    if (pending) navigate(pending.id, pending.demo, true);
    showToast('生成已停止。');
  }

  function showDiscardDialog() {
    openDialog(
      '换一篇？',
      '<p>当前短文还没有保存，换一篇后无法找回。</p>',
      '<button class="button button-secondary" data-action="close-dialog">保留这篇</button><button class="button button-danger" data-action="confirm-discard">换一篇</button>'
    );
  }

  function confirmDiscard() {
    closeDialog();
    appState.gen = freshGeneration();
    appState.demo = 'default';
    render();
    showToast('可以重新选择词语和阅读偏好。');
  }

  function saveGeneration() {
    if (appState.role === 'visitor') {
      appState.hasClaim = true;
      navigate('PAGE-003', 'claim');
      return;
    }
    appState.demo = 'saved';
    render();
    showToast('已保存到学习记录。');
  }

  function startNewGeneration() {
    appState.gen = freshGeneration();
    appState.demo = 'default';
    render();
    requestAnimationFrame(function () {
      var search = document.getElementById('word-search');
      if (search) search.focus();
    });
  }

  function completeAuth() {
    appState.role = 'learner';
    mergeAccountLocale('learner');
    if (appState.hasClaim) {
      appState.hasClaim = false;
      appState.demo = 'saved';
      appState.page = 'PAGE-004';
      render();
      showToast('登录成功，短文已经保存。');
      return;
    }
    var intent = appState.authIntent;
    appState.authIntent = null;
    if (intent) {
      appState.selectedBatch = intent.batchIndex;
      // No session is created by authentication. The prototype has no real session ID.
      navigate(intent.page === 'PAGE-008' ? 'PAGE-007' : intent.page);
    } else navigate('PAGE-001', 'learner');
  }

  function renderRecords() {
    if (appState.demo === 'empty' || appState.batches.length === 0) {
      return pageWrap('你的学习空间', '学习记录', '你保存的短文都在这里。', '<div class="empty-state card"><div class="empty-symbol">' + icon('book') + '</div><h2>这里还很安静</h2><p>保存第一篇短文后，就能随时回来阅读和复习。</p><button class="button button-primary" data-action="navigate" data-value="PAGE-004">开始学习</button></div>');
    }

    var query = appState.demo === 'search-empty' ? 'absentword' : appState.recordQuery.trim().toLowerCase();
    var list = appState.batches.filter(function (batch) {
      if (!query) return true;
      return batch.words.some(function (word) { return word.toLowerCase() === query; });
    });
    var stats = [
      ['31', '生成短文'],
      ['14', '学过词语'],
      [String(appState.batches.filter(function (b) { return b.status === 'active'; }).length), '参与复习'],
      [String(appState.batches.filter(function (b) { return b.status === 'paused'; }).length), '暂不参与'],
      ['8', '完成复习'],
      ['1', '掌握短文']
    ];
    var body = '<div class="stats-grid">' + stats.map(function (item) {
      return '<div class="stat-card"><div class="stat-value">' + item[0] + '</div><div class="stat-label">' + item[1] + '</div></div>';
    }).join('') + '</div>' +
      '<div class="toolbar"><div class="toolbar-search input-with-icon">' + icon('search') + '<input id="record-search" class="text-input" value="' + esc(query) + '" placeholder="搜索学过的词语…" aria-label="搜索学习记录"></div>' +
      '<span class="helper">' + list.length + ' 篇 · 较早保存的在前</span></div>' +
      (list.length ? '<div class="batch-list">' + list.map(renderBatchRow).join('') + '</div>' :
        '<div class="empty-state card"><div class="empty-symbol">0</div><h2>没有找到相关短文</h2><p>换一个学过的词语试试。</p></div>');
    return pageWrap('你的学习空间', '学习记录', '回看、搜索或继续复习。', body, '<button class="button button-primary" data-action="navigate" data-value="PAGE-007">按日期复习</button>');
  }

  function renderBatchRow(batch) {
    var originalIndex = appState.batches.indexOf(batch);
    var active = batch.status === 'active';
    var resumeSingle = batch.singleSession === 'in-progress';
    return '<article class="batch-row"><div><div class="batch-title"><h3>' + batch.words.map(esc).join(' · ') + '</h3></div>' +
      '<div class="chip-list" data-content-language="generated">' + batch.tags.map(function (tag) { return '<span class="tag">' + esc(tag) + '</span>'; }).join('') + '</div>' +
      '<div class="batch-meta"><span>加入于 ' + batch.saved + '</span><span>' + batch.scene + ' · ' + batch.length + '</span><span>' + batch.model + '</span><span>成功复习 ' + batch.reviewed + ' 次</span></div></div>' +
      '<div class="menu"><button class="button button-primary button-small" data-action="review-batch" data-index="' + originalIndex + '">' + (resumeSingle ? '继续本篇' : '复习本篇') + '</button>' +
      '<button class="button button-quiet button-small" data-action="view-batch" data-index="' + originalIndex + '">查看详情</button>' +
      '<label class="batch-review-check"><input type="checkbox" data-batch-participation data-index="' + originalIndex + '"' + (active ? ' checked' : '') + '><span>参与复习</span></label>' +
      '<button class="button button-danger-quiet button-small" data-action="delete-batch" data-index="' + originalIndex + '" aria-label="删除短文">' + icon('trash') + '</button></div></article>';
  }

  function openBatch(index) {
    appState.selectedBatch = index;
    navigate('PAGE-006');
  }

  function startBatchReview(index) {
    var batch = appState.batches[index];
    if (!batch) return;
    var resume = batch.singleSession === 'in-progress';
    appState.reviewMode = 'single';
    appState.reviewBatchIndex = index;
    appState.selectedBatch = index;
    if (!resume) batch.singleSession = 'in-progress';
    appState.review = freshReview();
    navigate('PAGE-008', 'single-stage-1');
    showToast(resume ? '继续上次本篇复习。' : '已开始本篇复习。');
  }

  function setBatchParticipation(index, participates) {
    var batch = appState.batches[index];
    if (!batch) return;
    batch.status = participates ? 'active' : 'paused';
    render();
    requestAnimationFrame(function () {
      var checkbox = document.querySelector('[data-batch-participation][data-index="' + index + '"]');
      if (checkbox) checkbox.focus();
    });
    showToast(participates ? '已参与复习。' : '已移出复习范围，短文仍会保留。');
  }

  function showDeleteBatchDialog(index) {
    var batch = appState.batches[index];
    if (!batch) return;
    openDialog(
      '删除这篇短文？',
      '<div class="notice notice-danger">' + icon('alert') + '<div><strong class="notice-title">删除后无法恢复</strong>相关复习记录也会一并删除。</div></div><p style="margin-top:1rem"><strong>' + batch.words.map(esc).join(' · ') + '</strong></p>',
      '<button class="button button-secondary" data-action="close-dialog">保留</button><button class="button button-danger" data-action="confirm-delete-batch" data-index="' + index + '">删除</button>'
    );
  }

  function confirmDeleteBatch(index) {
    appState.batches.splice(index, 1);
    closeDialog();
    navigate('PAGE-005');
    showToast('短文已删除。');
  }

  function renderBatchDetail() {
    if (appState.demo === 'not-found' || !appState.batches[appState.selectedBatch]) {
      return pageWrap('学习短文', '短文详情', '', '<div class="empty-state card"><div class="empty-symbol">?</div><h2>找不到这篇短文</h2><p>它可能已经被删除。</p><button class="button button-secondary" data-action="navigate" data-value="PAGE-005">返回学习记录</button></div>');
    }
    var batch = appState.batches[appState.selectedBatch];
    var active = batch.status === 'active';
    var resources = batch.words.map(function (word) {
      var resource = RESOURCE_MAP[word] || { meaning: '当前短文语境中的词义', phrase: 'using ' + word + ' in context' };
      return '<article class="resource-card" data-content-language="generated"><h3 class="resource-word">' + esc(word) + '</h3><p>' + esc(resource.meaning) + '</p><p class="resource-phrase">“' + esc(resource.phrase) + '”</p></article>';
    }).join('');
    var body = '<div class="detail-grid"><div class="card"><div class="card-header"><div><h2 class="card-title">英文短文</h2><p class="card-subtitle">保存于 ' + batch.saved + '</p></div><span class="status-badge ' + (active ? 'status-success' : 'status-muted') + '">' + (active ? '参与复习' : '暂不参与') + '</span></div>' +
      '<div class="card-body">' + renderPassageTags(batch.tags) + '<div class="reading-passage"><p>' + highlightedPassage() + '</p></div><section class="resource-section"><h2 class="card-title">文中词语</h2><div class="resource-grid" style="margin-top:1rem">' + resources + '</div></section></div></div>' +
      '<aside class="detail-aside"><div class="card"><div class="card-body"><h2 class="card-title">阅读偏好</h2><hr class="divider"><dl class="definition-list">' +
      detailItem('模型', batch.model) + detailItem('释义语言', batch.language) + detailItem('场景', batch.scene) + detailItem('篇幅', batch.length) + detailItem('完成复习', batch.reviewed + ' 次') +
      '</dl></div></div><div class="card"><div class="card-body"><div class="inline-actions"><label class="batch-review-check batch-review-check-panel"><input type="checkbox" data-batch-participation data-index="' + appState.selectedBatch + '"' + (active ? ' checked' : '') + '><span>参与复习</span></label><button class="button button-danger-quiet" data-action="delete-batch" data-index="' + appState.selectedBatch + '">删除</button></div></div></div></aside></div>';
    return pageWrap('学习短文', batch.words.map(esc).join(' · '), '', body, '<button class="button button-secondary" data-action="navigate" data-value="PAGE-005">返回学习记录</button>');
  }

  function detailItem(term, value) {
    return '<div><dt>' + term + '</dt><dd>' + esc(value) + '</dd></div>';
  }

  function renderReviewRange() {
    var body = window.WordWeaveReviewRange.render(appState.locale, icon, esc);
    return pageWrap('复习准备', '开始复习', '选一段时间，回顾保存过的短文。', body);
  }

  function startRangeReview() {
    if (!window.WordWeaveReviewRange.canStart()) return;
    openRangeReviewSample();
  }

  // PAGE-008 remains the existing static interaction sample, not a real session engine.
  function openRangeReviewSample() {
    appState.reviewMode = 'range';
    appState.reviewBatchIndex = null;
    appState.rangeSession.inProgress = true;
    appState.review = freshReview();
    navigate('PAGE-008', 'stage-1');
  }

  function renderReview() {
    if (appState.demo === 'summary' || appState.demo === 'single-summary') return renderReviewSummary();
    if (appState.demo === 'stage-2' || appState.demo === 'stage-2-error') return renderReviewStageTwo();
    return renderReviewStageOne();
  }

  function reviewProgress(percent, stageLabel) {
    var single = appState.reviewMode === 'single';
    var batch = single ? appState.batches[appState.reviewBatchIndex] : null;
    var source = single ? '本篇复习' : '日期复习';
    var progress = single ? '本篇 1 / 1' : '本轮 3 / 5 篇';
    var detail = single && batch
      ? '<span class="review-context-detail">保存于 ' + esc(batch.saved) + ' · ' + esc(batch.scene) + '</span>'
      : '<span class="review-context-detail">2026-08-23 — 2026-08-29</span>';
    var backPage = single ? 'PAGE-005' : 'PAGE-007';
    var backLabel = single ? '返回学习记录' : '返回复习准备';
    return '<div class="review-context"><div class="review-context-copy"><span class="status-badge status-info">' + source + '</span>' + detail + '</div>' +
      '<button class="button button-quiet button-small" data-action="navigate" data-value="' + backPage + '">' + backLabel + '</button></div>' +
      '<div class="review-progress"><div class="progress-labels"><span>' + progress + '</span><span>' + stageLabel + '</span></div><div class="progress-track" role="progressbar" aria-label="复习进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + percent + '"><span style="width:' + percent + '%"></span></div></div>';
  }

  function currentReviewQuestion() {
    var batch = appState.reviewMode === 'single' ? appState.batches[appState.reviewBatchIndex] : null;
    if (batch && batch.id === 'batch-002') {
      return {
        source: 'according to',
        surface: 'According to',
        meaning: RESOURCE_MAP['according to'].meaning,
        hint: '<span class="blank" aria-hidden="true">••••••</span><span class="sr-only">挖空</span> the local report and <span class="blank" aria-hidden="true">••••••</span><span class="sr-only">挖空</span> community updates',
        clozeParts: [
          { id: 'blank-1', group: 'g1', answer: 'According to' },
          { text: ' the local ' },
          { id: 'blank-2', group: 'g2', answer: 'news' },
          { text: ', a neighborhood ' },
          { id: 'blank-3', group: 'g3', answer: 'business' },
          { text: ' adapted its services. Later, ' },
          { id: 'blank-4', group: 'g1', answer: 'according to' },
          { text: ' community updates, two nearby ' },
          { id: 'blank-5', group: 'g3', answer: 'businesses' },
          { text: ' joined the same effort.' }
        ]
      };
    }
    return {
      source: 'resilient',
      surface: 'resilient',
      meaning: RESOURCE_MAP.resilient.meaning,
      hint: 'a <span class="blank" aria-hidden="true">••••••</span><span class="sr-only">挖空</span> team with <span class="blank" aria-hidden="true">••••••</span><span class="sr-only">挖空</span> learning habits',
      clozeParts: [
        { text: 'When the neighborhood library faced an uncertain future, a small learning circle decided to ' },
        { id: 'blank-1', group: 'g1', answer: 'create' },
        { text: ' a new reason for people to gather. They invited residents to ' },
        { id: 'blank-2', group: 'g2', answer: 'weave' },
        { text: ' personal memories into a shared story, then ' },
        { id: 'blank-3', group: 'g2', answer: 'wove' },
        { text: ' new ideas into the weekly program. The group remained ' },
        { id: 'blank-4', group: 'g3', answer: 'resilient' },
        { text: ' when only a few visitors came. By the end, the project had ' },
        { id: 'blank-5', group: 'g1', answer: 'created' },
        { text: ' a lasting habit of learning together.' }
      ]
    };
  }

  function renderReviewStageOne() {
    var error = appState.demo === 'stage-1-error' || appState.review.feedback;
    var question = currentReviewQuestion();
    return '<section class="container page-section"><div class="review-shell">' + reviewProgress(48, '第 1 步 · 词语 2 / 3') +
      '<article class="review-card"><span class="review-stage">想起这个词</span>' +
      '<div class="review-prompt" data-content-language="generated">' + esc(question.meaning) + '</div>' +
      '<div class="hint-row"><label class="switch"><input id="hint-toggle" type="checkbox"' + (appState.review.hint ? ' checked' : '') + '><span class="switch-track" aria-hidden="true"></span><span>给我一点提示</span></label></div>' +
      (appState.review.hint ? '<p class="hint-phrase" id="review-hint">' + question.hint + '</p>' : '') +
      '<label class="sr-only" for="review-answer-1">写下单词</label><input id="review-answer-1" class="text-input review-answer" value="' + esc(appState.review.answer1) + '" placeholder="写下英文单词" autocomplete="off"' + (appState.review.hint ? ' aria-describedby="review-hint"' : '') + '>' +
      (error ? '<div class="feedback feedback-error" role="alert">' + esc(appState.review.feedback || '还不正确，请检查拼写后再试。') + '</div>' : '') +
      '<div class="card-footer review-card-actions"><button class="button button-quiet" data-action="skip-stage-1">暂时跳过</button><button class="button button-primary" data-action="check-stage-1">检查</button></div></article></div></section>';
  }

  function checkStageOne() {
    var question = currentReviewQuestion();
    if (appState.review.answer1.trim().toLowerCase() === question.source.toLowerCase()) {
      appState.review.feedback = '';
      appState.review.groupStyles = createClozeGroupStyles();
      appState.review.answers2 = {};
      appState.review.incorrect2 = [];
      appState.demo = 'stage-2';
      render();
      showToast('写对了，继续补全短文。');
    } else {
      appState.review.feedback = '还不正确，请检查拼写后再试。';
      appState.demo = 'stage-1-error';
      render();
      refocus('review-answer-1', appState.review.answer1.length);
    }
  }

  function skipStageOne() {
    appState.review.skipped = true;
    appState.review.feedback = '';
    appState.review.groupStyles = createClozeGroupStyles();
    appState.review.answers2 = {};
    appState.review.incorrect2 = [];
    appState.demo = 'stage-2';
    render();
    showToast('已跳过，继续下一步。');
  }

  function renderReviewStageTwo() {
    var question = currentReviewQuestion();
    if (!appState.review.groupStyles) appState.review.groupStyles = createClozeGroupStyles();
    return '<section class="container page-section"><div class="review-shell">' + reviewProgress(58, '第 2 步 · 短文') +
      '<article class="review-card"><span class="review-stage">补全短文</span><p class="helper">根据上下文填写空白。</p>' +
      '<div class="cloze-group-guide" id="cloze-group-guide">' + icon('info') + '<span>同色同纹的空白来自同一个词。</span></div>' +
      '<div class="reading-passage review-cloze-passage"><p>' + renderClozeParts(question.clozeParts) + '</p></div>' +
      (appState.review.feedback ? '<div class="feedback feedback-error" role="alert">' + esc(appState.review.feedback) + '</div>' : '') +
      '<div class="card-footer review-card-actions"><button class="button button-quiet" data-action="skip-stage-2">暂时跳过</button><button class="button button-primary" data-action="check-stage-2">完成</button></div></article></div></section>';
  }

  function createClozeGroupStyles() {
    var tones = CLOZE_TONES.slice();
    for (var index = tones.length - 1; index > 0; index -= 1) {
      var swapWith = Math.floor(Math.random() * (index + 1));
      var temporary = tones[index];
      tones[index] = tones[swapWith];
      tones[swapWith] = temporary;
    }
    return {
      g1: { tone: tones[0], pattern: CLOZE_PATTERNS[0], name: 'A' },
      g2: { tone: tones[1], pattern: CLOZE_PATTERNS[1], name: 'B' },
      g3: { tone: tones[2], pattern: CLOZE_PATTERNS[2], name: 'C' }
    };
  }

  function renderClozeParts(parts) {
    return parts.map(function (part) {
      if (part.text != null) return esc(part.text);
      var style = appState.review.groupStyles[part.group];
      var value = appState.review.answers2[part.id] || '';
      var incorrect = appState.review.incorrect2.indexOf(part.id) >= 0;
      return '<span class="cloze-slot cloze-tone-' + style.tone + ' cloze-pattern-' + style.pattern + (incorrect ? ' is-incorrect' : '') + '" data-cloze-group="' + part.group + '">' +
        '<label class="sr-only" for="' + part.id + '">短文空白，匿名组 ' + style.name + '</label>' +
        '<input id="' + part.id + '" class="cloze-input" data-cloze-answer="' + part.id + '" value="' + esc(value) + '" autocomplete="off" spellcheck="false" aria-describedby="cloze-group-guide"' + (incorrect ? ' aria-invalid="true"' : '') + '>' +
        '</span>';
    }).join('');
  }

  function checkStageTwo() {
    var question = currentReviewQuestion();
    var blanks = question.clozeParts.filter(function (part) { return part.answer != null; });
    var incorrect = blanks.filter(function (part) {
      return String(appState.review.answers2[part.id] || '').trim().toLowerCase() !== part.answer.toLowerCase();
    }).map(function (part) { return part.id; });
    if (!incorrect.length) {
      finishReview(!appState.review.skipped);
      return;
    }
    appState.review.incorrect2 = incorrect;
    appState.review.feedback = '还有空白需要修改，可以继续尝试。';
    appState.demo = 'stage-2-error';
    render();
    var first = incorrect[0];
    refocus(first, String(appState.review.answers2[first] || '').length);
  }

  function finishReview(success) {
    if (!success) appState.review.skipped = true;
    if (appState.reviewMode === 'single') {
      var batch = appState.batches[appState.reviewBatchIndex];
      if (batch) {
        batch.singleSession = 'completed';
        if (success) batch.reviewed += 1;
      }
      appState.demo = 'single-summary';
    } else {
      appState.rangeSession.inProgress = false;
      appState.demo = 'summary';
    }
    render();
  }

  function renderReviewSummary() {
    var success = !appState.review.skipped;
    var single = appState.reviewMode === 'single';
    var completed = single ? '1' : '5';
    var mastered = single ? (success ? '1' : '0') : (success ? '4' : '3');
    var revisit = single ? (success ? '0' : '1') : (success ? '1' : '2');
    return '<section class="container page-section"><div class="review-shell"><div class="review-card" style="text-align:center">' +
      '<div class="empty-symbol" style="margin-inline:auto">' + (success ? '✓' : '→') + '</div><p class="eyebrow">' + (single ? '本篇复习完成' : '日期复习完成') + '</p>' +
      '<h1 class="page-title">' + (single ? (success ? '这篇已经完成' : '这篇还可以再试') : (success ? '5 篇全部完成' : '完成 5 篇复习')) + '</h1>' +
      '<p class="page-description" style="margin-inline:auto">' + (success ? '今天的复习完成了，继续保持。' : (single ? '没有关系，下一轮再试一次。' : '有几篇还不熟悉，下次再见。')) + '</p>' +
      '<div class="stats-grid" style="grid-template-columns:repeat(3,1fr);margin:2rem 0"><div class="stat-card"><div class="stat-value">' + completed + '</div><div class="stat-label">已完成</div></div><div class="stat-card"><div class="stat-value">' + mastered + '</div><div class="stat-label">已掌握</div></div><div class="stat-card"><div class="stat-value">' + revisit + '</div><div class="stat-label">下次再来</div></div></div>' +
      '<div class="inline-actions" style="justify-content:center"><button class="button button-secondary" data-action="navigate" data-value="PAGE-005">查看学习记录</button><button class="button button-primary" data-action="restart-review">' + (single ? '再复习本篇' : '再复习一轮') + '</button></div></div></div></section>';
  }

  function restartReview() {
    appState.review = freshReview();
    if (appState.reviewMode === 'single') {
      var batch = appState.batches[appState.reviewBatchIndex];
      if (batch) batch.singleSession = 'in-progress';
      navigate('PAGE-008', 'single-stage-1');
      return;
    }
    appState.rangeSession.inProgress = true;
    navigate('PAGE-008', 'stage-1');
  }

  function renderAccount() {
    var success = appState.demo === 'password-success';
    var body = (success ? '<div class="notice notice-success" style="margin-bottom:1.5rem">' + icon('check') + '<div><strong class="notice-title">密码已更新</strong>你可以继续学习。</div></div>' : '') +
      '<div class="settings-grid"><div class="card"><div class="card-header"><div><h2 class="card-title">账号信息</h2></div></div><div class="card-body"><dl class="definition-list">' + detailItem('用户名', 'lin_weave') + detailItem('当前方案', '基础版') + detailItem('登录方式', '用户名和密码') + '</dl></div><div class="card-footer"><button class="button button-secondary" data-action="change-password">修改密码</button><button class="button button-quiet" data-action="logout">' + icon('logout') + '退出</button></div></div>' +
      '<div class="card danger-zone"><div class="card-header"><div><h2 class="card-title">删除账号</h2><p class="card-subtitle">这项操作无法撤销。</p></div></div><div class="card-body"><p>你的短文、复习记录和账号信息都会被删除。</p><button class="button button-danger" data-action="delete-account">删除我的账号</button></div></div></div>';
    return pageWrap('账户', '账号设置', '', body);
  }

  function renderAdminShell(active, content) {
    return '<div class="admin-shell"><aside class="admin-sidebar"><div class="brand admin-brand">' + brandMarkup() + '<span class="admin-badge">管理</span></div>' +
      '<span class="admin-label">系统配置</span><nav class="admin-nav" aria-label="管理员导航">' +
      adminNav('PAGE-101', 'settings', '模型设置', active) +
      adminNav('PAGE-102', 'book', '方案设置', active) +
      adminNav('PAGE-103', 'users', '用户管理', active) +
      '</nav><div class="admin-account"><div class="admin-profile"><span class="admin-avatar">A</span><span><strong>admin_root</strong><small>管理员</small></span></div><div class="admin-account-actions">' + renderLocaleSwitch('dark') + '<button class="admin-logout" data-action="logout" aria-label="退出">' + icon('logout') + '<span>退出</span></button></div></div></aside>' +
      '<section class="admin-main"><div class="admin-content">' + content + '</div></section></div>';
  }

  function adminNav(id, iconName, label, active) {
    return '<button type="button" data-action="navigate" data-value="' + id + '"' + (id === active ? ' aria-current="page"' : '') + '>' + icon(iconName) + label + '</button>';
  }

  function renderAdminModels() {
    var noKey = appState.demo === 'no-key';
    var empty = appState.demo === 'empty';
    var models = empty ? [] : [
      { name: 'Sage Mini', description: '快速生成，适合日常短文', id: 'openrouter/sage-mini', enabled: true, groups: '4 个组' },
      { name: 'Atlas Reasoner', description: '更强语境组织，适合长文', id: 'openrouter/atlas-reasoner', enabled: true, groups: '2 个组' },
      { name: 'Archive Large', description: '暂不用于新生成', id: 'openrouter/archive-large', enabled: false, groups: '0 个组' }
    ];
    var content = adminHeading('PAGE-101', 'OpenRouter 与模型', '管理 API Key 和可用模型。', '<button class="button button-primary" data-action="add-model">新增模型</button>') +
      '<div class="card" style="margin-bottom:1.5rem"><div class="card-header"><div><h2 class="card-title">OpenRouter API Key</h2><p class="card-subtitle">所有模型共用</p></div><span class="status-badge ' + (noKey ? 'status-warning' : 'status-success') + '">' + (noKey ? '未配置' : '已配置') + '</span></div>' +
      '<div class="card-body">' + (noKey ? '<div class="notice notice-warning">' + icon('alert') + '<div>配置密钥后即可启用生成。</div></div>' : '<div class="field"><span class="field-label">当前密钥</span><div class="text-input code-value" style="display:flex;align-items:center">sk-or-••••••••••••••••••A9Q</div></div>') + '</div>' +
      '<div class="card-footer"><button class="button button-secondary" data-action="replace-key">' + (noKey ? '配置密钥' : '替换密钥') + '</button></div></div>' +
      '<div class="card"><div class="card-header"><div><h2 class="card-title">模型列表</h2></div><span class="helper">' + models.length + ' 个模型</span></div><div class="card-body">' +
      (models.length ? '<div class="model-list">' + models.map(function (model) {
        return '<article class="model-row"><div><div class="model-name">' + esc(model.name) + ' <span class="status-badge ' + (model.enabled ? 'status-success' : 'status-muted') + '">' + (model.enabled ? '已启用' : '已停用') + '</span></div><div class="model-description">' + esc(model.description) + '</div><div style="margin-top:.5rem"><span class="code-value">' + esc(model.id) + '</span> <span class="helper">· ' + model.groups + '引用</span></div></div><button class="button button-secondary button-small" data-action="edit-model">编辑</button></article>';
      }).join('') + '</div>' : '<div class="empty-state"><div class="empty-symbol">＋</div><h3>还没有模型</h3><p>先添加一个 OpenRouter 模型。</p><button class="button button-primary" data-action="add-model">新增模型</button></div>') +
      '</div></div>';
    return renderAdminShell('PAGE-101', content);
  }

  function adminHeading(id, title, description, action) {
    return '<div class="page-heading"><div><p class="eyebrow">管理后台</p><h1 class="page-title">' + title + '</h1><p class="page-description">' + description + '</p></div>' + (action || '') + '</div>';
  }

  function renderAdminGroups() {
    var invalid = appState.demo === 'invalid';
    var groups = [
      ['visitor', '访客'],
      ['member', '基础版'],
      ['pro', 'Pro'],
      ['plus', 'Plus']
    ];
    var content = adminHeading('PAGE-102', '方案设置', '设置每种方案可使用的模型、篇幅与次数。') +
      '<div class="card"><div class="card-body"><div class="tabs" role="tablist" aria-label="访问方案">' +
      groups.map(function (group) {
        return '<button class="tab" role="tab" aria-selected="' + String(appState.adminGroup === group[0]) + '" data-action="select-group" data-value="' + group[0] + '">' + group[1] + '</button>';
      }).join('') + '</div>' +
      (invalid ? '<div class="notice notice-warning" style="margin-bottom:1.5rem">' + icon('alert') + '<div><strong class="notice-title">当前方案已暂停生成</strong>选择至少一个模型和一种篇幅后即可恢复。</div></div>' : '') +
      '<div class="admin-grid"><section><div class="field"><span class="field-label">可用模型</span><div class="checkbox-list">' +
      adminCheckbox('Sage Mini', '快速生成，适合日常短文', !invalid) +
      adminCheckbox('Atlas Reasoner', '更强语境组织，适合长文', appState.adminGroup !== 'visitor' && !invalid) +
      '</div></div>' +
      '<div class="field"><span class="field-label">可用篇幅</span><div class="chip-list">' +
      ['短篇', '中篇', '长篇', '特长篇'].map(function (label, index) {
        return '<label class="chip"><input type="checkbox"' + (!invalid && (index < 2 || appState.adminGroup === 'plus') ? ' checked' : '') + '> ' + label + '</label>';
      }).join('') + '</div></div></section>' +
      '<section><div class="field"><label class="field-label" for="entry-limit">每篇最多词语</label><input id="entry-limit" class="text-input" type="number" min="1" value="5"></div>' +
      '<div class="field"><label class="field-label" for="quota-limit">24 小时内可生成</label><input id="quota-limit" class="text-input" type="number" min="0" value="' + (invalid ? '0' : '5') + '"><label class="switch" style="margin-top:.5rem"><input type="checkbox"' + (appState.adminGroup === 'member' ? ' checked' : '') + '><span class="switch-track"></span><span>不限次数</span></label></div></section></div>' +
      '</div><div class="card-footer"><button class="button button-primary" data-action="save-group">保存设置</button></div></div>';
    return renderAdminShell('PAGE-102', content);
  }

  function adminCheckbox(title, description, checked) {
    return '<label class="checkbox-row"><input type="checkbox"' + (checked ? ' checked' : '') + '><span><strong>' + title + '</strong><span class="helper" style="display:block">' + description + '</span></span></label>';
  }

  function renderAdminUsers() {
    var content = adminHeading('PAGE-103', '用户管理', '查找用户并管理账号。') +
      renderAdminUserSearch() + renderAdminUserState();
    return renderAdminShell('PAGE-103', content);
  }

  function renderAdminUserSearch() {
    var loading = appState.demo === 'loading';
    return '<form id="admin-user-search-form" class="card admin-user-search" role="search" aria-label="搜索用户">' +
      '<div class="card-body"><div class="toolbar"><div class="toolbar-search input-with-icon">' + icon('search') +
      '<input id="admin-user-search" class="text-input" value="' + esc(appState.adminUserQuery) + '" placeholder="搜索用户名…" aria-label="搜索用户名" autocomplete="off"' + (loading ? ' disabled' : '') + '></div>' +
      '<button class="button button-primary" type="submit" data-action="admin-user-search"' + (loading ? ' disabled' : '') + '>' + (loading ? '搜索中…' : '搜索') + '</button></div></div></form>';
  }

  function renderAdminUserState() {
    var state = appState.demo;
    if (state === 'detail' || state.indexOf('batch-') === 0) return renderAdminUserDetail();
    if (state === 'default') {
      return '<section class="empty-state card admin-user-empty" aria-labelledby="user-search-start-title"><div class="empty-symbol">' + icon('search') + '</div><h2 id="user-search-start-title">从用户名开始查找</h2><p>输入完整用户名或其中一部分。</p></section>';
    }
    if (state === 'loading') {
      return '<section class="card admin-user-results" aria-busy="true" aria-live="polite"><div class="card-header"><div><h2 class="card-title">正在查找</h2><p class="card-subtitle">请稍候。</p></div><span class="spinner" aria-hidden="true"></span></div><div class="card-body"><div class="user-skeleton" aria-hidden="true"><span></span><span></span><span></span></div><div class="user-skeleton" aria-hidden="true"><span></span><span></span><span></span></div><div class="user-skeleton" aria-hidden="true"><span></span><span></span><span></span></div></div></section>';
    }
    if (state === 'empty') {
      return '<section class="empty-state card admin-user-empty" aria-live="polite"><div class="empty-symbol">0</div><h2>没有找到用户</h2><p>试试其他用户名。</p></section>';
    }
    if (state === 'error') {
      return '<section class="card"><div class="card-body"><div class="notice notice-danger" role="alert">' + icon('alert') + '<div><strong class="notice-title">暂时无法搜索</strong><span>请稍后再试。</span><div style="margin-top:.75rem"><button type="button" class="button button-secondary button-small" data-action="admin-user-retry">重新搜索</button></div></div></div></div></section>';
    }

    var users = state === 'single' ? ADMIN_USERS.filter(function (user) { return user.username === 'lin_weave'; }) : ADMIN_USERS;
    var loadingMore = state === 'loading-more';
    return '<section class="card admin-user-results" aria-labelledby="admin-user-results-title"' + (loadingMore ? ' aria-busy="true"' : '') + '>' +
      '<div class="card-header"><div><h2 class="card-title" id="admin-user-results-title" tabindex="-1">搜索结果</h2><p class="card-subtitle" aria-live="polite">找到 ' + users.length + ' 位用户</p></div><span class="helper">按用户名排列</span></div>' +
      '<div class="admin-user-result-list" role="list">' + users.map(renderAdminUserResult).join('') + '</div>' +
      (state === 'single' ? '' : '<div class="card-footer admin-user-pagination"><span class="helper">已显示 ' + users.length + ' 位</span><button type="button" class="button button-secondary" data-action="admin-user-load-more"' + (loadingMore ? ' disabled' : '') + '>' + (loadingMore ? '<span class="spinner" aria-hidden="true"></span> 正在加载' : '加载更多') + '</button></div>') + '</section>';
  }

  function renderAdminUserResult(user) {
    var index = ADMIN_USERS.indexOf(user);
    return '<article class="admin-user-result" role="listitem"><div class="admin-user-identity"><span class="admin-avatar" aria-hidden="true">' + esc(user.username.charAt(0).toUpperCase()) + '</span><div><h3 class="user-name">' + esc(user.username) + '</h3><p class="user-meta">' + esc(user.role) + ' · 创建于 ' + esc(user.joined) + '</p></div></div>' +
      '<div class="admin-user-plan"><span class="helper">当前方案</span><strong>' + esc(user.plan) + '</strong></div>' +
      '<span class="status-badge status-success">' + esc(user.status) + '</span>' +
      '<button type="button" class="button button-secondary button-small" data-action="admin-user-open" data-index="' + index + '" aria-label="查看用户 ' + esc(user.username) + '">查看</button></article>';
  }

  function renderAdminUserDetail() {
    var user = ADMIN_USERS[appState.adminUserSelected] || ADMIN_USERS[0];
    return '<div class="admin-user-detail-toolbar"><button type="button" class="button button-quiet button-small" data-action="admin-user-back">← 返回搜索结果</button><span class="helper">“' + esc(appState.adminUserQuery) + '”</span></div>' +
      '<div class="admin-grid admin-user-detail-grid"><div class="card"><div class="card-header"><div><h2 class="card-title user-detail-name">' + esc(user.username) + '</h2><p class="card-subtitle">' + esc(user.role) + ' · 创建于 ' + esc(user.joined) + '</p></div><span class="status-badge status-success">' + esc(user.status) + '</span></div><div class="card-body"><dl class="definition-list">' +
      detailItem('当前方案', user.plan) + detailItem('可用次数', '不限') + detailItem('学习短文', user.stories) + detailItem('登录方式', '用户名与密码') +
      '</dl></div><div class="card-footer"><button class="button button-secondary" data-action="change-user-group">更改方案</button><button class="button button-danger-quiet" data-action="reset-user-password">重置密码</button></div></div>' +
      '<div class="card"><div class="card-header"><div><h2 class="card-title">学习记录</h2><p class="card-subtitle">仅供查看</p></div><span class="status-badge status-info">只读</span></div><div class="card-body"><div class="model-list">' +
      appState.batches.map(function (batch, index) {
        return '<article class="model-row"><div><div class="model-name">' + batch.words.map(esc).join(' · ') + '</div><div class="model-description">加入于 ' + batch.saved + ' · ' + batch.scene + ' · ' + (batch.status === 'active' ? '参与复习' : '暂不参与') + '</div></div><button class="button button-quiet button-small" data-action="admin-view-batch" data-index="' + index + '" aria-label="只读查看 ' + esc(batch.words.join(', ')) + '">只读查看</button></article>';
      }).join('') + '</div></div></div></div>';
  }

  function submitAdminUserSearch() {
    var query = appState.adminUserQuery.trim().toLowerCase();
    if (!query) {
      appState.demo = 'default';
    } else if (query === 'nobody') {
      appState.demo = 'empty';
    } else if (query === 'error') {
      appState.demo = 'error';
    } else if (query === 'lin_weave') {
      appState.demo = 'single';
      appState.adminUserResultState = 'single';
      appState.adminUserSelected = 3;
    } else {
      appState.demo = 'results';
      appState.adminUserResultState = 'results';
    }
    render();
    window.requestAnimationFrame(function () {
      var heading = document.getElementById('admin-user-results-title');
      if (heading) heading.focus();
    });
  }

  function openAdminUser(index) {
    if (!ADMIN_USERS[index]) return;
    appState.adminUserSelected = index;
    appState.adminUserResultState = appState.demo === 'single' ? 'single' : 'results';
    appState.demo = 'detail';
    render();
    window.scrollTo(0, 0);
  }

  function returnToAdminUserResults() {
    appState.demo = appState.adminUserResultState || 'results';
    render();
    window.requestAnimationFrame(function () {
      var button = document.querySelector('[data-action="admin-user-open"][data-index="' + appState.adminUserSelected + '"]');
      if (button) button.focus();
    });
  }

  function loadMoreAdminUsers() {
    appState.demo = 'loading-more';
    render();
  }

  function pageWrap(eyebrow, title, description, body, action) {
    return '<section class="container page-section"><div class="page-heading"><div><p class="eyebrow">' + eyebrow + '</p><h1 class="page-title">' + title + '</h1>' +
      (description ? '<p class="page-description">' + description + '</p>' : '') + '</div>' + (action || '') + '</div>' + body + '</section>';
  }

  function openDialog(title, body, footer) {
    if (!dialog.open) dialogReturnFocus = document.activeElement;
    dialog.classList.remove('reader-dialog');
    dialogContent.innerHTML = localize('<div class="dialog-header"><h2 id="dialog-title">' + title + '</h2></div><div class="dialog-body">' + body + '</div><div class="dialog-footer">' + footer + '</div>');
    if (!dialog.open) dialog.showModal();
  }

  function closeDialog() {
    if (dialog.open) dialog.close();
    finishDialogClose();
  }

  function finishDialogClose() {
    if (dialog.open) return;
    document.body.classList.remove('has-reader-dialog');
    if (appState.page === 'PAGE-103' && appState.demo.indexOf('batch-') === 0) {
      appState.demo = 'detail';
      syncPrototypeControls();
      syncPreviewUrl();
    }
    var target = dialogReturnFocus;
    dialogReturnFocus = null;
    if (target && target.isConnected) target.focus({ preventScroll: true });
  }

  function showPasswordDialog() {
    openDialog('修改密码', fieldInput('当前密码', 'current-password', 'password', '用于确认是账号本人', '') + fieldInput('新密码', 'new-password', 'password', '8–128 个字符', '') + fieldInput('确认新密码', 'confirm-new-password', 'password', '再次输入相同密码', '') + '<div class="notice" style="margin-top:1rem">' + icon('info') + '<div>修改成功后保留当前会话，其他已有会话全部退出。</div></div>', '<button class="button button-secondary" data-action="close-dialog">取消</button><button class="button button-primary" data-action="confirm-password">确认修改</button>');
  }

  function showDeleteAccountDialog() {
    openDialog('删除账号？', '<div class="notice notice-danger">' + icon('alert') + '<div><strong class="notice-title">删除后无法恢复</strong>账号、短文和复习记录会立即删除。</div></div>' + fieldInput('当前密码', 'delete-password', 'password', '用于确认是账号本人', '') + '<label class="checkbox-row" style="margin-top:1rem"><input type="checkbox"><span><strong>我了解这项操作无法撤销</strong></span></label>', '<button class="button button-secondary" data-action="close-dialog">保留账号</button><button class="button button-danger" data-action="confirm-delete-account">删除账号</button>');
  }

  function showKeyDialog() {
    openDialog('配置 OpenRouter API Key', '<div class="notice">' + icon('key') + '<div>保存后只显示密钥的隐藏状态。</div></div>' + fieldInput('新 API Key', 'api-key', 'password', '保存后不会再次显示', ''), '<button class="button button-secondary" data-action="close-dialog">取消</button><button class="button button-primary" data-action="confirm-key">保存</button>');
  }

  function showModelDialog(editing) {
    openDialog(editing ? '编辑模型' : '新增模型', fieldInput('显示名称', 'model-name', 'text', '学习者会看到这个名称', editing ? 'Sage Mini' : '') + fieldInput('说明', 'model-description', 'text', '帮助学习者选择', editing ? '快速生成，适合日常短文' : '') + fieldInput('OpenRouter 模型 ID', 'model-id', 'text', '仅管理员可见', editing ? 'openrouter/sage-mini' : '') + '<label class="switch" style="margin-top:1rem"><input type="checkbox" checked><span class="switch-track"></span><span>启用</span></label><div class="notice notice-warning" style="margin-top:1rem">' + icon('alert') + '<div>停用后不会用于新的生成，历史内容仍会保留。</div></div>', '<button class="button button-secondary" data-action="close-dialog">取消</button><button class="button button-primary" data-action="confirm-model">保存模型</button>');
  }

  function showUserGroupDialog() {
    var user = ADMIN_USERS[appState.adminUserSelected] || ADMIN_USERS[0];
    openDialog('更改 ' + esc(user.username) + ' 的方案', '<div class="field"><label class="field-label" for="new-group">新方案</label><select class="select-input" id="new-group"><option>基础版</option><option>Pro</option><option>Plus</option></select></div><div class="notice notice-warning" style="margin-top:1rem">' + icon('alert') + '<div>更改后，可用次数会按新方案重新计算。</div></div>', '<button class="button button-secondary" data-action="close-dialog">取消</button><button class="button button-primary" data-action="confirm-user-group">更改方案</button>');
  }

  function showResetUserPasswordDialog() {
    var user = ADMIN_USERS[appState.adminUserSelected] || ADMIN_USERS[0];
    openDialog('重置 ' + esc(user.username) + ' 的密码', fieldInput('新密码', 'admin-new-password', 'password', '8–128 个字符', '') + '<div class="notice notice-warning" style="margin-top:1rem">' + icon('alert') + '<div>保存后，用户需要重新登录。</div></div>', '<button class="button button-secondary" data-action="close-dialog">取消</button><button class="button button-danger" data-action="confirm-reset-user-password">重置密码</button>');
  }

  function showAdminBatchDialog(index, mode) {
    var batch = appState.batches[index];
    if (!batch) return;
    var user = ADMIN_USERS[appState.adminUserSelected] || ADMIN_USERS[0];
    appState.adminBatchIndex = index;
    appState.adminBatchMode = mode;
    var fixture = window.WordWeaveReaderFixtures;
    var paragraphs = [index === 1 ? fixture.news : SAMPLE_PASSAGE];
    if (mode === 'long') paragraphs = paragraphs.concat(fixture.continuation.slice(0, 3));
    if (mode === 'xlong') paragraphs = paragraphs.concat(fixture.continuation);
    var words = mode === 'xlong' ? Object.keys(RESOURCE_MAP) : batch.words;
    var tags = mode === 'xlong'
      ? ['邻里之间共同建立的学习空间', '在变化中保持韧性与连接', '通过真实故事理解社区的多种声音']
      : batch.tags;
    var content;
    if (mode === 'loading') {
      content = '<div class="reader-state" role="status" aria-busy="true"><span class="spinner" aria-hidden="true"></span><p>' + esc(ui('reader.loading')) + '</p><div class="reader-skeleton" aria-hidden="true"><i></i><i></i><i></i><i></i></div></div>';
    } else if (mode === 'error' || mode === 'unavailable') {
      content = '<div class="reader-state" role="' + (mode === 'error' ? 'alert' : 'status') + '">' + icon('info') + '<h3>' + esc(ui('reader.' + mode)) + '</h3><p>' + esc(ui(mode === 'error' ? 'reader.retryHint' : 'reader.unavailableHint')) + '</p>' +
        (mode === 'error' ? '<button type="button" class="button button-secondary" data-action="admin-batch-retry">重试</button>' : '') + '</div>';
    } else {
      var resources = words.map(function (word) {
        var resource = RESOURCE_MAP[word];
        return '<div class="reader-word" data-content-language="generated"><dt lang="en">' + esc(word) + '</dt><dd><p lang="zh-CN">' + esc(resource.meaning) + '</p><p class="reader-phrase" lang="en">' + esc(resource.phrase) + '</p></dd></div>';
      }).join('');
      content = '<dl class="reader-metadata">' + detailItem('模型', batch.model) + detailItem('释义语言', batch.language) + detailItem('场景', batch.scene) + detailItem('篇幅', mode === 'xlong' ? '特长篇' : mode === 'long' ? '长篇' : batch.length) + '</dl>' +
        '<section class="reader-story" aria-labelledby="reader-story-title"><h3 id="reader-story-title">' + esc(ui('reader.story')) + '</h3>' + renderPassageTags(tags) +
        '<div class="reading-passage" lang="en" data-content-language="generated">' + paragraphs.map(function (paragraph) { return '<p>' + esc(paragraph) + '</p>'; }).join('') + '</div></section>' +
        '<section class="reader-resources" aria-labelledby="reader-words-title"><h3 id="reader-words-title">' + esc(ui('reader.words')) + '</h3><dl class="reader-word-list">' + resources + '</dl></section>';
    }
    if (!dialog.open) dialogReturnFocus = document.querySelector('[data-action="admin-view-batch"][data-index="' + index + '"]') || document.activeElement;
    dialog.classList.add('reader-dialog');
    dialog.dataset.batchId = batch.id;
    dialog.dataset.username = user.username;
    dialog.dataset.readerState = mode;
    dialogContent.innerHTML = localize('<div class="dialog-header reader-header"><div><div class="reader-title-row"><h2 id="dialog-title" tabindex="-1">用户短文</h2><span class="status-badge status-info">只读</span></div>' +
      '<p class="reader-context"><span aria-label="' + esc(ui('reader.owner')) + '">' + esc(user.username) + '</span><span>' + esc(ui('reader.saved')) + ' <time datetime="' + batch.saved + '">' + batch.saved + '</time></span></p></div>' +
      '<button type="button" class="button button-quiet reader-close" data-action="close-dialog" aria-label="' + esc(ui('reader.close')) + '">' + icon('close') + '</button></div>' +
      '<div class="dialog-body reader-body" tabindex="0" role="region" aria-label="' + esc(ui('reader.story')) + '">' + content + '</div>' +
      '<div class="dialog-footer"><button type="button" class="button button-secondary" data-action="close-dialog">关闭</button></div>');
    document.body.classList.add('has-reader-dialog');
    if (!dialog.open) dialog.showModal();
    document.getElementById('dialog-title').focus({ preventScroll: true });
  }

  function showMobileMenuDialog() {
    var accountAction = appState.role === 'learner'
      ? '<button class="button button-secondary" data-action="navigate" data-value="PAGE-009">账号设置</button>'
      : '<button class="button button-secondary" data-action="navigate" data-value="PAGE-003">登录</button><button class="button button-primary" data-action="navigate" data-value="PAGE-002">注册</button>';
    openDialog('导航', '<div class="model-list"><button class="button button-secondary" data-action="navigate" data-value="PAGE-004">开始学习</button><button class="button button-secondary" data-action="navigate" data-value="PAGE-007">复习</button><button class="button button-secondary" data-action="navigate" data-value="PAGE-005">学习记录</button>' + accountAction + '</div>', '<button class="button button-quiet" data-action="close-dialog">关闭</button>');
  }

  function showToast(message, tone) {
    var toast = document.createElement('div');
    toast.className = 'toast' + (tone === 'warning' ? ' toast-warning' : '');
    toast.innerHTML = icon(tone === 'warning' ? 'alert' : 'check') + '<span>' + localize(esc(message)) + '</span>';
    toastRegion.appendChild(toast);
    window.setTimeout(function () {
      toast.remove();
    }, 3600);
  }

  window.addEventListener('beforeunload', function (event) {
    if (appState.page === 'PAGE-004' && appState.demo === 'streaming') {
      event.preventDefault();
      event.returnValue = '';
    }
  });

  document.addEventListener('DOMContentLoaded', init);
}());
