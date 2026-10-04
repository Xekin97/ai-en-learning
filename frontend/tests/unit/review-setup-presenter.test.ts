import { afterEach, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { ref } from "vue";
import { createReviewSetupState } from "@application/review/range-setup";
import { presentReviewSetup } from "@presentation/review/review-setup-presenter";
import ReviewRangeSetup from "@presentation/components/review/ReviewRangeSetup.vue";
import en from "../../i18n/locales/en-US.json";
import zh from "../../i18n/locales/zh-CN.json";

function translate(messages: object) {
  return (key: string, parameters: Record<string, string | number> = {}) => {
    let value: unknown = messages;
    for (const part of key.split(".")) {
      if (typeof value !== "object" || value === null || !(part in value))
        throw new Error(key);
      value = Reflect.get(value, part);
    }
    if (typeof value !== "string") throw new Error(key);
    return value.replace(/\{(\w+)\}/g, (_, name: string) =>
      String(parameters[name] ?? ""),
    );
  };
}
afterEach(() => vi.unstubAllGlobals());

it.each([en, zh])(
  "presents unknown, errors and exact dedicated messages",
  (messages) => {
    const t = translate(messages),
      state = createReviewSetupState();
    let view = presentReviewSetup(state, true, t);
    expect(view.count).toBe("—");
    expect(view.loading).toBe(true);
    expect(view.canStart).toBe(false);
    expect(view.fieldError).toBe("");
    state.draft = {
      startDate: "2026-09-06",
      endDate: "2026-09-06",
      timezone: "UTC",
      initialized: true,
    };
    state.preview = {
      kind: "ready",
      query: {
        startDate: "2026-09-06",
        endDate: "2026-09-06",
        timezone: "UTC",
      },
      result: { batchCount: 1, entryCount: 1, empty: false },
    };
    view = presentReviewSetup(state, true, t);
    expect(view.countHint).toBe(messages === en ? "1 word" : "1 个词语");
    expect(view.start).toBe(messages === en ? "Review" : "开始复习");
    expect(view.announcement).toBe(
      messages === en ? "1 story ready to review." : "1 篇短文可供复习。",
    );
    expect(view.library).toBe(
      messages === en ? "View library" : "查看学习记录",
    );
    expect(presentReviewSetup(state, false, t).canStart).toBe(false);
    state.preview = {
      kind: "empty",
      query: state.preview.query,
      result: { batchCount: 0, entryCount: 0, empty: true },
    };
    view = presentReviewSetup(state, true, t);
    expect(view.empty).toBe(true);
    expect(view.count).toBe("0");
    expect(view.canStart).toBe(false);
    expect(view.countHint).toBe(messages === en ? "0 words" : "0 个词语");
    state.preview = {
      kind: "invalid",
      issue: { kind: "reversed", startInvalid: false, endInvalid: true },
    };
    view = presentReviewSetup(state, true, t);
    expect(view.count).toBe("—");
    expect(view.endInvalid).toBe(true);
    expect(view.startInvalid).toBe(false);
    expect(view.fieldError).toBe(messages.review.range.reversed);
  },
);
it("reader uses its own approved retry without changing generic actions", () => {
  expect(zh.reader.retry).toBe("重试");
  expect(zh.common.retry).toBe("再试一次");
  expect(en.reader.retry).toBe("Try again");
});
it("preserves input nodes and focus while rendering every preview state and locale", async () => {
  vi.stubGlobal("useDesignCopy", () => ({ copy: (key: string) => key }));
  vi.stubGlobal("ref", ref);
  const state = createReviewSetupState();
  state.draft = {
    startDate: "2026-08-31",
    endDate: "2026-09-06",
    timezone: "UTC",
    initialized: true,
  };
  const wrapper = mount(ReviewRangeSetup, {
    attachTo: document.body,
    props: { view: presentReviewSetup(state, true, translate(en)) },
    global: {
      stubs: {
        AppIcon: true,
        AppError: true,
        NuxtLink: { template: "<a><slot /></a>" },
      },
    },
  });
  try {
    const first = wrapper.get(".date-fields label:first-child input").element;
    if (!(first instanceof HTMLInputElement)) throw new Error("input");
    first.focus();
    for (const kind of ["empty", "ready"] as const) {
      state.preview = {
        kind,
        query: {
          startDate: state.draft.startDate,
          endDate: state.draft.endDate,
          timezone: "UTC",
        },
        result: {
          batchCount: kind === "empty" ? 0 : 2,
          entryCount: kind === "empty" ? 0 : 6,
          empty: kind === "empty",
        },
      };
      await wrapper.setProps({
        view: presentReviewSetup(state, true, translate(en)),
      });
      expect(wrapper.get(".date-fields label:first-child input").element).toBe(
        first,
      );
      expect(document.activeElement).toBe(first);
      expect(
        wrapper
          .get(".date-fields label:last-child input")
          .attributes("required"),
      ).toBeDefined();
    }
    state.preview = {
      kind: "invalid",
      issue: { kind: "missing", startInvalid: true, endInvalid: false },
    };
    await wrapper.setProps({
      view: presentReviewSetup(state, true, translate(zh)),
    });
    expect(wrapper.get(".date-fields label:first-child input").element).toBe(
      first,
    );
    expect(
      wrapper
        .get(".date-fields label:first-child input")
        .attributes("aria-describedby"),
    ).toBe("range-error");
    expect(
      wrapper
        .get(".date-fields label:last-child input")
        .attributes("aria-describedby"),
    ).toBe("range-error");
    expect(wrapper.get("#range-error").text()).toBe("l.dateerror");
    expect(
      wrapper.get('button[type="submit"]').attributes("disabled"),
    ).toBeDefined();
    await wrapper.get(".date-fields label:first-child input").setValue("");
    expect(wrapper.emitted("changeStart")?.at(-1)).toEqual([""]);
  } finally {
    wrapper.unmount();
  }
});
