<script setup lang="ts">
const props = defineProps<{
  id: string;
  selectedEntries: readonly string[];
  candidates: readonly string[];
  query: string;
  searchStatus: "idle" | "loading" | "ready" | "empty" | "failed";
  disabled?: boolean;
  maxEntries?: number;
  randomPending?: boolean;
  showRandom?: boolean;
}>();
const emit = defineEmits<{
  query: [value: string];
  add: [entry: string];
  remove: [entry: string];
  retry: [];
  random: [];
}>();
const { copy } = useDesignCopy();
const root = ref<HTMLElement>(),
  input = ref<HTMLInputElement>(),
  expanded = ref(false),
  active = ref(-1),
  composing = ref(false),
  message = ref("");
const loadingVisible = ref(false);
let loadingTimer: ReturnType<typeof setTimeout> | undefined;
watch(
  () => [props.query, props.searchStatus, props.disabled],
  () => {
    clearTimeout(loadingTimer);
    loadingVisible.value = false;
    if (
      props.query.trim() &&
      props.searchStatus === "loading" &&
      !props.disabled
    )
      loadingTimer = setTimeout(() => {
        loadingVisible.value = true;
      }, 250);
  },
  { immediate: true },
);
onBeforeUnmount(() => clearTimeout(loadingTimer));
const full = computed(
  () =>
    props.maxEntries !== undefined &&
    props.selectedEntries.length >= props.maxEntries,
);
const visible = computed(
  () =>
    expanded.value &&
    !!props.query.trim() &&
    !props.disabled &&
    (props.searchStatus !== "loading" || loadingVisible.value),
);
const chosen = (word: string) =>
  props.selectedEntries.some((x) => x.toLowerCase() === word.toLowerCase());
const blocked = (word: string) => props.disabled || full.value || chosen(word);
watch(
  () => [props.candidates, props.searchStatus],
  () => {
    active.value = props.candidates.findIndex((w) => !blocked(w));
  },
);
function changeQuery(value: string) {
  expanded.value = true;
  active.value = -1;
  emit("query", value);
}
async function choose(word: string) {
  if (
    props.searchStatus !== "ready" ||
    !props.candidates.includes(word) ||
    blocked(word)
  )
    return;
  emit("add", word);
  emit("query", "");
  expanded.value = false;
  message.value = copy("picker.added", { word });
  await nextTick();
  input.value?.focus();
}
async function remove(word: string) {
  if (props.disabled) return;
  const i = props.selectedEntries.indexOf(word);
  emit("remove", word);
  message.value = copy("picker.removed", { word });
  await nextTick();
  const buttons = root.value?.querySelectorAll<HTMLButtonElement>(
    "[data-picker-remove]",
  );
  (buttons?.[Math.min(i, buttons.length - 1)] ?? input.value)?.focus();
}
function clear() {
  emit("query", "");
  expanded.value = false;
  input.value?.focus();
}
async function keydown(e: KeyboardEvent) {
  if (e.isComposing || composing.value) return;
  if (e.key === "Escape") {
    if (visible.value) {
      e.preventDefault();
      e.stopPropagation();
    }
    expanded.value = false;
    return;
  }
  if (e.key === "Tab") {
    expanded.value = false;
    return;
  }
  if (e.key === "Enter") {
    e.preventDefault();
    if (visible.value && active.value >= 0)
      void choose(props.candidates[active.value]!);
    return;
  }
  if (
    !["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key) ||
    !props.query.trim() ||
    props.searchStatus !== "ready"
  )
    return;
  e.preventDefault();
  expanded.value = true;
  const valid = props.candidates.flatMap((w, i) => (blocked(w) ? [] : [i]));
  if (!valid.length) return;
  active.value =
    e.key === "Home"
      ? valid[0]!
      : e.key === "End"
        ? valid.at(-1)!
        : valid[
            (valid.indexOf(active.value) +
              (e.key === "ArrowDown" ? 1 : -1) +
              valid.length) %
              valid.length
          ]!;
  await nextTick();
  root.value
    ?.querySelector(`#${props.id}-option-${active.value}`)
    ?.scrollIntoView({ block: "nearest" });
}
function outside(event: PointerEvent) {
  if (!root.value?.contains(event.target as Node)) expanded.value = false;
}
onMounted(() => document.addEventListener("pointerdown", outside));
onBeforeUnmount(() => document.removeEventListener("pointerdown", outside));
function parts(word: string) {
  const at = word.toLowerCase().indexOf(props.query.trim().toLowerCase()),
    size = props.query.trim().length;
  return at < 0
    ? [word, "", ""]
    : [word.slice(0, at), word.slice(at, at + size), word.slice(at + size)];
}
</script>
<template>
  <section
    :id="id"
    ref="root"
    class="word-picker"
    :aria-labelledby="`${id}-title`"
    @focusout="
      !root?.contains($event.relatedTarget as Node) && (expanded = false)
    "
  >
    <div class="word-picker-head">
      <div>
        <h2 :id="`${id}-title`">{{ copy("words") }}</h2>
        <p class="word-picker-count">
          {{
            maxEntries === undefined
              ? copy("picker.count", { count: selectedEntries.length })
              : copy("wordcount", {
                  count: selectedEntries.length,
                  limit: maxEntries,
                })
          }}<span v-if="maxEntries !== undefined && !full">{{
            copy("picker.remaining", {
              count: maxEntries - selectedEntries.length,
            })
          }}</span>
        </p>
      </div>
      <button
        v-if="showRandom"
        type="button"
        class="btn quiet small word-picker-random"
        :disabled="disabled || full || randomPending"
        @click="emit('random')"
      >
        <AppIcon name="shuffle" />{{ copy("random") }}
      </button>
    </div>
    <div class="word-picker-selection" :aria-label="copy('picker.selected')">
      <span v-for="word in selectedEntries" :key="word" class="word-token"
        ><span lang="en">{{ word }}</span
        ><button
          type="button"
          data-picker-remove
          :aria-label="`${copy('remove')} ${word}`"
          :disabled="disabled"
          @click="remove(word)"
        >
          <AppIcon name="x" /></button
      ></span>
      <p v-if="!selectedEntries.length" class="word-picker-empty">
        {{ copy("picker.empty") }}
      </p>
    </div>
    <div class="word-picker-search">
      <label :for="`${id}-search`">{{ copy("wordsearch") }}</label>
      <div class="word-picker-input">
        <AppIcon name="search" /><input
          :id="`${id}-search`"
          ref="input"
          :value="query"
          type="text"
          role="combobox"
          autocomplete="off"
          autocapitalize="none"
          :spellcheck="false"
          aria-autocomplete="list"
          aria-haspopup="listbox"
          :aria-controls="`${id}-list`"
          :aria-expanded="visible"
          :aria-busy="searchStatus === 'loading'"
          :aria-activedescendant="
            visible && searchStatus === 'ready' && active >= 0
              ? `${id}-option-${active}`
              : undefined
          "
          :aria-describedby="`${id}-feedback`"
          :placeholder="copy('picker.placeholder')"
          :disabled="disabled"
          @input="
            !composing && changeQuery(($event.target as HTMLInputElement).value)
          "
          @compositionstart="composing = true"
          @compositionend="
            composing = false;
            changeQuery(($event.target as HTMLInputElement).value);
          "
          @focus="expanded = true"
          @keydown="keydown"
        /><button
          v-if="query"
          type="button"
          :aria-label="copy('picker.clear')"
          :disabled="disabled"
          @click="clear"
        >
          <AppIcon name="x" />
        </button>
      </div>
      <div v-if="visible" class="word-picker-popup" @pointerdown.prevent>
        <div
          :id="`${id}-list`"
          role="listbox"
          :aria-label="copy('picker.options')"
          aria-multiselectable="true"
        >
          <template v-if="searchStatus === 'ready'"
            ><button
              v-for="(word, index) in candidates"
              :id="`${id}-option-${index}`"
              :key="word"
              type="button"
              role="option"
              tabindex="-1"
              class="word-picker-option"
              :class="{ 'is-active': active === index }"
              :aria-selected="chosen(word)"
              :aria-disabled="!!blocked(word)"
              @click="choose(word)"
            >
              <span lang="en"
                >{{ parts(word)[0] }}<mark>{{ parts(word)[1] }}</mark
                >{{ parts(word)[2] }}</span
              ><span class="word-picker-option-status"
                ><template v-if="chosen(word)"
                  >{{ copy("picker.chosen") }}<AppIcon name="check" /></template
                ><AppIcon v-else name="plus"
              /></span></button
          ></template>
        </div>
        <div
          v-if="searchStatus !== 'ready'"
          class="word-picker-search-state"
          :class="{ 'is-loading': searchStatus === 'loading' }"
          data-picker-search-state
          role="status"
        >
          <span
            v-if="searchStatus === 'loading'"
            class="word-picker-spinner"
            aria-hidden="true"
          />
          <p>
            {{
              copy(
                searchStatus === "failed"
                  ? "picker.error"
                  : searchStatus === "loading"
                    ? "picker.loading"
                    : "picker.none",
              )
            }}
          </p>
          <button
            v-if="searchStatus === 'failed'"
            class="btn quiet small"
            type="button"
            @click="emit('retry')"
          >
            {{ copy("retry") }}
          </button>
        </div>
      </div>
    </div>
    <p
      :id="`${id}-feedback`"
      class="word-picker-feedback"
      :class="{ 'at-limit': full }"
    >
      {{ full ? copy("picker.full") : "" }}
    </p>
    <span class="sr-only" role="status" aria-live="polite" aria-atomic="true">{{
      message
    }}</span>
  </section>
</template>
