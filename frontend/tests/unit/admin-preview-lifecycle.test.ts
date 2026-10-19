import { afterEach, describe, expect, it, vi } from "vitest";
import { computed, effectScope, readonly, ref, shallowRef, watch } from "vue";
import { useAdminPresetsStore } from "@runtime/stores/admin-presets";

const usage = {
  providerCalls: 1,
  inputTokens: null,
  outputTokens: null,
  cost: null,
  unknownCalls: 1,
  invocationUnknownCalls: 0,
  notInvokedCalls: 0,
};
const result = {
  passage: "A grape grows.",
  passageSegments: [{ kind: "text" as const, text: "A grape grows." }],
  tags: ["garden"],
  targets: [
    {
      entry: "grape",
      entryMeaning: "fruit",
      hintPhrase: "a grape",
      hintSegments: [{ kind: "text" as const, text: "a grape" }],
    },
  ],
};
const record = {
  preset: {
    id: "preset",
    draftVersion: "draft-version",
    publishedVersion: null,
    listed: false,
    title: "Grape",
    previewContentMode: "enhanced" as const,
    configuration: {
      entries: ["grape"],
      model: { id: "model", name: "Model", description: null },
      meaningLanguage: "en" as const,
      scenario: "story" as const,
      length: "short" as const,
    },
    draftState: "preview_ready" as const,
    hasUnpublishedChanges: true,
    preview: {
      runId: "run",
      completedAt: "2026-10-10T00:00:00Z",
      result,
      usage,
      previewContentMode: "enhanced" as const,
      finalContentVersion: 2,
      contentOutcome: "review_incomplete" as const,
      completionNotice: "content_review_incomplete" as const,
    },
    published: null,
  },
  revision: "revision",
};

afterEach(() => vi.unstubAllGlobals());

describe("M003 admin preview recovery", () => {
  it("reconciles a started stream disconnect through one same-run status request", async () => {
    const getStatus = vi.fn(async () => ({
      status: "valid" as const,
      runId: "run",
      draftVersion: "draft-version",
      mode: "enhanced" as const,
      result,
      usage,
      finalContentVersion: 2,
      contentOutcome: "review_incomplete" as const,
      completionNotice: "content_review_incomplete" as const,
    }));
    const api = {
      streamPresetPreview: vi.fn(async (_id, _version, _mode, emit) => {
        emit({
          kind: "started",
          seq: 1,
          runId: "run",
          streamId: "stream",
          draftVersion: "draft-version",
          mode: "enhanced",
          contentService: {
            nativeValidation: true,
            contentReviewEnabled: true,
            contentRepairLimit: 1,
          },
          nativeCorrectionPolicy: {
            version: "m003-native-policy-v1",
            scope: "logical_request",
            maxCalls: 2,
            editable: false,
          },
        });
        throw { kind: "network", code: "network_error", retryable: true };
      }),
      getPresetPreviewStatus: getStatus,
      getAdminPreset: vi.fn(async () => record),
      getAdminGenerationOptions: vi.fn(async () => ({
        models: [{ id: "model", name: "Model", description: null }],
        meaningLanguages: ["en"],
        scenarios: ["story"],
        lengths: ["short"],
        vocabularyVersion: "vocabulary",
        revision: "revision",
        availability: { kind: "ready" as const },
        previewContentModes: ["basic", "enhanced"] as const,
        defaultPreviewContentMode: "basic" as const,
        previewContentRepairLimit: 1 as const,
        nativeCorrectionPolicy: {
          version: "m003-native-policy-v1" as const,
          scope: "logical_request" as const,
          maxCalls: 2 as const,
          editable: false as const,
        },
      })),
      clearPresetPreview: vi.fn(),
    };
    const app = { $api: api };
    const states = new Map<string, ReturnType<typeof ref>>();
    vi.stubGlobal("useNuxtApp", () => app);
    vi.stubGlobal("useSessionStore", () => ({
      epoch: ref(1),
      refreshSecurityContext: vi.fn(async () => {}),
    }));
    vi.stubGlobal("useFeedbackStore", () => ({ show: vi.fn() }));
    vi.stubGlobal("useState", (key: string, initial: () => unknown) => {
      if (!states.has(key)) states.set(key, ref(initial()));
      return states.get(key);
    });
    vi.stubGlobal("usePrivateState", (key: string, initial: () => unknown) => {
      if (!states.has(key)) states.set(key, ref(initial()));
      return states.get(key);
    });
    vi.stubGlobal("readonly", readonly);
    vi.stubGlobal("computed", computed);
    vi.stubGlobal("ref", ref);
    vi.stubGlobal("shallowRef", shallowRef);
    vi.stubGlobal("watch", watch);

    const scope = effectScope();
    const store = scope.run(() => useAdminPresetsStore())!;
    await store.preview("preset", "draft-version", "enhanced");

    expect(api.streamPresetPreview).toHaveBeenCalledTimes(1);
    expect(getStatus).toHaveBeenCalledTimes(1);
    expect(store.stream.value).toMatchObject({
      phase: "validated",
      runId: "run",
      resultUnavailable: false,
      finalContentVersion: 2,
      contentOutcome: "review_incomplete",
      completionNotice: "content_review_incomplete",
    });
    scope.stop();
  });
});
