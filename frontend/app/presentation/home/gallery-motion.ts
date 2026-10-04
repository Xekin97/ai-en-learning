/** Disposable conversion of the UI22 gallery interaction; Vue owns content and filtering. */
export function attachGalleryMotion(
  root: HTMLElement,
  input: {
    initialId: string | null;
    paused: boolean;
    change: (id: string, paused: boolean) => void;
    announce: (current: number, total: number, title: string) => string;
  },
): () => void {
  const track = root.querySelector<HTMLElement>(".gallery-track");
  if (!track) return () => {};
  const cards = [...track.querySelectorAll<HTMLElement>(".gallery-card")],
    reduced = matchMedia("(prefers-reduced-motion: reduce)"),
    abort = new AbortController(),
    options = { signal: abort.signal };
  if (!cards.length) return () => {};
  let selected = Math.max(
      0,
      cards.findIndex((card) => card.dataset.presetId === input.initialId),
    ),
    paused = input.paused,
    onScreen = false;
  let timer: ReturnType<typeof setTimeout> | undefined,
    scrollTimer: ReturnType<typeof setTimeout> | undefined;
  const running = () => cards.length > 1 && !paused && !reduced.matches;
  const leftOf = (index: number) =>
    (cards[index]?.offsetLeft ?? 0) - (cards[0]?.offsetLeft ?? 0);
  function update() {
    root.dataset.rotation = running() ? "auto" : "paused";
    input.change(cards[selected]!.dataset.presetId!, paused);
  }
  function schedule() {
    clearTimeout(timer);
    if (running() && !document.hidden && onScreen)
      timer = setTimeout(() => move(selected + 1, false), 8000);
  }
  function move(index: number, manual = true) {
    selected = (index + cards.length) % cards.length;
    if (manual) paused = true;
    track!.scrollTo({
      left: leftOf(selected),
      behavior: reduced.matches ? "instant" : "smooth",
    });
    update();
    if (manual) {
      const announcement = root.querySelector(".gallery-announcement");
      if (announcement)
        announcement.textContent = input.announce(
          selected + 1,
          cards.length,
          cards[selected]?.querySelector("h2")?.textContent ?? "",
        );
    }
    schedule();
  }
  function pause() {
    paused = true;
    update();
    schedule();
  }
  root.addEventListener(
    "click",
    (event) => {
      const button = (event.target as Element).closest<HTMLButtonElement>(
        "[data-gallery]",
      );
      if (button && !button.disabled)
        move(selected + (button.dataset.gallery === "next" ? 1 : -1));
    },
    options,
  );
  root.addEventListener(
    "pointerenter",
    (event) => {
      if (event.pointerType === "mouse") pause();
    },
    options,
  );
  root.addEventListener("focusin", pause, options);
  root.addEventListener("pointerdown", pause, options);
  root.addEventListener("wheel", pause, { ...options, passive: true });
  if (
    root.contains(document.activeElement) ||
    (matchMedia("(hover: hover)").matches && root.matches(":hover"))
  )
    paused = true;
  track.addEventListener(
    "keydown",
    (event) => {
      if (
        event.target !== track ||
        !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
      )
        return;
      event.preventDefault();
      move(
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? cards.length - 1
            : selected + (event.key === "ArrowRight" ? 1 : -1),
      );
    },
    options,
  );
  track.addEventListener(
    "scroll",
    () => {
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => {
        selected = cards.reduce(
          (best, _, index) =>
            Math.abs(leftOf(index) - track.scrollLeft) <
            Math.abs(leftOf(best) - track.scrollLeft)
              ? index
              : best,
          0,
        );
        update();
        schedule();
      }, 120);
    },
    { ...options, passive: true },
  );
  document.addEventListener("visibilitychange", schedule, options);
  reduced.addEventListener(
    "change",
    () => {
      update();
      schedule();
    },
    options,
  );
  const observer = new IntersectionObserver((entries) => {
    onScreen = entries[0]?.isIntersecting ?? false;
    schedule();
  });
  observer.observe(root);
  update();
  track.scrollTo({ left: leftOf(selected), behavior: "instant" });
  return () => {
    clearTimeout(timer);
    clearTimeout(scrollTimer);
    abort.abort();
    observer.disconnect();
  };
}
