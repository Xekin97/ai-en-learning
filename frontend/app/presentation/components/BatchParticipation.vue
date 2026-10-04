<script setup lang="ts">
const props = defineProps<{ batchId: string; value: boolean }>();
const library = useLibraryStore(),
  { copy } = useDesignCopy(),
  pending = ref(false);
async function change(event: Event) {
  const input = event.target as HTMLInputElement;
  const desired = input.checked;
  input.checked = props.value;
  pending.value = true;
  try {
    await library.setParticipation(props.batchId, desired);
  } catch {
    useFeedbackStore().show("failed");
  } finally {
    pending.value = false;
    await nextTick();
    if (input.isConnected) input.focus({ preventScroll: true });
  }
}
</script>
<template>
  <label class="library-check"
    ><input
      type="checkbox"
      :checked="value"
      :disabled="pending"
      @change="change"
    /><span>{{ copy("l.participate") }}</span></label
  >
</template>
