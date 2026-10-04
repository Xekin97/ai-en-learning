// Presentation only: preserve the two stories, their DOM order and reading focus.
export function createHomeMotion() {
  let dispose = () => {}, top = 1, reading = false;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  function afterRender() {
    dispose();
    const stack = document.querySelector('.home-card-stack');
    if (!stack) { top = 1; reading = false; return; }
    const cards = [...stack.querySelectorAll('.home-paper')];
    const abort = new AbortController(), options = { signal: abort.signal };
    let timer, midpoint, finish, pending = null, animations = [], inView = false;
    const applyTop = index => { top = index; stack.dataset.top = String(index); };
    function sync() {
      if (abort.signal.aborted) return;
      clearTimeout(timer);
      const running = !reading && !reduced.matches && !document.hidden && inView && pending === null;
      stack.dataset.motion = reduced.matches ? 'reduced' : running ? 'running' : 'paused';
      if (running) timer = setTimeout(() => select(1 - top, false), 8000);
    }
    function cancelSwitch() {
      clearTimeout(midpoint); clearTimeout(finish);
      animations.forEach(a => a.cancel()); animations = [];
      pending = null; stack.dataset.switching = 'false';
    }
    function settle() {
      const destination = pending ?? top;
      cancelSwitch(); applyTop(destination); sync();
    }
    function select(index, manual = true) {
      if (manual) reading = true;
      if (index === pending) { sync(); return; }
      cancelSwitch();
      if (index === top || reduced.matches || document.hidden || !inView) {
        applyTop(index); sync(); return;
      }
      pending = index; stack.dataset.switching = 'true'; sync();
      const distance = innerWidth <= 760 ? 4 : 12;
      animations = cards.map((card, i) => {
        const angle = parseFloat(getComputedStyle(card).getPropertyValue('--paper-angle'));
        const direction = i === 0 ? -1 : 1;
        const base = `rotate(${angle}deg)`;
        const peak = `translate(${direction * distance}px, -4px) rotate(${angle + direction * .5}deg)`;
        return card.animate([
          { transform: base, offset: 0 },
          { transform: peak, offset: .45 },
          { transform: base, offset: 1 }
        ], { duration: 640, easing: 'ease-in-out' });
      });
      midpoint = setTimeout(() => applyTop(index), 288);
      finish = setTimeout(() => { cancelSwitch(); applyTop(index); sync(); }, 650);
    }
    function read() {
      reading = true;
      // An automatic turn must not continue underneath someone beginning to read.
      if (pending !== null) settle(); else sync();
    }
    const cardIndex = target => cards.indexOf(target.closest('.home-paper'));
    stack.addEventListener('pointerenter', e => {
      if (e.pointerType !== 'mouse') return;
      read();
      const index = cardIndex(e.target);
      if (index >= 0) select(index);
    }, options);
    // Physical movement avoids ping-pong when an animated card crosses the pointer.
    stack.addEventListener('pointermove', e => {
      if (e.pointerType !== 'mouse' || !(e.movementX || e.movementY) || pending !== null) return;
      const index = cardIndex(e.target);
      if (index >= 0 && !stack.contains(document.activeElement)) select(index);
    }, options);
    stack.addEventListener('pointerdown', read, options);
    stack.addEventListener('wheel', read, { ...options, passive: true });
    stack.addEventListener('focusin', e => {
      const index = cardIndex(e.target);
      if (index >= 0) select(index);
    }, options);
    stack.addEventListener('click', e => {
      const index = cardIndex(e.target);
      if (index >= 0) { cards[index].focus({ preventScroll: true }); select(index); }
    }, options);
    document.addEventListener('visibilitychange', () => document.hidden ? settle() : sync(), options);
    reduced.addEventListener('change', settle, options);
    const observer = new IntersectionObserver(entries => {
      inView = entries[0].isIntersecting;
      if (!inView) settle(); else sync();
    });
    observer.observe(stack);
    if (stack.contains(document.activeElement) || (matchMedia('(hover: hover)').matches && stack.matches(':hover'))) reading = true;
    applyTop(top); sync();
    dispose = () => { clearTimeout(timer); cancelSwitch(); abort.abort(); observer.disconnect(); };
  }
  return { afterRender };
}
