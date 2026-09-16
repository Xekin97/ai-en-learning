import { registerPrivateState } from "@runtime/session/private-state";
import { normalizeFailure } from "@application/shared/failure";
import {
  initialGenerationState,
  type AppFailure,
  type GenerationInputModel,
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
}

interface WorkspaceRuntime {
  vocabularyController: AbortController | null;
  searchSequence: number;
  optionsSequence: number;
  generation: GenerationRequest | null;
}

// Controllers belong to a Nuxt app, never to a process-wide user singleton.
const workspaces = new WeakMap<object, WorkspaceRuntime>();

export function useGenerationStore() {
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
  const session = useSessionStore();
  const state = useState<GenerationWorkspaceState>(
    "generation-workspace",
    () => ({
      options: null,
      optionsStatus: "idle",
      optionsFailure: null,
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
    runtime.vocabularyController?.abort();
    runtime.vocabularyController = null;
    runtime.searchSequence++;
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
      state.value.scenario = retainAvailableSelection(
        state.value.scenario,
        options.scenarios,
      );
      state.value.length = retainAvailableSelection(
        state.value.length,
        options.lengths,
      );
      state.value.optionsFailure = null;
      state.value.optionsStatus = "ready";
    } catch (error) {
      if (sequence !== runtime.optionsSequence || epoch !== session.epoch.value)
        return;
      state.value.optionsFailure = normalizeFailure(error);
      state.value.optionsStatus = "failed";
    }
  }

  async function searchVocabulary(query: string): Promise<void> {
    state.value.query = query;
    runtime.vocabularyController?.abort();
    const sequence = ++runtime.searchSequence;
    if (!query.trim()) {
      state.value.candidates = [];
      state.value.searchStatus = "idle";
      return;
    }
    const controller = new AbortController();
    runtime.vocabularyController = controller;
    state.value.searchStatus = "loading";
    try {
      const result = await api.searchVocabulary(
        query.trim(),
        controller.signal,
      );
      if (sequence !== runtime.searchSequence) return;
      state.value.candidates = result.entries.filter(
        (entry) => !state.value.selectedEntries.includes(entry),
      );
      state.value.searchStatus = state.value.candidates.length
        ? "ready"
        : "empty";
    } catch {
      if (sequence !== runtime.searchSequence || controller.signal.aborted)
        return;
      state.value.searchStatus = "failed";
    }
  }

  function addEntry(entry: string): void {
    const max = state.value.options?.maxEntries ?? 0;
    if (
      state.value.selectedEntries.includes(entry) ||
      state.value.selectedEntries.length >= max
    )
      return;
    state.value.selectedEntries.push(entry);
    state.value.query = "";
    state.value.candidates = [];
    state.value.searchStatus = "idle";
  }

  function removeEntry(entry: string): void {
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

  async function generate(): Promise<boolean> {
    const inputModel = input();
    if (!inputModel || state.value.generation.phase === "streaming")
      return false;
    const request: GenerationRequest = {
      controller: new AbortController(),
      epoch: session.epoch.value,
      cancelRequested: false,
      cancellation: null,
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
    state.value.scenario = null;
    state.value.length = null;
    state.value.generation = initialGenerationState();
  }

  function modelById(id: string | null): ModelOptionModel | null {
    return state.value.options?.models.find((model) => model.id === id) ?? null;
  }

  return {
    state: readonly(state),
    canSubmit: computed(
      () =>
        input() !== null &&
        state.value.options?.availability.canGenerate === true &&
        state.value.generation.phase !== "streaming",
    ),
    selectedModel: computed(() => modelById(state.value.modelId)),
    loadOptions,
    searchVocabulary,
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
