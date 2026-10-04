import type { DraftKey, LocalDraft } from "@application/review/models";
export class DraftConflict extends Error {
  constructor() {
    super("Local draft changed");
  }
}
export class InvalidDraft extends Error {
  constructor() {
    super("Invalid local draft");
  }
}
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("wordweave-review-drafts", 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("drafts");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Draft database blocked"));
  });
}
function valid(value: unknown): value is LocalDraft {
  if (!value || typeof value !== "object") return false;
  const d = value as Partial<LocalDraft>;
  if (
    d.schemaVersion !== 1 ||
    typeof d.serverRevision !== "string" ||
    !Number.isSafeInteger(d.localRevision) ||
    (d.localRevision ?? -1) < 0 ||
    !d.wordInputs ||
    !d.passageInputs ||
    !d.navigation
  )
    return false;
  return (
    Object.keys(d).sort().join(",") ===
      "localRevision,navigation,passageInputs,schemaVersion,serverRevision,wordInputs" &&
    Object.values(d.wordInputs).every(
      (v) => Array.isArray(v) && v.every((x) => typeof x === "string"),
    ) &&
    Object.values(d.passageInputs).every((x) => typeof x === "string") &&
    Object.keys(d.navigation).sort().join(",") ===
      "focus,returnToOverview,stage,step" &&
    ["editing", "overview"].includes(d.navigation.stage) &&
    Number.isSafeInteger(d.navigation.step) &&
    typeof d.navigation.returnToOverview === "boolean" &&
    (d.navigation.focus === null || Number.isSafeInteger(d.navigation.focus))
  );
}
async function transaction<T>(
  mode: IDBTransactionMode,
  run: (
    store: IDBObjectStore,
    set: (value: T) => void,
    fail: (error: unknown) => void,
  ) => void,
): Promise<T> {
  const db = await database();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction("drafts", mode);
    let value: T, error: unknown;
    tx.oncomplete = () => {
      db.close();
      resolve(value);
    };
    tx.onabort = () => {
      db.close();
      reject(error ?? tx.error ?? new Error("Draft transaction aborted"));
    };
    tx.onerror = () => {};
    run(
      tx.objectStore("drafts"),
      (result) => {
        value = result;
      },
      (reason) => {
        error = reason;
        tx.abort();
      },
    );
  });
}
export const reviewDrafts = {
  async read(key: DraftKey): Promise<LocalDraft | null> {
    return transaction("readonly", (store, set, fail) => {
      const request = store.get([...key]);
      request.onsuccess = () => {
        if (request.result === undefined) set(null);
        else if (valid(request.result)) set(request.result);
        else fail(new InvalidDraft());
      };
    });
  },
  async write(
    key: DraftKey,
    draft: LocalDraft,
    expected: number,
  ): Promise<number> {
    return transaction("readwrite", (store, set, fail) => {
      const get = store.get([...key]);
      get.onsuccess = () => {
        const old = get.result;
        if (old !== undefined && !valid(old)) {
          fail(new InvalidDraft());
          return;
        }
        if ((old?.localRevision ?? 0) !== expected) {
          fail(new DraftConflict());
          return;
        }
        const revision = expected + 1;
        store.put({ ...draft, localRevision: revision }, [...key]);
        set(revision);
      };
    });
  },
  async remove(key: DraftKey): Promise<void> {
    await transaction("readwrite", (store, set) => {
      store.delete([...key]);
      set(undefined);
    });
    if (typeof BroadcastChannel !== "undefined") {
      const channel = new BroadcastChannel("wordweave-review-drafts");
      channel.postMessage({ key: [...key], invalid: true });
      channel.close();
    }
  },
  async keys(accountId: string): Promise<DraftKey[]> {
    return transaction("readonly", (store, set) => {
      const get = store.getAllKeys(
        IDBKeyRange.bound([accountId], [accountId, []]),
      );
      get.onsuccess = () =>
        set(
          get.result.filter(
            (key): key is [string, string, string] =>
              Array.isArray(key) &&
              key.length === 3 &&
              key[0] === accountId &&
              key.every((x) => typeof x === "string"),
          ),
        );
    });
  },
  async clearAccount(accountId: string): Promise<void> {
    return transaction("readwrite", (store, set) => {
      store.delete(IDBKeyRange.bound([accountId], [accountId, []]));
      set(undefined);
    });
  },
};
