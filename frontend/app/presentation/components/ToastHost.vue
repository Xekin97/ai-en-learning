<script setup lang="ts">
const feedback = useFeedbackStore();
const { copy } = useDesignCopy();
const node = ref<HTMLElement | null>(null);
let animation: Animation | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let media: MediaQueryList | undefined;
let resize: ResizeObserver | undefined;
let cancelListeners: (() => void) | undefined;
const parts = computed(() => {
  const message = feedback.message.value;
  if (!message) return [];
  if (message.key !== "welcome")
    return [{ text: copy(message.key, message.values), emphasis: false }];
  const marker = "\uFFF0";
  return copy("welcome", { ...message.values, elapsed: marker })
    .split(marker)
    .flatMap((text, index) =>
      index
        ? [
            { text: copy("welcome.elapsed", message.values), emphasis: true },
            { text, emphasis: false },
          ]
        : [{ text, emphasis: false }],
    );
});
function position() {
  const modal = feedback.host.value;
  if (!modal) return;
  modal.classList.remove("with-toast-space");
  modal.style.removeProperty("--toast-clearance");
  if (!node.value || !feedback.message.value) return;
  const f = node.value.getBoundingClientRect(),
    box = modal.getBoundingClientRect();
  if (f.top < box.bottom + 12 && f.bottom > box.top) {
    modal.style.setProperty(
      "--toast-clearance",
      `${innerHeight - f.top + 12}px`,
    );
    modal.classList.add("with-toast-space");
  }
}
function cancel() {
  clearTimeout(timer);
  animation?.cancel();
  animation = null;
}
function hide(sequence: number) {
  if (feedback.message.value?.sequence !== sequence) return;
  if (node.value?.matches(":popover-open")) node.value.hidePopover();
  cancel();
  feedback.clear();
  position();
}
async function layer() {
  if (node.value?.matches(":popover-open")) node.value.hidePopover();
  await nextTick();
  if (feedback.message.value && node.value) node.value.showPopover();
  position();
}
async function play() {
  cancel();
  await nextTick();
  const message = feedback.message.value;
  if (!message || !node.value) return;
  await layer();
  const dwell = message.welcome ? 10000 : 5000;
  const fade = media?.matches ? 0 : 300;
  const sequence = message.sequence;
  if (fade) {
    const duration = dwell + fade * 2;
    const current = node.value.animate(
      [
        { opacity: 0, offset: 0, easing: "ease-out" },
        { opacity: 1, offset: fade / duration },
        { opacity: 1, offset: (fade + dwell) / duration, easing: "ease-in" },
        { opacity: 0, offset: 1 },
      ],
      { duration, fill: "both" },
    );
    animation = current;
    current.finished.then(
      () => {
        if (animation === current) hide(sequence);
      },
      () => {},
    );
  } else timer = setTimeout(() => hide(sequence), dwell);
}
watch(() => feedback.message.value?.sequence, play, { flush: "post" });
watch(
  feedback.host,
  async (host, old) => {
    old?.classList.remove("with-toast-space");
    await layer();
  },
  { flush: "post" },
);
onMounted(() => {
  media = matchMedia("(prefers-reduced-motion: reduce)");
  const reduce = () => {
    if (!media?.matches || !animation) return;
    const duration = Number(animation.effect?.getTiming().duration ?? 0),
      remaining = duration - Number(animation.currentTime ?? 0);
    const sequence = feedback.message.value?.sequence;
    cancel();
    if (sequence !== undefined) {
      if (remaining <= 300) hide(sequence);
      else
        timer = setTimeout(() => hide(sequence), Math.max(0, remaining - 300));
    }
  };
  media.addEventListener("change", reduce);
  window.addEventListener("resize", position);
  window.visualViewport?.addEventListener("resize", position);
  resize = new ResizeObserver(position);
  if (node.value) resize.observe(node.value);
  cancelListeners = () => {
    media?.removeEventListener("change", reduce);
    window.removeEventListener("resize", position);
    window.visualViewport?.removeEventListener("resize", position);
  };
  if (feedback.message.value) void play();
});
onBeforeUnmount(() => {
  cancel();
  resize?.disconnect();
  cancelListeners?.();
});
</script>
<template>
  <Teleport :to="feedback.host.value ?? 'body'"
    ><div
      id="toast"
      ref="node"
      popover="manual"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      :class="{
        visible: !!feedback.message.value,
        'on-modal': !!feedback.host.value,
      }"
    >
      <template v-for="(part, index) in parts" :key="index"
        ><strong v-if="part.emphasis" class="toast-days">{{ part.text }}</strong
        ><template v-else>{{ part.text }}</template></template
      >
    </div></Teleport
  >
</template>
