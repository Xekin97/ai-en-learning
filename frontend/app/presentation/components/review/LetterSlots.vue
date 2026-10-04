<script setup lang="ts">
import type { WordQuestion } from "@application/review/models";
const props = defineProps<{
  slots: readonly WordQuestion["slots"][number][];
  values: readonly string[];
  disabled?: boolean;
}>();
const emit = defineEmits<{ change: [values: string[]] }>(),
  { copy } = useDesignCopy(),
  root = ref<HTMLElement>(),
  invalid = ref(false);
const composing = ref(false);
const cells = computed(() => {
  let index = 0;
  return props.slots.map((slot) =>
    slot.kind === "letters"
      ? {
          kind: "letters" as const,
          indexes: Array.from({ length: slot.count }, () => index++),
        }
      : { kind: "separator" as const, text: slot.text },
  );
});
function focus(index: number) {
  root.value
    ?.querySelector<HTMLInputElement>(
      `[data-slot="${Math.max(0, Math.min(index, props.values.length - 1))}"]`,
    )
    ?.focus();
}
function apply(index: number, text: string) {
  const letters = Array.from(text.replace(/[^a-z]/gi, ""));
  if (letters.length > props.values.length - index) {
    invalid.value = true;
    return false;
  }
  const values = [...props.values];
  if (!letters.length) values[index] = "";
  else
    letters.forEach((letter, offset) => {
      values[index + offset] = letter;
    });
  invalid.value = false;
  emit("change", values);
  if (letters.length) nextTick(() => focus(index + letters.length));
  return true;
}
function input(event: Event, index: number) {
  if (composing.value) return;
  const el = event.target as HTMLInputElement;
  if (!apply(index, el.value)) el.value = props.values[index] ?? "";
}
function paste(event: ClipboardEvent, index: number) {
  event.preventDefault();
  apply(index, event.clipboardData?.getData("text") ?? "");
}
function key(event: KeyboardEvent, index: number) {
  if (composing.value) return;
  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    event.preventDefault();
    focus(index + (event.key === "ArrowLeft" ? -1 : 1));
  } else if (event.key === "Backspace" && !props.values[index] && index > 0) {
    event.preventDefault();
    const values = [...props.values];
    values[index - 1] = "";
    emit("change", values);
    focus(index - 1);
  }
}
</script>
<template>
  <div ref="root" class="slots">
    <template v-for="(cell, i) in cells" :key="i"
      ><span v-if="cell.kind === 'letters'" class="slot-word"
        ><input
          v-for="index in cell.indexes"
          :key="index"
          class="slot"
          :data-slot="index"
          :value="values[index] ?? ''"
          :aria-label="copy('slot', { index: index + 1 })"
          :aria-invalid="invalid"
          :disabled="disabled"
          autocomplete="off"
          autocapitalize="none"
          :spellcheck="false"
          @input="input($event, index)"
          @compositionstart="composing = true"
          @compositionend="
            composing = false;
            input($event, index);
          "
          @paste="paste($event, index)"
          @keydown="key($event, index)" /></span
      ><span
        v-else
        :class="cell.text === ' ' ? 'slot-space' : 'slot-punctuation'"
        aria-hidden="true"
        >{{ cell.text }}</span
      ></template
    >
  </div>
  <p v-if="invalid" class="note error" role="alert">{{ copy("error") }}</p>
</template>
