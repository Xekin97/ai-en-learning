import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  computed,
  createSSRApp,
  nextTick,
  onBeforeUnmount,
  onMounted,
  readonly,
  ref,
  shallowRef,
  toRef,
  watch,
} from "vue";
import { renderToString } from "vue/server-renderer";

import WordPronunciation from "@presentation/components/WordPronunciation.vue";
import PronunciationIcon from "@presentation/pronunciation/PronunciationIcon.vue";

beforeEach(() => {
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
  vi.stubGlobal("useId", () => "pron-ssr");
  vi.stubGlobal("useSessionStore", () => ({ epoch: ref(0) }));
  vi.stubGlobal("useDesignCopy", () => ({
    copy: (key: string, values: Record<string, string> = {}) =>
      `${key}:${values.word ?? ""}`,
  }));
});

afterEach(() => vi.unstubAllGlobals());

describe("WordPronunciation SSR boundary", () => {
  it("renders one stable idle speaker without reading browser speech state", async () => {
    const app = createSSRApp(WordPronunciation, {
      entry: "harbor",
      surfaceId: "result:one",
    });
    app.component("PronunciationIcon", PronunciationIcon);
    app.config.globalProperties.$t = (key: string) => key;
    const html = await renderToString(app);
    expect(html).toContain("data-pronunciation-action");
    expect(html).toContain('data-play-state="idle"');
    expect(html).toContain("M11 5 6 9H3v6h3l5 4V5Z");
    expect(html).not.toContain("pron-menu-trigger");
    expect(html).not.toContain('role="menu"');
  });
});
