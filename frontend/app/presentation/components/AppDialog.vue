<script setup lang="ts">
const props = defineProps<{
  id: string;
  open: boolean;
  title: string;
}>();
const emit = defineEmits<{ close: [] }>();
const dialog = ref<HTMLDialogElement | null>(null);

function syncOpen() {
  const element = dialog.value;
  if (!element) return;
  if (props.open && !element.open) element.showModal();
  if (!props.open && element.open) element.close();
}

function requestClose() {
  emit("close");
}

function onBackdrop(event: MouseEvent) {
  if (event.target === event.currentTarget) requestClose();
}

watch(
  () => props.open,
  () => nextTick(syncOpen),
);
onMounted(syncOpen);
</script>

<template>
  <Teleport v-if="open" to="body">
    <dialog
      ref="dialog"
      :aria-labelledby="`${id}-dialog-title`"
      @cancel.prevent="requestClose"
      @click="onBackdrop"
    >
      <div class="dialog-header">
        <h2 :id="`${id}-dialog-title`">{{ title }}</h2>
      </div>
      <div class="dialog-body"><slot /></div>
      <div class="dialog-footer"><slot name="footer" /></div>
    </dialog>
  </Teleport>
</template>
