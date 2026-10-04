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
}

interface GenerationRequest {
  controller: AbortController;
  epoch: number;
  cancelRequested: boolean;
  cancellation: Promise<void> | null;
  frame: number | null;
  buffer: string;
}

interface WorkspaceRuntime {
  vocabularySearch?: ReturnType<typeof createVocabularySearch>;
  vocabularyController: AbortController | null;
  searchSequence: number;
  optionsSequence: number;
  generation: GenerationRequest | null;
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
    }),
  );

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
      };
    },
  );

  function invalidateRequests(): void {
    const previous = runtime.generation;
    runtime.generation = null;
    previous?.controller.abort();
    if (previous?.frame != null) cancelAnimationFrame(previous.frame);
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
      ["streaming", "valid"].includes(state.value.generation.phase) ||
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

  function flushDeltas(request: GenerationRequest) {
    if (request.frame !== null) cancelAnimationFrame(request.frame);
    request.frame = null;
    if (
      owns(request) &&
      request.buffer &&
      state.value.generation.phase === "streaming"
    )
      state.value.generation = reduceGeneration(state.value.generation, {
        kind: "delta",
        text: request.buffer,
      });
    request.buffer = "";
  }
  async function generate(
    preset?: Extract<GenerationRequestModel, { kind: "preset" }>,
  ): Promise<boolean> {
    const inputModel = preset ?? input();
    if (!inputModel || state.value.generation.phase === "streaming")
      return false;
    analytics.action("start_generation");
    const request: GenerationRequest = {
      controller: new AbortController(),
      epoch: session.epoch.value,
      cancelRequested: false,
      cancellation: null,
      frame: null,
      buffer: "",
    };
    runtime.generation?.controller.abort();
    runtime.generation = request;
    state.value.generation = {
      ...initialGenerationState(),
      phase: "streaming",
    };
    try {
      await session.refreshSecurityContext();
      if (!owns(request)) return false;
      await api.streamGeneration(
        inputModel,
        (event) => {
          if (!owns(request) || request.controller.signal.aborted) return;
          if (event.kind === "delta") {
            request.buffer += event.text;
            if (request.frame === null)
              request.frame = requestAnimationFrame(() => flushDeltas(request));
            return;
          }
          flushDeltas(request);
          state.value.generation = reduceGeneration(
            state.value.generation,
            event,
          );
          if (event.kind === "started" && request.cancelRequested)
            void sendCancellation(request);
        },
        request.controller.signal,
      );
      if (!owns(request)) return false;
      if (state.value.generation.phase === "streaming") {
        state.value.generation = {
          ...state.value.generation,
          phase: "failed",
          result: null,
          failure: normalizeFailure(
            new Error("Stream ended before terminal event"),
          ),
        };
      }
    } catch (error) {
      if (!owns(request)) return false;
      flushDeltas(request);
      // A committed terminal event cannot be replaced by a late transport error.
      if (state.value.generation.phase === "streaming") {
        state.value.generation = {
          ...state.value.generation,
          phase: "failed",
          result: null,
          failure: normalizeFailure(error),
        };
      }
    } finally {
      if (request.frame !== null) cancelAnimationFrame(request.frame);
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
          state.value.generation = reduceGeneration(state.value.generation, {
            kind: "cancelled",
            quotaRefunded: false,
          });
          request.controller.abort();
        }
        // valid/failed won in the database: keep reading the actual terminal
        // payload. An acknowledgement alone is not a saveable result.
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
    if (generation.phase !== "valid" || !runId)
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

  async function discard(): Promise<void> {
    const generation = state.value.generation;
    const epoch = session.epoch.value;
    const isCurrent = () =>
      state.value.generation === generation && session.epoch.value === epoch;
    const runId = generation.runId;
    if (runId && generation.phase === "valid") {
      await session.refreshSecurityContext();
      if (!isCurrent()) return;
      await api.discardGeneration(runId);
    }
    if (!isCurrent()) return;
    state.value.generation = initialGenerationState();
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
    state: readonly(state),
    canSubmit: computed(
      () =>
        input() !== null &&
        state.value.optionsStatus === "ready" &&
        state.value.options?.availability.canGenerate === true &&
        state.value.generation.phase !== "streaming",
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
