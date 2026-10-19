import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import {
  computed,
  defineComponent,
  h,
  nextTick,
  onBeforeUnmount,
  onBeforeUpdate,
  onMounted,
  onUpdated,
  ref,
  watch,
} from "vue";

import { initialContentDraftState } from "@application/shared/models";
import GenerationContent from "@presentation/components/GenerationContent.vue";
import GenerationVocabularyList from "@presentation/components/GenerationVocabularyList.vue";

vi.mock("@presentation/generation/use-content-presentation", () => ({
  useContentPresentation: () => ({
    paragraphs: ref<string[]>([]),
    typing: ref(false),
    reduced: ref(false),
  }),
}));

const cancelSurface = vi.fn();
const animateDescriptor = Object.getOwnPropertyDescriptor(
  Element.prototype,
  "animate",
);
const WordPronunciationStub = defineComponent({
  props: {
    entry: { type: String, required: true },
    surfaceId: { type: String, required: true },
    active: Boolean,
  },
  setup(props) {
    return () =>
      h(
        "span",
        {
          "data-pron-control": "",
          "data-pron-surface": props.surfaceId,
        },
        h("button", {
          type: "button",
          disabled: !props.active,
          "data-pronunciation-action": "",
          "data-pron-entry": props.entry,
        }),
      );
  },
});

function controlledResult() {
  return {
    passage: "We take responsibility.",
    passageSegments: [
      { kind: "text" as const, text: "We take " },
      { kind: "target" as const, text: "responsibility" },
      { kind: "text" as const, text: "." },
    ],
    tags: ["controlled"],
    targets: [
      {
        entry: "responsibility",
        entryMeaning: "a duty",
        hintPhrase: "take responsibility",
        hintSegments: [{ kind: "text" as const, text: "take responsibility" }],
      },
    ],
  };
}

beforeEach(() => {
  cancelSurface.mockReset();
  for (const [name, value] of Object.entries({
    computed,
    nextTick,
    onBeforeUnmount,
    onBeforeUpdate,
    onMounted,
    onUpdated,
    ref,
    watch,
  }))
    vi.stubGlobal(name, value);
  vi.stubGlobal("useDesignCopy", () => ({ copy: (key: string) => key }));
  vi.stubGlobal("useNuxtApp", () => ({
    $pronunciation: { cancelSurface },
  }));
  Object.defineProperty(Element.prototype, "animate", {
    value: undefined,
    configurable: true,
  });
});

afterEach(() => {
  document.body.replaceChildren();
  if (animateDescriptor)
    Object.defineProperty(Element.prototype, "animate", animateDescriptor);
  else delete (Element.prototype as { animate?: unknown }).animate;
  vi.unstubAllGlobals();
});

describe("GenerationContent pronunciation focus transfer", () => {
  it("moves only focused plan pronunciation to the same result entry after render", async () => {
    const draft = {
      ...initialContentDraftState(),
      draftId: "qa-controlled-draft",
    };
    const planItems = [
      {
        kind: "word_use" as const,
        entry: "responsibility",
        form: "responsibility",
        sense: "a duty",
        phrase: "take responsibility",
      },
    ];
    const wrapper = mount(GenerationContent, {
      attachTo: document.body,
      props: {
        draft,
        planItems,
        result: null,
        phase: "streaming",
        requestPhase: "planning",
        activity: null,
        completionNotice: null,
        pronunciationEnabled: true,
      },
      global: {
        stubs: {
          AppIcon: true,
        },
        components: {
          GenerationVocabularyList,
          WordPronunciation: WordPronunciationStub,
        },
      },
    });
    const planAction = wrapper.get(
      '[data-pron-surface="generation-plan:qa-controlled-draft"] [data-pronunciation-action]',
    ).element as HTMLButtonElement;
    planAction.focus();
    expect(document.activeElement).toBe(planAction);

    await wrapper.setProps({
      planItems: [],
      phase: "valid",
      requestPhase: "finalizing",
      result: controlledResult(),
    });
    await nextTick();

    const resultAction = wrapper.get(
      '[data-pron-surface="generation-result:qa-controlled-draft"] [data-pronunciation-action]',
    ).element as HTMLButtonElement;
    expect(resultAction.disabled).toBe(false);
    expect(document.activeElement).toBe(resultAction);
    expect(cancelSurface).toHaveBeenCalledWith(
      "generation-plan:qa-controlled-draft",
    );
    wrapper.unmount();
  });

  it("does not steal focus when the plan action was not focused", async () => {
    const outside = document.createElement("button");
    document.body.append(outside);
    const wrapper = mount(GenerationContent, {
      attachTo: document.body,
      props: {
        draft: {
          ...initialContentDraftState(),
          draftId: "qa-controlled-draft",
        },
        planItems: [
          {
            kind: "word_use" as const,
            entry: "responsibility",
            form: "responsibility",
            sense: "a duty",
            phrase: "take responsibility",
          },
        ],
        result: null,
        phase: "streaming",
        requestPhase: "planning",
        activity: null,
        completionNotice: null,
        pronunciationEnabled: true,
      },
      global: {
        stubs: {
          AppIcon: true,
        },
        components: {
          GenerationVocabularyList,
          WordPronunciation: WordPronunciationStub,
        },
      },
    });
    outside.focus();
    await wrapper.setProps({
      planItems: [],
      phase: "valid",
      requestPhase: "finalizing",
      result: controlledResult(),
    });
    await nextTick();
    const resultAction = wrapper.get(
      '[data-pron-surface="generation-result:qa-controlled-draft"] [data-pronunciation-action]',
    ).element as HTMLButtonElement;
    expect(resultAction.disabled).toBe(false);
    expect(document.activeElement).toBe(outside);
    wrapper.unmount();
  });
});
