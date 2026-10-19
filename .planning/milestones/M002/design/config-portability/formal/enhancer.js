import { loadDesign, translator, esc, icon, bindPortability } from '../controller.js';

const formalPath = new URL('./', import.meta.url).pathname;
const route = (page, category, language, extra = {}) => {
  const next = new URLSearchParams({ page, category, lang: language, ...extra });
  return `${formalPath}?${next}`;
};

export async function enhanceConfigPortability({ page, category, language, initialState }) {
  const { copy, fixture } = await loadDesign();
  const currentLanguage = () => new URL(location.href).searchParams.get('lang') === 'en' ? 'en' : 'zh';
  const currentCategory = () => {
    if (page !== 'operations') return category;
    return document.querySelector('.admin-main > .tabs .selected')?.dataset.action === 'optab:itemsettings' ? 'items' : 'growth';
  };
  let controller = null;
  let opener = null;
  let initialOpened = false;
  let operationsAdjusted = false;
  let priorityDraft = null;
  let priorityCloseRequested = false;

  const nativeDialog = document.createElement('dialog');
  nativeDialog.id = 'cr313-dialog';
  nativeDialog.className = 'cr313-dialog';
  nativeDialog.setAttribute('aria-labelledby', 'portability-dialog-title');
  nativeDialog.innerHTML = '<div class="cr313-dialog-host"></div>';
  document.body.append(nativeDialog);
  const host = nativeDialog.querySelector('.cr313-dialog-host');

  const close = () => {
    if (['submitting', 'reading'].includes(controller?.state)) return;
    controller?.destroy();
    controller = null;
    nativeDialog.close();
    opener?.isConnected && requestAnimationFrame(() => opener.focus({ preventScroll: true }));
  };
  const open = (state, selectedCategory = category) => {
    const t = translator(copy, currentLanguage());
    opener = document.activeElement;
    controller?.destroy();
    controller = bindPortability({
      host,
      category: selectedCategory,
      state,
      t,
      data: fixture,
      embedded: true,
      outcome: new URLSearchParams(location.search).get('outcome') === 'unknown' ? 'unknown' : 'success',
      onClose: close,
    });
    if (!nativeDialog.open) nativeDialog.showModal();
  };
  nativeDialog.addEventListener('cancel', event => {
    event.preventDefault();
    close();
  });
  nativeDialog.addEventListener('click', event => {
    if (event.target === nativeDialog) close();
  });

  const rewriteInheritedNavigation = () => {
    const activeLanguage = currentLanguage();
    document.querySelectorAll('.admin-nav a').forEach(link => {
      const label = link.textContent.trim();
      const href = link.getAttribute('href') || '';
      if (/page=models/.test(href) || /模型管理|Models/.test(label)) link.href = route('models', 'models', activeLanguage);
      if (/page=plans/.test(href) || /计划管理|Plans/.test(label)) link.href = route('plans', 'plans', activeLanguage);
      if (/page=operations/.test(href) || /成长运营|Operations|Growth/.test(label)) link.href = route('operations', 'items', activeLanguage);
    });
  };

  const keepScopedNavigationInFormalHost = event => {
    const link = event.target.closest('.admin-nav a');
    if (!link) return;
    const label = link.textContent.trim();
    const href = link.getAttribute('href') || '';
    let destination = null;
    if (/page=models/.test(href) || /模型管理|Models/.test(label)) destination = route('models', 'models', currentLanguage());
    if (/page=plans/.test(href) || /计划管理|Plans/.test(label)) destination = route('plans', 'plans', currentLanguage());
    if (/page=operations/.test(href) || /成长运营|Operations|Growth/.test(label)) destination = route('operations', 'items', currentLanguage());
    if (!destination) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    location.assign(destination);
  };
  document.addEventListener('click', keepScopedNavigationInFormalHost, true);

  const readPriorityDraft = dialog => Array.from(dialog?.querySelectorAll('#priority-form input') || [], input => input.value);
  const restorePriorityDraft = dialog => {
    if (!priorityDraft) return;
    dialog.querySelectorAll('#priority-form input').forEach((input, index) => {
      if (priorityDraft[index] !== undefined) input.value = priorityDraft[index];
    });
  };
  const focusPriorityOpener = () => {
    if (!priorityCloseRequested) return;
    priorityCloseRequested = false;
    requestAnimationFrame(() => document.querySelector('[data-action="open-priority-editor"]')?.focus({ preventScroll: true }));
  };
  const upgradePriorityEditor = () => {
    if (page !== 'plans') return;
    const dialog = document.querySelector('#priority-editor');
    if (!dialog) {
      focusPriorityOpener();
      return;
    }
    if (dialog.dataset.cr313Modalized === 'true') return;
    dialog.dataset.cr313Modalized = 'true';
    restorePriorityDraft(dialog);
    dialog.addEventListener('cancel', event => {
      event.preventDefault();
      dialog.querySelector('[data-action="close-priority-editor"]')?.click();
    });
    dialog.addEventListener('keydown', event => {
      if (event.key !== 'Tab') return;
      const focusable = Array.from(dialog.querySelectorAll('button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'))
        .filter(element => !element.hidden && element.getClientRects().length > 0);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
    if (dialog.open) dialog.close();
    dialog.showModal();
    requestAnimationFrame(() => {
      const preview = dialog.querySelector('.notice');
      if (preview) {
        preview.tabIndex = -1;
        preview.focus({ preventScroll: true });
      } else {
        dialog.querySelector('#priority-form input')?.focus({ preventScroll: true });
      }
    });
  };
  document.addEventListener('input', event => {
    if (event.target.closest('#priority-form')) priorityDraft = readPriorityDraft(document.querySelector('#priority-editor'));
  }, true);
  document.addEventListener('click', event => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'open-priority-editor') {
      priorityDraft = null;
      priorityCloseRequested = false;
    }
    if (action === 'preview-priorities') priorityDraft = readPriorityDraft(document.querySelector('#priority-editor'));
    if (action === 'close-priority-editor' || action === 'save-priorities') {
      priorityDraft = null;
      priorityCloseRequested = true;
    }
  }, true);

  const adjustOperationsTab = () => {
    if (page !== 'operations' || operationsAdjusted) return;
    operationsAdjusted = true;
    const desired = category === 'growth' ? 'signsettings' : 'itemsettings';
    const tab = document.querySelector(`[data-action="optab:${desired}"]`);
    if (tab && !tab.classList.contains('selected')) tab.click();
  };

  const ensureActions = () => {
    const activeLanguage = currentLanguage();
    const t = translator(copy, activeLanguage);
    rewriteInheritedNavigation();
    adjustOperationsTab();
    upgradePriorityEditor();
    const main = document.querySelector('#main .admin-main');
    const heading = main?.querySelector(':scope > .page-head');
    if (!main || !heading) return;
    let actions = heading.querySelector(':scope > .actions');
    if (!actions) {
      actions = document.createElement('div');
      actions.className = 'actions';
      heading.append(actions);
    }
    if (!actions.querySelector('[data-cr313-action]')) {
      const group = document.createElement('span');
      group.className = 'cr313-actions';
      group.setAttribute('aria-label', t('portability.actionsLabel'));
      group.innerHTML = `<button class="btn" type="button" data-cr313-action="import">${icon('upload')}${esc(t('portability.import'))}</button><button class="btn" type="button" data-cr313-action="export">${icon('download')}${esc(t('portability.export'))}</button>`;
      actions.prepend(group);
      group.addEventListener('click', event => {
        const button = event.target.closest('[data-cr313-action]');
        if (!button) return;
        open(button.dataset.cr313Action === 'export' ? 'export' : 'file', currentCategory());
      });
    }
    if (!main.querySelector(':scope > .cr313-demo')) {
      const demo = document.createElement('details');
      demo.className = 'cr313-demo';
      const selectedCategory = currentCategory();
      demo.innerHTML = `<summary>${esc(t('demo.title'))}<span>M002-UI-33-R3</span></summary><div><p>${esc(t('demo.help'))}</p><a class="btn quiet" href="../prototype/?category=${selectedCategory}&state=${initialState === 'idle' ? 'file' : initialState}&lang=${activeLanguage}">${activeLanguage === 'zh' ? '打开交互原型' : 'Open interaction prototype'}</a></div>`;
      main.append(demo);
    }
    if (!initialOpened && initialState !== 'idle') {
      initialOpened = true;
      open(initialState, currentCategory());
    }
  };

  ensureActions();
  const observer = new MutationObserver(() => requestAnimationFrame(ensureActions));
  observer.observe(document.querySelector('#app'), { childList: true, subtree: true });
}
