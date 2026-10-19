import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  readonly,
  ref,
  shallowRef,
  toRef,
  watch,
} from "vue";

import type { PronunciationState } from "@application/pronunciation/models";
import WordPronunciation from "@presentation/components/WordPronunciation.vue";

const play = vi.fn();
const choose = vi.fn();
const state = shallowRef<PronunciationState>({
  phase: "idle",
  supported: true,
  entry: "harbor",
  surfaceId: "result:one",
  options: [{ id: "uk", locale: "en-GB", accent: "uk" }],
  selectedOptionId: "uk",
  selectionExplicit: false,
  failedSelection: null,
  actualSource: null,
  reason: null,
});

vi.mock("@runtime/pronunciation/use-pronunciation-scope", () => ({
  usePronunciationScope: () => ({ state: readonly(state), play, choose }),
}));

const wrappers: VueWrapper[] = [];
const copy = (key: string, values: Record<string, string> = {}) =>
  `${key}:${values.word ?? ""}:${values.accent ?? ""}:${values.source ?? ""}`;

function render() {
  const wrapper = mount(WordPronunciation, {
    attachTo: document.body,
    props: { entry: "harbor", surfaceId: "result:one" },
    global: {
      mocks: { $t: copy },
      stubs: {
        PronunciationIcon: {
          props: ["name"],
          template: '<svg class="pron-icon" :data-icon="name"></svg>',
        },
      },
    },
  });
  wrappers.push(wrapper);
  return wrapper;
}

beforeEach(() => {
  play.mockReset();
  choose.mockReset();
  state.value = {
    phase: "idle",
    supported: true,
    entry: "harbor",
    surfaceId: "result:one",
    options: [{ id: "uk", locale: "en-GB", accent: "uk" }],
    selectedOptionId: "uk",
    selectionExplicit: false,
    failedSelection: null,
    actualSource: null,
    reason: null,
  };
  for (const [name, value] of Object.entries({
    computed,
    nextTick,
    onBeforeUnmount,
    onMounted,
    readonly,
    ref,
    shallowRef,
    toRef,
    watch,
  }))
    vi.stubGlobal(name, value);
  vi.stubGlobal("useId", () => "pron-test");
  vi.stubGlobal("useDesignCopy", () => ({ copy }));
});

afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe("WordPronunciation", () => {
  it("keeps one normal source as a bare icon with no visible copy", async () => {
    const wrapper = render();
    await nextTick();
    expect(wrapper.findAll("button")).toHaveLength(1);
    expect(wrapper.get("button").attributes("title")).toBeUndefined();
    expect(wrapper.get("button").text()).toBe("");
    await wrapper.get("button").trigger("click");
    expect(play).toHaveBeenCalledOnce();
  });

  it("shows the actual accent trigger only when multiple normal options exist", async () => {
    state.value = {
      ...state.value,
      options: [
        { id: "uk", locale: "en-GB", accent: "uk" },
        { id: "us", locale: "en-US", accent: "us" },
      ],
    };
    const wrapper = render();
    await nextTick();
    expect(wrapper.get(".pron-menu-trigger").text()).toContain("pron.uk");
    expect(wrapper.get(".pron-menu").attributes()).toHaveProperty("hidden");
  });

  it("opens the one-alternative menu from a failed accent without playing", async () => {
    state.value = {
      ...state.value,
      phase: "accent",
      options: [{ id: "us", locale: "en-US", accent: "us" }],
      selectedOptionId: null,
      selectionExplicit: true,
      failedSelection: { id: "uk", locale: "en-GB", accent: "uk" },
      reason: "failed",
    };
    const wrapper = render();
    await nextTick();
    const main = wrapper.get(".pron-action");
    await main.trigger("click");
    expect(play).not.toHaveBeenCalled();
    expect(wrapper.get(".pron-menu").attributes("hidden")).toBeUndefined();
    const choice = wrapper.get(".pron-choice");
    expect(choice.attributes("aria-checked")).toBe("false");
    await choice.trigger("click");
    expect(choose).toHaveBeenCalledWith("us");
    await nextTick();
    expect(document.activeElement).toBe(main.element);
  });

  it("supports arrow/Home/End navigation and Escape opener restoration", async () => {
    state.value = {
      ...state.value,
      options: [
        { id: "uk", locale: "en-GB", accent: "uk" },
        { id: "us", locale: "en-US", accent: "us" },
      ],
    };
    const wrapper = render();
    await nextTick();
    const trigger = wrapper.get(".pron-menu-trigger");
    await trigger.trigger("click");
    await nextTick();
    const choices = wrapper.findAll(".pron-choice");
    await choices[0]!.trigger("keydown", { key: "End" });
    expect(document.activeElement).toBe(choices[1]!.element);
    await choices[1]!.trigger("keydown", { key: "Escape" });
    await nextTick();
    expect(document.activeElement).toBe(trigger.element);
  });
});
