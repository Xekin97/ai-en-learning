<script setup lang="ts">
const props = defineProps<{
  id: string;
  open: boolean;
  title: string;
  closeLabel?: string;
  notice?: boolean;
  bodyKey?: string | undefined;
  dialogClass?: string;
  closeDisabled?: boolean;
  backdropCloseDisabled?: boolean;
  initialFocus?: string;
  returnFocus?: () => HTMLElement | null;
}>();
const emit = defineEmits<{ close: []; shown: [key: string | undefined] }>();
const dialog = ref<HTMLDialogElement | null>(null);
const feedback = useFeedbackStore();
let opener: HTMLElement | null = null;
const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "details > summary:first-of-type",
  "[contenteditable='true']",
  "[tabindex]:not([tabindex^='-'])",
].join(",");

function focusableTargets(el: HTMLDialogElement) {
  return [...el.querySelectorAll<HTMLElement>(focusableSelector)].filter(
    (target) =>
      target.tabIndex >= 0 &&
      !target.matches(":disabled") &&
      target.getClientRects().length > 0 &&
      !target.closest("[inert], [aria-hidden='true']"),
  );
}

function trapFocus(event: KeyboardEvent) {
  const el = dialog.value;
  if (event.key !== "Tab" || !el?.open || feedback.host.value !== el) return;
  const targets = focusableTargets(el),
    first = targets[0],
    last = targets.at(-1),
    active = document.activeElement,
    activeIndex = active instanceof HTMLElement ? targets.indexOf(active) : -1;
  if (!first || !last) {
    event.preventDefault();
    return;
  }
  if (event.shiftKey ? activeIndex <= 0 : activeIndex < 0 || active === last) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
  }
}

function restoreOpener() {
  const target = props.returnFocus?.() ?? opener,
    parentDialog = target?.closest("dialog");
  if (
    target?.isConnected &&
    !target.matches(":disabled") &&
    (!parentDialog || parentDialog.open)
  )
    target.focus({ preventScroll: true });
}

async function syncOpen() {
  await nextTick();
  const el = dialog.value;
  if (!el) return;
  if (props.open && !el.open) {
    opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    el.showModal();
    feedback.modal(el, true);
    emit("shown", props.bodyKey);
    await nextTick();
    const target = props.initialFocus
      ? el.querySelector<HTMLElement>(props.initialFocus)
      : focusableTargets(el)[0];
    target?.focus({ preventScroll: true });
  }
  if (!props.open && el.open) {
    feedback.modal(el, false);
    await nextTick();
    el.close();
    await nextTick();
    restoreOpener();
  }
}
watch(() => props.open, syncOpen);
watch(
  () => props.bodyKey,
  async () => {
    await nextTick();
    const body = dialog.value?.querySelector(".notice-reading");
    if (body) body.scrollTop = 0;
    if (props.open && dialog.value?.open) emit("shown", props.bodyKey);
  },
);
onMounted(syncOpen);
onBeforeUnmount(() => {
  if (dialog.value) feedback.modal(dialog.value, false);
});
function backdrop(event: MouseEvent) {
  if (
    event.target === event.currentTarget &&
    !props.closeDisabled &&
    !props.backdropCloseDisabled
  )
    emit("close");
}
</script>
<template>
  <Teleport to="body"
    ><dialog
      :id="id"
      ref="dialog"
      :class="[dialogClass, { 'notice-dialog': notice }]"
      :aria-labelledby="`${id}-dialog-title`"
      @cancel.prevent="!closeDisabled && emit('close')"
      @click="backdrop"
      @keydown="trapFocus"
    >
      <button
        class="btn quiet dialog-close"
        type="button"
        :disabled="closeDisabled"
        :aria-label="$t('common.close')"
        @click="!closeDisabled && emit('close')"
      >
        <template v-if="closeLabel">{{ closeLabel }}</template>
        <AppIcon v-else name="x" />
      </button>
      <slot name="header"
        ><h2 :id="`${id}-dialog-title`">{{ title }}</h2></slot
      >
      <div
        class="dialog-body"
        :class="{ 'notice-reading': notice }"
        :tabindex="notice ? 0 : undefined"
      >
        <slot />
      </div>
      <div class="dialog-actions"><slot name="footer" /></div></dialog
  ></Teleport>
</template>
