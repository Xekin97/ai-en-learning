<script setup lang="ts">
import { usePronunciationPresentation } from "@presentation/pronunciation/use-pronunciation";
import PronunciationIcon from "@presentation/pronunciation/PronunciationIcon.vue";
import { usePronunciationScope } from "@runtime/pronunciation/use-pronunciation-scope";

const props = withDefaults(
  defineProps<{
    entry: string;
    surfaceId: string;
    active?: boolean;
  }>(),
  { active: true },
);

const entry = toRef(props, "entry");
const surfaceId = toRef(props, "surfaceId");
const active = toRef(props, "active");
const { state, play, choose } = usePronunciationScope({
  entry,
  surfaceId,
  active,
});
const { accentLabel, icon, liveMessage, mainLabel } =
  usePronunciationPresentation(entry, state);
const localId = useId();
const menuId = `${localId}-pron-menu`;
const mounted = ref(false);
const menuOpen = ref(false);
const controlRef = ref<HTMLElement>();
const mainRef = ref<HTMLButtonElement>();
const sourceRef = ref<HTMLButtonElement>();
const choiceRefs = ref<HTMLButtonElement[]>([]);
let opener: "main" | "source" = "main";
let focusoutTask: ReturnType<typeof setTimeout> | undefined;

const accentChoiceRequired = computed(
  () => state.value.phase === "accent" && state.value.options.length > 0,
);
const showSourceTrigger = computed(
  () =>
    mounted.value &&
    state.value.phase !== "accent" &&
    state.value.options.length > 1,
);
const hasMenu = computed(
  () =>
    mounted.value && (accentChoiceRequired.value || showSourceTrigger.value),
);
const selected = computed(() =>
  state.value.options.find(
    (option) => option.id === state.value.selectedOptionId,
  ),
);

function setChoiceRef(element: unknown) {
  if (element instanceof HTMLButtonElement) choiceRefs.value.push(element);
}

function openMenu(nextOpener: "main" | "source") {
  if (!hasMenu.value) return;
  opener = nextOpener;
  choiceRefs.value = [];
  menuOpen.value = true;
  nextTick(() => {
    const selectedIndex = state.value.options.findIndex(
      (option) => option.id === state.value.selectedOptionId,
    );
    choiceRefs.value[Math.max(0, selectedIndex)]?.focus();
  });
}

function closeMenu(restoreFocus = false) {
  if (!menuOpen.value) return;
  menuOpen.value = false;
  if (restoreFocus)
    nextTick(() => {
      const target = opener === "source" ? sourceRef.value : mainRef.value;
      target?.focus();
    });
}

function handleMain() {
  if (accentChoiceRequired.value) {
    if (menuOpen.value) closeMenu(true);
    else openMenu("main");
    return;
  }
  play();
}

function handleChoice(optionId: string) {
  // The coordinator revalidates and starts speech in this gesture callback.
  choose(optionId);
  menuOpen.value = false;
  nextTick(() => mainRef.value?.focus());
}

function moveChoice(event: KeyboardEvent, index: number) {
  const last = choiceRefs.value.length - 1;
  let target: number | undefined;
  if (event.key === "ArrowDown") target = index === last ? 0 : index + 1;
  if (event.key === "ArrowUp") target = index === 0 ? last : index - 1;
  if (event.key === "Home") target = 0;
  if (event.key === "End") target = last;
  if (event.key === "Escape") {
    event.preventDefault();
    closeMenu(true);
    return;
  }
  if (target !== undefined) {
    event.preventDefault();
    choiceRefs.value[target]?.focus();
  }
}

function handleFocusout(event: FocusEvent) {
  if (!menuOpen.value) return;
  const target = event.relatedTarget;
  if (target instanceof Node && controlRef.value?.contains(target)) return;
  if (focusoutTask) clearTimeout(focusoutTask);
  focusoutTask = setTimeout(() => {
    if (!controlRef.value?.contains(document.activeElement)) closeMenu();
  });
}

function handleDocumentPointer(event: PointerEvent) {
  if (menuOpen.value && !controlRef.value?.contains(event.target as Node))
    closeMenu();
}

watch(hasMenu, (value) => {
  if (!value) closeMenu();
});
onMounted(() => {
  mounted.value = true;
  document.addEventListener("pointerdown", handleDocumentPointer);
});
onBeforeUnmount(() => {
  if (focusoutTask) clearTimeout(focusoutTask);
  document.removeEventListener("pointerdown", handleDocumentPointer);
});
</script>

<template>
  <span
    ref="controlRef"
    class="pron-control"
    data-pron-control
    :data-word="props.entry"
    :data-pron-surface="props.surfaceId"
    @focusout="handleFocusout"
  >
    <button
      ref="mainRef"
      type="button"
      class="pron-action"
      data-pronunciation-action
      :data-pron-entry="props.entry"
      :data-play-state="state.phase"
      :aria-label="mainLabel"
      :aria-haspopup="accentChoiceRequired ? 'menu' : undefined"
      :aria-controls="accentChoiceRequired ? menuId : undefined"
      :aria-expanded="accentChoiceRequired ? menuOpen : undefined"
      :disabled="!props.active"
      @click="handleMain"
    >
      <PronunciationIcon :name="icon" />
    </button>
    <button
      v-if="showSourceTrigger"
      ref="sourceRef"
      type="button"
      class="pron-menu-trigger"
      :aria-label="$t(`m002.pron__chooseAccent`, { word: props.entry })"
      aria-haspopup="menu"
      :aria-controls="menuId"
      :aria-expanded="menuOpen"
      @click="menuOpen ? closeMenu(true) : openMenu('source')"
    >
      <span data-pron-source>{{
        selected ? accentLabel(selected.accent) : $t("m002.pron__english")
      }}</span>
      <PronunciationIcon name="chevron" />
    </button>
    <span
      v-if="hasMenu"
      :id="menuId"
      class="pron-menu"
      role="menu"
      :aria-label="$t(`m002.pron__chooseAccent`, { word: props.entry })"
      :hidden="!menuOpen"
    >
      <button
        v-for="(option, index) in state.options"
        :key="option.id"
        :ref="setChoiceRef"
        type="button"
        class="pron-choice"
        role="menuitemradio"
        :aria-checked="option.id === state.selectedOptionId"
        :data-pron-accent="option.accent"
        @click="handleChoice(option.id)"
        @keydown="moveChoice($event, index)"
      >
        <span>{{ accentLabel(option.accent) }}</span>
        <small><PronunciationIcon name="check" /></small>
      </button>
    </span>
    <span class="pron-live" aria-live="polite" aria-atomic="true">{{
      liveMessage
    }}</span>
  </span>
</template>
