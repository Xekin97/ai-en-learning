type ReminderStorage = Pick<Storage, "getItem" | "setItem">;
export function createNoticeReminderHistory(
  storage: () => ReminderStorage | null,
) {
  const fallback = new Set<string>();
  const key = (account: string, notice: string) =>
    `wordweave.notice-once.v1:${encodeURIComponent(account)}:${encodeURIComponent(notice)}`;
  return {
    has(account: string, notice: string): boolean {
      const id = key(account, notice);
      if (fallback.has(id)) return true;
      try {
        return storage()?.getItem(id) === "1";
      } catch {
        return false;
      }
    },
    mark(account: string, notice: string) {
      const id = key(account, notice);
      try {
        const target = storage();
        if (target) {
          target.setItem(id, "1");
          return;
        }
      } catch {
        /* Blocked storage must not interrupt authentication or reading. */
      }
      fallback.add(id);
    },
  };
}
const histories = new WeakMap<
  object,
  ReturnType<typeof createNoticeReminderHistory>
>();
export function noticeReminderHistoryFor(app: object) {
  let history = histories.get(app);
  if (!history) {
    history = createNoticeReminderHistory(() =>
      typeof window === "undefined" ? null : window.localStorage,
    );
    histories.set(app, history);
  }
  return history;
}
