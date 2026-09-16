import { describe, expect, it, vi } from "vitest";
import {
  createAdminDetailActions,
  createAdminDetailState,
} from "@application/admin/user-detail";
import { adminUserEnvelopeSchema } from "@infrastructure/http/schemas/admin";
import { mapAdminUserDetailDto } from "@infrastructure/http/mappers";
import type {
  AdminUserDetailModel,
  AppFailure,
  BatchDetailModel,
} from "@application/shared/models";
import { presentAdminUserDetail } from "@presentation/admin/admin-user-detail-presenter";
import raw from "../contracts/v1.4/user-limited.json";
import en from "../../i18n/locales/en-US.json";
import zh from "../../i18n/locales/zh-CN.json";

function user(id = "A"): AdminUserDetailModel {
  return {
    ...mapAdminUserDetailDto(adminUserEnvelopeSchema.parse(raw).data.user),
    id,
  };
}
const network: AppFailure = {
  kind: "network",
  code: "network_error",
  status: null,
  fields: {},
  requestId: null,
  retryable: true,
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}
function setup() {
  let state = createAdminDetailState(),
    epoch = 1;
  const api = {
    getUser: vi.fn(async (id: string) => user(id)),
    listUserBatches: vi.fn(async () => ({
      items: [],
      nextCursor: null,
      hasMore: false,
    })),
    getUserBatch: vi.fn(
      async (_userId: string, id: string) => ({ id }) as BatchDetailModel,
    ),
    changeUserGroup: vi.fn(
      async (id: string, plan: "basic" | "pro" | "plus") => ({
        user: {
          ...user(id),
          planCode: plan,
          generationQuota: { kind: "unlimited" as const },
        },
        quotaReset: true as const,
      }),
    ),
    resetUserPassword: vi.fn(async () => {}),
  };
  const updateSummary = vi.fn(),
    authenticationRequired = vi.fn();
  const actions = createAdminDetailActions({
    state: () => state,
    replace: (s) => {
      state = s;
    },
    api,
    sessionEpoch: () => epoch,
    refreshSecurity: async () => {},
    authenticationRequired,
    updateSummary,
  });
  return {
    actions,
    api,
    updateSummary,
    authenticationRequired,
    state: () => state,
    logout: () => {
      epoch++;
      state = createAdminDetailState();
    },
  };
}
describe("admin detail lifecycle", () => {
  it("keeps library page info independent of user failure", async () => {
    const h = setup();
    h.api.getUser.mockRejectedValueOnce(network);
    await h.actions.load("A");
    expect(h.state().status).toBe("failed");
    expect(h.state().user).toBeNull();
    expect(h.state().libraryStatus).toBe("ready");
  });
  it("does not accept A after B, including the same batch ID across users", async () => {
    const h = setup(),
      old = deferred<AdminUserDetailModel>();
    h.api.getUser.mockReturnValueOnce(old.promise);
    const pending = h.actions.load("A");
    await h.actions.load("B");
    old.resolve(user("A"));
    await pending;
    expect(h.state().user?.id).toBe("B");
    const oldBatch = deferred<BatchDetailModel>();
    h.api.getUserBatch.mockReturnValueOnce(oldBatch.promise);
    const read = h.actions.readBatch("B", "same");
    await h.actions.load("A");
    await h.actions.readBatch("A", "same");
    oldBatch.resolve({ id: "same", passage: "private-B" } as BatchDetailModel);
    await read;
    expect(h.state().reader).toMatchObject({ kind: "ready", userId: "A" });
    expect(JSON.stringify(h.state().reader)).not.toContain("private-B");
  });
  it.each(["close", "reopen", "logout", "leave"])(
    "ignores late reader result after %s",
    async (mode) => {
      const h = setup();
      await h.actions.load("A");
      const late = deferred<BatchDetailModel>();
      h.api.getUserBatch.mockReturnValueOnce(late.promise);
      const pending = h.actions.readBatch("A", "old");
      if (mode === "logout") h.logout();
      else if (mode === "leave") h.actions.dispose();
      else h.actions.closeReader();
      if (mode === "reopen") await h.actions.readBatch("A", "new");
      late.resolve({ id: "old", passage: "stale" } as BatchDetailModel);
      await pending;
      expect(JSON.stringify(h.state().reader)).not.toContain("stale");
      expect(h.state().reader.kind).toBe(
        mode === "reopen" ? "ready" : "closed",
      );
    },
  );
  it.each(["pro", "plus", "basic"] as const)(
    "replaces the full returned user for %s without reloading",
    async (plan) => {
      const h = setup();
      await h.actions.load("A");
      await h.actions.readBatch("A", "batch");
      const reader = h.state().reader;
      const outcome = await h.actions.changeGroup("A", plan);
      expect(outcome.kind).toBe("applied");
      expect(h.state().user).toMatchObject({
        planCode: plan,
        generationQuota: { kind: "unlimited" },
      });
      expect(h.api.getUser).toHaveBeenCalledTimes(1);
      expect(h.state().reader).toBe(reader);
      expect(h.updateSummary).toHaveBeenCalledTimes(1);
    },
  );
  it("blocks duplicate submission and ignores response after logout", async () => {
    const h = setup();
    await h.actions.load("A");
    const late = deferred<Awaited<ReturnType<typeof h.api.changeUserGroup>>>();
    h.api.changeUserGroup.mockReturnValueOnce(late.promise);
    const pending = h.actions.changeGroup("A", "pro");
    await Promise.resolve();
    expect((await h.actions.changeGroup("A", "pro")).kind).toBe("ignored");
    h.logout();
    late.resolve({
      user: {
        ...user("A"),
        planCode: "pro",
        generationQuota: { kind: "unlimited" },
      },
      quotaReset: true,
    });
    expect((await pending).kind).toBe("ignored");
    expect(h.state().user).toBeNull();
    expect(h.api.changeUserGroup).toHaveBeenCalledTimes(1);
  });
  it("reconciles an uncertain PUT once without claiming success or replaying", async () => {
    const h = setup();
    await h.actions.load("A");
    h.api.changeUserGroup.mockRejectedValueOnce(network);
    h.api.getUser.mockResolvedValueOnce({ ...user("A"), planCode: "pro" });
    expect((await h.actions.changeGroup("A", "pro")).kind).toBe("failed");
    expect(h.state().user?.planCode).toBe("pro");
    expect(h.state().mutationFailure).toEqual(network);
    expect(h.api.changeUserGroup).toHaveBeenCalledTimes(1);
    expect(h.api.getUser).toHaveBeenCalledTimes(2);
    expect(h.updateSummary).not.toHaveBeenCalled();
  });
  it("failed reconciliation retries GET only; explicit refusal keeps old snapshot", async () => {
    const h = setup();
    await h.actions.load("A");
    const old = h.state().user;
    h.api.changeUserGroup.mockRejectedValueOnce({
      ...network,
      kind: "validation",
      status: 422,
    });
    await h.actions.changeGroup("A", "pro");
    expect(h.state().user).toBe(old);
    expect(h.api.getUser).toHaveBeenCalledTimes(1);
    h.api.changeUserGroup.mockRejectedValueOnce(network);
    h.api.getUser.mockRejectedValueOnce(network);
    await h.actions.changeGroup("A", "plus");
    expect(h.state().user).toBeNull();
    expect(h.state().needsReconciliation).toBe(true);
    await h.actions.readUser("A");
    expect(h.api.changeUserGroup).toHaveBeenCalledTimes(2);
    expect(h.state().status).toBe("ready");
  });
  it("marks unavailable uniformly and clears private state on 401", async () => {
    const h = setup();
    await h.actions.load("A");
    for (const kind of ["forbidden", "not_found"]) {
      h.api.getUserBatch.mockRejectedValueOnce({ ...network, kind });
      await h.actions.readBatch("A", "hidden");
      expect(h.state().reader.kind).toBe("unavailable");
    }
    h.api.getUserBatch.mockRejectedValueOnce({
      ...network,
      kind: "authentication_required",
    });
    await h.actions.readBatch("A", "hidden");
    expect(h.state().user).toBeNull();
    expect(h.authenticationRequired).toHaveBeenCalledOnce();
  });
});
describe("detail presenter", () => {
  for (const [locale, messages] of [
    ["en-US", en],
    ["zh-CN", zh],
  ] as const)
    it(
      "projects exact localized quota without changing models: " + locale,
      () => {
        const state = createAdminDetailState();
        state.user = user();
        state.status = "ready";
        const t = (key: string) =>
          key
            .split(".")
            .reduce<unknown>(
              (value, part) => (value as Record<string, unknown>)[part],
              messages,
            ) as string;
        const format = {
          t,
          date: (s: string) => s.slice(0, 10),
          integer: (n: number) => new Intl.NumberFormat(locale).format(n),
          group: (s: string) => s,
          meaning: (s: string) => s,
          scenario: (s: string) => s,
          length: (s: string) => s,
        };
        for (const quota of [
          { kind: "limited", remaining: 0 },
          { kind: "limited", remaining: 2147483647 },
          { kind: "unlimited" },
          { kind: "not_applicable" },
        ] as const) {
          state.user.generationQuota = quota;
          const row = presentAdminUserDetail(state, format).rows[1]!;
          expect(row.label).toBe(locale === "en-US" ? "Available" : "可用次数");
          expect(row.value).toBe(
            quota.kind === "limited"
              ? format.integer(quota.remaining)
              : quota.kind === "unlimited"
                ? locale === "en-US"
                  ? "Unlimited"
                  : "不限"
                : "—",
          );
          expect(state.user.generationQuota).toEqual(quota);
        }
      },
    );
});
