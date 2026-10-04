<script setup lang="ts">
const props = defineProps<{
  id: string;
  open: boolean;
  title: string;
  closeLabel?: string;
  notice?: boolean;
  bodyKey?: string | undefined;
}>();
const emit = defineEmits<{ close: []; shown: [key: string | undefined] }>();
const dialog = ref<HTMLDialogElement | null>(null);
const feedback = useFeedbackStore();
let opener: HTMLElement | null = null;
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
  }
  if (!props.open && el.open) {
    feedback.modal(el, false);
    await nextTick();
    el.close();
    if (opener?.isConnected) opener.focus();
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
  if (event.target === event.currentTarget) emit("close");
}
</script>
<template>
  <Teleport to="body"
    ><dialog
      :id="id"
      ref="dialog"
      :class="{ 'notice-dialog': notice }"
      :aria-labelledby="`${id}-dialog-title`"
      @cancel.prevent="emit('close')"
      @click="backdrop"
    >
      <button
        class="btn quiet dialog-close"
        type="button"
        :aria-label="$t('common.close')"
        @click="emit('close')"
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
