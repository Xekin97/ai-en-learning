import { noticeReminderHistoryFor } from "@infrastructure/storage/notice-reminders";
import type { NoticeModel } from "@application/notices/models";
import type { AppFailure } from "@application/shared/models";
import { normalizeFailure } from "@application/shared/failure";
export function useNoticesStore() {
  const api = useNuxtApp().$api,
    session = useSessionStore();
  const history = noticeReminderHistoryFor(useNuxtApp());
  const state = usePrivateState("notices", () => ({
    items: [] as NoticeModel[],
    nextCursor: null as string | null,
    pending: false,
    failure: null as AppFailure | null,
    dialog: [] as NoticeModel[],
    index: 0,
    open: false,
    reminders: false,
    request: 0,
    dialogRequest: 0,
  }));
  async function load(more = false, reminders = false, preserveQueue = false) {
    const epoch = session.epoch.value,
      request = ++state.value.request;
    const selectedId = state.value.dialog[state.value.index]?.id;
    const account = session.actor.value;
    const retained = new Set(
      preserveQueue && state.value.open && state.value.reminders
        ? state.value.dialog.map((n) => n.id)
        : [],
    );
    state.value.pending = true;
    state.value.failure = null;
    try {
      let cursor = more ? state.value.nextCursor : null;
      const items: NoticeModel[] = more ? [...state.value.items] : [];
      do {
        const page = await api.listNotices({
          remindersOnly: reminders,
          ...(cursor ? { cursor } : {}),
        });
        if (epoch !== session.epoch.value || request !== state.value.request)
          return;
        items.push(...page.items);
        cursor = page.nextCursor;
      } while (reminders && cursor);
      if (reminders) {
        const eligible = items.filter(
          (n) =>
            !n.remindOnce ||
            retained.has(n.id) ||
            (account?.kind === "account" && !history.has(account.id, n.id)),
        );
        state.value.dialog = eligible;
        state.value.index = Math.max(
          0,
          eligible.findIndex((item) => item.id === selectedId),
        );
        state.value.open = eligible.length > 0;
        state.value.reminders = true;
      } else {
        state.value.items = items;
        state.value.nextCursor = cursor;
      }
    } catch (error) {
      if (epoch === session.epoch.value && request === state.value.request)
        state.value.failure = normalizeFailure(error);
    } finally {
      if (epoch === session.epoch.value && request === state.value.request)
        state.value.pending = false;
    }
  }
  async function open(id: string) {
    const epoch = session.epoch.value,
      request = ++state.value.dialogRequest;
    try {
      const notice = await api.getNotice(id);
      if (
        epoch !== session.epoch.value ||
        request !== state.value.dialogRequest
      )
        return;
      state.value.dialog = [notice];
      state.value.index = 0;
      state.value.open = true;
      state.value.reminders = false;
    } catch (error) {
      if (
        epoch === session.epoch.value &&
        request === state.value.dialogRequest
      )
        state.value.failure = normalizeFailure(error);
    }
  }
  async function move(delta: number) {
    const targetIndex = state.value.index + delta;
    const target = state.value.dialog[targetIndex];
    if (!target) return;
    const epoch = session.epoch.value,
      request = ++state.value.dialogRequest;
    try {
      const item = await api.getNotice(target.id);
      if (
        epoch !== session.epoch.value ||
        request !== state.value.dialogRequest
      )
        return;
      state.value.dialog[targetIndex] = item;
      state.value.index = targetIndex;
    } catch (error) {
      if (
        epoch !== session.epoch.value ||
        request !== state.value.dialogRequest
      )
        return;
      const failure = normalizeFailure(error);
      if (failure.kind === "not_found") {
        state.value.dialog = state.value.dialog.filter(
          (item) => item.id !== target.id,
        );
        state.value.index = Math.min(
          state.value.index,
          state.value.dialog.length - 1,
        );
        state.value.open = state.value.dialog.length > 0;
      } else state.value.failure = failure;
    }
  }
  function markDisplayed(id: string | undefined) {
    const item = state.value.dialog[state.value.index];
    const account = session.actor.value;
    if (
      state.value.open &&
      state.value.reminders &&
      item &&
      item.id === id &&
      item.remindOnce &&
      account?.kind === "account"
    )
      history.mark(account.id, item.id);
  }
  function close() {
    if (state.value.reminders) {
      state.value.request++;
      state.value.pending = false;
    }
    state.value.dialogRequest++;
    state.value.open = false;
    state.value.dialog = [];
  }
  return {
    state: readonly(state),
    selected: computed(() => state.value.dialog[state.value.index] ?? null),
    load,
    markDisplayed,
    open,
    move,
    close,
  };
}
