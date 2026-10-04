import { afterEach, describe, expect, it, vi } from "vitest";
import { readonly, ref } from "vue";
import { useAdminStore } from "@runtime/stores/admin";
import { resetPrivateStates } from "@runtime/session/private-state";
import type { AdminModelModel } from "@application/shared/models";

const model = (id: string): AdminModelModel => ({
  id,
  revision: "r1",
  displayName: id,
  description: null,
  providerModelId: "local/" + id,
  connection: {
    id: "c",
    name: "Provider",
    protocol: "openai_chat",
    baseUrl: "https://example.com/v1",
    credentialConfigured: true,
    maskedHint: "••••test",
  },
  outputMode: "prompt",
  maxOutputTokens: null,
  enabled: false,
  retiredAt: "2026-09-21T00:00:00Z",
  assignedGroupCodes: [],
  createdAt: "2026-09-20T00:00:00Z",
  updatedAt: "2026-09-21T00:00:00Z",
});
const page = (ids: string[], nextCursor: string | null = null) => ({
  items: ids.map(model),
  nextCursor,
  hasMore: nextCursor !== null,
});
function harness() {
  const api = {
    listModelConnections: vi.fn().mockResolvedValue([]),
    listModels: vi.fn().mockResolvedValue(page(["a"], "page2")),
  };
  const app = { $api: api },
    epoch = ref(0);
  vi.stubGlobal("useNuxtApp", () => app);
  vi.stubGlobal("useState", (_key: string, initial: () => unknown) =>
    ref(initial()),
  );
  vi.stubGlobal("readonly", readonly);
  vi.stubGlobal("useSessionStore", () => ({ epoch, invalidate: vi.fn() }));
  vi.stubGlobal("useFeedbackStore", () => ({ show: vi.fn() }));
  return { api, app, epoch, store: useAdminStore() };
}
afterEach(() => vi.unstubAllGlobals());

describe("existing model references across catalog pages", () => {
  it("loads only through the required page, retains retired identities, and deduplicates overlaps", async () => {
    const { store, api } = harness();
    await store.loadModels();
    api.listModels.mockResolvedValueOnce(page(["a", "b"], "page3"));
    api.listModels.mockResolvedValueOnce(page(["x"], "page4"));
    await store.ensureModels(["a", "x"]);
    expect(store.state.value.models.map((m) => m.id)).toEqual(["a", "b", "x"]);
    expect(store.state.value.models[2]?.retiredAt).not.toBeNull();
    expect(api.listModels.mock.calls.map((c) => c[0])).toEqual([
      undefined,
      "page2",
      "page3",
    ]);
    expect(store.state.value.nextModelCursor).toBe("page4");
    await store.ensureModels(["x"]);
    expect(api.listModels).toHaveBeenCalledTimes(3);
  });
  it("preserves partial progress on failure and retries the failed page", async () => {
    const { store, api } = harness();
    await store.loadModels();
    api.listModels.mockResolvedValueOnce(page(["b"], "page3"));
    api.listModels.mockRejectedValueOnce(new Error("offline"));
    await store.ensureModels(["x"]);
    expect(store.state.value.status).toBe("failed");
    expect(store.state.value.models.map((m) => m.id)).toEqual(["a", "b"]);
    expect(store.state.value.nextModelCursor).toBe("page3");
    api.listModels.mockResolvedValueOnce(page(["x"]));
    await store.ensureModels(["x"]);
    expect(api.listModels).toHaveBeenLastCalledWith("page3");
    expect(store.state.value.status).toBe("ready");
    expect(store.state.value.failure).toBeNull();
  });
  it("reports an absent reference without inventing an option or clearing loaded models", async () => {
    const { store, api } = harness();
    api.listModels.mockResolvedValue(page(["a"]));
    await store.loadModels();
    await store.ensureModels(["missing"]);
    expect(store.state.value.status).toBe("failed");
    expect(store.state.value.models.map((m) => m.id)).toEqual(["a"]);
    expect(api.listModels).toHaveBeenCalledTimes(2);
  });
  it("stops a repeated cursor instead of requesting an endless catalog", async () => {
    const { store, api } = harness();
    await store.loadModels();
    api.listModels.mockResolvedValueOnce(page(["b"], "page2"));
    await store.ensureModels(["x"]);
    expect(store.state.value.status).toBe("failed");
    expect(api.listModels).toHaveBeenCalledTimes(2);
  });
  it.each([
    {
      kind: "conflict",
      code: "revision_conflict",
      status: 409,
      fields: {},
      retryable: false,
    },
    {
      kind: "validation",
      code: "validation_failed",
      status: 422,
      fields: { cursor: "invalid" },
      retryable: false,
    },
  ])(
    "restarts a stale catalog cursor (%j) once and loads references",
    async (failure) => {
      const { store, api } = harness();
      await store.loadModels();
      api.listModels.mockRejectedValueOnce(failure);
      api.listModels.mockResolvedValueOnce(page(["a"], "fresh2"));
      api.listModels.mockResolvedValueOnce(page(["x"]));
      await store.ensureModels(["x"]);
      expect(api.listModels.mock.calls.map((c) => c[0])).toEqual([
        undefined,
        "page2",
        undefined,
        "fresh2",
      ]);
      expect(store.state.value.models.map((m) => m.id)).toEqual(["a", "x"]);
      expect(store.state.value.status).toBe("ready");
    },
  );
  it("reports a second invalid cursor instead of endlessly restarting", async () => {
    const { store, api } = harness();
    await store.loadModels();
    const failure = {
      kind: "validation",
      code: "validation_failed",
      status: 422,
      fields: { cursor: "invalid" },
      retryable: false,
    };
    api.listModels.mockRejectedValueOnce(failure);
    api.listModels.mockResolvedValueOnce(page(["a"], "fresh2"));
    api.listModels.mockRejectedValueOnce(failure);
    await store.ensureModels(["x"]);
    expect(api.listModels).toHaveBeenCalledTimes(4);
    expect(store.state.value.status).toBe("failed");
  });
  it("refreshes an exhausted catalog when a conflict introduces a new reference", async () => {
    const { store, api } = harness();
    api.listModels.mockResolvedValueOnce(page(["a"]));
    await store.loadModels();
    api.listModels.mockResolvedValueOnce(page(["a", "x"]));
    await store.ensureModels(["x"]);
    expect(api.listModels).toHaveBeenLastCalledWith(undefined);
    expect(store.state.value.models.map((m) => m.id)).toEqual(["a", "x"]);
    expect(store.state.value.status).toBe("ready");
  });
  it("does not apply a late page after session invalidation", async () => {
    const { store, api, epoch, app } = harness();
    await store.loadModels();
    let resolve!: (value: ReturnType<typeof page>) => void;
    api.listModels.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const pending = store.ensureModels(["x"]);
    epoch.value++;
    resetPrivateStates(app);
    resolve(page(["x"]));
    await pending;
    expect(store.state.value.models).toEqual([]);
    expect(store.state.value.status).toBe("idle");
  });
  it("does not apply a superseded catalog request", async () => {
    const { store, api } = harness();
    await store.loadModels();
    let resolve!: (value: ReturnType<typeof page>) => void;
    api.listModels.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const pending = store.ensureModels(["x"]);
    api.listModels.mockResolvedValueOnce(page(["fresh"]));
    await store.loadModels();
    resolve(page(["x"]));
    await pending;
    expect(store.state.value.models.map((m) => m.id)).toEqual(["fresh"]);
    expect(store.state.value.status).toBe("ready");
  });
});
