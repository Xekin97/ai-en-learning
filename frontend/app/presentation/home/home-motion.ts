/** UI22 home-motion.js converted to a scoped, disposable browser controller. */
export function attachHomeMotion(stack: HTMLElement): () => void {
  const cards = [...stack.querySelectorAll<HTMLElement>(".home-paper")];
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const abort = new AbortController();
  const options = { signal: abort.signal };
  let top = 1,
    reading = false,
    inView = false;
  let pending: number | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let midpoint: ReturnType<typeof setTimeout> | undefined;
  let finish: ReturnType<typeof setTimeout> | undefined;
  let animations: Animation[] = [];
  function applyTop(index: number) {
    top = index;
    stack.dataset.top = String(index);
  }
  function cancelSwitch() {
    clearTimeout(midpoint);
    clearTimeout(finish);
    animations.forEach((animation) => animation.cancel());
    animations = [];
    pending = null;
    stack.dataset.switching = "false";
  }
  function sync() {
    if (abort.signal.aborted) return;
    clearTimeout(timer);
    const running =
      !reading &&
      !reduced.matches &&
      !document.hidden &&
      inView &&
      pending === null;
    stack.dataset.motion = reduced.matches
      ? "reduced"
      : running
        ? "running"
        : "paused";
    if (running) timer = setTimeout(() => select(1 - top, false), 8000);
  }
  function settle() {
    const destination = pending ?? top;
    cancelSwitch();
    applyTop(destination);
    sync();
  }
  function select(index: number, manual = true) {
    if (manual) reading = true;
    if (index === pending) {
      sync();
      return;
    }
    cancelSwitch();
    if (index === top || reduced.matches || document.hidden || !inView) {
      applyTop(index);
      sync();
      return;
    }
    pending = index;
    stack.dataset.switching = "true";
    sync();
    const distance = innerWidth <= 760 ? 4 : 12;
    animations = cards.map((card, i) => {
      const angle = parseFloat(
        getComputedStyle(card).getPropertyValue("--paper-angle"),
      );
      const direction = i === 0 ? -1 : 1;
      const base = `rotate(${angle}deg)`;
      return card.animate(
        [
          { transform: base, offset: 0 },
          {
            transform: `translate(${direction * distance}px, -4px) rotate(${angle + direction * 0.5}deg)`,
            offset: 0.45,
          },
          { transform: base, offset: 1 },
        ],
        { duration: 640, easing: "ease-in-out" },
      );
    });
    midpoint = setTimeout(() => applyTop(index), 288);
    finish = setTimeout(() => {
      cancelSwitch();
      applyTop(index);
      sync();
    }, 650);
  }
  function read() {
    reading = true;
    if (pending !== null) settle();
    else sync();
  }
  const cardIndex = (target: EventTarget | null) =>
    target instanceof Element
      ? cards.indexOf(target.closest<HTMLElement>(".home-paper") as HTMLElement)
      : -1;
  stack.addEventListener(
    "pointerenter",
    (e) => {
      if (e.pointerType !== "mouse") return;
      read();
      const index = cardIndex(e.target);
      if (index >= 0) select(index);
    },
    options,
  );
  stack.addEventListener(
    "pointermove",
    (e) => {
      if (
        e.pointerType !== "mouse" ||
        !(e.movementX || e.movementY) ||
        pending !== null
      )
        return;
      const index = cardIndex(e.target);
      if (index >= 0 && !stack.contains(document.activeElement)) select(index);
    },
    options,
  );
  stack.addEventListener("pointerdown", read, options);
  stack.addEventListener("wheel", read, { ...options, passive: true });
  stack.addEventListener(
    "focusin",
    (e) => {
      const index = cardIndex(e.target);
      if (index >= 0) select(index);
    },
    options,
  );
  stack.addEventListener(
    "click",
    (e) => {
      const index = cardIndex(e.target);
      if (index >= 0) {
        cards[index]?.focus({ preventScroll: true });
        select(index);
      }
    },
    options,
  );
  document.addEventListener(
    "visibilitychange",
    () => (document.hidden ? settle() : sync()),
    options,
  );
  reduced.addEventListener("change", settle, options);
  const observer = new IntersectionObserver((entries) => {
    inView = entries[0]?.isIntersecting ?? false;
    if (!inView) settle();
    else sync();
  });
  observer.observe(stack);
  if (
    stack.contains(document.activeElement) ||
    (matchMedia("(hover: hover)").matches && stack.matches(":hover"))
  )
    reading = true;
  const focused = cardIndex(document.activeElement);
  applyTop(focused >= 0 ? focused : top);
  sync();
  return () => {
    clearTimeout(timer);
    cancelSwitch();
    abort.abort();
    observer.disconnect();
  };
}
