<script
  setup
  lang="ts"
  generic="T extends string | number | string[] | null | undefined"
>
import { isVNode } from "vue";
defineOptions({ inheritAttrs: false });
const props = defineProps<{
  modelValue?: T;
  value?: T;
  disabled?: boolean;
  required?: boolean;
  multiple?: boolean;
}>();
const emit = defineEmits<{
  "update:modelValue": [value: T];
  change: [event: Event];
}>();
const attrs = useAttrs(),
  uid = useId();
const native = ref<HTMLSelectElement>(),
  trigger = ref<HTMLButtonElement>(),
  menu = ref<HTMLElement>();
const opened = ref(false),
  active = ref(-1),
  label = ref("");
const slots = useSlots();
function textOf(value: unknown): string {
  if (typeof value === "string" || typeof value === "number")
    return String(value);
  if (Array.isArray(value)) return value.map(textOf).join("");
  return isVNode(value) ? textOf(value.children) : "";
}
function collect(
  value: unknown,
  parentDisabled = false,
): { value: string; label: string; disabled: boolean }[] {
  if (Array.isArray(value))
    return value.flatMap((node) => collect(node, parentDisabled));
  if (!isVNode(value)) return [];
  const disabled =
    parentDisabled ||
    value.props?.disabled === true ||
    value.props?.disabled === "";
  if (value.type === "option")
    return [
      {
        value: String(value.props?.value ?? textOf(value.children)),
        label: textOf(value.children).trim(),
        disabled,
      },
    ];
  return collect(value.children, disabled);
}
const options = computed(() => collect(slots.default?.()));
const current = computed(() =>
  props.modelValue !== undefined ? props.modelValue : (props.value ?? ""),
);
const isSelected = (value: string) =>
  Array.isArray(current.value)
    ? current.value.includes(value)
    : value === String(current.value);
const selectedLabel = computed(() =>
  options.value
    .filter((o) => isSelected(o.value))
    .map((o) => o.label)
    .join(", "),
);
const ariaInvalid = computed(
  () => attrs["aria-invalid"] as "true" | "false" | undefined,
);
const proxyAttrs = computed(() =>
  Object.fromEntries(
    Object.entries(attrs).filter(
      ([key]) =>
        ![
          "class",
          "style",
          "id",
          "aria-label",
          "aria-labelledby",
          "aria-describedby",
        ].includes(key),
    ),
  ),
);
function sync() {
  const el = native.value;
  if (!el) return;
  if (props.multiple)
    for (const option of el.options) option.selected = isSelected(option.value);
  const parent = el.closest("label");
  label.value =
    parent?.querySelector(":scope > span")?.textContent?.trim() ||
    Array.from(parent?.childNodes ?? [])
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent)
      .join("")
      .trim();
  if (props.disabled || el.matches(":disabled")) close();
}
function position() {
  if (!opened.value || !menu.value || !trigger.value) return;
  const r = trigger.value.getBoundingClientRect(),
    m = menu.value;
  const v = window.visualViewport,
    height = v?.height ?? innerHeight,
    width = v?.width ?? innerWidth,
    top = v?.offsetTop ?? 0,
    left = v?.offsetLeft ?? 0;
  const below = top + height - r.bottom - 12,
    above = r.top - top - 12;
  const up =
    below < Math.min(220, options.value.length * 44 + 12) && above > below;
  m.style.width = `${Math.min(Math.max(r.width, 180), width - 24)}px`;
  m.style.maxHeight = `${Math.max(44, Math.min(288, (up ? above : below) - 7))}px`;
  m.style.left = `${Math.max(left + 12, Math.min(r.left, left + width - m.offsetWidth - 12))}px`;
  m.style.top = `${up ? r.top - m.offsetHeight - 7 : r.bottom + 7}px`;
}
function close(focus = false) {
  if (menu.value?.matches(":popover-open")) menu.value.hidePopover();
  opened.value = false;
  if (focus) trigger.value?.focus({ preventScroll: true });
}
async function open() {
  if (
    props.disabled ||
    native.value?.matches(":disabled") ||
    !options.value.some((o) => !o.disabled)
  )
    return;
  active.value = options.value.findIndex(
    (o) => isSelected(o.value) && !o.disabled,
  );
  if (active.value < 0)
    active.value = options.value.findIndex((o) => !o.disabled);
  // Keep keyboard ownership on the combobox after pointer activation in Safari.
  trigger.value?.focus({ preventScroll: true });
  menu.value?.showPopover();
  opened.value = true;
  await nextTick();
  position();
}
function change(event: Event) {
  const el = native.value;
  if (!el) return;
  const option = el.options[el.selectedIndex] as
    (HTMLOptionElement & { _value?: T }) | undefined;
  const value = props.multiple
    ? (Array.from(el.selectedOptions, (o) => o.value) as T)
    : (option?._value ?? (el.value as T));
  emit("update:modelValue", value);
  emit("change", event);
}
function choose(index: number) {
  if (options.value[index]?.disabled || index < 0 || props.disabled) return;
  if (native.value) {
    if (props.multiple)
      native.value.options[index]!.selected =
        !native.value.options[index]!.selected;
    else native.value.selectedIndex = index;
    native.value.dispatchEvent(new Event("change", { bubbles: true }));
  }
  if (!props.multiple) close(true);
}
let prefix = "",
  prefixTimer: ReturnType<typeof setTimeout> | undefined;
async function keydown(e: KeyboardEvent) {
  if (e.isComposing) return;
  if (e.key === "Tab") {
    close();
    return;
  }
  if (e.key === "Escape") {
    if (opened.value) {
      e.preventDefault();
      e.stopPropagation();
      close(true);
    }
    return;
  }
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    if (opened.value) choose(active.value);
    else await open();
    return;
  }
  if (
    !["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key) &&
    (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey)
  )
    return;
  e.preventDefault();
  if (!opened.value) await open();
  const valid = options.value.flatMap((o, i) => (o.disabled ? [] : [i]));
  if (!valid.length) return;
  const at = valid.indexOf(active.value);
  if (e.key === "Home") active.value = valid[0]!;
  else if (e.key === "End") active.value = valid.at(-1)!;
  else if (e.key === "ArrowDown" || e.key === "ArrowUp")
    active.value =
      valid[
        (at + (e.key === "ArrowDown" ? 1 : -1) + valid.length) % valid.length
      ]!;
  else {
    clearTimeout(prefixTimer);
    prefix += e.key.toLocaleLowerCase();
    const found = valid.find((i) =>
      options.value[i]!.label.toLocaleLowerCase().startsWith(prefix),
    );
    if (found !== undefined) active.value = found;
    prefixTimer = setTimeout(() => {
      prefix = "";
    }, 600);
  }
  await nextTick();
  menu.value?.children[active.value]?.scrollIntoView({ block: "nearest" });
}
onMounted(() => {
  sync();
  window.addEventListener("resize", position);
  document.addEventListener("scroll", position, true);
  window.visualViewport?.addEventListener("resize", position);
  window.visualViewport?.addEventListener("scroll", position);
});
onUpdated(sync);
onBeforeUnmount(() => {
  close();
  clearTimeout(prefixTimer);
  window.removeEventListener("resize", position);
  document.removeEventListener("scroll", position, true);
  window.visualViewport?.removeEventListener("resize", position);
  window.visualViewport?.removeEventListener("scroll", position);
});
</script>
<template>
  <div class="ww-select" :class="attrs.class" :style="attrs.style as string">
    <select
      ref="native"
      v-bind="proxyAttrs"
      :value="current"
      :multiple="multiple"
      :required="required"
      :disabled="disabled"
      class="ww-select-proxy"
      tabindex="-1"
      aria-hidden="true"
      @change="change"
      @invalid.prevent="trigger?.focus()"
    >
      <slot />
    </select>
    <button
      :id="attrs.id as string"
      ref="trigger"
      class="ww-select-trigger"
      :class="{ 'is-placeholder': !current }"
      type="button"
      role="combobox"
      aria-haspopup="listbox"
      :aria-expanded="opened"
      :aria-controls="`${uid}-options`"
      :aria-activedescendant="
        opened && active >= 0 ? `${uid}-option-${active}` : undefined
      "
      :aria-label="(attrs['aria-label'] as string) || label"
      :aria-labelledby="attrs['aria-labelledby'] as string"
      :aria-describedby="attrs['aria-describedby'] as string"
      :aria-invalid="ariaInvalid"
      :aria-required="required"
      :disabled="disabled"
      @click="opened ? close() : open()"
      @keydown="keydown"
    >
      <span>{{ selectedLabel }}</span
      ><AppIcon name="chevron-down" />
    </button>
    <span
      :id="`${uid}-options`"
      ref="menu"
      popover="auto"
      class="ww-select-menu"
      role="listbox"
      :aria-multiselectable="multiple || undefined"
      :aria-label="(attrs['aria-label'] as string) || label"
      @toggle="opened = ($event as ToggleEvent).newState === 'open'"
      @pointerdown.prevent
    >
      <span
        v-for="(option, index) in options"
        :id="`${uid}-option-${index}`"
        :key="option.value"
        class="ww-select-option"
        :class="{ 'is-active': active === index }"
        role="option"
        :aria-selected="isSelected(option.value)"
        :aria-disabled="option.disabled"
        @click="choose(index)"
        ><span>{{ option.label }}</span
        ><AppIcon v-if="isSelected(option.value)" name="check"
      /></span>
    </span>
  </div>
</template>
