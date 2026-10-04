import { afterEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { computed, defineComponent, h, nextTick, ref, Suspense } from "vue";
import BatchPage from "../../app/pages/library/[batchId].vue";

vi.mock("@presentation/controllers/learner-access", () => ({
  useLearnerAccess: () => ({
    view: ref({ kind: "learner" }),
    initialize: vi.fn().mockResolvedValue(undefined),
    retry: vi.fn(),
  }),
}));

const wrappers: VueWrapper[] = [];
afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

async function setup() {
  const detail = {
    title: "Original title",
    titleRevision: "1",
    titleMaxLength: 120,
    savedAt: "2026-09-28T00:00:00Z",
    tags: [],
    passageSegments: [],
    targets: [],
    configuration: {},
    reviewSummary: { successfulCount: 0 },
    participatesInRangeReview: true,
  };
  const state = ref({
    details: { batch: detail } as Record<string, typeof detail>,
    failure: null as null | { kind: string },
  });
  const epoch = ref(1);
  const updateTitle = vi.fn<() => Promise<boolean>>();
  const show = vi.fn();
  const errors: unknown[] = [];
  vi.stubGlobal("ref", ref);
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("nextTick", nextTick);
  vi.stubGlobal("definePageMeta", vi.fn());
  vi.stubGlobal("useLocalizedHead", vi.fn());
  vi.stubGlobal("useRoute", () => ({
    params: { batchId: "batch" },
    query: {},
  }));
  vi.stubGlobal("useLibraryStore", () => ({ state, updateTitle }));
  vi.stubGlobal("useSessionStore", () => ({ epoch }));
  vi.stubGlobal("useDesignCopy", () => ({ copy: (key: string) => key }));
  vi.stubGlobal("useDisplayFormatters", () => ({ dateTime: (v: string) => v }));
  vi.stubGlobal("useFeedbackStore", () => ({ show }));
  const wrapper = mount(
    defineComponent({
      render: () => h(Suspense, null, { default: () => h(BatchPage) }),
    }),
    {
      attachTo: document.body,
      global: {
        config: { errorHandler: (error) => errors.push(error) },
        stubs: {
          LearnerPageBoundary: { template: "<div><slot /></div>" },
          NuxtLink: { template: "<a><slot /></a>" },
          AppError: true,
          AppDialog: true,
          AppIcon: true,
          BatchParticipation: true,
          GenerationSettings: true,
        },
      },
    },
  );
  wrappers.push(wrapper);
  await flushPromises();
  await wrapper.get(".batch-title-header button").trigger("click");
  await wrapper.get("#batch-title").setValue("My new title");
  const submit = async () => {
    // Clicking Save moves focus away from the editor before it is disabled.
    (wrapper.get('button[type="submit"]').element as HTMLButtonElement).focus();
    await wrapper.get("form").trigger("submit");
    await flushPromises();
  };
  return { wrapper, state, epoch, updateTitle, show, errors, submit };
}

describe("batch title async completion", () => {
  it("retains text and stored title, restores focus after failure, then explicitly retries", async () => {
    const { wrapper, state, updateTitle, show, errors, submit } = await setup();
    updateTitle.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    await submit();
    const input = wrapper.get("#batch-title").element as HTMLInputElement;
    expect(input.value).toBe("My new title");
    expect(input.disabled).toBe(false);
    expect(document.activeElement).toBe(input);
    expect(state.value.details.batch?.title).toBe("Original title");
    expect(wrapper.get(".batch-title-editor [role=alert]").text()).toBe(
      "l.title.failed",
    );
    expect(show).not.toHaveBeenCalled();
    await submit();
    expect(updateTitle).toHaveBeenLastCalledWith("batch", "My new title", "1");
    expect(wrapper.find("#batch-title").exists()).toBe(false);
    expect(show).toHaveBeenCalledExactlyOnceWith("l.title.saved");
    expect(errors).toEqual([]);
  });

  it.each([false, true])(
    "ignores a delayed %s result after identity changes even if a batch is available again",
    async (saved) => {
      const { wrapper, state, epoch, updateTitle, show, errors, submit } =
        await setup();
      updateTitle.mockImplementationOnce(async () => {
        epoch.value++;
        state.value.details.batch = {
          ...state.value.details.batch!,
          title: "Another session",
          titleRevision: "7",
        };
        return saved;
      });
      await submit();
      expect(show).not.toHaveBeenCalled();
      expect(wrapper.find(".batch-title-editor [role=alert]").exists()).toBe(
        false,
      );
      expect(document.activeElement?.id).not.toBe("batch-title");
      expect(state.value.details.batch?.title).toBe("Another session");
      expect(errors).toEqual([]);
    },
  );

  it("does not read a removed private batch after session invalidation", async () => {
    const { state, epoch, updateTitle, show, errors, submit } = await setup();
    updateTitle.mockImplementationOnce(async () => {
      epoch.value++;
      state.value.details = {};
      return false;
    });
    await submit();
    expect(errors).toEqual([]);
    expect(show).not.toHaveBeenCalled();
  });

  it("does not restore a deleted batch or show success after a delayed result", async () => {
    const { state, updateTitle, show, errors, submit } = await setup();
    updateTitle.mockImplementationOnce(async () => {
      state.value.details = {};
      return true;
    });
    await submit();
    expect(state.value.details).toEqual({});
    expect(show).not.toHaveBeenCalled();
    expect(errors).toEqual([]);
  });

  it("keeps local input on a conflict and retries with the refreshed revision", async () => {
    const { wrapper, state, updateTitle, errors, submit } = await setup();
    updateTitle
      .mockImplementationOnce(async () => {
        state.value.failure = { kind: "conflict" };
        state.value.details.batch = {
          ...state.value.details.batch!,
          title: "Saved elsewhere",
          titleRevision: "2",
        };
        return false;
      })
      .mockResolvedValueOnce(true);
    await submit();
    expect(wrapper.get("[role=alert]").text()).toContain("Saved elsewhere");
    expect(
      (wrapper.get("#batch-title").element as HTMLInputElement).value,
    ).toBe("My new title");
    await submit();
    expect(updateTitle).toHaveBeenLastCalledWith("batch", "My new title", "2");
    expect(errors).toEqual([]);
  });

  it("rejects blank input and cancels without writing", async () => {
    const { wrapper, state, updateTitle, submit } = await setup();
    await wrapper.get("#batch-title").setValue("   ");
    await submit();
    expect(wrapper.get("[role=alert]").text()).toBe("l.title.empty");
    await wrapper
      .get('.batch-title-editor button[type="button"]')
      .trigger("click");
    expect(wrapper.get("#saved-batch-title").text()).toBe("Original title");
    expect(state.value.details.batch?.title).toBe("Original title");
    expect(updateTitle).not.toHaveBeenCalled();
  });
});
