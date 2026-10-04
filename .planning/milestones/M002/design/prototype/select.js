// Design-only select adapter. Retains prototype values/events; no production dependency.
export function createSelectDesign({ icon }) {
  const controls = new WeakMap();
  let opened = null, serial = 0;
  function enhance() {
    document.querySelectorAll('select:not(#demo select)').forEach(select => {
      if (controls.has(select)) { controls.get(select).sync(); return; }
      const wrapper = document.createElement('div');
      wrapper.className = 'ww-select';
      const trigger = document.createElement('button');
      trigger.type = 'button'; trigger.className = 'ww-select-trigger';
      trigger.setAttribute('role', 'combobox');
      trigger.setAttribute('aria-haspopup', 'listbox');
      trigger.setAttribute('aria-expanded', 'false');
      const label = select.closest('label')?.querySelector(':scope > span');
      const name = select.getAttribute('aria-label') || label?.textContent?.trim() || select.id;
      trigger.setAttribute('aria-label', name);
      const popup = document.createElement('div');
      popup.id = `ww-options-${++serial}`; popup.className = 'ww-select-menu';
      popup.setAttribute('popover', 'manual'); popup.setAttribute('role', 'listbox');
      popup.setAttribute('aria-label', name);
      trigger.setAttribute('aria-controls', popup.id);
      select.before(wrapper); wrapper.append(select, trigger, popup);
      select.hidden = true; select.tabIndex = -1;
      let index = select.selectedIndex, buffer = '', lastKey = 0;
      const options = () => [...select.options];
      function sync() {
        trigger.replaceChildren();
        const value = document.createElement('span');
        value.textContent = select.selectedOptions[0]?.textContent || '—';
        trigger.append(value);
        trigger.insertAdjacentHTML('beforeend', icon('chevron-down'));
        trigger.disabled = select.disabled;
        trigger.classList.toggle('is-placeholder', !select.value);
        if (select.required) trigger.setAttribute('aria-required', 'true');
        if (select.getAttribute('aria-invalid')) trigger.setAttribute('aria-invalid', select.getAttribute('aria-invalid'));
        if (select.getAttribute('aria-describedby')) trigger.setAttribute('aria-describedby', select.getAttribute('aria-describedby'));
        if (select.disabled && opened?.select === select) close(false);
      }
      function paint() {
        popup.replaceChildren();
        options().forEach((option, i) => {
          const item = document.createElement('div');
          item.id = `${popup.id}-${i}`; item.className = 'ww-select-option';
          item.setAttribute('role', 'option'); item.dataset.index = i;
          item.setAttribute('aria-selected', String(option.selected));
          item.setAttribute('aria-disabled', String(option.disabled));
          item.classList.toggle('is-active', i === index);
          const text = document.createElement('span'); text.textContent = option.textContent;
          item.append(text);
          if (option.selected) item.insertAdjacentHTML('beforeend', icon('check'));
          popup.append(item);
        });
        const active = popup.children[index];
        if (active) {
          trigger.setAttribute('aria-activedescendant', active.id);
          active.scrollIntoView({ block: 'nearest' });
        }
      }
      function position() {
        if (!popup.matches(':popover-open')) return;
        const r = trigger.getBoundingClientRect(), gap = 7, edge = 12;
        const below = innerHeight - r.bottom - edge, above = r.top - edge;
        const upwards = below < Math.min(220, options().length * 44 + 12) && above > below;
        popup.style.width = `${Math.min(Math.max(r.width, 180), innerWidth - edge * 2)}px`;
        popup.style.maxHeight = `${Math.max(44, Math.min(288, (upwards ? above : below) - gap))}px`;
        popup.style.left = `${Math.max(edge, Math.min(r.left, innerWidth - popup.offsetWidth - edge))}px`;
        popup.style.top = `${upwards ? r.top - popup.offsetHeight - gap : r.bottom + gap}px`;
      }
      function close(focus = true) {
        if (popup.matches(':popover-open')) popup.hidePopover();
        trigger.setAttribute('aria-expanded', 'false');
        trigger.removeAttribute('aria-activedescendant');
        if (opened?.select === select) opened = null;
        if (focus && trigger.isConnected) trigger.focus({ preventScroll: true });
      }
      function open() {
        if (select.disabled || !options().length) return;
        opened?.close(false);
        index = select.selectedIndex >= 0 ? select.selectedIndex : options().findIndex(o => !o.disabled);
        popup.showPopover();
        opened = { select, wrapper, popup, close, position };
        trigger.setAttribute('aria-expanded', 'true');
        paint(); position();
      }
      function choose() {
        if (index < 0 || options()[index]?.disabled) return;
        select.selectedIndex = index; close(); sync();
        select.dispatchEvent(new Event('change', { bubbles: true }));
        // A value change may redraw the whole prototype. Restore the replacement trigger.
        queueMicrotask(() => {
          enhance();
          const current = select.id ? document.getElementById(select.id) : select;
          current?.closest('.ww-select')?.querySelector('.ww-select-trigger')?.focus({ preventScroll: true });
        });
      }
      trigger.addEventListener('click', e => { e.preventDefault(); opened?.select === select ? close() : open(); });
      popup.addEventListener('pointerdown', e => e.preventDefault());
      popup.addEventListener('click', e => {
        const option = e.target.closest('[data-index]');
        if (option) { index = Number(option.dataset.index); choose(); }
      });
      trigger.addEventListener('keydown', e => {
        if (e.key === 'Tab') { close(false); return; }
        if (e.key === 'Escape') { if (opened?.select === select) { e.preventDefault(); e.stopPropagation(); close(); } return; }
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault(); opened?.select === select ? choose() : open(); return;
        }
        const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End'];
        if (!keys.includes(e.key) && (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey)) return;
        e.preventDefault();
        if (opened?.select !== select) open();
        if (opened?.select !== select) return;
        const enabled = options().map((o, i) => o.disabled ? -1 : i).filter(i => i >= 0);
        if (keys.includes(e.key)) {
          const at = enabled.indexOf(index);
          index = e.key === 'Home' ? enabled[0] : e.key === 'End' ? enabled.at(-1) : enabled[Math.max(0, Math.min(enabled.length - 1, at + (e.key === 'ArrowDown' ? 1 : -1)))];
        } else {
          buffer = Date.now() - lastKey > 650 ? e.key : buffer + e.key; lastKey = Date.now();
          const match = enabled.find(i => options()[i].textContent.toLocaleLowerCase().startsWith(buffer.toLocaleLowerCase()));
          if (match !== undefined) index = match;
        }
        paint(); position();
      });
      select.addEventListener('change', sync);
      select.addEventListener('invalid', () => trigger.focus());
      label?.addEventListener('click', e => { e.preventDefault(); trigger.focus(); });
      controls.set(select, { sync }); sync();
    });
    if (opened && !opened.wrapper.isConnected) opened.close(false);
  }
  document.addEventListener('pointerdown', e => { if (opened && !opened.wrapper.contains(e.target)) opened.close(false); });
  window.addEventListener('resize', () => opened?.position());
  document.addEventListener('scroll', e => { if (opened && !opened.popup.contains(e.target)) opened.position(); }, true);
  new MutationObserver(records => {
    if (records.some(r => r.target.matches?.('select,option,optgroup') || [...r.addedNodes].some(n => n.nodeType === 1 && (n.matches('select') || n.querySelector('select'))))) enhance();
    if (opened && !opened.wrapper.isConnected) opened.close(false);
  }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'selected'] });
  return { enhance };
}
