import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import {
  computed,
  defineComponent,
  h,
  nextTick,
  ref,
  Suspense,
  watch,
} from "vue";
import GrowthPage from "../../app/pages/account/growth.vue";
import AchievementCard from "@presentation/components/AchievementCard.vue";
import type {
  AchievementModel,
  LevelAwardModel,
} from "@application/growth/models";

const reward = { points: "5", experience: "10", item: null };
const award = (id: string) => ({
  id,
  state: "claimable" as const,
  blockReason: null,
  achievedAt: "2026-09-20T00:00:00Z",
  claimedAt: null,
  reward,
  settlementId: null,
});
const achievement = (
  id: string,
  kind: AchievementModel["kind"],
): AchievementModel => ({
  ...award(id),
  tierId: id,
  kind,
  name: id,
  title: id,
  descriptionText: null,
  threshold: 2,
  progress: 4,
});
const makeState = () => ({
  growth: {
    learningDay: "2026-09-20",
    points: "10",
    experience: "120",
    level: { number: 2, minExperience: "100" },
    nextLevel: null,
    masteredTotal: 4,
    savedTotal: 2,
    checkin: { signedToday: true },
  },
  achievements: [
    achievement("tier-1", "saved_passages"),
    achievement("tier-2", "saved_passages"),
    achievement("words-1", "mastered_words"),
  ],
  levels: [
    {
      ...award("level-award"),
      levelId: "lv2",
      levelNumber: 2,
      minExperience: "100",
    },
  ] as LevelAwardModel[],
  calendar: { days: [] },
  pending: false,
  claiming: null as string | null,
  failure: null as { code: string } | null,
});
let state: ReturnType<typeof ref<ReturnType<typeof makeState>>>;
let wrapper: VueWrapper;
let complete: () => void;
let fail: boolean;
const claim = vi.fn(async (kind: string, id: string) => {
  state.value.claiming = id;
  await new Promise<void>((resolve) => {
    complete = resolve;
  });
  if (fail) state.value.failure = { code: "unavailable" };
  else if (kind === "achievement") {
    state.value.achievements = state.value.achievements.map((a) =>
      a.tierId === id ? { ...a, state: "claimed" } : { ...a },
    );
  } else {
    state.value.levels = state.value.levels.map((a) =>
      a.levelId === id ? { ...a, state: "claimed" } : { ...a },
    );
  }
  state.value.claiming = null;
});
beforeEach(async () => {
  state = ref(makeState());
  fail = false;
  claim.mockClear();
  for (const [name, fn] of Object.entries({ computed, nextTick, ref, watch }))
    vi.stubGlobal(name, fn);
  vi.stubGlobal("definePageMeta", vi.fn());
  vi.stubGlobal("useSessionStore", () => ({ isLearner: ref(false) }));
  vi.stubGlobal("useDesignCopy", () => ({ copy: (key: string) => key }));
  vi.stubGlobal("useI18n", () => ({ locale: ref("en-US") }));
  vi.stubGlobal("useGrowthStore", () => ({ state, claim, load: vi.fn() }));
  wrapper = mount(
    defineComponent({
      setup: () => () => h(Suspense, null, { default: () => h(GrowthPage) }),
    }),
    {
      attachTo: document.body,
      global: {
        components: { AchievementCard },
        stubs: {
          AccountPage: { template: "<div><slot /></div>" },
          AppIcon: true,
          AppError: true,
          NuxtLink: true,
        },
      },
    },
  );
  await flushPromises();
});
afterEach(() => {
  wrapper.unmount();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});
const group = () => wrapper.get('[data-achievement-group="saved_passages"]');
async function finish() {
  complete();
  await flushPromises();
  await nextTick();
}

describe("reward claim focus after the refreshed view", () => {
  it("advances the current achievement and keeps its expanded group with focus on summary", async () => {
    (group().get("details").element as HTMLDetailsElement).open = true;
    await group().get(".achievement button").trigger("click");
    expect(claim).toHaveBeenCalledWith("achievement", "tier-1");
    await finish();
    expect(group().get(".achievement h3").text()).toBe("tier-2");
    expect((group().get("details").element as HTMLDetailsElement).open).toBe(
      true,
    );
    expect(document.activeElement).toBe(group().get("summary").element);
  });
  it("returns a claim from the expanded tier list to the same group, not another achievement", async () => {
    (group().get("details").element as HTMLDetailsElement).open = true;
    await group().get("details .achievement button").trigger("click");
    expect(claim).toHaveBeenCalledWith("achievement", "tier-2");
    await finish();
    expect(document.activeElement).toBe(group().get("summary").element);
    expect(group().get(".achievement h3").text()).toBe("tier-1");
  });
  it("returns level reward focus to the matching heading without adding a tab stop", async () => {
    await wrapper.get(".level-reward button").trigger("click");
    await finish();
    const heading = wrapper.get(".level-reward h3").element as HTMLElement;
    expect(document.activeElement).toBe(heading);
    expect(heading.tabIndex).toBe(-1);
  });
  it("does not treat a failed claim as success or move focus to the success target", async () => {
    fail = true;
    await group().get(".achievement button").trigger("click");
    await finish();
    expect(group().get(".achievement h3").text()).toBe("tier-1");
    expect(document.activeElement).not.toBe(group().get("summary").element);
    expect(state.value.failure?.code).toBe("unavailable");
  });
});
