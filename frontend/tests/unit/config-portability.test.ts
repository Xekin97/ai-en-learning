import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computed, readonly, ref } from "vue";
import { validPortabilityPassphrase } from "@application/admin/config-portability";
import {
  portabilityCurrentEnvelopeSchema,
  portabilityPreviewEnvelopeSchema,
  portabilityResultEnvelopeSchema,
} from "@infrastructure/http/schemas/config-portability";
import { mapPortabilityPreview } from "@infrastructure/http/mappers/config-portability-mapper";
import { createConfigPortabilityRepository } from "@infrastructure/http/repositories/config-portability-repository";
import { TokenVault } from "@runtime/session/token-vault";
import {
  clearAllPortabilityRecovery,
  clearPortabilityRecovery,
  readPortabilityRecovery,
  savePortabilityRecovery,
} from "@runtime/session/config-portability-recovery";
import {
  formatPortabilityValue,
  presentNotice,
} from "@presentation/admin/config-portability-presenter";
import { useConfigPortabilityStore } from "@runtime/stores/config-portability";

const operationId = "00000000-0000-4000-8000-000000000001";
const connectionId = "00000000-0000-4000-8000-000000000002";
const createdAt = "2099-10-16T00:00:00Z";
const commitNotAfter = "2099-10-16T00:05:00Z";
const retainUntil = "2099-10-17T00:05:00Z";
const counts = { added: 0, updated: 1, removed: 0, unchanged: 0 };
const effects = {
  base_users: 0,
  active_trial_users: 0,
  model_card_instances: 0,
  achieved_awards: 0,
  claimed_awards: 0,
  may_change_effective_plan: false,
  may_downgrade: false,
  usage_reset: false,
  trial_dates_changed: false,
  history_preserved: true,
  in_flight_policy: "accepted_snapshot",
  checkin_source: null,
  target_learning_day: null,
  checkin_effective_day: null,
  mastery_applies: null,
};
const change = {
  action: "updated",
  kind: "connection",
  identity: connectionId,
  label: "Synthetic connection",
  fields: [{ field: "/name", before: "Old", after: "New" }],
  credential_action: "replace_from_package",
};
const preview = () => ({
  category: "models",
  schema_version: 1,
  can_commit: true,
  operation_id: operationId,
  preview_token: "opaque-token",
  baseline_revision: "opaque-revision",
  created_at: createdAt,
  commit_not_after: commitNotAfter,
  retain_until: retainUntil,
  counts,
  changes: [change],
  blockers: [],
  effects,
  warnings: [
    {
      code: "future_notice",
      item_ref: { kind: "connection", identity: connectionId },
      field: "/name",
    },
  ],
  defaults_applied: [
    {
      code: "name_generated",
      item_ref: { kind: "connection", identity: connectionId },
      field: "/name",
    },
  ],
});
const envelope = (data: unknown) => ({
  data,
  meta: { request_id: "fixture-request" },
});
const previewModel = () =>
  mapPortabilityPreview(
    portabilityPreviewEnvelopeSchema.parse(envelope(preview())).data,
  );
const appliedResult = (superseded = false) => ({
  operationId,
  category: "models" as const,
  status: "applied" as const,
  reasonCode: null,
  baselineRevision: "r1",
  resultRevision: "r2",
  currentRevision: superseded ? "r3" : "r2",
  superseded,
  counts,
  effectiveDay: null,
  resolvedAt: commitNotAfter,
  commitNotAfter,
  retainUntil,
});
const portabilityFailure = (status: number, code: string, retry = null) => ({
  kind: "portability_failure" as const,
  code,
  status,
  requestId: "fixture-request",
  fieldIssues: [],
  items: [],
  errorsTruncated: false,
  outcome: code === "outcome_unknown" ? ("unknown" as const) : null,
  retryAfterSeconds: retry as number | null,
});
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => (resolve = accept));
  return { promise, resolve };
};

function storeHarness(overrides: Record<string, unknown> = {}) {
  const api = {
    previewConfiguration: vi.fn(async () => previewModel()),
    importConfiguration: vi.fn(async () => appliedResult()),
    resolveConfigurationOperation: vi.fn(async () => appliedResult()),
    getCurrentConfiguration: vi.fn(),
    exportConfiguration: vi.fn(),
    ...overrides,
  };
  const app = { $api: api };
  const actor = ref({
    kind: "account" as const,
    id: "admin-fixture",
    username: "admin",
    role: "admin" as const,
    planCode: null,
  });
  const epoch = ref(1);
  const refreshSecurityContext = vi.fn(async () => {});
  const states = new Map<string, ReturnType<typeof ref>>();
  vi.stubGlobal("useNuxtApp", () => app);
  vi.stubGlobal("useSessionStore", () => ({
    actor,
    epoch,
    refreshSecurityContext,
  }));
  vi.stubGlobal("useState", (key: string, initial: () => unknown) => {
    if (!states.has(key)) states.set(key, ref(initial()));
    return states.get(key);
  });
  vi.stubGlobal("ref", ref);
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("readonly", readonly);
  return {
    api,
    epoch,
    refreshSecurityContext,
    store: useConfigPortabilityStore(),
  };
}

async function readyEncryptedImport(harness: ReturnType<typeof storeHarness>) {
  harness.store.open("models");
  await harness.store.selectFile(
    new File(
      [
        JSON.stringify({
          format: "wordweave-config-encrypted",
          version: 1,
          category: "models",
          credential_mode: "encrypted",
          kdf: {},
          cipher: {},
          ciphertext: "synthetic",
        }),
      ],
      "synthetic-models.wwcfg.json",
      { type: "application/json" },
    ),
  );
  harness.store.setPassphrase("synthetic password");
  await harness.store.preview();
  harness.store.beginConfirm();
  harness.store.setAcknowledged(true);
}

afterEach(() => vi.unstubAllGlobals());

describe("CR313 portability contracts", () => {
  it("keeps false, zero, null and empty collections distinct", () => {
    const parsed = portabilityCurrentEnvelopeSchema.parse(
      envelope({
        category: "plans",
        revision: "r",
        read_at: createdAt,
        configuration: {
          plans: ["visitor", "basic", "pro", "plus"].map((code, index) => ({
            code,
            priority: index === 0 ? 0 : index * 10,
            rolling_24h_limit: index === 3 ? null : 0,
            max_entries: 1,
            allowed_lengths: [],
            model_ids: [],
            content_review_enabled: false,
            content_repair_limit: 0,
          })),
        },
      }),
    );
    const plans =
      "plans" in parsed.data.configuration
        ? parsed.data.configuration.plans
        : [];
    expect(plans[0]).toMatchObject({
      priority: 0,
      rolling_24h_limit: 0,
      content_review_enabled: false,
      allowed_lengths: [],
    });
    expect(plans[3]?.rolling_24h_limit).toBeNull();
  });

  it("rejects contradictory tickets and invalid B1 references", () => {
    expect(
      portabilityPreviewEnvelopeSchema.safeParse(
        envelope({ ...preview(), can_commit: false }),
      ).success,
    ).toBe(false);
    const missing = preview();
    missing.warnings[0]!.item_ref!.identity =
      "00000000-0000-4000-8000-000000000099";
    expect(
      portabilityPreviewEnvelopeSchema.safeParse(envelope(missing)).success,
    ).toBe(false);
    const secretPointer = preview();
    secretPointer.defaults_applied[0]!.field = "/api_key";
    expect(
      portabilityPreviewEnvelopeSchema.safeParse(envelope(secretPointer))
        .success,
    ).toBe(false);
  });

  it("maps notices through the DTO boundary and hides unknown code text", () => {
    const dto = portabilityPreviewEnvelopeSchema.parse(
      envelope(preview()),
    ).data;
    const model = mapPortabilityPreview(dto);
    const copy = (key: string, values: Record<string, string | number> = {}) =>
      `${key}:${Object.values(values).join("|")}`;
    const rendered = presentNotice(model.warnings[0]!, model.changes, copy);
    expect(rendered).toContain("notice.unknown");
    expect(rendered).not.toContain("future_notice");
  });

  it("accepts applied superseded and zero-count not_applied as different facts", () => {
    const base = {
      operation_id: operationId,
      category: "plans",
      baseline_revision: "r1",
      result_revision: "r2",
      current_revision: "r3",
      resolved_at: commitNotAfter,
      commit_not_after: commitNotAfter,
      retain_until: retainUntil,
      effective_day: null,
    };
    expect(
      portabilityResultEnvelopeSchema.parse(
        envelope({
          ...base,
          status: "applied",
          reason_code: null,
          superseded: true,
          counts,
        }),
      ).data.status,
    ).toBe("applied");
    expect(
      portabilityResultEnvelopeSchema.parse(
        envelope({
          ...base,
          status: "not_applied",
          reason_code: "revision_changed",
          baseline_revision: "r2",
          current_revision: "r2",
          superseded: false,
          counts: { added: 0, updated: 0, removed: 0, unchanged: 0 },
        }),
      ).data.status,
    ).toBe("not_applied");
  });
});

describe("CR313 secret and recovery boundaries", () => {
  beforeEach(() => sessionStorage.clear());

  it("validates Unicode scalars and UTF-8 bytes without trimming or normalization", () => {
    expect(validPortabilityPassphrase("twelve chars!")).toBe(true);
    expect(validPortabilityPassphrase("short value")).toBe(false);
    expect(validPortabilityPassphrase("              ")).toBe(false);
    expect(validPortabilityPassphrase("valid password\u0000x")).toBe(false);
    expect(validPortabilityPassphrase("😀".repeat(12))).toBe(true);
    expect(validPortabilityPassphrase("😀".repeat(129))).toBe(false);
    expect(validPortabilityPassphrase("a".repeat(128))).toBe(true);
  });

  it("stores exactly the approved five recovery fields and rejects mutation", () => {
    const record = {
      operation_id: operationId,
      category: "models" as const,
      preview_token: "opaque-token",
      commit_not_after: commitNotAfter,
      retain_until: retainUntil,
    };
    savePortabilityRecovery("actor", record);
    const raw = sessionStorage.getItem(
      "wordweave:config-portability:v1:actor",
    )!;
    expect(Object.keys(JSON.parse(raw)).sort()).toEqual([
      "category",
      "commit_not_after",
      "operation_id",
      "preview_token",
      "retain_until",
    ]);
    expect(raw).not.toContain("password");
    expect(readPortabilityRecovery("actor")).toEqual(record);
    sessionStorage.setItem(
      "wordweave:config-portability:v1:actor",
      JSON.stringify({ ...record, file_base64: "secret" }),
    );
    expect(readPortabilityRecovery("actor")).toBeNull();
    clearPortabilityRecovery("actor");
  });

  it("clears every actor recovery slot on session invalidation", () => {
    const record = {
      operation_id: operationId,
      category: "models" as const,
      preview_token: "opaque-token",
      commit_not_after: commitNotAfter,
      retain_until: retainUntil,
    };
    savePortabilityRecovery("actor-a", record);
    savePortabilityRecovery("actor-b", record);
    sessionStorage.setItem("unrelated", "keep");
    clearAllPortabilityRecovery();
    expect(readPortabilityRecovery("actor-a")).toBeNull();
    expect(readPortabilityRecovery("actor-b")).toBeNull();
    expect(sessionStorage.getItem("unrelated")).toBe("keep");
  });

  it("renders explicit values without truthy collapse", () => {
    const copy = (key: string) => key;
    expect(formatPortabilityValue(false, "/enabled", copy)).toBe("false");
    expect(formatPortabilityValue(0, "/priority", copy)).toBe("0");
    expect(formatPortabilityValue([], "/model_ids", copy)).toBe(
      "change.valueNone",
    );
    expect(formatPortabilityValue(null, "/rolling_24h_limit", copy)).toBe(
      "change.valueUnlimited",
    );
    expect(formatPortabilityValue(null, "/description", copy)).toBe(
      "change.valueNotSet",
    );
  });
});

describe("CR313 API transport", () => {
  it("uses one contract path and never adds a passphrase to ordinary export", async () => {
    const send = vi.fn(
      async (_path: string, _init?: RequestInit) =>
        new Response("{}", {
          status: 200,
          headers: {
            "content-type": "application/json",
            "content-disposition":
              'attachment; filename="wordweave-plans-20261016T000000Z.json"',
          },
        }),
    );
    const vault = new TokenVault();
    vault.setCsrf("csrf");
    const repo = createConfigPortabilityRepository({ send }, vault);
    const result = await repo.exportConfiguration({
      category: "plans",
      includeCredentials: false,
    });
    expect(result.safeFilename).toBe("wordweave-plans-20261016T000000Z.json");
    const [path, init] = send.mock.calls[0]!;
    expect(path).toBe("/api/v1/admin/config-portability/plans/exports");
    expect(JSON.parse(String(init?.body))).toEqual({
      include_credentials: false,
    });
    expect(new Headers(init?.headers).get("x-csrf-token")).toBe("csrf");
  });
});

describe("CR313 operation state machine", () => {
  beforeEach(() => sessionStorage.clear());

  it("ignores preview replies after a category change or session epoch change", async () => {
    const first = deferred<ReturnType<typeof previewModel>>();
    const category = storeHarness({
      previewConfiguration: vi.fn(() => first.promise),
    });
    category.store.open("models");
    await category.store.selectFile(
      new File(
        [JSON.stringify({ format: "wordweave-config", category: "models" })],
        "models.json",
      ),
    );
    const oldCategory = category.store.preview();
    await vi.waitFor(() =>
      expect(category.api.previewConfiguration).toHaveBeenCalledTimes(1),
    );
    category.store.open("plans");
    first.resolve(previewModel());
    await oldCategory;
    expect(category.store.state.value).toMatchObject({
      category: "plans",
      phase: "file",
      preview: null,
    });

    const second = deferred<ReturnType<typeof previewModel>>();
    const logout = storeHarness({
      previewConfiguration: vi.fn(() => second.promise),
    });
    logout.store.open("models");
    await logout.store.selectFile(
      new File(
        [JSON.stringify({ format: "wordweave-config", category: "models" })],
        "models.json",
      ),
    );
    const oldActor = logout.store.preview();
    await vi.waitFor(() =>
      expect(logout.api.previewConfiguration).toHaveBeenCalledTimes(1),
    );
    logout.epoch.value++;
    second.resolve(previewModel());
    await oldActor;
    expect(logout.store.state.value.preview).toBeNull();
  });

  it("enforces the byte boundary and retains the decoded mismatch category", async () => {
    const harness = storeHarness();
    harness.store.open("models");
    const prefix = JSON.stringify({ category: "models" });
    await harness.store.selectFile(
      new File(
        [prefix, " ".repeat(8 * 1024 * 1024 - prefix.length)],
        "boundary.json",
      ),
    );
    expect(harness.store.state.value).toMatchObject({
      phase: "file",
      fileCategory: "models",
    });
    await harness.store.selectFile(
      new File([new Uint8Array(8 * 1024 * 1024 + 1)], "too-large.json"),
    );
    expect(harness.store.state.value).toMatchObject({
      phase: "error",
      failure: { code: "file_size" },
    });
    await harness.store.selectFile(
      new File([JSON.stringify({ category: "plans" })], "plans.json"),
    );
    expect(harness.store.state.value).toMatchObject({
      fileCategory: "plans",
      failure: { code: "category_mismatch" },
    });
  });

  it("persists the five-field ticket before one import dispatch", async () => {
    let rawAtDispatch: string | null = null;
    const result = deferred<ReturnType<typeof appliedResult>>();
    const harness = storeHarness({
      importConfiguration: vi.fn(() => {
        rawAtDispatch = sessionStorage.getItem(
          "wordweave:config-portability:v1:admin-fixture",
        );
        return result.promise;
      }),
    });
    await readyEncryptedImport(harness);
    const first = harness.store.submit();
    const duplicate = harness.store.submit();
    await vi.waitFor(() =>
      expect(harness.api.importConfiguration).toHaveBeenCalledTimes(1),
    );
    expect(Object.keys(JSON.parse(rawAtDispatch!)).sort()).toEqual([
      "category",
      "commit_not_after",
      "operation_id",
      "preview_token",
      "retain_until",
    ]);
    expect(rawAtDispatch).not.toContain("password");
    result.resolve(appliedResult());
    await Promise.all([first, duplicate]);
    expect(harness.store.state.value.phase).toBe("success");
    expect(harness.refreshSecurityContext).toHaveBeenCalledTimes(2);
  });

  it("does not dispatch when recovery storage fails", async () => {
    const harness = storeHarness();
    await readyEncryptedImport(harness);
    const storage = vi
      .spyOn(sessionStorage, "setItem")
      .mockImplementation(() => {
        throw new DOMException("blocked", "SecurityError");
      });
    await harness.store.submit();
    expect(harness.api.importConfiguration).not.toHaveBeenCalled();
    expect(harness.store.state.value).toMatchObject({
      phase: "error",
      failure: { kind: "local", code: "recovery_unavailable" },
    });
    storage.mockRestore();
  });

  it("keeps ambiguous outcomes unknown and maps resolve facts without replay", async () => {
    const resolve = vi
      .fn()
      .mockRejectedValueOnce(portabilityFailure(503, "outcome_unknown", 2))
      .mockRejectedValueOnce(portabilityFailure(403, "recovery_token_invalid"));
    const harness = storeHarness({
      importConfiguration: vi.fn(async () => {
        throw portabilityFailure(503, "outcome_unknown", 2);
      }),
      resolveConfigurationOperation: resolve,
    });
    await readyEncryptedImport(harness);
    await harness.store.submit();
    expect(harness.store.state.value.phase).toBe("unknown");
    await harness.store.resolve();
    expect(harness.store.state.value.phase).toBe("unknown");
    await harness.store.resolve();
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(harness.api.importConfiguration).toHaveBeenCalledTimes(1);

    vi.setSystemTime(Date.now() + 2_001);
    await harness.store.resolve();
    expect(harness.store.state.value.phase).toBe("tokenInvalid");
    expect(harness.api.importConfiguration).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("keeps expired recovery unresolved when a safe current read succeeds", async () => {
    savePortabilityRecovery("admin-fixture", {
      operation_id: operationId,
      category: "models",
      preview_token: "opaque-token",
      commit_not_after: commitNotAfter,
      retain_until: retainUntil,
    });
    const current = {
      category: "models" as const,
      revision: "current-r3",
      readAt: createdAt,
      configuration: { category: "models" as const, connections: [] },
    };
    const harness = storeHarness({
      resolveConfigurationOperation: vi.fn(async () => {
        throw portabilityFailure(410, "result_expired");
      }),
      getCurrentConfiguration: vi.fn(async () => current),
    });
    harness.store.open("plans");
    expect(harness.store.state.value.phase).toBe("unknown");
    await harness.store.resolve();
    expect(harness.store.state.value.phase).toBe("resultExpired");
    await harness.store.readCurrent();
    expect(harness.store.state.value).toMatchObject({
      phase: "resultExpired",
      result: null,
      current: { revision: "current-r3" },
    });
    expect(harness.api.importConfiguration).not.toHaveBeenCalled();
  });

  it("keeps applied superseded as success and a refresh failure as presentation state", async () => {
    const harness = storeHarness({
      importConfiguration: vi.fn(async () => appliedResult(true)),
    });
    await readyEncryptedImport(harness);
    await harness.store.submit();
    harness.store.markRefreshFailed(true);
    expect(harness.store.state.value).toMatchObject({
      phase: "success",
      result: { status: "applied", superseded: true },
      refreshFailed: true,
    });
    expect(harness.api.importConfiguration).toHaveBeenCalledTimes(1);
  });
});
