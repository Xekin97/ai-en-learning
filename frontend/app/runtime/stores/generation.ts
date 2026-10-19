import { createVocabularySearch } from "@application/generation/vocabulary-search";
import { useAnalyticsEvents } from "@runtime/stores/analytics-events";
import { registerPrivateState } from "@runtime/session/private-state";
import { normalizeFailure } from "@application/shared/failure";
import {
  initialGenerationState,
  type AppFailure,
  type GenerationInputModel,
  type GenerationRequestModel,
  type GenerationOptionsModel,
  type GenerationStateModel,
  type MeaningLanguage,
  type ModelOptionModel,
  type PassageLength,
  type Scenario,
} from "@application/shared/models";
import { reduceGeneration } from "@application/generation/reducer";
import {
  authoritativeDraftState,
  freezeDraftState,
} from "@application/generation/draft-reducer";
import { retainAvailableSelection } from "@application/generation/selection";

interface GenerationWorkspaceState {
  options: GenerationOptionsModel | null;
  optionsStatus: "idle" | "loading" | "ready" | "failed";
  optionsFailure: AppFailure | null;
  randomPending: boolean;
  selectionRevision: number;
  query: string;
  candidates: string[];
  searchStatus: "idle" | "loading" | "ready" | "empty" | "failed";
  selectedEntries: string[];
  modelId: string | null;
  meaningLanguage: MeaningLanguage | null;
  scenario: Scenario | null;
  length: PassageLength | null;
  generation: GenerationStateModel;
  retryAt: number | null;
}

interface GenerationRequest {
  controller: AbortController;
  epoch: number;
  cancelRequested: boolean;
  cancellation: Promise<void> | null;
  previous: GenerationStateModel;
  reconciliation: number;
  reconciliationController: AbortController | null;
  reconciliationDeadline: number | null;
  postDispatched: boolean;
}

interface WorkspaceRuntime {
  vocabularySearch?: ReturnType<typeof createVocabularySearch>;
  vocabularyController: AbortController | null;
  searchSequence: number;
  optionsSequence: number;
  generation: GenerationRequest | null;
  cooldownTimer: ReturnType<typeof setTimeout> | null;
}

// Controllers belong to a Nuxt app, never to a process-wide user singleton.
const workspaces = new WeakMap<object, WorkspaceRuntime>();

export function useGenerationStore() {
  const analytics = useAnalyticsEvents();
  const app = useNuxtApp();
  const api = app.$api;
  let existing = workspaces.get(app);
  if (!existing) {
    existing = {
      vocabularyController: null,
      searchSequence: 0,
      optionsSequence: 0,
      generation: null,
      cooldownTimer: null,
    };
    workspaces.set(app, existing);
  }
  const runtime = existing;
  const session = useSessionStore(),
    feedback = useFeedbackStore();
  const state = useState<GenerationWorkspaceState>(
    "generation-workspace",
    () => ({
      options: null,
      optionsStatus: "idle",
      optionsFailure: null,
      randomPending: false,
      selectionRevision: 0,
      query: "",
      candidates: [],
      searchStatus: "idle",
      selectedEntries: [],
      modelId: null,
      meaningLanguage: null,
      scenario: null,
      length: null,
      generation: initialGenerationState(),
      retryAt: null,
    }),
  );
  const exposedState = readonly(state);

  runtime.vocabularySearch ??= createVocabularySearch(
    (q, signal) => api.searchVocabulary(q, signal),
    () => session.epoch.value,
    (next) => {
      Object.assign(state.value, next);
    },
  );

  registerPrivateState<GenerationWorkspaceState>(
    app,
    "generation-workspace",
    state,
    () => {
      invalidateRequests();
      return {
        ...state.value,
        options: null,
        optionsStatus: "idle",
        optionsFailure: null,
        randomPending: false,
        selectionRevision: 0,
        query: "",
        candidates: [],
        searchStatus: "idle",
        selectedEntries: [],
        modelId: null,
        meaningLanguage: null,
        scenario: null,
        length: null,
        generation: initialGenerationState(),
        retryAt: null,
      };
    },
  );

  function invalidateRequests(): void {
    const previous = runtime.generation;
    runtime.generation = null;
    previous?.controller.abort();
    previous?.reconciliationController?.abort();
    if (runtime.cooldownTimer) clearTimeout(runtime.cooldownTimer);
    runtime.cooldownTimer = null;
    runtime.vocabularyController?.abort();
    runtime.vocabularyController = null;
    runtime.searchSequence++;
    runtime.vocabularySearch?.reset();
    runtime.optionsSequence++;
  }

  function owns(request: GenerationRequest): boolean {
    return (
      runtime.generation === request && request.epoch === session.epoch.value
    );
  }

  async function loadOptions(force = false): Promise<void> {
    if (
      !force &&
      (state.value.optionsStatus === "loading" ||
        state.value.optionsStatus === "ready")
    )
      return;
    const sequence = ++runtime.optionsSequence;
    const epoch = session.epoch.value;
    state.value.optionsStatus = "loading";
    try {
      const options = await api.getGenerationOptions();
      if (sequence !== runtime.optionsSequence || epoch !== session.epoch.value)
        return;
      state.value.options = options;
      state.value.modelId = retainAvailableSelection(
        state.value.modelId,
        options.models.map((model) => model.id),
      );
      state.value.meaningLanguage = retainAvailableSelection(
        state.value.meaningLanguage,
        options.meaningLanguages,
      );
      state.value.scenario =
        retainAvailableSelection(state.value.scenario, options.scenarios) ??
        (options.scenarios.includes("story") ? "story" : null);
      state.value.length =
        retainAvailableSelection(state.value.length, options.lengths) ??
        (options.lengths.includes("short") ? "short" : null);
      state.value.optionsFailure = null;
      state.value.optionsStatus = "ready";
    } catch (error) {
      if (sequence !== runtime.optionsSequence || epoch !== session.epoch.value)
        return;
      state.value.optionsFailure = normalizeFailure(error);
      state.value.optionsStatus = "failed";
    }
  }

  const searchVocabulary = (query: string) =>
    runtime.vocabularySearch!.search(query);
  const setVocabularyQuery = (query: string) =>
    runtime.vocabularySearch!.setQuery(query);

  function addEntry(entry: string, fromRandom = false): void {
    const max = state.value.options?.maxEntries ?? 0;
    if (
      ["streaming", "pending"].includes(state.value.generation.phase) ||
      (!fromRandom &&
        (state.value.searchStatus !== "ready" ||
          !state.value.candidates.includes(entry))) ||
      state.value.selectedEntries.some(
        (x) => x.toLowerCase() === entry.toLowerCase(),
      ) ||
      state.value.selectedEntries.length >= max
    )
      return;
    runtime.vocabularySearch?.reset();
    state.value.selectionRevision++;
    state.value.selectedEntries.push(entry);
    analytics.action("select_word");
    state.value.query = "";
    state.value.candidates = [];
    state.value.searchStatus = "idle";
  }

  function removeEntry(entry: string): void {
    state.value.selectionRevision++;
    state.value.selectedEntries = state.value.selectedEntries.filter(
      (candidate) => candidate !== entry,
    );
  }

  function input(): GenerationInputModel | null {
    const value = state.value;
    if (
      !value.modelId ||
      !value.meaningLanguage ||
      !value.scenario ||
      !value.length ||
      value.selectedEntries.length === 0
    )
      return null;
    return {
      modelId: value.modelId,
      meaningLanguage: value.meaningLanguage,
      scenario: value.scenario,
      length: value.length,
      entries: [...value.selectedEntries],
    };
  }

  const wait = (milliseconds: number, signal: AbortSignal) =>
    new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, milliseconds);
      signal.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true },
      );
    });

  function applyBusyCooldown(seconds: number): void {
    const retryAt = Date.now() + seconds * 1_000;
    state.value.retryAt = retryAt;
    if (runtime.cooldownTimer) clearTimeout(runtime.cooldownTimer);
    runtime.cooldownTimer = setTimeout(
      () => {
        runtime.cooldownTimer = null;
        if (state.value.retryAt === retryAt) state.value.retryAt = null;
      },
      Math.max(0, retryAt - Date.now()),
    );
  }

  async function reconcile(
    request: GenerationRequest,
    automatic = true,
  ): Promise<void> {
    const runId = state.value.generation.runId;
    if (!runId || !owns(request)) return;
    request.reconciliationDeadline ??= Date.now() + 10_000;
    const deadline = request.reconciliationDeadline;
    do {
      const remaining = deadline - Date.now();
      if (remaining <= 0) return;
      const reconciliation = ++request.reconciliation;
      const controller = new AbortController();
      request.reconciliationController?.abort();
      request.reconciliationController = controller;
      const deadlineTimer = setTimeout(() => controller.abort(), remaining);
      try {
        const status = await api.getGenerationStatus(runId, controller.signal);
        if (!owns(request) || reconciliation !== request.reconciliation) return;
        if (
          state.value.generation.acceptedSnapshot &&
          JSON.stringify(status.snapshot) !==
            JSON.stringify(state.value.generation.acceptedSnapshot)
        ) {
          state.value.generation = {
            ...state.value.generation,
            phase: "pending",
            activity: null,
            draft: freezeDraftState(state.value.generation.draft),
            canSave: false,
            failure: {
              kind: "contract_violation",
              code: "contract_violation",
              status: null,
              requestId: null,
              fields: {},
              retryable: true,
            },
          };
          return;
        }
        if (status.status === "active") {
          state.value.generation = {
            ...state.value.generation,
            phase: "pending",
            activity: null,
            draft: freezeDraftState(state.value.generation.draft),
            canSave: false,
          };
        } else if (status.status === "valid") {
          const requestedEntries = state.value.generation.requestedEntries;
          if (
            status.result &&
            requestedEntries.length > 0 &&
            JSON.stringify(
              status.result.targets.map((target) => target.entry),
            ) !== JSON.stringify(requestedEntries)
          ) {
            state.value.generation = {
              ...state.value.generation,
              phase: "pending",
              activity: null,
              draft: freezeDraftState(state.value.generation.draft),
              canSave: false,
              failure: {
                kind: "contract_violation",
                code: "contract_violation",
                status: null,
                requestId: null,
                fields: {},
                retryable: true,
              },
            };
            return;
          }
          state.value.generation = status.result
            ? {
                ...state.value.generation,
                phase: "valid",
                requestPhase: null,
                acceptedContentService: status.snapshot.contentService,
                acceptedSnapshot: status.snapshot,
                streamedText: status.result.passage,
                activity: null,
                draft: authoritativeDraftState(
                  state.value.generation.draft,
                  status.result.passage,
                ),
                planId: null,
                planMeaningLanguage: null,
                planItems: [],
                draftId: null,
                retiredDraftIds: [],
                revision: 0,
                codePointLength: Array.from(status.result.passage).length,
                contentVersion: null,
                result: status.result,
                finalContentVersion: status.finalContentVersion,
                contentOutcome: status.contentOutcome,
                completionNotice: status.completionNotice,
                resultUnavailable: false,
                canSave: status.canSave,
                failure: null,
              }
            : {
                ...state.value.generation,
                phase: "valid",
                requestPhase: null,
                activity: null,
                draft: freezeDraftState(state.value.generation.draft),
                acceptedContentService: status.snapshot.contentService,
                acceptedSnapshot: status.snapshot,
                result: null,
                finalContentVersion: status.finalContentVersion,
                contentOutcome: status.contentOutcome,
                completionNotice: status.completionNotice,
                resultUnavailable: true,
                canSave: false,
                failure: null,
              };
          return;
        } else {
          state.value.generation = {
            ...initialGenerationState(),
            phase: status.status,
            runId,
          };
          return;
        }
      } catch (error) {
        if (!owns(request)) return;
        if (controller.signal.aborted && Date.now() >= deadline) return;
        const failure = normalizeFailure(error);
        if (failure.status === 404 || failure.status === 410) {
          state.value.generation = {
            ...state.value.generation,
            phase: "pending",
            activity: null,
            draft: freezeDraftState(state.value.generation.draft),
            canSave: false,
            failure,
          };
          return;
        }
        state.value.generation = {
          ...state.value.generation,
          phase: "pending",
          activity: null,
          draft: freezeDraftState(state.value.generation.draft),
          canSave: false,
          failure,
        };
      } finally {
        clearTimeout(deadlineTimer);
        if (request.reconciliationController === controller)
          request.reconciliationController = null;
      }
      if (!automatic || Date.now() + 2_000 >= deadline) return;
      const sleepController = new AbortController();
      request.reconciliationController = sleepController;
      await wait(2_000, sleepController.signal);
      if (request.reconciliationController === sleepController)
        request.reconciliationController = null;
    } while (owns(request));
  }
  async function generate(
    requestModel?: GenerationRequestModel,
  ): Promise<boolean> {
    const inputModel = requestModel ?? input();
    if (
      !inputModel ||
      ["streaming", "pending"].includes(state.value.generation.phase) ||
      (state.value.retryAt !== null && state.value.retryAt > Date.now())
    )
      return false;
    analytics.action("start_generation");
    const request: GenerationRequest = {
      controller: new AbortController(),
      epoch: session.epoch.value,
      cancelRequested: false,
      cancellation: null,
      previous: state.value.generation,
      reconciliation: 0,
      reconciliationController: null,
      reconciliationDeadline: null,
      postDispatched: false,
    };
    runtime.generation?.controller.abort();
    runtime.generation = request;
    state.value.generation = {
      ...initialGenerationState(),
      phase: "streaming",
      requestedEntries: "kind" in inputModel ? [] : [...inputModel.entries],
      requestedMeaningLanguage:
        "kind" in inputModel ? null : inputModel.meaningLanguage,
    };
    try {
      await session.refreshSecurityContext();
      if (!owns(request)) return false;
      request.postDispatched = true;
      await api.streamGeneration(
        inputModel,
        (event) => {
          if (!owns(request) || request.controller.signal.aborted) return;
          state.value.generation = reduceGeneration(
            state.value.generation,
            event,
          );
          if (event.kind === "started" && request.cancelRequested)
            void sendCancellation(request);
          if (state.value.generation.phase === "pending") {
            request.controller.abort();
          }
        },
        request.controller.signal,
      );
      if (!owns(request)) return false;
      if (state.value.generation.phase === "streaming") {
        state.value.generation = {
          ...state.value.generation,
          phase: "pending",
          activity: null,
          draft: freezeDraftState(state.value.generation.draft),
          canSave: false,
          failure: normalizeFailure(
            new Error("Stream ended before terminal event"),
          ),
        };
        await reconcile(request);
      } else if (state.value.generation.phase === "pending") {
        await reconcile(request);
      }
    } catch (error) {
      if (!owns(request)) return false;
      if (state.value.generation.phase === "pending") {
        await reconcile(request);
        return (
          (state.value.generation as GenerationStateModel).phase === "valid"
        );
      }
      // A committed terminal event cannot be replaced by a late transport error.
      if (state.value.generation.phase === "streaming") {
        const failure = normalizeFailure(error);
        if (failure.code === "generation_busy" && failure.accepted === false) {
          applyBusyCooldown(failure.retryAfterSeconds ?? 1);
          state.value.generation = { ...request.previous, failure };
        } else if (state.value.generation.runId) {
          state.value.generation = {
            ...state.value.generation,
            phase: "pending",
            activity: null,
            draft: freezeDraftState(state.value.generation.draft),
            canSave: false,
            failure,
          };
          await reconcile(request);
        } else if (request.postDispatched) {
          state.value.generation = {
            ...state.value.generation,
            phase: "pending",
            activity: null,
            draft: freezeDraftState(state.value.generation.draft),
            result: null,
            canSave: false,
            failure,
          };
        } else {
          state.value.generation = {
            ...initialGenerationState(),
            phase: "failed",
            failure,
          };
        }
      }
    } finally {
      if (owns(request)) runtime.generation = null;
    }
    return state.value.generation.phase === "valid";
  }

  async function sendCancellation(request: GenerationRequest): Promise<void> {
    if (!owns(request) || state.value.generation.phase !== "streaming") return;
    if (request.cancellation) return request.cancellation;
    const runId = state.value.generation.runId;
    if (!runId) return;
    request.cancellation = (async () => {
      try {
        const outcome = await api.cancelGeneration(runId);
        if (!owns(request) || state.value.generation.phase !== "streaming")
          return;
        if (outcome === "cancelled") {
          state.value.generation = {
            ...initialGenerationState(),
            phase: "cancelled",
            runId,
          };
          request.controller.abort();
        }
        if (outcome === "valid" || outcome === "failed") {
          request.controller.abort();
          state.value.generation = {
            ...state.value.generation,
            phase: "pending",
            activity: null,
            draft: freezeDraftState(state.value.generation.draft),
            canSave: false,
          };
          await reconcile(request);
        }
      } catch (error) {
        if (owns(request) && state.value.generation.phase === "streaming")
          state.value.generation = {
            ...state.value.generation,
            failure: normalizeFailure(error),
          };
      } finally {
        request.cancelRequested = false;
        request.cancellation = null;
      }
    })();
    return request.cancellation;
  }

  async function cancel(): Promise<void> {
    const request = runtime.generation;
    if (
      !request ||
      !owns(request) ||
      state.value.generation.phase !== "streaming"
    )
      return;
    request.cancelRequested = true;
    // Before started, retain the intent until the server supplies a capability;
    // aborting the socket is passive disconnect, not explicit cancellation.
    await sendCancellation(request);
  }

  async function recheck(): Promise<void> {
    if (
      !(
        state.value.generation.phase === "pending" ||
        (state.value.generation.phase === "valid" &&
          state.value.generation.resultUnavailable)
      ) ||
      !state.value.generation.runId ||
      runtime.generation
    )
      return;
    const request: GenerationRequest = {
      controller: new AbortController(),
      epoch: session.epoch.value,
      cancelRequested: false,
      cancellation: null,
      previous: state.value.generation,
      reconciliation: 0,
      reconciliationController: null,
      reconciliationDeadline: null,
      postDispatched: false,
    };
    runtime.generation = request;
    try {
      await reconcile(request, false);
    } finally {
      if (owns(request)) runtime.generation = null;
    }
  }

  function abortPassive(): void {
    if (state.value.generation.phase !== "streaming") return;
    invalidateRequests();
    state.value.generation = initialGenerationState();
  }

  async function save(): Promise<
    { kind: "saved"; batchId: string } | { kind: "claim"; expiresAt: string }
  > {
    const generation = state.value.generation;
    const epoch = session.epoch.value;
    const isCurrent = () =>
      state.value.generation === generation && session.epoch.value === epoch;
    const runId = generation.runId;
    if (generation.phase !== "valid" || !generation.canSave || !runId)
      throw new Error("No validated generation is ready");
    await session.refreshSecurityContext();
    if (!isCurrent()) throw new Error("Generation is no longer current");
    if (session.isLearner.value) {
      const result = await api.saveGeneration(runId);
      if (!isCurrent()) throw new Error("Generation is no longer current");
      state.value.generation = { ...state.value.generation, phase: "saved" };
      return { kind: "saved", batchId: result.batchId };
    }
    const lease = await api.createVisitorClaim(runId);
    if (!isCurrent()) throw new Error("Generation is no longer current");
    return { kind: "claim", expiresAt: lease.expiresAt };
  }

  async function discard() {
    const generation = state.value.generation;
    const epoch = session.epoch.value;
    const isCurrent = () =>
      state.value.generation === generation && session.epoch.value === epoch;
    const runId = generation.runId;
    if (runId && generation.phase === "valid") {
      await session.refreshSecurityContext();
      if (!isCurrent()) return null;
      await api.discardGeneration(runId);
      if (!isCurrent()) return null;
      state.value.generation = initialGenerationState();
      return {
        runId,
        clearedGeneration: exposedState.value.generation,
      };
    }
    if (!isCurrent()) return null;
    state.value.generation = initialGenerationState();
    return null;
  }

  function startNewTask(): void {
    invalidateRequests();
    state.value.query = "";
    state.value.candidates = [];
    state.value.searchStatus = "idle";
    state.value.selectedEntries = [];
    state.value.modelId = null;
    state.value.meaningLanguage = null;
    state.value.selectionRevision++;
    state.value.scenario = state.value.options?.scenarios.includes("story")
      ? "story"
      : null;
    state.value.length = state.value.options?.lengths.includes("short")
      ? "short"
      : null;
    state.value.generation = initialGenerationState();
  }

  async function randomEntry(): Promise<void> {
    if (state.value.randomPending) return;
    const revision = state.value.selectionRevision,
      epoch = session.epoch.value;
    state.value.randomPending = true;
    try {
      await session.refreshSecurityContext();
      if (epoch !== session.epoch.value) return;
      const result = await api.randomEntry([...state.value.selectedEntries]);
      if (
        epoch !== session.epoch.value ||
        revision !== state.value.selectionRevision
      )
        return;
      if (result.entry) addEntry(result.entry, true);
      else
        feedback.show(
          result.reason === "limit_reached" ? "word.limit" : "random.none",
        );
    } catch (error) {
      if (epoch === session.epoch.value)
        state.value.optionsFailure = normalizeFailure(error);
    } finally {
      if (epoch === session.epoch.value) state.value.randomPending = false;
    }
  }
  function modelById(id: string | null): ModelOptionModel | null {
    return state.value.options?.models.find((model) => model.id === id) ?? null;
  }

  return {
    state: exposedState,
    canSubmit: computed(
      () =>
        input() !== null &&
        state.value.optionsStatus === "ready" &&
        state.value.options?.availability.canGenerate === true &&
        !["streaming", "pending"].includes(state.value.generation.phase) &&
        (state.value.retryAt === null || state.value.retryAt <= Date.now()),
    ),
    selectedModel: computed(() => modelById(state.value.modelId)),
    loadOptions,
    searchVocabulary,
    setVocabularyQuery,
    randomEntry,
    addEntry,
    removeEntry,
    generate,
    cancel,
    recheck,
    abortPassive,
    save,
    discard,
    startNewTask,
    setModel: (value: string) => {
      state.value.modelId = value;
    },
    setMeaningLanguage: (value: MeaningLanguage) => {
      state.value.meaningLanguage = value;
    },
    setScenario: (value: Scenario) => {
      state.value.scenario = value;
    },
    setLength: (value: PassageLength) => {
      state.value.length = value;
    },
  };
}
