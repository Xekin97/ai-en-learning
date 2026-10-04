import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ref, computed, readonly } from "vue";
import {
  createNoticeReminderHistory,
  noticeReminderHistoryFor,
} from "@infrastructure/storage/notice-reminders";
import { useNoticesStore } from "@runtime/stores/notices";
import type { NoticeModel } from "@application/notices/models";
const notice = (id: string, once = true): NoticeModel => ({
  id,
  title: id,
  safeBody: "<p>Body</p>",
  contentLocale: "en-US",
  remind: true,
  remindOnce: once,
  publishedAt: "2026-10-01T00:00:00Z",
  revision: "1",
});
let app: object;
let session: {
  epoch: ReturnType<typeof ref<number>>;
  actor: ReturnType<typeof ref<{ kind: "account"; id: string }>>;
};
let items: NoticeModel[];
let api: {
  listNotices: ReturnType<typeof vi.fn>;
  getNotice: ReturnType<typeof vi.fn>;
};
beforeEach(() => {
  localStorage.clear();
  items = [notice("one"), notice("two"), notice("repeat", false)];
  api = {
    listNotices: vi.fn(async () => ({
      items,
      nextCursor: null,
      hasMore: false,
    })),
    getNotice: vi.fn(async (id: string) => items.find((n) => n.id === id)!),
  };
  app = { $api: api };
  session = { epoch: ref(0), actor: ref({ kind: "account", id: "A" }) };
  vi.stubGlobal("useNuxtApp", () => app);
  vi.stubGlobal("useSessionStore", () => session);
  vi.stubGlobal("usePrivateState", (_key: string, initial: () => unknown) =>
    ref(initial()),
  );
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("readonly", readonly);
});
afterEach(() => vi.unstubAllGlobals());
describe("browser-local notice reminders", () => {
  it("persists by account and message, independent of revision, and respects site-data removal", () => {
    const a = createNoticeReminderHistory(() => localStorage);
    a.mark("A", "one");
    const b = createNoticeReminderHistory(() => localStorage);
    expect(b.has("A", "one")).toBe(true);
    expect(b.has("B", "one")).toBe(false);
    expect(b.has("A", "two")).toBe(false);
    localStorage.clear();
    expect(b.has("A", "one")).toBe(false);
  });
  it("does not collide for identifiers containing delimiters", () => {
    const h = createNoticeReminderHistory(() => localStorage);
    h.mark("a:b", "c");
    expect(h.has("a", "b:c")).toBe(false);
  });
  it("uses page-local fallback when storage access or writes fail", () => {
    for (const getter of [
      () => {
        throw Error("blocked");
      },
      () => ({
        getItem: () => null,
        setItem: () => {
          throw Error("quota");
        },
      }),
    ]) {
      const h = createNoticeReminderHistory(getter);
      expect(() => h.mark("A", "one")).not.toThrow();
      expect(h.has("A", "one")).toBe(true);
      expect(h.has("B", "one")).toBe(false);
    }
  });
  it("records only displayed automatic messages; an early close leaves unseen items eligible", async () => {
    const s = useNoticesStore();
    await s.load(false, true);
    expect(localStorage.length).toBe(0);
    s.markDisplayed("two");
    expect(localStorage.length).toBe(0);
    s.markDisplayed("one");
    s.close();
    await s.load(false, true);
    expect(s.state.value.dialog.map((n) => n.id)).toEqual(["two", "repeat"]);
  });
  it("does not consume manual reading and keeps once messages in the normal list", async () => {
    const s = useNoticesStore();
    await s.open("one");
    s.markDisplayed("one");
    s.close();
    await s.load();
    expect(s.state.value.items).toHaveLength(3);
    expect(localStorage.length).toBe(0);
    await s.load(false, true);
    expect(s.selected.value?.id).toBe("one");
  });
  it("keeps the current queue on language refresh, but filters again on the next login", async () => {
    const s = useNoticesStore();
    await s.load(false, true);
    s.markDisplayed("one");
    await s.move(1);
    s.markDisplayed("two");
    await s.load(false, true, true);
    expect(s.state.value.dialog).toHaveLength(3);
    expect(s.selected.value?.id).toBe("two");
    await s.move(-1);
    expect(s.selected.value?.id).toBe("one");
    s.close();
    await s.load(false, true);
    expect(s.state.value.dialog.map((n) => n.id)).toEqual(["repeat"]);
  });
  it("keeps A history on account changes without suppressing B", async () => {
    const s = useNoticesStore();
    await s.load(false, true);
    s.markDisplayed("one");
    s.close();
    session.actor.value = { kind: "account", id: "B" };
    session.epoch.value++;
    await s.load(false, true);
    expect(s.selected.value?.id).toBe("one");
    s.markDisplayed("one");
    s.close();
    session.actor.value = { kind: "account", id: "A" };
    session.epoch.value++;
    await s.load(false, true);
    expect(s.selected.value?.id).toBe("two");
  });
  it("a disabled once setting repeats, re-enabling retains history, content edits do not reset it", async () => {
    const s = useNoticesStore();
    await s.load(false, true);
    s.markDisplayed("one");
    s.close();
    items[0] = { ...items[0]!, remindOnce: false };
    await s.load(false, true);
    expect(s.selected.value?.id).toBe("one");
    s.close();
    items[0] = {
      ...items[0]!,
      remindOnce: true,
      revision: "2",
      title: "Edited",
    };
    await s.load(false, true);
    expect(s.selected.value?.id).toBe("two");
  });
  it("rejects an old-account response without writing any local records", async () => {
    let release!: () => void;
    api.listNotices.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ items, nextCursor: null, hasMore: false });
        }),
    );
    const s = useNoticesStore();
    const pending = s.load(false, true);
    session.epoch.value++;
    session.actor.value = { kind: "account", id: "B" };
    release();
    await pending;
    expect(s.state.value.open).toBe(false);
    expect(localStorage.length).toBe(0);
  });
  it("does not share in-memory fallback between Nuxt instances", () => {
    expect(noticeReminderHistoryFor(app)).toBe(noticeReminderHistoryFor(app));
    expect(noticeReminderHistoryFor({})).not.toBe(
      noticeReminderHistoryFor(app),
    );
  });
  it("closing during a language reload does not reopen or consume another reminder", async () => {
    const s = useNoticesStore();
    await s.load(false, true);
    s.markDisplayed("one");
    let release!: () => void;
    api.listNotices.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ items, nextCursor: null, hasMore: false });
        }),
    );
    const pending = s.load(false, true, true);
    s.close();
    release();
    await pending;
    expect(s.state.value.open).toBe(false);
    expect(s.state.value.dialog).toEqual([]);
    expect(localStorage.length).toBe(1);
  });
});
